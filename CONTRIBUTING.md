# Contributing

## Pull Requests

### Before You Open Or Update A PR

Run the same gates CI expects:

```bash
pnpm check
pnpm build
pnpm test
pnpm e2e
cargo test --workspace
```

### PR Title Format

PR titles must use this format:

```text
type[!]: description
```

Scopes are not allowed. For example, these are valid:

```text
type: description
type!: description
```

Allowed types:

- `feat`
- `fix`
- `chore`
- `refactor`
- `docs`
- `test`
- `perf`
- `build`
- `ci`
- `revert`

Matching titles are labeled automatically from their type, and titles using `!`
also receive the `breaking-change` label.

### Release Labels

Every non-draft PR must end up with exactly one `release:` label:

- `release: none`
- `release: patch`
- `release: minor`
- `release: major`

Default release labels are applied automatically:

- `breaking-change` -> `release: major`
- `type: feat` -> `release: minor`
- every other valid PR type -> `release: patch`

Maintainers can override the release label before merge when the default is too
aggressive or not aggressive enough.

### Examples

Valid examples:

- `feat: add parser flag`
- `fix!: change parser default`
- `ci: add PR build workflow`
- `docs: document PR title rules`
- `refactor: simplify native sync step`

## Releases

### Stable Releases

Stable releases are prepared from `main` by running the `create-release`
workflow in GitHub.

That workflow:

1. Generates a temporary Changesets release entry from merged PR release
   labels.
2. Opens a `release/vX.Y.Z` PR with synchronized package and crate version
   bumps.
3. Avoids requiring contributors to author `.changeset/*.md` files manually.

Merging the release PR triggers the `publish-release` workflow automatically.
That workflow assembles the generated native packages, publishes
`fast-flow-transform`, creates the git tag, and creates the GitHub Release with
generated release notes.

### Canary Releases

Manual canary releases also run through GitHub. Dispatch the `publish-release`
workflow with:

- `release_mode=canary`
- `target_ref=<same-repo branch, tag, or exact commit SHA>`

`target_ref` can point at the branch backing an open PR as long as it belongs
to this repository.

Canary versions are derived from the checked-out package version plus the
commit timestamp and short SHA. Canary publishes do not create a git tag or
GitHub Release.

### Manual Stable Fallback

If the automatic stable publish fails, dispatch the same `publish-release`
workflow manually with:

- `release_mode=stable`
- `target_ref=<release branch, release commit, or release tag>`
- `confirm_stable=publish-stable`

### Trusted Publishing

Trusted publishing is configured per package against the exact workflow
filename `publish-release.yml`.

Published packages:

- `fast-flow-transform`
- `fast-flow-transform-darwin-arm64`
- `fast-flow-transform-darwin-x64`
- `fast-flow-transform-linux-arm64-gnu`
- `fast-flow-transform-linux-arm64-musl`
- `fast-flow-transform-linux-x64-gnu`
- `fast-flow-transform-linux-x64-musl`
- `fast-flow-transform-win32-arm64-msvc`
- `fast-flow-transform-win32-x64-msvc`

Maintenance note:

- If the trusted publish workflow file is ever renamed, update the trusted
  publisher settings for all nine npm packages before the next release.

## Native Packaging

`napi-rs/cli` is the source of truth for FFT's native package layout. Treat the
checked-in files under `bindings/**` and `packages/core/binding/**` as generated
artifacts.

### Regenerate `bindings/`

When you change `packages/core/package.json` `napi.targets` or other native
package metadata, refresh the platform package directories with:

```bash
pnpm --dir packages/core exec napi create-npm-dirs --package-json-path package.json --npm-dir ../../bindings
```

Do not hand-edit the generated binding package manifests or READMEs. Re-run
`create-npm-dirs` instead.

### Build The Current-Platform Native Binding

To regenerate the current machine's loader and native addon directly through the
official CLI:

```bash
pnpm --dir packages/core exec napi build --platform --release --manifest-path ../../crates/fft_node/Cargo.toml --package-json-path package.json --output-dir binding --js bindings.cjs --dts bindings.d.cts
```

`packages/core/build` already runs this before `tsc`, so `pnpm build` gives you
a runnable package on the current machine.

### Install Troubleshooting

- FFT relies on platform-specific optional dependencies. If the native package
  is missing, reinstall on the target machine without disabling optional
  dependencies.
- The supported manual override is `NAPI_RS_NATIVE_LIBRARY_PATH`.

## Local Registry Testing

Use the local Verdaccio flow when you want to publish a current-machine canary
build to a local registry and install that exact version into another project.

### Start Verdaccio

```bash
pnpm run local-registry:start
```

### Publish A Local Canary

```bash
pnpm run local-registry:publish
```

The publish command prints the exact install command to run in another repo.

### Notes

- This local flow is current-machine only.
- Consumer installs only need `npm_config_registry=<verdaccio-url>`.
- Stop Verdaccio with `Ctrl+C`. To reset the local registry state, remove
  `.local/verdaccio/`.
