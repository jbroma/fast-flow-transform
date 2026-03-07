# fast-flow-transform

A programmatic Flow type stripper with webpack and rspack loader adapters.

## Features

- Native parse + transform + codegen + source map pipeline
- Small programmatic API for one-shot transforms
- Dedicated webpack and rspack loader entrypoints
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
cd packages/core
pnpm run pack:local
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
FFT_STRIP_BINARY=/abs/path/to/fft-strip pnpm run pack:local
```

Install elsewhere:

```bash
pnpm add /abs/path/to/packages/core/artifacts/*.tgz
```
