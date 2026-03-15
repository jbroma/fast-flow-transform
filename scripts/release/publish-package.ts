import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function commandName(name: 'npm'): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function requiredFlag(name: string): string {
  const flagIndex = process.argv.indexOf(name);
  const value = flagIndex === -1 ? null : process.argv[flagIndex + 1];

  if (!value) {
    throw new Error(`Missing required flag: ${name}`);
  }

  return value;
}

function optionalFlag(name: string): string | null {
  const flagIndex = process.argv.indexOf(name);
  return flagIndex === -1 ? null : (process.argv[flagIndex + 1] ?? null);
}

function run(args: string[], cwd: string, stdio: 'inherit' | 'pipe'): string {
  const result = spawnSync(commandName('npm'), args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    shell: false,
    stdio,
  });

  if (result.status !== 0) {
    throw new Error(
      `npm ${args.join(' ')} failed with ${String(result.status)}\n${
        result.stdout ?? ''
      }${result.stderr ?? ''}`
    );
  }

  return result.stdout ?? '';
}

function manifestFor(packageDir: string): { name: string; version: string } {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
}

function writeOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  appendFileSync(outputPath, `${name}=${value}\n`);
}

function versionExists(name: string, version: string): boolean {
  try {
    const output = run(
      [
        'view',
        `${name}@${version}`,
        'version',
        '--registry',
        'https://registry.npmjs.org/',
      ],
      process.cwd(),
      'pipe'
    ).trim();
    return output === version;
  } catch {
    return false;
  }
}

function main(): void {
  const packageDir = requiredFlag('--package-dir');
  const versionOutput = optionalFlag('--version-output');
  const manifest = manifestFor(packageDir);

  if (versionOutput) {
    writeOutput(versionOutput, manifest.version);
  }

  if (versionExists(manifest.name, manifest.version)) {
    process.stdout.write(
      `Skipping existing package: ${manifest.name}@${manifest.version}\n`
    );
    return;
  }

  run(
    ['publish', '--provenance', '--registry', 'https://registry.npmjs.org/'],
    packageDir,
    'inherit'
  );
}

main();
