import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const RELEASE_BOT_EMAIL =
  '41898282+github-actions[bot]@users.noreply.github.com';
const RELEASE_BOT_NAME = 'github-actions[bot]';

function commandName(name: 'git' | 'gh'): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

interface PackageManifest {
  version: string;
}

function flagValue(name: string): string | null {
  const flagIndex = process.argv.indexOf(name);
  const value = flagIndex === -1 ? null : process.argv[flagIndex + 1];

  return value || null;
}

function readPackageManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

function releaseVersion(): string {
  const version =
    flagValue('--version') ??
    readPackageManifest('packages/core/package.json').version;

  if (!version) {
    throw new Error(
      'Unable to determine release version from --version or packages/core/package.json'
    );
  }

  return version;
}

function assertStableVersion(version: string): void {
  if (version.includes('-canary')) {
    throw new Error(`Refusing to finalize canary release: ${version}`);
  }
}

function run(
  command: string,
  args: string[],
  stdio: 'inherit' | 'pipe'
): string {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    shell: false,
    stdio,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with ${String(result.status)}\n${
        result.stdout ?? ''
      }${result.stderr ?? ''}`
    );
  }

  return result.stdout ?? '';
}

function tagFor(version: string): string {
  return `v${version}`;
}

interface CommandResult {
  status: number | null;
  stderr: string;
  stdout: string;
}

function runResult(
  command: string,
  args: string[],
  stdio: 'inherit' | 'pipe'
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    shell: false,
    stdio,
  });

  return {
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

function tagExists(tag: string): boolean {
  const result = runResult(
    commandName('git'),
    ['show-ref', '--tags', '--verify', '--quiet', `refs/tags/${tag}`],
    'pipe'
  );

  if (result.status === 0) {
    return true;
  }

  if (result.status === 1) {
    return false;
  }

  throw new Error(
    `Unable to verify tag ${tag}\n${result.stdout}${result.stderr}`
  );
}

function existingTagSha(tag: string): string | null {
  if (!tagExists(tag)) {
    return null;
  }

  return run(commandName('git'), ['rev-list', '-n', '1', tag], 'pipe').trim();
}

function createReleaseTag(tag: string): void {
  run(
    commandName('git'),
    [
      '-c',
      `user.name=${RELEASE_BOT_NAME}`,
      '-c',
      `user.email=${RELEASE_BOT_EMAIL}`,
      'tag',
      '-a',
      tag,
      '-m',
      tag,
    ],
    'inherit'
  );
  run(commandName('git'), ['push', 'origin', tag], 'inherit');
}

function ensureReleaseTag(version: string): string {
  const tag = tagFor(version);

  run(commandName('git'), ['fetch', '--tags', '--force'], 'inherit');

  const existingSha = existingTagSha(tag);
  const currentSha = process.env.GITHUB_SHA;

  if (!existingSha) {
    createReleaseTag(tag);
    return tag;
  }

  if (currentSha && existingSha !== currentSha) {
    throw new Error(`Tag ${tag} already exists on a different commit.`);
  }

  return tag;
}

function ensureGitHubRelease(tag: string): void {
  const result = runResult(commandName('gh'), ['release', 'view', tag], 'pipe');

  if (result.status === 0) {
    return;
  }

  if (!/release not found/i.test(`${result.stdout}\n${result.stderr}`)) {
    throw new Error(
      `Unable to verify GitHub Release ${tag}\n${result.stdout}${result.stderr}`
    );
  }

  run(
    commandName('gh'),
    ['release', 'create', tag, '--generate-notes', '--title', tag],
    'inherit'
  );
}

function main(): void {
  const version = releaseVersion();
  assertStableVersion(version);
  const tag = ensureReleaseTag(version);
  ensureGitHubRelease(tag);
}

main();
