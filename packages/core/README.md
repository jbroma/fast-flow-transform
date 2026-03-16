# fast-flow-transform

A programmatic Flow type stripper with webpack, rspack, rsbuild, Parcel, Vite,
Rollup, Rolldown, and esbuild adapters.

## Features

- Native parse + transform + codegen + source map pipeline
- Small programmatic API for one-shot transforms
- CLI for transforming files with the same option set
- Dedicated webpack, rspack, rsbuild, Parcel, Vite, Rollup, Rolldown, and
  esbuild entrypoints
- Optional source map merging when you need emitted maps
- FFT strips Flow syntax only. JSX stays in the output for the bundler's own
  JSX pipeline to handle.

## Programmatic Usage

```ts
import transform from 'fast-flow-transform';

const result = await transform({
  filename: '/abs/path/input.js',
  source: 'const answer: number = 42;',
  sourcemap: true,
});
```

The programmatic API returns `{ code: string, map?: SourceMapLike }`. `map` is
present when source maps are enabled.

Programmatic input shape:

| Field                | Type                                            | Default         | Notes                                                                  |
| -------------------- | ----------------------------------------------- | --------------- | ---------------------------------------------------------------------- |
| `filename`           | `string`                                        | omitted         | Used in diagnostics and source maps; falls back to `'<unknown>'`       |
| `source`             | `string \| Buffer`                              | required        | Source text to transform                                               |
| `inputSourceMap`     | `SourceMapLike \| null`                         | omitted         | Merged into FFT's emitted map when present                             |
| `dialect`            | `'flow' \| 'flow-detect' \| 'flow-unambiguous'` | `'flow-detect'` | Flow parsing mode                                                      |
| `format`             | `'compact' \| 'pretty' \| 'preserve'`           | `'compact'`     | Output mode; `preserve` uses the layout-preserving subtractive path    |
| `comments`           | `boolean`                                       | `false`         | Keeps ordinary comments in any output mode                             |
| `reactRuntimeTarget` | `'18' \| '19' \| 18 \| 19`                      | `'19'`          | Only affects Flow `component` lowering; normalized to `'18'` or `'19'` |
| `sourcemap`          | `boolean`                                       | `true`          | Controls emitted source maps for the programmatic API and CLI          |

Adapter note: bundler integrations do not all treat `sourcemap` the same way.
webpack and rspack default to the loader context unless you override them,
Parcel follows the asset's source-map setting, Rollup/Vite/Rolldown always ask
FFT for maps so the bundler can compose them, and the esbuild adapter leaves
final map emission to esbuild itself.

Flow enums always lower to `flow-enums-runtime`.

## CLI Usage

```bash
fast-flow-transform src/input.js --out-file dist/output.js
```

The CLI reads the input file, calls the same `transform(...)` API exposed by the
package, and writes:

- transformed code to `--out-file`
- a source map to `--source-map-file` or `--out-file.map`

Useful flags:

```bash
fast-flow-transform src/input.js \
  --out-file dist/output.js \
  --dialect flow-detect \
  --format preserve \
  --comments
```

Output defaults to dense `compact` formatting. Pass `--format pretty`, or set
`format: 'pretty'` in adapter options, when you want readable reprinted output.

Enable `comments: true` or pass `--comments` when you want ordinary comments
preserved.

For source-preserving output, set `format: 'preserve'` or pass
`--format preserve`. That path preserves original layout where possible,
supports comments too, currently supports subtractive Flow stripping only, and
supports source maps as well.

If you want code on stdout instead of a file, disable source maps:

```bash
fast-flow-transform src/input.js --no-source-map
```

## Webpack Usage

```js
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        use: [
          {
            loader: 'swc-loader',
            options: {
              jsc: {
                parser: {
                  jsx: true,
                  syntax: 'ecmascript',
                },
                transform: {
                  react: {
                    runtime: 'classic',
                  },
                },
              },
            },
          },
          {
            loader: 'fast-flow-transform/webpack',
            options: {
              dialect: 'flow-detect',
            },
          },
        ],
      },
    ],
  },
};
```

If your config file is ESM, resolve the loader with
`createRequire(import.meta.url)` and `require.resolve(...)` like the runnable
example does.

Runnable example:
[`examples/webpack`](../../examples/webpack)

## Rspack Usage

```js
// rspack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  jsx: true,
                  syntax: 'ecmascript',
                },
                transform: {
                  react: {
                    runtime: 'classic',
                  },
                },
              },
            },
          },
          {
            loader: 'fast-flow-transform/rspack',
            options: {
              dialect: 'flow-detect',
            },
          },
        ],
      },
    ],
  },
};
```

