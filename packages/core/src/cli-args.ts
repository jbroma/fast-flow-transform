import { resolve } from 'node:path';

import type { TransformOptionsInput } from './transform/types.js';

export interface CliCommand {
  inputFile: string;
  inputSourceMapFile: string | undefined;
  outputFile: string | undefined;
  rawOptions: UnparsedCliOptions;
  sourceMapFile: string | undefined;
}

interface ParseState {
  inputFile?: string;
  inputSourceMapFile?: string;
  outputFile?: string;
  rawOptions: UnparsedCliOptions;
  sourceMapFile?: string;
}

export interface UnparsedCliOptions extends Omit<
  TransformOptionsInput,
  'dialect' | 'format' | 'reactRuntimeTarget'
> {
  dialect?: string;
  format?: string;
  reactRuntimeTarget?: string;
}

type BooleanFlagHandler = (state: ParseState) => void;
type ValueFlagHandler = (state: ParseState, value: string, cwd: string) => void;

export const HELP_TEXT = `Usage: fast-flow-transform <input-file> [options]

Options:
  --out-file <path>           Write transformed code to a file
  --input-source-map <path>   Load an incoming source map JSON file
  --source-map-file <path>    Write the emitted source map to a file
  --dialect <value>           flow | flow-detect | flow-unambiguous
  --format <value>            compact | pretty (default: pretty)
  --preserve-whitespace       Preserve original whitespace where possible
  --preserve-comments         Preserve comments with --preserve-whitespace
  --react-runtime-target <n>  18 | 19
  --enum-runtime-module <id>  Override enum runtime module
  --source-map                Enable source map output
  --no-source-map             Disable source map output
  -h, --help                  Show this help
`;

const BOOLEAN_FLAG_HANDLERS: Record<string, BooleanFlagHandler> = {
  '--no-source-map': (state) => {
    state.rawOptions.sourcemap = false;
  },
  '--preserve-comments': (state) => {
    state.rawOptions.preserveComments = true;
  },
  '--preserve-whitespace': (state) => {
    state.rawOptions.preserveWhitespace = true;
  },
  '--source-map': (state) => {
    state.rawOptions.sourcemap = true;
  },
};

const VALUE_FLAG_HANDLERS: Record<string, ValueFlagHandler> = {
  '--dialect': (state, value) => {
    state.rawOptions.dialect = value;
  },
  '--enum-runtime-module': (state, value) => {
    state.rawOptions.enumRuntimeModule = value;
  },
  '--format': (state, value) => {
    state.rawOptions.format = value;
  },
  '--input-source-map': (state, value, cwd) => {
    state.inputSourceMapFile = resolve(cwd, value);
  },
  '--out-file': (state, value, cwd) => {
    state.outputFile = resolve(cwd, value);
  },
  '--react-runtime-target': (state, value) => {
    state.rawOptions.reactRuntimeTarget = value;
  },
  '--source-map-file': (state, value, cwd) => {
    state.sourceMapFile = resolve(cwd, value);
  },
};

function missingValue(flag: string): Error {
  return new Error(`Missing value for ${flag}.`);
}

function invalidArgument(argument: string): Error {
  return new Error(`Unknown CLI argument: ${argument}`);
}

function nextValue(
  args: readonly string[],
  index: number,
  flag: string
): string {
  const value = args[index + 1];

  if (!value) {
    throw missingValue(flag);
  }

  return value;
}

function createParseState(): ParseState {
  return { rawOptions: {} };
}

function assignInputFile(
  state: ParseState,
  argument: string,
  cwd: string
): number {
  if (state.inputFile) {
    throw new Error(`Unexpected extra input file: ${argument}`);
  }

  state.inputFile = resolve(cwd, argument);

  return 0;
}

function parseValueFlag(
  argument: string,
  args: readonly string[],
  index: number,
  state: ParseState,
  cwd: string
): number {
  const valueHandler = VALUE_FLAG_HANDLERS[argument];

  if (!valueHandler) {
    throw invalidArgument(argument);
  }

  valueHandler(state, nextValue(args, index, argument), cwd);

  return 1;
}

function parseFlagArgument(
  argument: string,
  args: readonly string[],
  index: number,
  state: ParseState,
  cwd: string
): number {
  const booleanHandler = BOOLEAN_FLAG_HANDLERS[argument];

  if (!booleanHandler) {
    return parseValueFlag(argument, args, index, state, cwd);
  }

  booleanHandler(state);

  return 0;
}

function finalCommand(state: ParseState): CliCommand {
  if (!state.inputFile) {
    throw new Error('An input file is required.');
  }

  return {
    inputFile: state.inputFile,
    inputSourceMapFile: state.inputSourceMapFile,
    outputFile: state.outputFile,
    rawOptions: state.rawOptions,
    sourceMapFile: state.sourceMapFile,
  };
}

function isHelpArgument(argument: string): boolean {
  return argument === '-h' || argument === '--help';
}

function nextIndex(
  argument: string,
  args: readonly string[],
  index: number,
  state: ParseState,
  cwd: string
): number {
  return argument.startsWith('-')
    ? parseFlagArgument(argument, args, index, state, cwd)
    : assignInputFile(state, argument, cwd);
}

export function parseCliArgs(
  args: readonly string[],
  cwd: string
): CliCommand | null {
  const state = createParseState();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (!argument) {
      continue;
    }

    if (isHelpArgument(argument)) {
      return null;
    }

    index += nextIndex(argument, args, index, state, cwd);
  }

  return finalCommand(state);
}
