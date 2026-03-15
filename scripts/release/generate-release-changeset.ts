import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';

import {
  highestImpact,
  releaseImpactFor,
  throwOnInvalidReleaseLabels,
} from './release-impact.ts';
import type { ReleaseImpact } from './release-impact.ts';

interface GitHubPullRequest {
  labels: { name: string }[];
  merged_at: string | null;
  number: number;
  title: string;
}

const GENERATED_CHANGESET_PATH = '.changeset/generated-release.md';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function writeOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  appendFileSync(outputPath, `${name}=${value}\n`);
}

function gitOutput(args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed with ${String(result.status)}\n${
        result.stdout ?? ''
      }${result.stderr ?? ''}`
    );
  }

  return (result.stdout ?? '').trim();
}

function latestReleaseTag(): string | null {
  const output = gitOutput(['tag', '--list', 'v*', '--sort=-version:refname']);
  return output ? (output.split('\n')[0] ?? null) : null;
}

function includesInRelease(
  pullRequest: GitHubPullRequest,
  since: string | null
): boolean {
  if (!pullRequest.merged_at) {
    return false;
  }

  if (since && pullRequest.merged_at <= since) {
    return false;
  }

  return !pullRequest.labels.some((label) => label.name === 'release: ignore');
}

async function listMergedPullRequests(
  repository: string,
  token: string,
  since: string | null
): Promise<GitHubPullRequest[]> {
  const pullRequests: GitHubPullRequest[] = [];

  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/pulls?base=main&direction=desc&page=${String(
        page
      )}&per_page=100&sort=updated&state=closed`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Unable to list pull requests: ${response.status} ${response.statusText}`
      );
    }

    const pageItems = (await response.json()) as GitHubPullRequest[];
    if (pageItems.length === 0) {
      break;
    }

    pullRequests.push(
      ...pageItems.filter((pullRequest) =>
        includesInRelease(pullRequest, since)
      )
    );
  }

  return pullRequests.toSorted((left, right) =>
    (left.merged_at ?? '').localeCompare(right.merged_at ?? '')
  );
}

function changesetSummary(
  impact: ReleaseImpact,
  sinceTag: string | null,
  pullRequests: GitHubPullRequest[]
): string {
  const lines = [
    'Prepare a synchronized package release.',
    '',
    `- Release impact: \`${impact}\``,
    `- Previous tag: ${sinceTag ? `\`${sinceTag}\`` : 'none (bootstrap release)'}`,
    '',
    'Included pull requests:',
  ];

  for (const pullRequest of pullRequests) {
    lines.push(
      `- #${String(pullRequest.number)} ${pullRequest.title} (${releaseImpactFor(
        pullRequest
      )})`
    );
  }

  return lines.join('\n');
}

function writeNoReleaseOutputs(): void {
  if (existsSync(GENERATED_CHANGESET_PATH)) {
    rmSync(GENERATED_CHANGESET_PATH);
  }
  writeOutput('should_release', 'false');
  writeOutput('release_reason', 'No releasable pull requests found');
  process.stdout.write('No releasable pull requests found.\n');
}

interface ReleaseInputs {
  includedPullRequests: GitHubPullRequest[];
  impact: ReleaseImpact;
  sinceTag: string | null;
}

async function releaseInputs(): Promise<ReleaseInputs> {
  const token = requiredEnv('GITHUB_TOKEN');
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const sinceTag = latestReleaseTag();
  const sinceTimestamp = sinceTag
    ? gitOutput(['log', '-1', '--format=%cI', sinceTag])
    : null;
  const pullRequests = await listMergedPullRequests(
    repository,
    token,
    sinceTimestamp
  );

  throwOnInvalidReleaseLabels(pullRequests);

  return {
    impact: highestImpact(pullRequests),
    includedPullRequests: pullRequests.filter(
      (pullRequest) => releaseImpactFor(pullRequest) !== 'none'
    ),
    sinceTag,
  };
}

function writeReleaseArtifacts(
  impact: Exclude<ReleaseImpact, 'none'>,
  sinceTag: string | null,
  pullRequests: GitHubPullRequest[]
): void {
  const summary = changesetSummary(impact, sinceTag, pullRequests);
  const changeset = `---\n'fast-flow-transform': ${impact}\n---\n\n${summary}\n`;
  const bodyPath = process.env.RELEASE_PR_BODY_PATH;

  mkdirSync('.changeset', { recursive: true });
  writeFileSync(GENERATED_CHANGESET_PATH, changeset);
  if (bodyPath) {
    writeFileSync(bodyPath, `${summary}\n`);
  }
  writeOutput('should_release', 'true');
  writeOutput('release_impact', impact);
}

async function main(): Promise<void> {
  const { impact, includedPullRequests, sinceTag } = await releaseInputs();

  if (impact === 'none' || includedPullRequests.length === 0) {
    writeNoReleaseOutputs();
    return;
  }
  writeReleaseArtifacts(impact, sinceTag, includedPullRequests);
}

await main();
