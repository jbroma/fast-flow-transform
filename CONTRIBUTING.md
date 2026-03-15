# Contributing

## Pull Requests

Before you open or update a PR, run the same gates CI expects:

```bash
pnpm check
pnpm build
pnpm test
pnpm e2e
cargo fmt --all --check
```

PR titles must use this format:

```text
type(scope)!: description
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

Examples:

- `feat(core): add parser flag`
- `fix(core)!: change parser default`
- `ci(actions): add PR build workflow`
- `docs(contributing): document PR title rules`
- `refactor(bindings): simplify native sync step`

## Local Registry Testing

Use the local Verdaccio workflow when you want to publish a canary build of
`fast-flow-transform` and install that exact version into another project on
this machine.

Start Verdaccio in one terminal:

```bash
pnpm run local-registry:start
```

Then publish a fresh local canary build from another terminal:

```bash
pnpm run local-registry:publish
```

That publish flow will:

1. Verify that Verdaccio is already running.
2. Bootstrap a local throwaway Verdaccio user automatically if the npm client
   needs one for publish.
3. Build and sync the native binding for the current machine.
4. Build `packages/core`.
5. Publish the current platform binding package first.
6. Publish `fast-flow-transform` with a unique canary version such as
   `0.0.1-local.20260309t123456789z.abc1234`.

The publish command prints the exact consumer install command to copy into
another repo. It will look like:

```bash
npm_config_registry=http://127.0.0.1:4873 pnpm add fast-flow-transform@0.0.1-local.20260309t123456789z.abc1234
```

Or with npm:

```bash
npm_config_registry=http://127.0.0.1:4873 npm install fast-flow-transform@0.0.1-local.20260309t123456789z.abc1234
```

Notes:

- This workflow is current-machine only. It publishes the binding for the
  platform and architecture you built on.
- Public npm packages still resolve through Verdaccio because
  [`config/verdaccio.yaml`](./config/verdaccio.yaml) proxies
  `https://registry.npmjs.org/`.
- `pnpm run local-registry:start` keeps Verdaccio attached to that terminal
  until you stop it with `Ctrl+C`.
- Consumer installs do not need local Verdaccio credentials. The repo only
  creates a throwaway local user because your npm client requires auth for
  publish in practice.
- To reset the local registry state, stop Verdaccio and remove `.local/verdaccio/`.
