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
  'breaking-change': {
    color: 'b60205',
    description: 'Pull request includes a breaking change',
  },
});

async function ensureLabel({ github, repo, name, color, description }) {
  try {
    await github.rest.issues.getLabel({ ...repo, name });
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }

    await github.rest.issues.createLabel({
      ...repo,
      name,
      color,
      description,
    });
  }
}

async function ensureManagedLabels({ github, context }) {
  for (const [name, details] of Object.entries(LABEL_DEFS)) {
    await ensureLabel({
      github,
      repo: context.repo,
      name,
      color: details.color,
      description: details.description,
    });
  }
}

module.exports = ensureManagedLabels;
