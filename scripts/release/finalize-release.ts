import { spawnSync } from 'node:child_process';

function commandName(name: 'git' | 'gh'): string {
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

function existingTagSha(tag: string): string | null {
  try {
    return run(commandName('git'), ['rev-list', '-n', '1', tag], 'pipe').trim();
  } catch (error) {
    if (error instanceof Error && !error.message.includes('failed with')) {
      throw error;
    }
    return null;
  }
}

function createReleaseTag(tag: string): void {
  run(
    commandName('git'),
    ['config', 'user.name', 'github-actions[bot]'],
    'inherit'
  );
  run(
    commandName('git'),
    [
      'config',
      'user.email',
      '41898282+github-actions[bot]@users.noreply.github.com',
    ],
    'inherit'
  );
  run(commandName('git'), ['tag', '-a', tag, '-m', tag], 'inherit');
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
  try {
    run(commandName('gh'), ['release', 'view', tag], 'pipe');
  } catch {
    run(
      commandName('gh'),
      ['release', 'create', tag, '--generate-notes', '--title', tag],
      'inherit'
    );
  }
}

function main(): void {
  const version = requiredFlag('--version');
  const tag = ensureReleaseTag(version);
  ensureGitHubRelease(tag);
}

main();
