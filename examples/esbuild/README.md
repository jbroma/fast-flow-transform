# esbuild Example

This example shows `fast-flow-transform/esbuild` in a small Node-targeted bundle
with local Flow-annotated source files and JSX in `.js` modules.

Run it with:

```bash
pnpm --filter @fft-examples/esbuild build
pnpm --filter @fft-examples/esbuild e2e
```

FFT strips Flow syntax, and esbuild handles JSX by treating `.js` files as JSX
modules through the local `loader` setting in `build.mjs`. The e2e test reads
`dist/bundle.cjs` and requires it to verify the runtime export still works.
