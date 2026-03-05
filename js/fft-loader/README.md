# fft-loader

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
            loader: 'fft-loader',
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
cd js/fft-loader

# 1) Build/copy dist files for npm package shape.
npm run build:dist

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
cd js/fft-loader
npm run pack:local
```

This command will:

1. Build `fft_strip` natively.
2. Copy the binary into:
   - `fft-loader/bin/` (bundled fallback)
   - the current platform package (`fft-loader-<platform>-<arch>/bin/`)
3. Emit `.tgz` files in `fft-loader/artifacts/`.

If you already built the native executable, skip Cargo build:

```bash
FFT_STRIP_BINARY=/abs/path/to/fft-strip npm run pack:local
```

Install elsewhere:

```bash
npm install /abs/path/to/fft-loader/artifacts/*.tgz
```
