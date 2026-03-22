# Repo Code Standards

This repo uses **Ultracite**, **Oxlint**, and **Oxfmt** for JS/TS work.

## Commands

- Format: `pnpm format`
- Format JS: `pnpm format:js`
- Format Rust: `pnpm format:rust`
- Check formatting: `pnpm format:check`
- Check JS formatting: `pnpm format:check:js`
- Check Rust formatting: `pnpm format:check:rust`
- Lint: `pnpm lint`
- Fix lint issues: `pnpm lint:fix`
- Full verification: `pnpm check`

## Working Rules

- Run `pnpm check` before completion for JS/TS changes.
- Always request escalated sandbox permissions before running `pnpm install`.
- For PRs, follow this quick title guide so `pr-hygiene` passes and labels sync
  correctly:
  - Do use `type: description` for normal changes.
  - Do use `type!: description` when the PR includes a breaking change.
  - Do choose one of these PR title types: `feat`, `fix`, `chore`,
    `refactor`, `docs`, `test`, `perf`, `build`, `ci`, `revert`.
  - Do leave scopes out of PR titles; this repo's CI accepts type-only prefixes.
  - Do make the description reviewer-friendly and specific about the behavior
    change after the prefix.
- Skip TDD for repository plumbing work such as contributor scripts, local
  tooling, docs, release helpers, and other repo-only infrastructure. Use TDD
  for changes that affect FFT's shipped behavior, runtime output, APIs, parser
  behavior, transforms, bindings, or other end-product functionality.
- Do not add or keep dedicated tests for repo-only plumbing unless the user
  explicitly asks for them.
- Treat Hermes `ESTree.def` at `hermes/include/hermes/AST/ESTree.def`
  as the source of truth for generated Rust bindings and AST shape decisions. Do
  not hand-maintain schema drift in generated files or patch around Hermes with
  repo-local field injections.
- After updating the Hermes submodule at `hermes`, run
  `pnpm codegen:rust` and commit the refreshed generated files, especially
  `crates/hermes/src/parser/generated_ffi.rs` and
  `crates/fft/src/hparser/generated_cvt.rs`.
- Modularize from the start. Do not land large files/functions and split later.
- Do not create files over `300` lines.
- Do not create functions over `50` lines.
- Treat complexity over `15` or nesting depth over `3` as a signal to extract
  helpers or modules immediately.
- Prefer clear names, early returns, and straightforward control flow.
- Use `const` by default; use `let` only when reassignment is required.
- Prefer explicit, maintainable code over clever compactness.
- Remove stray debugging statements unless they are intentionally operational.
- Keep test suites reasonably flat and do not leave `.only` or `.skip`.
