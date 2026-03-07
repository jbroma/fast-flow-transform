# Repo Code Standards

This repo uses **Ultracite**, **Oxlint**, and **Oxfmt** for JS/TS work.

## Commands

- Format: `pnpm format`
- Check formatting: `pnpm format:check`
- Lint: `pnpm lint`
- Fix lint issues: `pnpm lint:fix`
- Full verification: `pnpm check`

## Working Rules

- Run `pnpm check` before completion for JS/TS changes.
- Always request escalated sandbox permissions before running `pnpm install`.
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
