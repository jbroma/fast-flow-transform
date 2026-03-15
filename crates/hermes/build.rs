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
    match env::var("TARGET").as_deref() {
        // Cross builds inherit the host processor here, so pin Boost.Context
        // to the ARM64 ELF backend instead of letting it default to x86_64.
        Ok("aarch64-unknown-linux-gnu") => {
            config.define("BOOST_CONTEXT_ARCHITECTURE", "arm64");
            config.define("BOOST_CONTEXT_ABI", "aapcs");
            config.define("BOOST_CONTEXT_ASSEMBLER", "gas");
        }
        Ok("aarch64-pc-windows-msvc") => {
            config.define("BOOST_CONTEXT_ARCHITECTURE", "arm64");
            config.define("BOOST_CONTEXT_IMPLEMENTATION", "winfib");
        }
        _ => {}
    }
}

fn main() {
    emit_cpp_runtime_link();
    let hermes_root = detect_hermes_root();

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

    // Build sourceMap library because it depends on everything we depend on here
    // via the hermesParser library.
    let mut config = cmake::Config::new(&hermes_root);
    configure_target_specific_cmake(&mut config);

    let dst = config.build_target("hermesSourceMap").build();

    emit_link_search(dst.join("build/lib/Parser"));
    emit_link_search(dst.join("build/lib/Platform/Unicode"));
    emit_link_search(dst.join("build/lib/SourceMap"));
    emit_link_search(dst.join("build/lib/Regex"));
    emit_link_search(dst.join("build/lib/AST"));
    emit_link_search(dst.join("build/lib/Support"));
    emit_link_search(dst.join("build/external/dtoa"));
    emit_link_search(dst.join("build/external/llvh/lib/Support"));

    println!("cargo:rustc-link-lib=hermesSourceMap");
    println!("cargo:rustc-link-lib=hermesAST");
    println!("cargo:rustc-link-lib=hermesRegex");
    println!("cargo:rustc-link-lib=hermesParser");
    println!("cargo:rustc-link-lib=hermesPlatformUnicode");
    println!("cargo:rustc-link-lib=hermesSupport");
    println!("cargo:rustc-link-lib=LLVHSupport");
    println!("cargo:rustc-link-lib=dtoa");
}
