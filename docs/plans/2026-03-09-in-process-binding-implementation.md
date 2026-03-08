# In-Process Binding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the per-transform subprocess bridge with an in-process Node binding for supported platforms while keeping a binary fallback for the first cut.

**Architecture:** Add a small N-API Rust crate that exposes the existing FFT transform logic directly to Node, resolve that binding from the JS package, and have `packages/core` call the binding first instead of spawning `fft-strip`. Keep the current CLI/binary path available as a fallback while packaging shifts from executable artifacts to `.node` artifacts.

**Tech Stack:** Rust, `napi-rs`, TypeScript, Vitest, pnpm workspaces

---

### Task 1: Lock the JS binding contract with tests

**Files:**

- Modify: `packages/core/__tests__/transform.test.ts`
- Create: `packages/core/__tests__/resolveBinding.test.ts`

**Step 1: Write the failing tests**

- Update the programmatic transform tests so they mock a native binding loader instead of the subprocess runner.
- Add resolver tests that describe how the package should locate an in-process native binding from the environment, bundled artifacts, optional platform packages, and workspace builds.

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter fast-flow-transform test -- --run packages/core/__tests__/transform.test.ts packages/core/__tests__/resolveBinding.test.ts`

Expected: FAIL because the code still depends on binary resolution and subprocess transport.

**Step 3: Write the minimal JS implementation**

- Add a binding resolver module.
- Add a binding call module that normalizes native errors/results.
- Update `transform/index.ts` to use the binding path first.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter fast-flow-transform test -- --run packages/core/__tests__/transform.test.ts packages/core/__tests__/resolveBinding.test.ts`

Expected: PASS.

### Task 2: Extract reusable native transform logic

**Files:**

- Create: `crates/fft/src/transform.rs`
- Modify: `crates/fft/src/lib.rs`
- Modify: `crates/fft_strip/src/main.rs`

**Step 1: Write the failing Rust tests**

- Add unit tests around the extracted transform entrypoint covering successful Flow stripping and invalid input diagnostics.

**Step 2: Run tests to verify they fail**

Run: `cargo test -p fft`

Expected: FAIL because the reusable transform entrypoint does not exist yet.

**Step 3: Write the minimal implementation**

- Move the shared parse/convert/pass/codegen flow into `fft::transform`.
- Keep `fft_strip` focused on request/response I/O and delegate to the shared function.

**Step 4: Run tests to verify they pass**

Run: `cargo test -p fft`

Expected: PASS.

### Task 3: Add the N-API binding crate

**Files:**

- Create: `crates/fft_node/Cargo.toml`
- Create: `crates/fft_node/build.rs`
- Create: `crates/fft_node/src/lib.rs`
- Modify: `Cargo.toml`

**Step 1: Write the failing tests**

- Add JS tests that exercise the binding wrapper API shape expected by `packages/core`.

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter fast-flow-transform test -- --run packages/core/__tests__/transform.test.ts`

Expected: FAIL because there is no compiled binding to load and no wrapper in place.

**Step 3: Write the minimal implementation**

- Expose a synchronous or async-safe N-API `transform` entrypoint that accepts plain strings/options and returns `{ code, map }` or throws structured diagnostics.

**Step 4: Run tests to verify they pass**

Run: `cargo build -p fft_node`

Expected: PASS.

### Task 4: Shift packaging from binaries to `.node` bindings

**Files:**

- Modify: `bindings/*/package.json`
- Modify: `bindings/*/index.js`
- Modify: `packages/core/package.json`
- Modify: `scripts/sync-binary.mts`
- Modify: `scripts/pack-local.mts`
- Modify: `packages/core/README.md`

**Step 1: Write the failing tests**

- Update package resolution tests to expect `.node` binding artifacts instead of executable paths for supported platforms.

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter fast-flow-transform test -- --run packages/core/__tests__/resolveBinding.test.ts`

Expected: FAIL because packaging still assumes `bin/fft-strip`.

**Step 3: Write the minimal implementation**

- Keep the existing platform package names.
- Make each package export the `.node` artifact.
- Update local pack/sync scripts to copy the built binding into the core package and current platform package.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter fast-flow-transform test -- --run packages/core/__tests__/resolveBinding.test.ts`

Expected: PASS.

### Task 5: Verify end-to-end behavior and benchmark impact

**Files:**

- Modify: `bench/candidates.ts`
- Modify: `bench/compare.test.ts`

**Step 1: Write the failing verification**

- Add benchmark or harness assertions that target the binding-based path rather than the subprocess path.

**Step 2: Run verification to observe current behavior**

Run: `BENCH_ITERATIONS=80 pnpm --filter @fft/bench benchmark`

Expected: Existing subprocess-backed numbers or harness mismatch.

**Step 3: Update harness if needed**

- Make the benchmark exercise the same in-process binding path shipped to users.

**Step 4: Run verification to confirm improvement**

Run: `BENCH_ITERATIONS=80 pnpm --filter @fft/bench benchmark`

Expected: Noticeably lower FFT mean time than the current subprocess-backed baseline.
