'use strict';

const childProcess = require('child_process');
const os = require('os');
const readline = require('readline');

const DEFAULT_MAX_THREADS = 8;
const POOLS = new Map();
let nextRequestId = 1;

function defaultThreadCount() {
  const cpuCount = os.cpus() == null ? 1 : os.cpus().length;
  return Math.max(1, Math.min(DEFAULT_MAX_THREADS, cpuCount));
}

class NativeWorker {
  constructor(binaryPath) {
    this._pending = new Map();
    this._stderrTail = [];
    this._isClosed = false;

    this._child = childProcess.spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this._reader = readline.createInterface({
      input: this._child.stdout,
      crlfDelay: Infinity,
    });

    this._reader.on('line', line => {
      this._onResponseLine(line);
    });

    this._child.stderr.on('data', chunk => {
      const message = chunk.toString('utf8');
      this._stderrTail.push(message);
      if (this._stderrTail.length > 16) {
        this._stderrTail.shift();
      }
    });

    this._child.on('error', error => {
      this._failAllPending(error);
    });

    this._child.on('exit', code => {
      this._isClosed = true;
      this._failAllPending(
        new Error(
          `juno-flow-strip worker exited with code ${String(code)}${this._stderrSummary()}`,
        ),
      );
    });
  }

  get isClosed() {
    return this._isClosed;
  }

  _stderrSummary() {
    if (this._stderrTail.length === 0) {
      return '';
    }
    return `\nStderr:\n${this._stderrTail.join('')}`;
  }

  _failAllPending(error) {
    for (const pending of this._pending.values()) {
      pending.reject(error);
    }
    this._pending.clear();
  }

  _onResponseLine(line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch (error) {
      this._failAllPending(
        new Error(
          `juno-flow-strip worker emitted invalid JSON: ${String(error)}${this._stderrSummary()}`,
        ),
      );
      return;
    }

    const pending = this._pending.get(response.id);
    if (pending == null) {
      return;
    }
    this._pending.delete(response.id);

    if (response.ok === true) {
      pending.resolve({
        code: response.code,
        map: response.map,
      });
      return;
    }

    pending.reject(response.error || new Error('Unknown juno-flow-strip worker error'));
  }

  request(payload) {
    if (this._isClosed) {
      return Promise.reject(new Error('juno-flow-strip worker is closed'));
    }

    return new Promise((resolve, reject) => {
      this._pending.set(payload.id, {resolve, reject});
      try {
        this._child.stdin.write(JSON.stringify(payload));
        this._child.stdin.write('\n');
      } catch (error) {
        this._pending.delete(payload.id);
        reject(error);
      }
    });
  }

  close() {
    if (this._isClosed) {
      return;
    }

    this._isClosed = true;
    this._reader.close();
    this._child.kill();
    this._failAllPending(new Error('juno-flow-strip worker closed'));
  }
}

class NativePool {
  constructor(binaryPath, threads) {
    this._binaryPath = binaryPath;
    this._workers = Array.from({length: threads}, () => new NativeWorker(binaryPath));
    this._index = 0;
  }

  _ensureWorker(index) {
    let worker = this._workers[index];
    if (worker.isClosed) {
      worker = new NativeWorker(this._binaryPath);
      this._workers[index] = worker;
    }
    return worker;
  }

  transform(request) {
    const id = nextRequestId++;
    const workerIndex = this._index % this._workers.length;
    this._index += 1;

    const worker = this._ensureWorker(workerIndex);
    return worker.request({
      id,
      filename: request.filename,
      code: request.code,
      dialect: request.dialect,
      format: request.format,
      reactRuntimeTarget: request.reactRuntimeTarget,
      enumRuntimeModule: request.enumRuntimeModule,
    });
  }

  close() {
    for (const worker of this._workers) {
      worker.close();
    }
  }
}

function getPool(binaryPath, threadsOption) {
  const threads = threadsOption == null ? defaultThreadCount() : threadsOption;
  const key = `${binaryPath}:${String(threads)}`;
  let pool = POOLS.get(key);
  if (pool == null) {
    pool = new NativePool(binaryPath, threads);
    POOLS.set(key, pool);
  }
  return pool;
}

function closeAllPools() {
  for (const pool of POOLS.values()) {
    pool.close();
  }
  POOLS.clear();
}

module.exports = {
  getPool,
  closeAllPools,
};
