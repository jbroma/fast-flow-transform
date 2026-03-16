# rspack Example

This example shows `fast-flow-transform/rspack` with a local Flow + JSX entry
bundled to CommonJS for Node.

Run it with:

```bash
pnpm --filter @fft-examples/rspack build
pnpm --filter @fft-examples/rspack e2e
```

FFT strips Flow syntax first, and Rspack's built-in SWC loader handles JSX
afterward. The example test reads `dist/bundle.cjs` and requires it to verify
that the transformed bundle still exports the expected runtime value.