If your config file is ESM, resolve the loader with
`createRequire(import.meta.url)` and `require.resolve(...)` like the runnable
example does.

Runnable example:
[`examples/rspack`](../../examples/rspack)

## Rsbuild Usage

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import pluginFastFlowTransformRsbuild from 'fast-flow-transform/rsbuild';

export default defineConfig({
  plugins: [
    pluginReact({
      swcReactOptions: {
        runtime: 'classic',
      },
    }),
    pluginFastFlowTransformRsbuild({
      dialect: 'flow-detect',
      format: 'compact',
      sourcemap: true,
    }),
  ],
  source: {
    // Rsbuild skips most node_modules by default.
    // include: [{ not: /[\\/]core-js[\\/]/ }],
  },
});
```

If you need lower-level control, `fast-flow-transform/rsbuild` also exposes the
named `applyFastFlowTransformRsbuild` helper for wiring directly inside your own
`tools.bundlerChain` logic.

Runnable example:
[`examples/rsbuild`](../../examples/rsbuild)

## Parcel Usage

Parcel expects transformers to be referenced from `.parcelrc` using either a
Parcel-style plugin package name or a local file path. The recommended setup is
to add a tiny local wrapper that imports `fast-flow-transform/parcel`.

```jsonc
{
  "extends": "@parcel/config-default",
  "transformers": {
    "*.{js,mjs,cjs,jsx}": ["./parcel-transformer.mjs", "..."],
  },
}
```

```js
// parcel-transformer.mjs
import { createFastFlowTransformParcel } from 'fast-flow-transform/parcel';

export default createFastFlowTransformParcel({
  dialect: 'flow-detect',
  sourcemap: true,
});
```

If the defaults are good enough, your wrapper can re-export the package's
default Parcel transformer instead:

```js
export { default } from 'fast-flow-transform/parcel';
```

Runnable example:
[`examples/parcel`](../../examples/parcel)

## Vite Usage

```ts
// vite.config.ts
import { defineConfig, transformWithEsbuild } from 'vite';
import fastFlowTransformVite from 'fast-flow-transform/vite';

const JS_WITH_JSX = /\.[cm]?jsx?(?:[?#].*)?$/;

function jsxAfterFftPlugin() {
  return {
    enforce: 'pre',
    name: 'jsx-after-fft',
    async transform(code, id) {
      if (id.startsWith('\0') || !JS_WITH_JSX.test(id)) {
        return null;
      }

      return await transformWithEsbuild(code, id, {
        jsx: 'transform',
        loader: 'jsx',
        sourcemap: true,
      });
    },
  };
}

export default defineConfig({
  plugins: [
    fastFlowTransformVite({
      dialect: 'flow-detect',
    }),
    jsxAfterFftPlugin(),
  ],
});
```

FFT does not lower JSX itself. If your JSX already lives in `.jsx` or `.tsx`
files, or another Vite plugin handles it, you may not need the extra
`transformWithEsbuild(...)` pass shown above.

Runnable example:
[`examples/vite`](../../examples/vite)

## Rollup Usage

```ts
import fastFlowTransformRollup from 'fast-flow-transform/rollup';

export default {
  plugins: [
    fastFlowTransformRollup({
      dialect: 'flow-detect',
    }),
  ],
};
```

If your graph still contains JSX after Flow stripping, add your preferred
Rollup JSX transform separately. FFT does not lower JSX.

Runnable example:
[`examples/rollup`](../../examples/rollup)

## Rolldown Usage

```ts
import fastFlowTransformRolldown from 'fast-flow-transform/rolldown';
import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/index.js',
  moduleTypes: {
    '.js': 'jsx',
  },
  output: {
    file: 'dist/out.js',
    format: 'cjs',
    sourcemap: true,
  },
  plugins: [
    fastFlowTransformRolldown({
      dialect: 'flow-detect',
    }),
  ],
  transform: {
    jsx: 'react',
  },
});
```

Rolldown already supports mixed ESM and CommonJS graphs natively, so you should
not pair this adapter with `@rollup/plugin-commonjs`.

Runnable example:
[`examples/rolldown`](../../examples/rolldown)

## esbuild Usage

```ts
import { build } from 'esbuild';
import fastFlowTransformEsbuild from 'fast-flow-transform/esbuild';

await build({
  bundle: true,
  entryPoints: ['src/index.js'],
  outfile: 'dist/out.js',
  plugins: [
    fastFlowTransformEsbuild({
      dialect: 'flow-detect',
    }),
  ],
});
```

Runnable example:
[`examples/esbuild`](../../examples/esbuild)
