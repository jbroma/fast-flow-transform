import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

type UnrefableStream = PassThrough & {
  unref: ReturnType<typeof vi.fn>;
};

type MockChildProcess = EventEmitter & {
  kill: ReturnType<typeof vi.fn>;
  stderr: UnrefableStream;
  stdin: UnrefableStream;
  stdout: UnrefableStream;
  unref: ReturnType<typeof vi.fn>;
};

type MockReader = EventEmitter & {
  close: ReturnType<typeof vi.fn>;
};

function createStream(): UnrefableStream {
  const stream = new PassThrough() as UnrefableStream;
  stream.unref = vi.fn();
  return stream;
}

function createChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.kill = vi.fn();
  child.stdin = createStream();
  child.stdout = createStream();
  child.stderr = createStream();
  child.unref = vi.fn();
  return child;
}

function createReader(): MockReader {
  const reader = new EventEmitter() as MockReader;
  reader.close = vi.fn();
  return reader;
}

describe('native worker pool process lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('unrefs spawned worker handles so one-shot builds can exit cleanly', async () => {
    const child = createChildProcess();
    const reader = createReader();
    const spawn = vi.fn(() => child);
    const createInterface = vi.fn(() => reader);

    vi.doMock('node:child_process', async () => {
      const actual =
        await vi.importActual<typeof import('node:child_process')>(
          'node:child_process'
        );

      return {
        ...actual,
        spawn,
      };
    });

    vi.doMock('node:readline', async () => {
      const actual =
        await vi.importActual<typeof import('node:readline')>('node:readline');

      return {
        ...actual,
        createInterface,
      };
    });

    const poolModule = await import('../src/pool.js');
    poolModule.getPool('/tmp/fft_strip', 1);

    expect(child.unref).toHaveBeenCalledTimes(1);
    expect(child.stdin.unref).toHaveBeenCalledTimes(1);
    expect(child.stdout.unref).toHaveBeenCalledTimes(1);
    expect(child.stderr.unref).toHaveBeenCalledTimes(1);

    poolModule.closeAllPools();
  });
});
