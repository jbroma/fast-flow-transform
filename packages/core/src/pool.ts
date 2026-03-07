import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { cpus } from 'node:os';
import { createInterface } from 'node:readline';
import type { Interface } from 'node:readline';

import type {
  SourceMapLike,
  TransformRequest,
  TransformResult,
} from './types.js';

const DEFAULT_MAX_THREADS = 8;
const MAX_STDERR_TAIL_LINES = 16;
const POOLS = new Map<string, NativePool>();

let nextRequestId = 1;

interface PendingRequest {
  reject: (reason?: unknown) => void;
  resolve: (value: TransformResult) => void;
}

type WorkerResponse =
  | { code: string; id: number; map: SourceMapLike; ok: true }
  | { error?: unknown; id: number; ok?: false };

function defaultThreadCount(): number {
  return Math.max(1, Math.min(DEFAULT_MAX_THREADS, cpus().length || 1));
}

function parseWorkerResponse(
  line: string,
  stderrSummary: string
): WorkerResponse {
  try {
    return JSON.parse(line) as WorkerResponse;
  } catch (error) {
    throw new Error(
      `fft-strip worker emitted invalid JSON: ${String(error)}${stderrSummary}`,
      { cause: error }
    );
  }
}

function completePendingRequest(
  pending: PendingRequest,
  response: WorkerResponse
): void {
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
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #reader: Interface;
  readonly #stderrTail: string[] = [];
  #isClosed = false;

  constructor(binaryPath: string) {
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
      this.#failAllPending(
        new Error(
          `fft-strip worker exited with code ${String(code)}${this.#stderrSummary()}`
        )
      );
    });
  }

  get isClosed(): boolean {
    return this.#isClosed;
  }

  request(
    payload: TransformRequest & { id: number }
  ): Promise<TransformResult> {
    if (this.#isClosed) {
      return Promise.reject(new Error('fft-strip worker is closed'));
    }

    return new Promise((resolve, reject) => {
      this.#pending.set(payload.id, { reject, resolve });
      try {
        this.#child.stdin.write(JSON.stringify(payload));
        this.#child.stdin.write('\n');
      } catch (error) {
        this.#pending.delete(payload.id);
        reject(error);
      }
    });
  }

  close(): void {
    if (this.#isClosed) {
      return;
    }

    this.#isClosed = true;
    this.#reader.close();
    this.#child.kill();
    this.#failAllPending(new Error('fft-strip worker closed'));
  }

  #pushStderrChunk(message: string): void {
    this.#stderrTail.push(message);
    if (this.#stderrTail.length > MAX_STDERR_TAIL_LINES) {
      this.#stderrTail.shift();
    }
  }

  #stderrSummary(): string {
    if (this.#stderrTail.length === 0) {
      return '';
    }

    return `\nStderr:\n${this.#stderrTail.join('')}`;
  }

  #failAllPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }

    this.#pending.clear();
  }

  #pendingRequest(id: number): PendingRequest | null {
    const pending = this.#pending.get(id);
    if (!pending) {
      return null;
    }

    this.#pending.delete(id);
    return pending;
  }

  #onResponseLine(line: string): void {
    let response: WorkerResponse;

    try {
      response = parseWorkerResponse(line, this.#stderrSummary());
    } catch (error) {
      this.#failAllPending(error as Error);
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
  readonly #binaryPath: string;
  readonly #workers: NativeWorker[];
  #index = 0;

  constructor(binaryPath: string, threads: number) {
    this.#binaryPath = binaryPath;
    this.#workers = Array.from(
      { length: threads },
      () => new NativeWorker(binaryPath)
    );
  }

  transform(request: TransformRequest): Promise<TransformResult> {
    const worker = this.#nextWorker();
    const requestId = nextRequestId;
    nextRequestId += 1;

    return worker.request({
      ...request,
      id: requestId,
    });
  }

  close(): void {
    for (const worker of this.#workers) {
      worker.close();
    }
  }

  #nextWorker(): NativeWorker {
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

export function getPool(
  binaryPath: string,
  threadsOption?: number
): NativePool {
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

export function closeAllPools(): void {
  for (const pool of POOLS.values()) {
    pool.close();
  }

  POOLS.clear();
}
