# Parcel Example

This example shows the recommended local-wrapper setup for
`fast-flow-transform/parcel` with a small Flow + JSX source tree.

Run it with:

```bash
pnpm --filter @fft-examples/parcel build
pnpm --filter @fft-examples/parcel e2e
```

Parcel expects `.parcelrc` transformers to be referenced through a local file,
so this example keeps a tiny `parcel-transformer.cjs` wrapper that configures
FFT. FFT strips Flow syntax, and Parcel's normal transformer chain from `"..."`
continues handling JSX and the final bundle output.
