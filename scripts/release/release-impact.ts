export type ReleaseImpact = 'none' | 'patch' | 'minor' | 'major';

interface ReleasePullRequest {
  labels: { name: string }[];
  number: number;
  title: string;
}

const RELEASE_LABELS = new Set([
  'release: none',
  'release: patch',
  'release: minor',
  'release: major',
]);

function explicitReleaseLabels(pullRequest: ReleasePullRequest): string[] {
  return pullRequest.labels
    .map((label) => label.name)
    .filter((name) => RELEASE_LABELS.has(name));
}

function fallbackImpactFromLabels(
  pullRequest: ReleasePullRequest
): ReleaseImpact | null {
  if (pullRequest.labels.some((label) => label.name === 'breaking-change')) {
    return 'major';
  }

  if (pullRequest.labels.some((label) => label.name === 'type: feat')) {
    return 'minor';
  }

  return null;
}

function fallbackImpactFromTitle(title: string): ReleaseImpact {
  if (/^[a-z]+\(.*\)!: /.test(title)) {
    return 'major';
  }

  return /^feat\(.*\): /.test(title) ? 'minor' : 'patch';
}

function releaseImpactPriority(impact: ReleaseImpact): number {
  return {
    none: 0,
    patch: 1,
    minor: 2,
    major: 3,
  }[impact];
}

export function releaseImpactFor(
  pullRequest: ReleasePullRequest
): ReleaseImpact | null {
  const releaseLabels = explicitReleaseLabels(pullRequest);

  if (releaseLabels.length > 1) {
    return null;
  }

  if (releaseLabels.length === 1) {
    return releaseLabels[0].replace('release: ', '') as ReleaseImpact;
  }

  return (
    fallbackImpactFromLabels(pullRequest) ??
    fallbackImpactFromTitle(pullRequest.title)
  );
}

export function highestImpact(
  pullRequests: ReleasePullRequest[]
): ReleaseImpact {
  let current: ReleaseImpact = 'none';

  for (const pullRequest of pullRequests) {
    const nextImpact = releaseImpactFor(pullRequest) ?? 'none';
    if (releaseImpactPriority(nextImpact) > releaseImpactPriority(current)) {
      current = nextImpact;
    }
  }

  return current;
}

export function throwOnInvalidReleaseLabels(
  pullRequests: ReleasePullRequest[]
): void {
  const invalidPullRequests = pullRequests.filter(
    (pullRequest) => explicitReleaseLabels(pullRequest).length > 1
  );

  if (invalidPullRequests.length === 0) {
    return;
  }

  const details = invalidPullRequests
    .map((pullRequest) => `#${String(pullRequest.number)} ${pullRequest.title}`)
    .join(', ');
  throw new Error(
    `Merged pull requests must not have multiple release labels: ${details}`
  );
}
