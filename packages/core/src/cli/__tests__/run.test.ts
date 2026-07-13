import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runCli } from '../run.js';

type RawSourceMap = import('source-map').RawSourceMap;

const REPO_ROOT = resolve('/repo');
const INPUT_FILE = resolve(REPO_ROOT, 'src/input.js');
const INPUT_MAP_FILE = resolve(REPO_ROOT, 'maps/input.js.map');
const OUTPUT_FILE = resolve(REPO_ROOT, 'dist/output.js');
const OUTPUT_MAP_FILE = `${OUTPUT_FILE}.map`;

function createMap(file: string): RawSourceMap {
  return {
    file,
    mappings: '',
    names: [],
    sources: ['/tmp/input.js'],
    version: 3,
  };
}

function createDeps() {
  const readFile = vi.fn<(path: string) => Promise<string>>();
  const writeFile = vi.fn<(path: string, content: string) => Promise<void>>();
  const transform = vi.fn();
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    deps: {
      cwd: () => REPO_ROOT,
      readFile,
      stderr: {
        write(chunk: string) {
          stderr.push(chunk);
        },
      },
      stdout: {
        write(chunk: string) {
          stdout.push(chunk);
        },
      },
      transform,
      writeFile,
    },
    readFile,
    stderr,
    stdout,
    transform,
    writeFile,
  };
}

describe('CLI runner', () => {
  it('transforms a file without source maps by default', async () => {
    const { deps, readFile, transform, writeFile } = createDeps();
    readFile.mockImplementation(async (path) => {
      if (path === INPUT_FILE) {
        return 'const answer: number = 42;';
      }

      throw new Error(`Unexpected read: ${path}`);
    });
    transform.mockResolvedValue({
      code: 'const answer = 42;\n',
      map: createMap(OUTPUT_FILE),
    });

    const exitCode = await runCli(
      ['src/input.js', '--out-file', 'dist/output.js'],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: INPUT_FILE,
      source: 'const answer: number = 42;',
      sourcemap: false,
    });
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(OUTPUT_FILE, 'const answer = 42;\n');
  });

  it('writes code plus sourcemap files when --source-map is enabled', async () => {
    const { deps, readFile, transform, writeFile } = createDeps();
    readFile.mockImplementation(async (path) => {
      if (path === INPUT_FILE) {
        return 'const answer: number = 42;';
      }

      throw new Error(`Unexpected read: ${path}`);
    });
    transform.mockResolvedValue({
      code: 'const answer = 42;\n',
      map: createMap(OUTPUT_FILE),
    });

    const exitCode = await runCli(
      [
        'src/input.js',
        '--out-file',
        'dist/output.js',
        '--dialect',
        'flow',
        '--format',
        'pretty',
        '--source-map',
      ],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      dialect: 'flow',
      filename: INPUT_FILE,
      format: 'pretty',
      source: 'const answer: number = 42;',
      sourcemap: true,
    });
    expect(writeFile).toHaveBeenNthCalledWith(
      1,
      OUTPUT_FILE,
      'const answer = 42;\n//# sourceMappingURL=output.js.map\n'
    );
    expect(writeFile).toHaveBeenNthCalledWith(
      2,
      OUTPUT_MAP_FILE,
      `${JSON.stringify(createMap(OUTPUT_FILE), null, 2)}\n`
    );
  });

  it('prints transformed code to stdout by default when no output file is provided', async () => {
    const { deps, readFile, stdout, transform, writeFile } = createDeps();
    readFile.mockResolvedValue('const answer: number = 42;');
    transform.mockResolvedValue({
      code: 'const answer = 42;\n',
    });

    const exitCode = await runCli(['src/input.js'], deps);

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: INPUT_FILE,
      source: 'const answer: number = 42;',
      sourcemap: false,
    });
    expect(stdout).toEqual(['const answer = 42;\n']);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('forwards preserve flags to stdout without requiring --no-source-map', async () => {
    const { deps, readFile, stdout, transform, writeFile } = createDeps();
    readFile.mockResolvedValue('const answer: number = 42;');
    transform.mockResolvedValue({
      code: 'const answer = 42;\n',
    });

    const exitCode = await runCli(
      ['src/input.js', '--format', 'preserve', '--comments'],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      comments: true,
      filename: INPUT_FILE,
      format: 'preserve',
      source: 'const answer: number = 42;',
      sourcemap: false,
    });
    expect(stdout).toEqual(['const answer = 42;\n']);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('forwards comments to stdout without preserve formatting', async () => {
    const { deps, readFile, stdout, transform, writeFile } = createDeps();
    readFile.mockResolvedValue('/* keep */\nconst answer: number = 42;');
    transform.mockResolvedValue({
      code: '/* keep */\nconst answer = 42;\n',
    });

    const exitCode = await runCli(['src/input.js', '--comments'], deps);

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      comments: true,
      filename: INPUT_FILE,
      source: '/* keep */\nconst answer: number = 42;',
      sourcemap: false,
    });
    expect(stdout).toEqual(['/* keep */\nconst answer = 42;\n']);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('loads an input sourcemap file and forwards it to transform', async () => {
    const { deps, readFile, transform, writeFile } = createDeps();
    const inputMap = createMap(INPUT_FILE);
    readFile.mockImplementation(async (path) => {
      if (path === INPUT_FILE) {
        return 'const answer: number = 42;';
      }

      if (path === INPUT_MAP_FILE) {
        return JSON.stringify(inputMap);
      }

      throw new Error(`Unexpected read: ${path}`);
    });
    transform.mockResolvedValue({
      code: 'const answer = 42;\n',
      map: createMap(OUTPUT_FILE),
    });

    const exitCode = await runCli(
      [
        'src/input.js',
        '--input-source-map',
        'maps/input.js.map',
        '--out-file',
        'dist/output.js',
        '--source-map',
      ],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: INPUT_FILE,
      inputSourceMap: inputMap,
      source: 'const answer: number = 42;',
      sourcemap: true,
    });
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it('reports an error when --source-map is enabled without a file destination', async () => {
    const { deps, readFile, stderr, transform } = createDeps();
    readFile.mockResolvedValue('const answer: number = 42;');

    const exitCode = await runCli(['src/input.js', '--source-map'], deps);

    expect(exitCode).toBe(1);
    expect(transform).not.toHaveBeenCalled();
    expect(stderr).toEqual([
      'Source maps require --out-file or --source-map-file.\n',
    ]);
  });
});
