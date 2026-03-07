# third_party

This standalone staging layout expects Hermes to be provided as a git submodule at:

- `third_party/hermes`

The Rust `crates/hermes` bridge crate should be adjusted to include headers/sources from
that submodule path as part of your extraction process.

## Licensing

`third_party/hermes` vendors the upstream Hermes repository directly. Root
third-party licensing details are tracked in
[THIRD_PARTY_LICENSES](../THIRD_PARTY_LICENSES).
