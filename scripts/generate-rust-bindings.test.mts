import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGeneratedFiles,
  buildHermesConfigureArgs,
  buildRustgenCompileArgs,
  checkGeneratedFiles,
  ensureRustgenBinary,
  normalizeRustgenSource,
  writeGeneratedFiles,
} from './hermes-rustgen-lib.mts';

test('buildHermesConfigureArgs includes release mode and optional generator', () => {
  assert.deepEqual(buildHermesConfigureArgs('/repo/hermes', '/repo/build'), [
    '-S',
    '/repo/hermes',
    '-B',
    '/repo/build',
    '-DCMAKE_BUILD_TYPE=Release',
  ]);

  assert.deepEqual(
    buildHermesConfigureArgs('/repo/hermes', '/repo/build', 'Ninja'),
    [
      '-S',
      '/repo/hermes',
      '-B',
      '/repo/build',
      '-G',
      'Ninja',
      '-DCMAKE_BUILD_TYPE=Release',
    ]
  );
});

test('buildRustgenCompileArgs targets upstream rustgen.cpp and Hermes-built llvh archives', () => {
  const args = buildRustgenCompileArgs(
    '/repo/hermes',
    '/repo/build',
    '/repo/build/bin/rustgen'
  );

  assert.deepEqual(args.slice(0, 3), [
    '-std=c++17',
    '-fno-exceptions',
    '-fno-rtti',
  ]);
  assert.ok(
    args.includes('/repo/hermes/unsupported/tools/rustgen/rustgen.cpp')
  );
  assert.ok(
    args.includes('/repo/build/external/llvh/lib/Support/libLLVHSupport.a')
  );
  assert.ok(
    args.includes('/repo/build/external/llvh/lib/Demangle/libLLVHDemangle.a')
  );
  assert.ok(args.includes('-o'));
});

test('normalizeRustgenSource fixes reserved Rust identifiers emitted by upstream rustgen', () => {
  const source = [
    '        NodeKind::TypeParameter => {',
    '          let const = hermes_get_TypeParameter_const(n);',
    '          let mut template = ast::template::TypeParameter {',
    '              const,',
    '          };',
    '        }',
  ].join('\n');

  assert.equal(
    normalizeRustgenSource(source),
    [
      '        NodeKind::TypeParameter => {',
      '          let const_ = hermes_get_TypeParameter_const(n);',
      '          let mut template = ast::template::TypeParameter {',
      '              const_,',
      '          };',
      '        }',
    ].join('\n')
  );
});

test('ensureRustgenBinary respects HERMES_RUSTGEN override', () => {
  const commands: string[] = [];

  const rustgen = ensureRustgenBinary({
    env: { HERMES_RUSTGEN: '/custom/rustgen' },
    existsSync(path) {
      return path === '/custom/rustgen';
    },
    runCommand(file, args) {
      commands.push(`${file} ${args.join(' ')}`);
      return '';
    },
  });

  assert.equal(rustgen, '/custom/rustgen');
  assert.deepEqual(commands, []);
});

test('ensureRustgenBinary configures Hermes, builds llvh libs, and compiles rustgen', () => {
  const buildDir = '/repo/target/hermes-rustgen';
  const existing = new Set<string>();
  const commands: string[] = [];

  const rustgen = ensureRustgenBinary({
    env: {},
    workspaceRoot: '/repo',
    mkdirp(path) {
      assert.equal(path, `${buildDir}/bin`);
    },
    existsSync(path) {
      return existing.has(path);
    },
    preferredGenerator() {
      return 'Ninja';
    },
    runCommand(file, args) {
      commands.push(`${file} ${args.join(' ')}`);
      if (file === 'cmake' && args[0] === '-S') {
        existing.add(`${buildDir}/CMakeCache.txt`);
        existing.add(`${buildDir}/build.ninja`);
        return '';
      }
      if (file === 'c++') {
        existing.add(`${buildDir}/bin/rustgen`);
      }
      return '';
    },
  });

  assert.equal(rustgen, `${buildDir}/bin/rustgen`);
  assert.deepEqual(commands.slice(0, 2), [
    `cmake -S /repo/third_party/hermes -B ${buildDir} -G Ninja -DCMAKE_BUILD_TYPE=Release`,
    `cmake --build ${buildDir} --target LLVHSupport LLVHDemangle --config Release`,
  ]);
  assert.match(commands[2] ?? '', /^c\+\+ /);
  assert.match(commands[2] ?? '', /unsupported\/tools\/rustgen\/rustgen\.cpp/);
  assert.match(commands[2] ?? '', /libLLVHSupport\.a/);
  assert.match(commands[2] ?? '', /libLLVHDemangle\.a/);
});

test('ensureRustgenBinary reconfigures when a stale cache exists without build files', () => {
  const buildDir = '/repo/target/hermes-rustgen';
  const existing = new Set<string>([`${buildDir}/CMakeCache.txt`]);
  const commands: string[] = [];

  ensureRustgenBinary({
    env: {},
    workspaceRoot: '/repo',
    mkdirp(path) {
      assert.equal(path, `${buildDir}/bin`);
    },
    existsSync(path) {
      return existing.has(path);
    },
    preferredGenerator() {
      return 'Ninja';
    },
    runCommand(file, args) {
      commands.push(`${file} ${args.join(' ')}`);
      if (file === 'cmake' && args[0] === '-S') {
        existing.add(`${buildDir}/build.ninja`);
        return '';
      }
      if (file === 'c++') {
        existing.add(`${buildDir}/bin/rustgen`);
      }
      return '';
    },
  });

  assert.equal(
    commands[0],
    `cmake -S /repo/third_party/hermes -B ${buildDir} -G Ninja -DCMAKE_BUILD_TYPE=Release`
  );
});

test('buildGeneratedFiles is driven by rustgen output for ffi and cvt', () => {
  const modes: string[] = [];

  const files = buildGeneratedFiles({
    bindingPaths: {
      cvt: '/tmp/generated_cvt.rs',
      ffi: '/tmp/generated_ffi.rs',
    },
    formatRust(path, source) {
      return `${path}:${source}`;
    },
    runRustgen(mode) {
      modes.push(mode);
      return `generated-${mode}`;
    },
  });

  assert.deepEqual(modes, ['ffi', 'cvt']);
  assert.deepEqual(files, [
    {
      path: '/tmp/generated_ffi.rs',
      source: '/tmp/generated_ffi.rs:generated-ffi',
    },
    {
      path: '/tmp/generated_cvt.rs',
      source: '/tmp/generated_cvt.rs:generated-cvt',
    },
  ]);
});

test('writeGeneratedFiles and checkGeneratedFiles operate on generated content only', () => {
  const files = [
    { path: '/tmp/ffi.rs', source: 'ffi-new' },
    { path: '/tmp/cvt.rs', source: 'cvt-new' },
  ];
  const written = new Map<string, string>();

  writeGeneratedFiles(files, (path, source) => {
    written.set(path, source);
  });

  assert.deepEqual(
    [...written.entries()],
    [
      ['/tmp/ffi.rs', 'ffi-new'],
      ['/tmp/cvt.rs', 'cvt-new'],
    ]
  );

  const mismatches = checkGeneratedFiles(files, (path) =>
    path === '/tmp/ffi.rs' ? 'ffi-new' : 'stale'
  );
  assert.deepEqual(mismatches, ['/tmp/cvt.rs']);
});
