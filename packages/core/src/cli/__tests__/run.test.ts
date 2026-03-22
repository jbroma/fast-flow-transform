import { describe, expect, it, vi } from 'vitest';

import { runCli } from '../run.js';

type RawSourceMap = import('source-map').RawSourceMap;

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
  it('transforms a file without source maps by default', async () => {
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
      ['src/input.js', '--out-file', 'dist/output.js'],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: '/repo/src/input.js',
      removeEmptyImports: true,
      source: 'const answer: number = 42;',
      sourcemap: false,
    });
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      '/repo/dist/output.js',
      'const answer = 42;\n'
    );
  });

  it('writes code plus sourcemap files when --source-map is enabled', async () => {
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
        '--source-map',
      ],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      dialect: 'flow',
      filename: '/repo/src/input.js',
      format: 'pretty',
      removeEmptyImports: true,
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

  it('prints transformed code to stdout by default when no output file is provided', async () => {
    const { deps, readFile, stdout, transform, writeFile } = createDeps();
    readFile.mockResolvedValue('const answer: number = 42;');
    transform.mockResolvedValue({
      code: 'const answer = 42;\n',
    });

    const exitCode = await runCli(['src/input.js'], deps);

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: '/repo/src/input.js',
      removeEmptyImports: true,
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
      filename: '/repo/src/input.js',
      format: 'preserve',
      removeEmptyImports: true,
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
      filename: '/repo/src/input.js',
      removeEmptyImports: true,
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
        '--source-map',
      ],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: '/repo/src/input.js',
      inputSourceMap: inputMap,
      removeEmptyImports: true,
      source: 'const answer: number = 42;',
      sourcemap: true,
    });
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it('forwards --no-remove-empty-imports to transform', async () => {
    const { deps, readFile, stdout, transform, writeFile } = createDeps();
    readFile.mockResolvedValue("import { type Foo } from './types.js';");
    transform.mockResolvedValue({
      code: "import './types.js';\n",
    });

    const exitCode = await runCli(
      ['src/input.js', '--no-remove-empty-imports'],
      deps
    );

    expect(exitCode).toBe(0);
    expect(transform).toHaveBeenCalledWith({
      filename: '/repo/src/input.js',
      removeEmptyImports: false,
      source: "import { type Foo } from './types.js';",
      sourcemap: false,
    });
    expect(stdout).toEqual(["import './types.js';\n"]);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('prints help text including remove-empty-imports flags', async () => {
    const { deps, stdout } = createDeps();

    const exitCode = await runCli(['--help'], deps);

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('--remove-empty-imports');
    expect(stdout.join('')).toContain('--no-remove-empty-imports');
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
