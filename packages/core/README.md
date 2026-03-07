# fast-flow-transform

A webpack/rspack loader that strips Flow types through a native Hermes/FFT binary.

## Features

- Native parse + transform + codegen + source map pipeline
- One loader implementation for webpack and rspack
- Persistent worker process pool for low warm-build overhead
- Deterministic in-memory cache keying over source/options/binary version

## Usage

```js
// webpack.config.js or rspack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\\.[jt]sx?$/,
        use: [
          {
            loader: 'fast-flow-transform',
            options: {
              dialect: 'flow-detect',
              format: 'compact',
              reactRuntimeTarget: '18',
              enumRuntimeModule: 'flow-enums-runtime',
              sourcemap: true,
              threads: 4,
            },
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

# 3) Point loader to local binary for an integration test.
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
