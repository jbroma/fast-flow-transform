# fast-flow-transform

A programmatic Flow type stripper with webpack, rspack, rsbuild, and Parcel adapters.

## Features

- Native parse + transform + codegen + source map pipeline
- Small programmatic API for one-shot transforms
- CLI for transforming files with the same option set
- Dedicated webpack, rspack, rsbuild, and Parcel entrypoints
- Optional source map merging when you need emitted maps

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
  --format pretty \
  --react-runtime-target 19 \
  --enum-runtime-module flow-enums-runtime
```

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
              format: 'compact',
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
      format: 'compact',
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
  format: 'compact',
  reactRuntimeTarget: '18',
  sourcemap: true,
});
```

If the defaults are good enough, your wrapper can re-export the package's
default Parcel transformer instead:

```js
export { default } from 'fast-flow-transform/parcel';
```

If you need to override binary resolution during development, set:

```bash
FFT_STRIP_BINARY=/absolute/path/to/fft-strip
```

## Local Testing

From the repo root:

```bash
cd packages/core

# 1) Build the ESM package output.
pnpm run build

# 2) Build native binary in the standalone workspace root.
cd ../..
cargo build --release -p fft_strip

# 3) Point the package to the local binary.
export FFT_STRIP_BINARY="$PWD/target/release/fft-strip"
```

On Windows use `target\\release\\fft-strip.exe`.

## Create Movable Tarballs

You can build tarballs that are installable in other repos:

```bash
pnpm pack:local
```

This command will:

1. Build `fft_strip` natively.
2. Copy the binary into:
   - `fast-flow-transform/bin/` (bundled fallback)
   - the current platform package
     (`bindings/fast-flow-transform-<platform>-<arch>/bin/`)
3. Emit `.tgz` files in `packages/core/artifacts/`.

If you already built the native executable, skip Cargo build:

```bash
FFT_STRIP_BINARY=/abs/path/to/fft-strip pnpm pack:local
```

Install elsewhere:

```bash
pnpm add /abs/path/to/packages/core/artifacts/*.tgz
```
