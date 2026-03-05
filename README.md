# fast-flow-transform

## Layout

- `crates/`:
    - `hermes` (bridge crate)
    - `libcplusplus`
    - `fft_support`
    - `fft_ast`
    - `fft`
    - `fft_pass`
    - `fft_strip`
- `js/`:
    - `fft-loader`
    - platform binary packages (`fft-loader-*`)
- `scripts/`:
    - helper scripts for Hermes sync / bridge regeneration

## What this gives you

- Cargo workspace for the native transform binary (`fft-strip`).
- Local npm workspace for loader and platform packages.
- A clean subtree that can be copied to a new git repository.

## Next step after extraction

1. Add Hermes as submodule at `third_party/hermes`.
2. Update `crates/hermes/build.rs` include/source paths to point at `third_party/hermes`.
3. Run `cargo build -p fft_strip --release`.
4. Run `npm run pack:local` from `js/fft-loader`.
