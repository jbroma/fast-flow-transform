const LABEL_DEFS = Object.freeze({
  'type: feat': {
    color: '0e8a16',
    description: 'Feature pull request',
  },
  'type: fix': {
    color: 'd73a4a',
    description: 'Bug fix pull request',
  },
  'type: chore': {
    color: '6a737d',
    description: 'Maintenance pull request',
  },
  'type: refactor': {
    color: '8a63d2',
    description: 'Refactor pull request',
  },
  'type: docs': {
    color: '0366d6',
    description: 'Documentation pull request',
  },
  'type: test': {
    color: 'fbca04',
    description: 'Test coverage pull request',
  },
  'type: perf': {
    color: 'c2e0c6',
    description: 'Performance pull request',
  },
  'type: build': {
    color: '1d76db',
    description: 'Build system pull request',
  },
  'type: ci': {
    color: '5319e7',
    description: 'CI workflow pull request',
  },
  'type: revert': {
    color: 'b60205',
    description: 'Revert pull request',
  },
  'release: none': {
    color: 'bfdadc',
    description: 'No release impact',
  },
  'release: patch': {
    color: 'fbca04',
    description: 'Patch release impact',
  },
  'release: minor': {
    color: '0e8a16',
    description: 'Minor release impact',
  },
  'release: major': {
    color: 'b60205',
    description: 'Major release impact',
  },
  'breaking-change': {
    color: 'b60205',
    description: 'Pull request includes a breaking change',
  },
  'release: ignore': {
    color: 'ededed',
    description: 'Exclude this pull request from release note generation',
  },
});

interface RepoContext {
  apiUrl: string;
  owner: string;
  repo: string;
  token: string;
}

interface LabelDef {
  color: string;
  description: string;
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

  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
  }

  return {
    apiUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com',
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

async function labelExists(
  context: RepoContext,
  name: string
): Promise<boolean> {
  const response = await githubRequest(
    context,
    `/repos/${context.owner}/${context.repo}/labels/${encodeURIComponent(name)}`
  );

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`Unable to look up label "${name}": ${response.status}`);
  }

  return true;
}

async function createLabel(
  context: RepoContext,
  name: string,
  details: LabelDef
): Promise<void> {
  const response = await githubRequest(
    context,
    `/repos/${context.owner}/${context.repo}/labels`,
    {
      body: JSON.stringify({
        color: details.color,
        description: details.description,
        name,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );

  if (!response.ok) {
    throw new Error(`Unable to create label "${name}": ${response.status}`);
  }
}

async function ensureLabel(
  context: RepoContext,
  name: string,
  details: LabelDef
): Promise<void> {
  if (await labelExists(context, name)) {
    return;
  }

  await createLabel(context, name, details);
}

async function main(): Promise<void> {
  const context = repoContext();

  for (const [name, details] of Object.entries(LABEL_DEFS)) {
    await ensureLabel(context, name, details);
  }
}

await main();
