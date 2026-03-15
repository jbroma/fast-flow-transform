import { checkRustBindings, writeRustBindings } from './lib.mts';

function isCheckMode(argv: string[]): boolean {
  return argv.includes('--check');
}

function reportMismatches(mismatches: string[]): void {
  console.error('Rust generated files are out of date:');
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch}`);
  }
}

function runCheckMode(): void {
  const mismatches = checkRustBindings();

  if (mismatches.length === 0) {
    console.log('Rust generated files are up to date.');
    return;
  }

  reportMismatches(mismatches);
  process.exitCode = 1;
}

function runWriteMode(): void {
  const updatedFiles = writeRustBindings();
  for (const file of updatedFiles) {
    console.log(`Updated ${file}`);
  }
}

function main(argv: string[]): void {
  if (isCheckMode(argv)) {
    runCheckMode();
    return;
  }

  runWriteMode();
}

main(process.argv.slice(2));
