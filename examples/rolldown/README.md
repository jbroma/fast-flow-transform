# Rolldown Example

This example shows `fast-flow-transform/rolldown` on a small Flow + JSX app
bundled to CommonJS for Node.

Run it with:

```bash
pnpm --filter @fft-examples/rolldown build
pnpm --filter @fft-examples/rolldown e2e
```

FFT removes Flow syntax, and Rolldown handles JSX through the local
`moduleTypes` and `transform.jsx` settings. The test reads `dist/bundle.cjs`
and requires it to verify the transformed bundle still exports the expected
runtime string.
