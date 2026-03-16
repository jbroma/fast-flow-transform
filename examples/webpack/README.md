# webpack Example

This example shows `fast-flow-transform/webpack` on a small Flow + JSX source
tree bundled for Node.

Run it with:

```bash
pnpm --filter @fft-examples/webpack build
pnpm --filter @fft-examples/webpack e2e
```

FFT strips Flow syntax first, then `swc-loader` lowers JSX because FFT does not
handle JSX itself. The local test reads `dist/bundle.cjs` and requires it to
confirm the exported runtime value still matches the source.
