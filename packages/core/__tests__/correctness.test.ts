import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import fft from '../src/index.js';

type Format = 'compact' | 'pretty' | 'preserve';
interface SnapshotCase {
  fixture: string;
  options: {
    comments?: boolean;
    format: Format;
    sourcemap?: boolean;
  };
  snapshotFile: string;
  title: string;
}

function outputsDir(): string {
  return resolve(import.meta.dirname, 'outputs');
}

function inputsDir(): string {
  return resolve(import.meta.dirname, 'inputs');
}

const FULL_FIXTURE = 'source.flow';
const PRESERVE_FIXTURE = 'source.flow.preserve';

function snapshotPath(fileName: string): string {
  return resolve(outputsDir(), fileName);
}

function fixturePath(fixture: string): string {
  return resolve(inputsDir(), `${fixture}.js`);
}

function fixtureInput(fixture: string): string {
  return readFileSync(fixturePath(fixture), 'utf8');
}

function assertParsesAsModule(code: string, fileName: string): void {
  const tempDir = mkdtempSync(join(tmpdir(), 'fft-parse-'));
  const tempFile = join(tempDir, fileName);
  writeFileSync(tempFile, code, 'utf8');

  const result = spawnSync(process.execPath, ['--check', tempFile], {
    encoding: 'utf8',
  });

  rmSync(tempDir, { force: true, recursive: true });

  expect({
    status: result.status,
    stderr: result.stderr,
  }).toStrictEqual({
    status: 0,
    stderr: '',
  });
}

function standardCases(): SnapshotCase[] {
  return [
    {
      fixture: FULL_FIXTURE,
      options: {
        format: 'pretty',
      },
      snapshotFile: `${FULL_FIXTURE}.pretty.js`,
      title: `${FULL_FIXTURE} matches pretty output`,
    },
    {
      fixture: FULL_FIXTURE,
      options: {
        format: 'compact',
      },
      snapshotFile: `${FULL_FIXTURE}.compact.js`,
      title: `${FULL_FIXTURE} matches compact output`,
    },
  ];
}

function preserveCases(): SnapshotCase[] {
  return [
    {
      fixture: PRESERVE_FIXTURE,
      options: {
        format: 'preserve',
        sourcemap: false,
      },
      snapshotFile: `${PRESERVE_FIXTURE}.preserve-whitespace.js`,
      title: `${PRESERVE_FIXTURE} preserves whitespace without comments`,
    },
    {
      fixture: PRESERVE_FIXTURE,
      options: {
        comments: true,
        format: 'preserve',
        sourcemap: false,
      },
      snapshotFile: `${PRESERVE_FIXTURE}.preserve-whitespace-comments.js`,
      title: `${PRESERVE_FIXTURE} preserves whitespace and comments`,
    },
  ];
}

function commentCases(): SnapshotCase[] {
  return [
    {
      fixture: FULL_FIXTURE,
      options: {
        comments: true,
        format: 'pretty',
        sourcemap: false,
      },
      snapshotFile: `${FULL_FIXTURE}.pretty-comments.js`,
      title: `${FULL_FIXTURE} keeps comments in pretty output`,
    },
    {
      fixture: FULL_FIXTURE,
      options: {
        comments: true,
        format: 'compact',
        sourcemap: false,
      },
      snapshotFile: `${FULL_FIXTURE}.compact-comments.js`,
      title: `${FULL_FIXTURE} keeps comments in compact output`,
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

  it('loads the transform fixtures', () => {
    for (const fixture of [FULL_FIXTURE, PRESERVE_FIXTURE]) {
      expect(fixtureInput(fixture).length).toBeGreaterThan(0);
    }
  });

  it.each(cases)('$title', async (snapshotCase) => {
    await expectFixtureSnapshot(snapshotCase);
  });

  it('preserve-whitespace outputs for the shared fixture parse as valid modules', async () => {
    for (const snapshotCase of preserveCases()) {
      const result = await fft({
        filename: `${snapshotCase.fixture}.js`,
        source: fixtureInput(snapshotCase.fixture),
        sourcemap: false,
        ...(snapshotCase.options as Record<string, unknown>),
      } as never);

      assertParsesAsModule(result.code, `${snapshotCase.snapshotFile}.mjs`);
    }
  });
});
