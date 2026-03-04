# juno-flow-strip-loader

A webpack/rspack loader that strips Flow types through a native Hermes/Juno binary.

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
            loader: 'juno-flow-strip-loader',
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
JUNO_FLOW_STRIP_BINARY=/absolute/path/to/juno-flow-strip
```

## Local Testing

From the loader package directory:

```bash
cd tools/hermes-parser/js/juno-flow-strip-loader

# 1) Build/copy dist files for npm package shape.
npm run build:dist

# 2) Build native binary in unsupported/juno.
cd ../../../../unsupported/juno
cargo build --release -p juno_flow_strip

# 3) Point loader to local binary for an integration test.
export JUNO_FLOW_STRIP_BINARY="$PWD/target/release/juno-flow-strip"
```

On Windows use `target\\release\\juno-flow-strip.exe`.

## Create Movable Tarballs

You can build tarballs that are installable in other repos:

```bash
cd tools/hermes-parser/js/juno-flow-strip-loader
npm run pack:local
```

This command will:

1. Build `juno_flow_strip` natively.
2. Copy the binary into:
   - `juno-flow-strip-loader/bin/` (bundled fallback)
   - the current platform package (`juno-flow-strip-loader-<platform>-<arch>/bin/`)
3. Emit `.tgz` files in `juno-flow-strip-loader/artifacts/`.

If you already built the native executable, skip Cargo build:

```bash
JUNO_FLOW_STRIP_BINARY=/abs/path/to/juno-flow-strip npm run pack:local
```

Install elsewhere:

```bash
npm install /abs/path/to/juno-flow-strip-loader/artifacts/*.tgz
```
