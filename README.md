# fast-flow-transform

## Layout

- `crates/`:
    - `hermes` (bridge crate)
    - `libcplusplus`
    - `juno_support`
    - `juno_ast`
    - `juno`
    - `juno_pass`
    - `juno_flow_strip`
- `js/`:
    - `juno-flow-strip-loader`
    - platform binary packages (`juno-flow-strip-loader-*`)
- `scripts/`:
    - helper scripts for Hermes sync / bridge regeneration

## What this gives you

- Cargo workspace for the native transform binary (`juno-flow-strip`).
- Local npm workspace for loader and platform packages.
- A clean subtree that can be copied to a new git repository.

## Next step after extraction

1. Add Hermes as submodule at `third_party/hermes`.
2. Update `crates/hermes/build.rs` include/source paths to point at `third_party/hermes`.
3. Run `cargo build -p juno_flow_strip --release`.
4. Run `npm run pack:local` from `js/juno-flow-strip-loader`.
