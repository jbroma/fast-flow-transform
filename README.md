# fast-flow-transform

`fast-flow-transform` (`fft`) is a Flow-stripping JavaScript transform focused
on turning Flow-typed JS into plain JS in the fastest, most minimal, and most
compatible way possible.

FFT builds on top of the unsupported Juno tooling from Hermes, but it is its
own project with its own packaging, workspace layout, and integration surface.

## What this gives you

- A Flow-to-JavaScript pipeline optimized for speed, low output churn, and
  compatibility.
- First-class webpack, rspack, rsbuild, Parcel, Vite, Rollup, Rolldown, and
  esbuild integration for bundler pipelines.
- Cargo workspace for the native transform binding (`fft_node`).
- Root `pnpm` workspace for active packages under `packages/` and `bindings/`.
- The publishable loader package now lives at `packages/core` and is published as
  `fast-flow-transform`.
- A clean subtree that can be copied to a new git repository.

Contributor workflows, including local Verdaccio publishing for canary testing,
live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Attribution And Licensing

- FFT builds on top of Hermes Juno:
  <https://github.com/facebook/hermes/tree/static_h/unsupported/juno>
- Vendored Hermes source lives in `third_party/hermes` as an upstream submodule.
- FFT's own MIT license lives in [LICENSE](./LICENSE).
- Hermes/Juno third-party license details live in
  [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES).
