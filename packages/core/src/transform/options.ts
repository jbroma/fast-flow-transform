import type {
  Dialect,
  Format,
  ReactRuntimeTarget,
  TransformOptions,
  TransformOptionsInput,
} from './types.js';

const DEFAULT_OPTIONS: TransformOptions = Object.freeze({
  comments: false,
  dialect: 'flow-detect',
  format: 'compact',
  removeEmptyImports: true,
  reactRuntimeTarget: '19',
  sourcemap: true,
});

const DIALECTS = new Set<Dialect>(['flow', 'flow-detect', 'flow-unambiguous']);
const FORMATS = new Set<Format>(['compact', 'preserve', 'pretty']);
const REACT_TARGETS = new Set<ReactRuntimeTarget>(['18', '19']);
const REMOVED_OPTIONS = new Set([
  'enumRuntimeModule',
  'preserveComments',
  'preserveWhitespace',
]);

function invalidOption(optionName: string, value: unknown): Error {
  return new Error(
    `Invalid fast-flow-transform option \`${optionName}\`: ${String(value)}`
  );
}

function validateStringOption<T extends string>(
  validValues: Set<T>,
  optionName: string,
  value: string
): T {
  if (validValues.has(value as T)) {
    return value as T;
  }

  throw invalidOption(optionName, value);
}

function validateSourceMapOption(sourcemap: unknown): boolean {
  if (typeof sourcemap === 'boolean') {
    return sourcemap;
  }

  throw invalidOption('sourcemap', sourcemap);
}

function validateBooleanOption(optionName: string, value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  throw invalidOption(optionName, value);
}

function rejectRemovedOptions(rawOptions: object): void {
  for (const optionName of REMOVED_OPTIONS) {
    if (Object.hasOwn(rawOptions, optionName)) {
      throw invalidOption(
        optionName,
        (rawOptions as Record<string, unknown>)[optionName]
      );
    }
  }
}

export function parseOptions(
  rawOptions: TransformOptionsInput | null | undefined
): TransformOptions {
  const options = rawOptions ?? {};
  rejectRemovedOptions(options);
  const comments = validateBooleanOption(
    'comments',
    options.comments ?? DEFAULT_OPTIONS.comments
  );
  const sourcemap = validateSourceMapOption(
    options.sourcemap ?? DEFAULT_OPTIONS.sourcemap
  );
  const removeEmptyImports = validateBooleanOption(
    'removeEmptyImports',
    options.removeEmptyImports ?? DEFAULT_OPTIONS.removeEmptyImports
  );

  return {
    comments,
    dialect: validateStringOption(
      DIALECTS,
      'dialect',
      options.dialect ?? DEFAULT_OPTIONS.dialect
    ),
    format: validateStringOption(
      FORMATS,
      'format',
      options.format ?? DEFAULT_OPTIONS.format
    ),
    removeEmptyImports,
    reactRuntimeTarget: validateStringOption(
      REACT_TARGETS,
      'reactRuntimeTarget',
      String(options.reactRuntimeTarget ?? DEFAULT_OPTIONS.reactRuntimeTarget)
    ),
    sourcemap,
  };
}
