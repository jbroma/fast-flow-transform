import { describe, expect, it, vi } from 'vitest';

import { runCli } from '../run.js';

type RawSourceMap = import('source-map').RawSourceMap;

function createMap(file: string): RawSourceMap {
  return {
    file,
    mappings: '',
    names: [],
    sources: ['/tmp/input.js'],
    version: '3',
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
      cwd: () => '/repo',
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
  it('transforms a file and writes code plus sourcemap files', async () => {
    const { deps, readFile, transform, writeFile } = createDeps();
    readFile.mockImplementation(async (path) => {
      if (path === '/repo/src/input.js') {
        return 'const answer: number = 42;';
      }

      throw new Error(`Unexpected read: ${path}`);
    });
    transform.mockResolvedValue({
      code: 'const answer = 42;\n',
      map: createMap('/repo/dist/output.js'),
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
      ],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      dialect: 'flow',
      filename: '/repo/src/input.js',
      format: 'pretty',
      source: 'const answer: number = 42;',
      sourcemap: true,
    });
    expect(writeFile).toHaveBeenNthCalledWith(
      1,
      '/repo/dist/output.js',
      'const answer = 42;\n//# sourceMappingURL=output.js.map\n'
    );
    expect(writeFile).toHaveBeenNthCalledWith(
      2,
      '/repo/dist/output.js.map',
      `${JSON.stringify(createMap('/repo/dist/output.js'), null, 2)}\n`
    );
  });

  it('prints transformed code to stdout when no output file is provided', async () => {
    const { deps, readFile, stdout, transform, writeFile } = createDeps();
    readFile.mockResolvedValue('const answer: number = 42;');
    transform.mockResolvedValue({
      code: 'const answer = 42;\n',
    });

    const exitCode = await runCli(['src/input.js', '--no-source-map'], deps);

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: '/repo/src/input.js',
      source: 'const answer: number = 42;',
      sourcemap: false,
    });
    expect(stdout).toEqual(['const answer = 42;\n']);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('forwards preserve flags with explicit no-source-map', async () => {
    const { deps, readFile, stdout, transform, writeFile } = createDeps();
    readFile.mockResolvedValue('const answer: number = 42;');
    transform.mockResolvedValue({
      code: 'const answer = 42;\n',
    });

    const exitCode = await runCli(
      [
        'src/input.js',
        '--preserve-whitespace',
        '--preserve-comments',
        '--no-source-map',
      ],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: '/repo/src/input.js',
      preserveComments: true,
      preserveWhitespace: true,
      source: 'const answer: number = 42;',
      sourcemap: false,
    });
    expect(stdout).toEqual(['const answer = 42;\n']);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('forwards preserveComments without preserveWhitespace', async () => {
    const { deps, readFile, stdout, transform, writeFile } = createDeps();
    readFile.mockResolvedValue('/* keep */\nconst answer: number = 42;');
    transform.mockResolvedValue({
      code: '/* keep */\nconst answer = 42;\n',
    });

    const exitCode = await runCli(
      ['src/input.js', '--preserve-comments', '--no-source-map'],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: '/repo/src/input.js',
      preserveComments: true,
      source: '/* keep */\nconst answer: number = 42;',
      sourcemap: false,
    });
    expect(stdout).toEqual(['/* keep */\nconst answer = 42;\n']);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('loads an input sourcemap file and forwards it to transform', async () => {
    const { deps, readFile, transform, writeFile } = createDeps();
    const inputMap = createMap('/repo/src/input.js');
    readFile.mockImplementation(async (path) => {
      if (path === '/repo/src/input.js') {
        return 'const answer: number = 42;';
      }

      if (path === '/repo/maps/input.js.map') {
        return JSON.stringify(inputMap);
      }

      throw new Error(`Unexpected read: ${path}`);
    });
    transform.mockResolvedValue({
      code: 'const answer = 42;\n',
      map: createMap('/repo/dist/output.js'),
    });

    const exitCode = await runCli(
      [
        'src/input.js',
        '--input-source-map',
        'maps/input.js.map',
        '--out-file',
        'dist/output.js',
      ],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: '/repo/src/input.js',
      inputSourceMap: inputMap,
      source: 'const answer: number = 42;',
      sourcemap: true,
    });
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it('reports an error when sourcemaps are enabled without a file destination', async () => {
    const { deps, readFile, stderr, transform } = createDeps();
    readFile.mockResolvedValue('const answer: number = 42;');

    const exitCode = await runCli(['src/input.js'], deps);

    expect(exitCode).toBe(1);
    expect(transform).not.toHaveBeenCalled();
    expect(stderr).toEqual([
      'Source maps require --out-file or --source-map-file.\n',
    ]);
  });
});
