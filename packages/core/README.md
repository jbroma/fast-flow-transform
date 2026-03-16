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

Programmatic options:

| Property             | Required | Type                                            | Default         | Description                                                                       |
| -------------------- | -------- | ----------------------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| `source`             | Yes      | `string \| Buffer`                              | n/a             | Source text to transform                                                          |
| `format`             | No       | `'compact' \| 'pretty' \| 'preserve'`           | `'compact'`     | Output mode. `preserve` is experimental; see [Preserve Format](#preserve-format)  |
| `dialect`            | No       | `'flow' \| 'flow-detect' \| 'flow-unambiguous'` | `'flow-detect'` | Flow parsing mode                                                                 |
| `comments`           | No       | `boolean`                                       | `false`         | Preserves ordinary comments in any output mode                                    |
| `sourcemap`          | No       | `boolean`                                       | `true`          | Enables or disables FFT's emitted output source map                               |
| `filename`           | No       | `string`                                        | `'<unknown>'`   | Used in diagnostics and in the emitted source map when you pass a path            |
| `inputSourceMap`     | No       | `SourceMapLike \| null`                         | none            | Incoming source map from an earlier transform step to merge into FFT's output map |
| `reactRuntimeTarget` | No       | `'18' \| '19' \| 18 \| 19`                      | `'19'`          | Only affects Flow `component` lowering; normalized to `'18'` or `'19'`            |

When you provide `inputSourceMap`, FFT merges it into the emitted map. The
current merge path preserves source and name mappings, but does not yet retain
upstream `sourcesContent` or custom metadata fields.

Flow enums always lower to the external `flow-enums-runtime` package. If your
project uses Flow enums, install `flow-enums-runtime` as a dependency so the
generated runtime imports resolve in your bundler and at runtime.

## CLI Usage

```bash
fast-flow-transform src/input.js --out-file dist/output.js
```

The CLI reads the input file, calls the same `transform(...)` API exposed by the
package, and:

- writes transformed code to `--out-file`, or prints it to stdout when
  `--out-file` is absent
- writes a source map to `--source-map-file` or `--out-file.map` when source
  map output is enabled

CLI arguments:

| Argument                           | Required | Value                                     | Default          | Description                                                                         |
| ---------------------------------- | -------- | ----------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `<input-file>`                     | Yes      | `path`                                    | n/a              | Source file to transform                                                            |
| `--format <value>`                 | No       | `compact`, `pretty`, `preserve`           | `compact`        | Output mode. `preserve` is experimental; see [Preserve Format](#preserve-format)    |
| `--dialect <value>`                | No       | `flow`, `flow-detect`, `flow-unambiguous` | `flow-detect`    | Flow parsing mode                                                                   |
| `--comments`                       | No       | flag                                      | `false`          | Preserve ordinary comments in the output                                            |
| `--source-map` / `--no-source-map` | No       | flag                                      | `false`          | Enable or disable FFT's emitted output source map                                   |
| `--out-file <path>`                | No       | `path`                                    | none             | Write transformed code to a file                                                    |
| `--source-map-file <path>`         | No       | `path`                                    | `<out-file>.map` | Write the emitted output source map to a specific file and enable source map output |
| `--input-source-map <path>`        | No       | `path`                                    | none             | Load an upstream source map JSON file to merge into FFT's emitted output map        |
| `--react-runtime-target <n>`       | No       | `18`, `19`                                | `19`             | Only affects Flow `component` lowering                                              |
| `-h`, `--help`                     | No       | flag                                      | n/a              | Show help                                                                           |

```bash
fast-flow-transform src/input.js \
  --out-file dist/output.js \
  --dialect flow-detect \
  --format preserve \
  --comments
```

Without `--out-file`, transformed code goes to stdout. Source maps are off by
default unless you pass `--source-map` or `--source-map-file`.

## Preserve Format

`format: 'preserve'` and `--format preserve` are experimental.

This mode uses FFT's layout-preserving subtractive path instead of the normal
reprinter. It tries to remove Flow syntax while keeping the original spacing,
line structure, and comments as intact as possible. It supports source maps and
works with `comments: true`.

Current limitations:

- It only supports subtractive Flow stripping.
- It does not yet support Flow `component` declarations.
- It does not yet support Flow `hook` declarations.
- It does not yet support Flow `enum` declarations.
- It does not yet support Flow `match` statements or expressions.

## Bundler Adapters

The adapter entrypoints expose the same canonical transform options where the
host bundler makes sense of them: `dialect`, `format`, `comments`,
`reactRuntimeTarget`, and `sourcemap`.

Bundler integrations do not all treat `sourcemap` the same way. webpack and
rspack default to the loader context unless you override them, Parcel follows
the asset's source-map setting, Rollup/Vite/Rolldown always ask FFT for maps so
the bundler can compose them, and the esbuild adapter leaves final map emission
to esbuild itself.

<details>
<summary><strong>Webpack</strong></summary>

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

</details>

<details>
<summary><strong>Rspack</strong></summary>

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

</details>

<details>
<summary><strong>Rsbuild</strong></summary>

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

</details>

<details>
<summary><strong>Parcel</strong></summary>

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

</details>

<details>
<summary><strong>Vite</strong></summary>

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

</details>

<details>
<summary><strong>Rollup</strong></summary>

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

</details>

<details>
<summary><strong>Rolldown</strong></summary>

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

</details>

<details>
<summary><strong>esbuild</strong></summary>

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

</details>
