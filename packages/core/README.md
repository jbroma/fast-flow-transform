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
  --react-runtime-target 19 \
  --enum-runtime-module flow-enums-runtime
```

Output defaults to readable `pretty` formatting. Pass `--format compact`, or
set `format: 'compact'` in adapter options, when you want minified output.

Enable `preserveComments: true` or pass `--preserve-comments` when you want
ordinary comments preserved on normal `pretty` or `compact` output.

For source-preserving output, enable `preserveWhitespace: true` or pass
`--preserve-whitespace`. That path preserves original layout where possible,
can optionally keep comments too, currently supports subtractive Flow stripping
only, and now supports source maps as well.

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
        test: /\\.[jt]sx?$/,
        use: [
          {
            loader: 'fast-flow-transform/webpack',
            options: {
              dialect: 'flow-detect',
              reactRuntimeTarget: '18',
              enumRuntimeModule: 'flow-enums-runtime',
            },
          },
        ],
      },
    ],
  },
};
```

## Rspack Usage

```js
// rspack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\\.[jt]sx?$/,
        use: [
          {
            loader: 'fast-flow-transform/rspack',
          },
        ],
      },
    ],
  },
};
```

## Rsbuild Usage

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import pluginFastFlowTransformRsbuild from 'fast-flow-transform/rsbuild';

export default defineConfig({
  plugins: [
    pluginFastFlowTransformRsbuild({
      dialect: 'flow-detect',
      reactRuntimeTarget: '18',
    }),
  ],
  source: {
    // Rsbuild skips most node_modules by default. Include any Flow-heavy
    // dependencies you need compiled.
    include: [{ not: /[\\/]core-js[\\/]/ }],
  },
  tools: {
    bundlerChain: (chain, { CHAIN_ID }) => {
      // If your JS sources or dependencies contain JSX, align SWC's parser.
      chain.module
        .rule(CHAIN_ID.RULE.JS)
        .use(CHAIN_ID.USE.SWC)
        .tap((options) => ({
          ...options,
          jsc: {
            ...options.jsc,
            parser: {
              decorators: true,
              jsx: true,
              syntax: 'ecmascript',
            },
            transform: {
              ...options.jsc?.transform,
              react: {
                runtime: 'classic',
              },
            },
          },
        }));
    },
  },
});
```

If you need lower-level control, `fast-flow-transform/rsbuild` also exposes the
named `applyFastFlowTransformRsbuild` helper for wiring directly inside your own
`tools.bundlerChain` logic.

## Parcel Usage

Parcel expects transformers to be referenced from `.parcelrc` using either a
Parcel-style plugin package name or a local file path. The recommended setup is
to add a tiny local wrapper that imports `fast-flow-transform/parcel`.

```json
// .parcelrc
{
  "extends": "@parcel/config-default",
  "transformers": {
    "*.{js,mjs,cjs,jsx}": ["./parcel-transformer.mjs", "..."]
  }
}
```

```js
// parcel-transformer.mjs
import { createFastFlowTransformParcel } from 'fast-flow-transform/parcel';

export default createFastFlowTransformParcel({
  dialect: 'flow-detect',
  reactRuntimeTarget: '18',
  sourcemap: true,
});
```

If the defaults are good enough, your wrapper can re-export the package's
default Parcel transformer instead:

```js
export { default } from 'fast-flow-transform/parcel';
```

## Vite Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import fastFlowTransformVite from 'fast-flow-transform/vite';

export default defineConfig({
  plugins: [
    fastFlowTransformVite({
      dialect: 'flow-detect',
      reactRuntimeTarget: '18',
    }),
  ],
});
```

It does not lower JSX itself. Vite's normal JSX handling remains responsible
for that phase.

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

## Rolldown Usage

```ts
import fastFlowTransformRolldown from 'fast-flow-transform/rolldown';

await build({
  input: 'src/index.js',
  plugins: [
    fastFlowTransformRolldown({
      dialect: 'flow-detect',
    }),
  ],
});
```

Rolldown already supports mixed ESM and CommonJS graphs natively, so you should
not pair this adapter with `@rollup/plugin-commonjs`.

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
