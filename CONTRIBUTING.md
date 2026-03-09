# Contributing

## Local Registry Testing

Use the local Verdaccio workflow when you want to publish a canary build of
`fast-flow-transform` and install that exact version into another project on
this machine.

Start Verdaccio in one terminal:

```bash
pnpm run local-registry:start
```

Run the one-time npm login against that Verdaccio instance:

```bash
pnpm run local-registry:setup
```

Publish a fresh local canary build:

```bash
pnpm run local-registry:publish
```

That publish flow will:

1. Verify the local registry is up.
2. Build and sync the native binding for the current machine.
3. Build `packages/core`.
4. Publish the current platform binding package first.
5. Publish `fast-flow-transform` with a unique canary version such as
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
- `pnpm run local-registry:setup` stores the Verdaccio login in the ignored
  `.local/verdaccio/npmrc` file, and `pnpm run local-registry:publish` reuses
  that file for publish.
- To reset the local registry state, stop Verdaccio and remove
  `.local/verdaccio/`.
