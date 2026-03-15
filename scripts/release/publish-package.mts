import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function commandName(name: 'npm'): string {
  return name;
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

interface CommandResult {
  error: string | null;
  status: number | null;
  stderr: string;
  stdout: string;
}

function runResult(
  args: string[],
  cwd: string,
  stdio: 'inherit' | 'pipe'
): CommandResult {
  const result = spawnSync(commandName('npm'), args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    shell: process.platform === 'win32',
    stdio,
  });

  return {
    error: result.error?.message ?? null,
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

function run(args: string[], cwd: string, stdio: 'inherit' | 'pipe'): string {
  const result = runResult(args, cwd, stdio);

  if (result.status !== 0) {
    throw new Error(
      `npm ${args.join(' ')} failed with ${String(result.status)}${
        result.error ? ` (${result.error})` : ''
      }\n${result.stdout}${result.stderr}`
    );
  }

  return result.stdout;
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

function alreadyPublished(result: CommandResult): boolean {
  const combinedOutput = `${result.stdout}\n${result.stderr}`;

  return /cannot publish over|previously published versions|cannot modify pre-existing version|EPUBLISHCONFLICT/i.test(
    combinedOutput
  );
}

function publishArgs(publishTag: string): string[] {
  return [
    'publish',
    '--provenance',
    '--tag',
    publishTag,
    '--registry',
    'https://registry.npmjs.org/',
  ];
}

function publishOrSkip(
  packageDir: string,
  packageName: string,
  version: string,
  publishTag: string
): void {
  if (versionExists(packageName, version)) {
    process.stdout.write(
      `Skipping existing package: ${packageName}@${version}\n`
    );
    return;
  }

  const publishResult = runResult(
    publishArgs(publishTag),
    packageDir,
    'inherit'
  );

  if (publishResult.status === 0) {
    return;
  }

  if (alreadyPublished(publishResult) || versionExists(packageName, version)) {
    process.stdout.write(
      `Treating already-published package as success: ${packageName}@${version}\n`
    );
    return;
  }

  throw new Error(
    `npm publish failed with ${String(publishResult.status)}${
      publishResult.error ? ` (${publishResult.error})` : ''
    }\n${publishResult.stdout}${publishResult.stderr}`
  );
}

function main(): void {
  const packageDir = requiredFlag('--package-dir');
  const publishTag = optionalFlag('--tag') ?? 'latest';
  const versionOutput = optionalFlag('--version-output');
  const manifest = manifestFor(packageDir);

  if (versionOutput) {
    writeOutput(versionOutput, manifest.version);
  }

  publishOrSkip(packageDir, manifest.name, manifest.version, publishTag);
}

main();
