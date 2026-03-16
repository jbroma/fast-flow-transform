# Vite Example

This example shows `fast-flow-transform/vite` with a tiny Flow + JSX app built
to CommonJS for Node.

Run it with:

```bash
pnpm --filter @fft-examples/vite build
pnpm --filter @fft-examples/vite e2e
```

FFT only strips Flow syntax, so the example keeps a small local Vite plugin
that calls `transformWithEsbuild` to lower JSX after FFT runs. The test reads
`dist/bundle.cjs` and requires it to confirm the built export still works.
