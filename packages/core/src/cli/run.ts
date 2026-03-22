import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
} from 'node:fs/promises';
import { basename, dirname, relative } from 'node:path';

import fft from '../index.js';
import { parseOptions } from '../transform/options.js';
import type {
  SourceMapLike,
  TransformInput,
  TransformOptionsInput,
  TransformResult,
} from '../transform/types.js';
import { HELP_TEXT, parseCliArgs } from './args.js';
import type { CliCommand, UnparsedCliOptions } from './args.js';

interface StreamLike {
  write(chunk: string): unknown;
}

interface CliRuntime {
  cwd(): string;
  readFile(path: string): Promise<string>;
  stderr: StreamLike;
  stdout: StreamLike;
  transform(input: TransformInput): Promise<TransformResult>;
  writeFile(path: string, content: string): Promise<void>;
}

interface PreparedCommand {
  outputFile: string | undefined;
  request: TransformInput;
  sourceMapFile: string | undefined;
}

const DEFAULT_RUNTIME: CliRuntime = {
  cwd: () => process.cwd(),
  readFile: (path) => fsReadFile(path, 'utf8'),
  stderr: process.stderr,
  stdout: process.stdout,
  transform: fft,
  writeFile: (path, content) => fsWriteFile(path, content),
};

async function loadInputSourceMap(
  inputSourceMapFile: string | undefined,
  runtime: CliRuntime
): Promise<SourceMapLike | undefined> {
  if (!inputSourceMapFile) {
    return undefined;
  }

  return JSON.parse(
    await runtime.readFile(inputSourceMapFile)
  ) as SourceMapLike;
}

function defaultSourceMapFile(
  outputFile: string | undefined
): string | undefined {
  return outputFile ? `${outputFile}.map` : undefined;
}

function sourceMapUrl(outputFile: string, sourceMapFile: string): string {
  const relativePath =
    relative(dirname(outputFile), sourceMapFile) || basename(sourceMapFile);

  return relativePath.split('\\').join('/');
}

function appendSourceMapComment(
  code: string,
  outputFile: string,
  sourceMapFile: string
): string {
  const suffix = `//# sourceMappingURL=${sourceMapUrl(outputFile, sourceMapFile)}\n`;

  return code.endsWith('\n') ? `${code}${suffix}` : `${code}\n${suffix}`;
}

function resolvedSourceMapFile(
  outputFile: string | undefined,
  sourceMapFile: string | undefined,
  sourcemap: boolean
): string | undefined {
  if (!sourcemap) {
    if (sourceMapFile) {
      throw new Error('--source-map-file cannot be used with --no-source-map.');
    }

    return undefined;
  }

  return sourceMapFile ?? defaultSourceMapFile(outputFile);
}

function transformOptionsInput(
  options: UnparsedCliOptions
): TransformOptionsInput {
  return options as TransformOptionsInput;
}

function defaultCliSourceMap(command: CliCommand): boolean {
  return Boolean(command.sourceMapFile);
}

function resolvedRawOptions(command: CliCommand): UnparsedCliOptions {
  if (command.rawOptions.sourcemap !== undefined) {
    return command.rawOptions;
  }

  return {
    ...command.rawOptions,
    sourcemap: defaultCliSourceMap(command),
  };
}

async function prepareCommand(
  command: CliCommand,
  runtime: CliRuntime
): Promise<PreparedCommand> {
  const rawOptions = resolvedRawOptions(command);
  const options = parseOptions(transformOptionsInput(rawOptions));
  const sourceMapFile = resolvedSourceMapFile(
    command.outputFile,
    command.sourceMapFile,
    options.sourcemap
  );

  if (options.sourcemap && !command.outputFile && !sourceMapFile) {
    throw new Error('Source maps require --out-file or --source-map-file.');
  }

  const [source, inputSourceMap] = await Promise.all([
    runtime.readFile(command.inputFile),
    loadInputSourceMap(command.inputSourceMapFile, runtime),
  ]);

  return {
    outputFile: command.outputFile,
    request: {
      ...transformOptionsInput(rawOptions),
      filename: command.inputFile,
      ...(inputSourceMap ? { inputSourceMap } : {}),
      source,
      sourcemap: options.sourcemap,
    },
    sourceMapFile,
  };
}

async function emitTransformedOutput(
  result: TransformResult,
  outputFile: string | undefined,
  sourceMapFile: string | undefined,
  runtime: CliRuntime
): Promise<void> {
  if (sourceMapFile && !result.map) {
    throw new Error('Transform completed without a source map.');
  }

  if (outputFile) {
    const code = sourceMapFile
      ? appendSourceMapComment(result.code, outputFile, sourceMapFile)
      : result.code;
    await runtime.writeFile(outputFile, code);
  } else {
    runtime.stdout.write(result.code);
  }

  if (sourceMapFile && result.map) {
    await runtime.writeFile(
      sourceMapFile,
      `${JSON.stringify(result.map, null, 2)}\n`
    );
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function executeCommand(
  command: CliCommand,
  runtime: CliRuntime
): Promise<void> {
  const preparedCommand = await prepareCommand(command, runtime);
  const result = await runtime.transform(preparedCommand.request);

  await emitTransformedOutput(
    result,
    preparedCommand.outputFile,
    preparedCommand.sourceMapFile,
    runtime
  );
}

export async function runCli(
  args: readonly string[],
  runtime: CliRuntime = DEFAULT_RUNTIME
): Promise<number> {
  try {
    const parsedCommand = parseCliArgs(args, runtime.cwd());

    if (!parsedCommand) {
      runtime.stdout.write(HELP_TEXT);
      return 0;
    }

    await executeCommand(parsedCommand, runtime);

    return 0;
  } catch (error) {
    runtime.stderr.write(`${formatError(error)}\n`);
    return 1;
  }
}
