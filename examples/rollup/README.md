# Rollup Example

This example shows `fast-flow-transform/rollup` with a tiny Flow + JSX entry
bundled to CommonJS.

Run it with:

```bash
pnpm --filter @fft-examples/rollup build
pnpm --filter @fft-examples/rollup e2e
```

FFT strips Flow syntax, and Rollup lowers JSX separately through the local
`@rollup/plugin-babel` setup. `@rollup/plugin-commonjs` stays in the example so
the bundle can consume React cleanly before the test requires `dist/bundle.cjs`.
