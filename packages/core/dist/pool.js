import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { createInterface } from 'node:readline';
const DEFAULT_MAX_THREADS = 8;
const MAX_STDERR_TAIL_LINES = 16;
const POOLS = new Map();
let nextRequestId = 1;
function defaultThreadCount() {
    return Math.max(1, Math.min(DEFAULT_MAX_THREADS, cpus().length || 1));
}
function parseWorkerResponse(line, stderrSummary) {
    try {
        return JSON.parse(line);
    }
    catch (error) {
        throw new Error(`fft-strip worker emitted invalid JSON: ${String(error)}${stderrSummary}`, { cause: error });
    }
}
function completePendingRequest(pending, response) {
    if (response.ok) {
        pending.resolve({
            code: response.code,
            map: response.map,
        });
        return;
    }
    pending.reject(response.error ?? new Error('Unknown fft-strip worker error'));
}
class NativeWorker {
    #child;
    #pending = new Map();
    #reader;
    #stderrTail = [];
    #isClosed = false;
    constructor(binaryPath) {
        this.#child = spawn(binaryPath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.#reader = createInterface({
            crlfDelay: Infinity,
            input: this.#child.stdout,
        });
        this.#reader.on('line', (line) => {
            this.#onResponseLine(line);
        });
        this.#child.stderr.on('data', (chunk) => {
            this.#pushStderrChunk(chunk.toString('utf8'));
        });
        this.#child.on('error', (error) => {
            this.#failAllPending(error);
        });
        this.#child.on('exit', (code) => {
            this.#isClosed = true;
            this.#failAllPending(new Error(`fft-strip worker exited with code ${String(code)}${this.#stderrSummary()}`));
        });
    }
    get isClosed() {
        return this.#isClosed;
    }
    request(payload) {
        if (this.#isClosed) {
            return Promise.reject(new Error('fft-strip worker is closed'));
        }
        return new Promise((resolve, reject) => {
            this.#pending.set(payload.id, { reject, resolve });
            try {
                this.#child.stdin.write(JSON.stringify(payload));
                this.#child.stdin.write('\n');
            }
            catch (error) {
                this.#pending.delete(payload.id);
                reject(error);
            }
        });
    }
    close() {
        if (this.#isClosed) {
            return;
        }
        this.#isClosed = true;
        this.#reader.close();
        this.#child.kill();
        this.#failAllPending(new Error('fft-strip worker closed'));
    }
    #pushStderrChunk(message) {
        this.#stderrTail.push(message);
        if (this.#stderrTail.length > MAX_STDERR_TAIL_LINES) {
            this.#stderrTail.shift();
        }
    }
    #stderrSummary() {
        if (this.#stderrTail.length === 0) {
            return '';
        }
        return `\nStderr:\n${this.#stderrTail.join('')}`;
    }
    #failAllPending(error) {
        for (const pending of this.#pending.values()) {
            pending.reject(error);
        }
        this.#pending.clear();
    }
    #pendingRequest(id) {
        const pending = this.#pending.get(id);
        if (!pending) {
            return null;
        }
        this.#pending.delete(id);
        return pending;
    }
    #onResponseLine(line) {
        let response;
        try {
            response = parseWorkerResponse(line, this.#stderrSummary());
        }
        catch (error) {
            this.#failAllPending(error);
            return;
        }
        const pending = this.#pendingRequest(response.id);
        if (!pending) {
            return;
        }
        completePendingRequest(pending, response);
    }
}
class NativePool {
    #binaryPath;
    #workers;
    #index = 0;
    constructor(binaryPath, threads) {
        this.#binaryPath = binaryPath;
        this.#workers = Array.from({ length: threads }, () => new NativeWorker(binaryPath));
    }
    transform(request) {
        const worker = this.#nextWorker();
        const requestId = nextRequestId;
        nextRequestId += 1;
        return worker.request({
            ...request,
            id: requestId,
        });
    }
    close() {
        for (const worker of this.#workers) {
            worker.close();
        }
    }
    #nextWorker() {
        const workerIndex = this.#index % this.#workers.length;
        this.#index += 1;
        const existingWorker = this.#workers.at(workerIndex);
        if (!existingWorker) {
            throw new Error(`Missing worker for index ${String(workerIndex)}`);
        }
        if (!existingWorker.isClosed) {
            return existingWorker;
        }
        const replacementWorker = new NativeWorker(this.#binaryPath);
        this.#workers[workerIndex] = replacementWorker;
        return replacementWorker;
    }
}
export function getPool(binaryPath, threadsOption) {
    const threads = threadsOption ?? defaultThreadCount();
    const key = `${binaryPath}:${String(threads)}`;
    const existingPool = POOLS.get(key);
    if (existingPool) {
        return existingPool;
    }
    const pool = new NativePool(binaryPath, threads);
    POOLS.set(key, pool);
    return pool;
}
export function closeAllPools() {
    for (const pool of POOLS.values()) {
        pool.close();
    }
    POOLS.clear();
}
//# sourceMappingURL=pool.js.map