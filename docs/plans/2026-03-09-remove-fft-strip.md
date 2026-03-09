# Remove `fft-strip` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the standalone `fft-strip` Rust crate and keep a single N-API-based native path for fast-flow-transform.

**Architecture:** Move the shared transform request/response logic into `crates/fft_node`, update the Node binding to call that internal module directly, and delete the `fft_strip` crate and all JS/task references to binary syncing. Revert the `pack-local` npm cache workaround and handle the local npm cache issue outside repo code.

**Tech Stack:** Rust, napi-rs, TypeScript, Vitest, pnpm workspaces, Turbo

---

### Task 1: Lock the post-`fft-strip` Rust API with tests

**Files:**

- Modify: `crates/fft_node/src/lib.rs`
- Create: `crates/fft_node/src/transform.rs`

**Step 1: Write the failing test**

- Add Rust tests in `crates/fft_node` that expect transform request helpers and source-map behavior to exist within `fft_node` rather than `fft_strip`.

**Step 2: Run test to verify it fails**

Run: `cargo test -p fft_node`

Expected: FAIL because the transform module does not exist in `fft_node` yet.

**Step 3: Write minimal implementation**

- Move `TransformRequest`, `TransformOutput`, `TransformFailure`, and `transform(...)` into `crates/fft_node/src/transform.rs`.
- Update `crates/fft_node/src/lib.rs` to use that module.

**Step 4: Run test to verify it passes**

Run: `cargo test -p fft_node`

Expected: PASS.

### Task 2: Delete the old crate and stale task wiring

**Files:**

- Delete: `crates/fft_strip/**`
- Modify: `crates/fft_node/Cargo.toml`
- Modify: `turbo.json`
- Modify: `README.md`
- Modify: `docs/plans/2026-03-09-in-process-binding-implementation.md`

**Step 1: Write the failing verification**

- Remove `fft_strip` references from manifests and task wiring, then run the affected commands.

**Step 2: Run verification to observe current failures**

Run: `cargo test -p fft_node`
Run: `pnpm check`

Expected: FAIL until all `fft_strip` references and old turbo task wiring are removed.

**Step 3: Write minimal implementation**

- Remove the `fft_strip` dependency from `crates/fft_node/Cargo.toml`.
- Delete the `crates/fft_strip` crate.
- Replace `//#sync-binary` references in `turbo.json` with `//#sync-binding`.
- Update root docs so they describe the binding-based native path.

**Step 4: Run verification to confirm it passes**

Run: `cargo test -p fft_node`
Run: `pnpm check`

Expected: PASS.

### Task 3: Revert the repo-level `pack-local` workaround

**Files:**

- Modify: `scripts/pack-local.mts`

**Step 1: Write the failing verification**

- Revert the cache override and run local packaging with an explicit command-level cache override if needed.

**Step 2: Run verification to observe behavior**

Run: `npm_config_cache=/tmp/fft-npm-cache pnpm pack:local`

Expected: PASS if the packaging logic is correct and only the machine cache is broken.

**Step 3: Write minimal implementation**

- Remove the repo-level cache mutation from `scripts/pack-local.mts`.
- Prefer `pnpm pack` over `npm pack` so local tarball creation stays within the repo toolchain.

**Step 4: Run verification to confirm it passes**

Run: `npm_config_cache=/tmp/fft-npm-cache pnpm pack:local`

Expected: PASS.
