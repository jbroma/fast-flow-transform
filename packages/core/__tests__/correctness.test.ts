import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import fft from '../src/index.js';

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

const FIXTURE = 'preserve-layout';

function inputPath(name: string): string {
  return resolve(inputsDir(), `${name}.js`);
}

function snapshotPath(fileName: string): string {
  return resolve(outputsDir(), fileName);
}

function fixtureInput(name: string): string {
  return readFileSync(inputPath(name), 'utf8');
}

function standardCases(): SnapshotCase[] {
  return [
    {
      fixture: FIXTURE,
      options: {
        format: 'pretty',
      },
      snapshotFile: `${FIXTURE}.pretty.js`,
      title: `${FIXTURE} matches pretty output`,
    },
    {
      fixture: FIXTURE,
      options: {
        format: 'compact',
      },
      snapshotFile: `${FIXTURE}.compact.js`,
      title: `${FIXTURE} matches compact output`,
    },
  ];
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
      fixture: FIXTURE,
      options: {
        format: 'pretty',
        preserveComments: true,
        sourcemap: false,
      },
      snapshotFile: `${FIXTURE}.pretty-comments.js`,
      title: `${FIXTURE} keeps comments in pretty output`,
    },
    {
      fixture: FIXTURE,
      options: {
        format: 'compact',
        preserveComments: true,
        sourcemap: false,
      },
      snapshotFile: `${FIXTURE}.compact-comments.js`,
      title: `${FIXTURE} keeps comments in compact output`,
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
  const cases = [...standardCases(), ...preserveCases(), ...commentCases()];

  it('loads the shared transform fixture', () => {
    expect(fixtureInput(FIXTURE).length).toBeGreaterThan(0);
  });

  it.each(cases)('$title', async (snapshotCase) => {
    await expectFixtureSnapshot(snapshotCase);
  });
});
