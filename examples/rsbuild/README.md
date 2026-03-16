# Rsbuild Example

This example shows `fast-flow-transform/rsbuild` on a small Flow + JSX app that
builds to a CommonJS bundle for Node.

Run it with:

```bash
pnpm --filter @fft-examples/rsbuild build
pnpm --filter @fft-examples/rsbuild e2e
```

FFT removes Flow syntax through the Rsbuild plugin, and `@rsbuild/plugin-react`
handles JSX separately with classic React output. The e2e test reads
`dist/bundle.cjs` and requires it to verify the exported runtime value.
