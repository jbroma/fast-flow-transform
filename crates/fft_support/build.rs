/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

use std::env;
use std::path::{Path, PathBuf};

fn emit_cpp_runtime_link() {
    if cfg!(target_os = "macos") {
        println!("cargo:rustc-link-lib=c++");
    } else if cfg!(target_os = "linux") {
        println!("cargo:rustc-link-lib=stdc++");
    }
}

fn is_msvc_target() -> bool {
    matches!(env::var("CARGO_CFG_TARGET_ENV").as_deref(), Ok("msvc"))
}

/// Apply `patches/hermes-simple-ilist-empty-bases.patch` on the MSVC build
/// path. Mirrors the same hook in `crates/hermes/build.rs`; both build
/// scripts run independently so each must apply, but the function is
/// idempotent (the second writer sees `LLVM_DECLARE_EMPTY_BASES simple_ilist`
/// already present and returns early). See `crates/hermes/build.rs` and
/// facebook/hermes#2012 for the full diagnosis and the bump-behavior
/// contract.
fn ensure_msvc_empty_bases_patch(hermes_root: &Path) {
    if !is_msvc_target() {
        return;
    }

    let target_path = hermes_root.join("external/llvh/include/llvh/ADT/simple_ilist.h");
    let manifest_dir = PathBuf::from(
        env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by cargo"),
    );
    let patch_file = manifest_dir.join("../../patches/hermes-simple-ilist-empty-bases.patch");

    println!("cargo:rerun-if-changed={}", patch_file.display());
    println!("cargo:rerun-if-changed={}", target_path.display());

    let original = std::fs::read_to_string(&target_path).unwrap_or_else(|err| {
        panic!(
            "MSVC build requires a patched llvh simple_ilist.h, but reading {} failed: {}",
            target_path.display(),
            err
        )
    });
    // Idempotency check accepts either marker: the macro-based form
    // `LLVM_DECLARE_EMPTY_BASES simple_ilist` (upstreamed at hermes#2012) or
    // the earlier inline `__declspec(empty_bases) simple_ilist` form. See
    // crates/hermes/build.rs for the rationale.
    if original.contains("LLVM_DECLARE_EMPTY_BASES simple_ilist")
        || original.contains("__declspec(empty_bases) simple_ilist")
    {
        return;
    }

    if !patch_file.exists() {
        panic!(
            "MSVC build expects {} but the file is missing — was patches/ pruned?",
            patch_file.display()
        );
    }

    // Skip canonicalize() — on Windows it returns the `\\?\` extended-length
    // form which `git apply` rejects with "can't open patch". The path is
    // already absolute (manifest_dir joined with a relative tail), and git
    // resolves `..` components fine.
    let output = std::process::Command::new("git")
        .arg("apply")
        .arg("--whitespace=nowarn")
        .arg(&patch_file)
        .current_dir(hermes_root)
        .output()
        .unwrap_or_else(|err| {
            panic!(
                "could not invoke `git apply` for the MSVC simple_ilist patch: {} (is git on PATH?)",
                err
            )
        });

    if !output.status.success() {
        // Race-safe sibling: see crates/hermes/build.rs for the full reasoning.
        // If a parallel build script already won the race and applied the patch
        // between our idempotency check and our `git apply`, the file is now
        // patched and we can skip silently rather than panicking.
        if let Ok(after) = std::fs::read_to_string(&target_path) {
            if after.contains("LLVM_DECLARE_EMPTY_BASES simple_ilist")
                || after.contains("__declspec(empty_bases) simple_ilist")
            {
                return;
            }
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        panic!(
            "Applying {} failed.\n\
             stderr:\n{}\nstdout:\n{}\n\
             This usually means the bundled Hermes submodule was bumped and\n\
             external/llvh/include/llvh/ADT/simple_ilist.h no longer matches the\n\
             patch's expected context. To resolve:\n\
             \n\
               1. If the upstream fix (facebook/hermes#2012) has landed in the new\n\
                  submodule pin, this patch is unnecessary — delete the patch file\n\
                  and the `ensure_msvc_empty_bases_patch` calls in build.rs.\n\
             \n\
               2. Otherwise, regenerate the patch against the new submodule revision\n\
                  and overwrite patches/hermes-simple-ilist-empty-bases.patch.",
            patch_file.display(),
            stderr.trim(),
            stdout.trim(),
        );
    }
}

fn cmake_profile_dir() -> &'static str {
    let profile = env::var("PROFILE").unwrap_or_default();
    let debug = env::var("DEBUG").unwrap_or_default();

    match (profile.as_str(), debug.as_str()) {
        ("debug", _) => "Debug",
        ("release" | "bench", "true") => "RelWithDebInfo",
        _ => "Release",
    }
}

