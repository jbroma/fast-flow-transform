import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(TEST_DIR, 'node_modules/.bin/fast-flow-transform');
const FLOW_INPUT =
  "// @flow\nimport type { Node } from './types.js';\nconst value: Node = { id: 1 };\nexport default value.id;\n";

interface SourceMapJson {
  sources?: string[];
  version: number;
}

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'fft-cli-e2e-'));

  try {
    await run(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function inputFilePath(dir: string): string {
  return join(dir, 'input.js');
}

function outputFilePath(dir: string): string {
  return join(dir, 'output.js');
}

async function runCli(args: string[], cwd: string) {
  return await execFileAsync(CLI_PATH, args, { cwd });
}

async function readSourceMap(outputFile: string): Promise<SourceMapJson> {
  return JSON.parse(
    await readFile(`${outputFile}.map`, 'utf8')
  ) as SourceMapJson;
}

async function writeSuccessFixture(inputFile: string): Promise<void> {
  await writeFile(inputFile, FLOW_INPUT);
}

function expectSuccessfulTransform(
  stderr: string,
  output: string,
  sourceMap: SourceMapJson,
  inputFile: string
) {
  expect({
    hasImportType: output.includes('import type'),
    hasNodeType: output.includes(': Node'),
    hasSourceMapUrl: output.includes('sourceMappingURL=output.js.map'),
    stderr,
    version: sourceMap.version,
  }).toStrictEqual({
    hasImportType: false,
    hasNodeType: false,
    hasSourceMapUrl: true,
    stderr: '',
    version: 3,
  });
  expect(sourceMap.sources).toContain(inputFile);
}

describe('cli e2e', () => {
  it('transforms a file and writes code plus a sourcemap', async () => {
    await withTempDir(async (dir) => {
      const inputFile = inputFilePath(dir);
      const outputFile = outputFilePath(dir);
      await writeSuccessFixture(inputFile);

      const { stderr } = await runCli(
        [inputFile, '--out-file', outputFile],
        dir
      );

      const output = await readFile(outputFile, 'utf8');
      const sourceMap = await readSourceMap(outputFile);

      expectSuccessfulTransform(stderr, output, sourceMap, inputFile);
    });
  });

  it('fails when sourcemaps are enabled without an output destination', async () => {
    await withTempDir(async (dir) => {
      const inputFile = inputFilePath(dir);
      await writeFile(inputFile, '// @flow\nconst value: number = 1;\n');

      await expect(runCli([inputFile], dir)).rejects.toMatchObject({
        code: 1,
        stderr: 'Source maps require --out-file or --source-map-file.\n',
      });
    });
  });
});
