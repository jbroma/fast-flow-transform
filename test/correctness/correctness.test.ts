import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import fft from 'fast-flow-transform';

type Format = 'compact' | 'pretty';
interface SnapshotCase {
  fixture: string;
  options: {
    format: Format;
    preserveComments?: boolean;
    preserveWhitespace?: boolean;
    sourcemap?: boolean;
  };
  snapshotFile: string;
  title: string;
}

function inputsDir(): string {
  return resolve(import.meta.dirname, 'inputs');
}

function outputsDir(): string {
  return resolve(import.meta.dirname, 'outputs');
}

function fixtureNames(): string[] {
  return readdirSync(inputsDir())
    .filter((fileName) => fileName.endsWith('.js'))
    .map((fileName) => fileName.replace(/\.js$/u, ''))
    .toSorted();
}

function inputPath(name: string): string {
  return resolve(inputsDir(), `${name}.js`);
}

function snapshotPath(fileName: string): string {
  return resolve(outputsDir(), fileName);
}

function fixtureInput(name: string): string {
  return readFileSync(inputPath(name), 'utf8');
}

function standardCases(fixtures: string[]): SnapshotCase[] {
  return fixtures.flatMap((fixture) => [
    {
      fixture,
      options: {
        format: 'pretty',
      },
      snapshotFile: `${fixture}.pretty.js`,
      title: `${fixture} matches pretty output`,
    },
    {
      fixture,
      options: {
        format: 'compact',
      },
      snapshotFile: `${fixture}.compact.js`,
      title: `${fixture} matches compact output`,
    },
  ]);
}

function preserveCases(): SnapshotCase[] {
  return [
    {
      fixture: 'preserve-layout',
      options: {
        format: 'pretty',
        preserveWhitespace: true,
        sourcemap: false,
      },
      snapshotFile: 'preserve-layout.preserve-whitespace.js',
      title: 'preserve-layout preserves whitespace without comments',
    },
    {
      fixture: 'preserve-layout',
      options: {
        format: 'pretty',
        preserveComments: true,
        preserveWhitespace: true,
        sourcemap: false,
      },
      snapshotFile: 'preserve-layout.preserve-whitespace-comments.js',
      title: 'preserve-layout preserves whitespace and comments',
    },
  ];
}

function commentCases(): SnapshotCase[] {
  return [
    {
      fixture: 'comment-preserve',
      options: {
        format: 'pretty',
        preserveComments: true,
        sourcemap: false,
      },
      snapshotFile: 'comment-preserve.pretty-comments.js',
      title: 'comment-preserve keeps comments in pretty output',
    },
    {
      fixture: 'comment-preserve',
      options: {
        format: 'compact',
        preserveComments: true,
        sourcemap: false,
      },
      snapshotFile: 'comment-preserve.compact-comments.js',
      title: 'comment-preserve keeps comments in compact output',
    },
    {
      fixture: 'comment-reanchor',
      options: {
        format: 'pretty',
        preserveComments: true,
        sourcemap: false,
      },
      snapshotFile: 'comment-reanchor.pretty-comments.js',
      title: 'comment-reanchor moves comments off removed Flow declarations',
    },
    {
      fixture: 'comment-ambiguous-drop',
      options: {
        format: 'pretty',
        preserveComments: true,
        sourcemap: false,
      },
      snapshotFile: 'comment-ambiguous-drop.pretty-comments.js',
      title: 'comment-ambiguous-drop removes ambiguous comments',
    },
  ];
}

async function expectFixtureSnapshot(
  snapshotCase: SnapshotCase
): Promise<void> {
  const { fixture, options, snapshotFile } = snapshotCase;
  const result = await fft({
    filename: `${fixture}.js`,
    source: fixtureInput(fixture),
    sourcemap: false,
    ...(options as Record<string, unknown>),
  } as never);

  await expect(result.code).toMatchFileSnapshot(snapshotPath(snapshotFile));
}

describe('transform correctness snapshots', () => {
  const fixtures = fixtureNames();
  const cases = [
    ...standardCases(fixtures),
    ...preserveCases(),
    ...commentCases(),
  ];

  it('discovers at least one transform fixture', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(cases)('$title', async (snapshotCase) => {
    await expectFixtureSnapshot(snapshotCase);
  });
});
