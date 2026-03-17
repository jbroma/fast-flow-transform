const RELEASE_LABELS = new Set([
  'release: none',
  'release: patch',
  'release: minor',
  'release: major',
]);

interface RepoContext {
  apiUrl: string;
  issueNumber: number;
  owner: string;
  repo: string;
  token: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function repoContext(): RepoContext {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const [owner, repo] = repository.split('/');
  const issueNumber = Number.parseInt(requiredEnv('GITHUB_PR_NUMBER'), 10);

  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
  }

  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(`Invalid GITHUB_PR_NUMBER: ${String(issueNumber)}`);
  }

  return {
    apiUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com',
    issueNumber,
    owner,
    repo,
    token: requiredEnv('GITHUB_TOKEN'),
  };
}

function githubRequest(
  context: RepoContext,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('Authorization', `Bearer ${context.token}`);
  headers.set('X-GitHub-Api-Version', '2022-11-28');

  return fetch(`${context.apiUrl}${path}`, {
    ...init,
    headers,
  });
}

function releaseLabelsFrom(names: string[]): string[] {
  return names.filter((name) => RELEASE_LABELS.has(name));
}

function defaultReleaseLabel(names: string[]): string {
  if (names.includes('breaking-change')) {
    return 'release: major';
  }

  if (names.includes('type: feat')) {
    return 'release: minor';
  }

  return 'release: patch';
}

async function listCurrentLabelNames(context: RepoContext): Promise<string[]> {
  const labels: string[] = [];

  for (let page = 1; ; page += 1) {
    const response = await githubRequest(
      context,
      `/repos/${context.owner}/${context.repo}/issues/${String(
        context.issueNumber
      )}/labels?per_page=100&page=${String(page)}`
    );

    if (!response.ok) {
      throw new Error(`Unable to list PR labels: ${response.status}`);
    }

    const pageLabels = (await response.json()) as { name?: string }[];
    labels.push(
      ...pageLabels
        .map((label) => label.name)
        .filter((name): name is string => name !== undefined)
    );

    if (pageLabels.length < 100) {
      return labels;
    }
  }
}

function resolveReleaseState(currentLabelNames: string[]): {
  currentReleaseLabels: string[];
  nextLabel: string;
} {
  const currentReleaseLabels = releaseLabelsFrom(currentLabelNames);

  if (currentReleaseLabels.length > 1) {
    throw new Error(
      `PR must have exactly one release label. Found: ${currentReleaseLabels.join(', ')}`
    );
  }

  return {
    currentReleaseLabels,
    nextLabel: defaultReleaseLabel(currentLabelNames),
  };
}

async function addReleaseLabel(
  context: RepoContext,
  name: string
): Promise<void> {
  const response = await githubRequest(
    context,
    `/repos/${context.owner}/${context.repo}/issues/${String(
      context.issueNumber
    )}/labels`,
    {
      body: JSON.stringify({ labels: [name] }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Unable to add "${name}" label: ${response.status}${body ? ` ${body}` : ''}`
    );
  }
}

async function main(): Promise<void> {
  const context = repoContext();
  const currentLabelNames = await listCurrentLabelNames(context);
  const { currentReleaseLabels, nextLabel } =
    resolveReleaseState(currentLabelNames);

  if (currentReleaseLabels.length === 1) {
    return;
  }

  await addReleaseLabel(context, nextLabel);
}

await main();