fn emit_link_search(path: PathBuf) {
    println!("cargo:rustc-link-search=native={}", path.display());

    if is_msvc_target() {
        println!(
            "cargo:rustc-link-search=native={}",
            path.join(cmake_profile_dir()).display()
        );
    }
}

fn emit_static_link(lib: &str) {
    println!("cargo:rustc-link-lib=static={lib}");
}

fn is_hermes_root(path: &Path) -> bool {
    path.join("CMakeLists.txt").exists()
        && path.join("include").exists()
        && path.join("lib").exists()
        && path.join("external").exists()
}

fn detect_hermes_root() -> PathBuf {
    if let Some(path) = env::var_os("HERMES_SOURCE_DIR") {
        let candidate = PathBuf::from(path);
        if is_hermes_root(&candidate) {
            return candidate;
        }
    }

    let manifest_dir =
        PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set"));

    let standalone_root = manifest_dir.join("../../hermes");
    if is_hermes_root(&standalone_root) {
        return standalone_root;
    }

    for ancestor in manifest_dir.ancestors() {
        let candidate = ancestor.join("hermes");
        if is_hermes_root(&candidate) {
            return candidate;
        }
    }

    panic!("Unable to locate Hermes sources. Set HERMES_SOURCE_DIR or initialize hermes.");
}

fn configure_target_specific_cmake(config: &mut cmake::Config) {
    let target = env::var("TARGET").unwrap_or_default();

    if target.ends_with("-musl") {
        // Hermes cross-compilation docs recommend the lightweight Unicode
        // backend when ICU is unavailable in musl toolchains.
        config.define("HERMES_UNICODE_LITE", "ON");
        config.define("CMAKE_TRY_COMPILE_TARGET_TYPE", "STATIC_LIBRARY");
        config.define("CMAKE_SIZEOF_VOID_P", "8");
        config.cflag("-D_LARGEFILE64_SOURCE");
        config.cxxflag("-D_LARGEFILE64_SOURCE");
    }

    match target.as_str() {
        // Cross builds inherit the host processor here, so pin Boost.Context
        // to the ARM64 ELF backend instead of letting it default to x86_64.
        "aarch64-unknown-linux-gnu" | "aarch64-unknown-linux-musl" => {
            config.define("BOOST_CONTEXT_ARCHITECTURE", "arm64");
            config.define("BOOST_CONTEXT_ABI", "aapcs");
            config.define("BOOST_CONTEXT_ASSEMBLER", "gas");
        }
        "aarch64-pc-windows-msvc" => {
            config.define("BOOST_CONTEXT_ARCHITECTURE", "arm64");
            config.define("BOOST_CONTEXT_IMPLEMENTATION", "winfib");
        }
        _ => {}
    }
}

fn main() {
    emit_cpp_runtime_link();
    let hermes_root = detect_hermes_root();

    ensure_msvc_empty_bases_patch(&hermes_root);

    println!(
        "cargo:rerun-if-changed={}",
        hermes_root.join("include").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        hermes_root.join("lib").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        hermes_root.join("external").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        hermes_root.join("cmake").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        hermes_root.join("CMakeLists.txt").display()
    );

    let mut config = cmake::Config::new(&hermes_root);
    configure_target_specific_cmake(&mut config);

    let dst = config.build_target("hermesSupport").build();
    emit_link_search(dst.join("build/lib/Support"));
    emit_static_link("hermesSupport");
    emit_link_search(dst.join("build/external/dtoa"));
    emit_static_link("dtoa");
}
