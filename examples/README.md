# Bundler Examples

These runnable examples are the source of truth for FFT bundler integration.
Each package under `examples/*` contains:

- a tiny local Flow + JSX app
- the bundler config needed to compile it with `fast-flow-transform`
- a local e2e test that verifies the built bundle strips Flow syntax and still
  exports a working runtime value

Run all bundler examples with:

```bash
pnpm e2e
```

Run one example directly with:

```bash
pnpm --filter @fft-examples/vite build
pnpm --filter @fft-examples/vite e2e
pnpm --filter @fft-examples/vite typecheck
```

Available examples:

- `examples/webpack`
- `examples/rspack`
- `examples/rsbuild`
- `examples/parcel`
- `examples/vite`
- `examples/rollup`
- `examples/rolldown`
- `examples/esbuild`
