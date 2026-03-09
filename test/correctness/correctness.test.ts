import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import fft from 'fast-flow-transform';

type Format = 'compact' | 'pretty';

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

function outputPath(name: string, format: Format): string {
  return resolve(outputsDir(), `${name}.${format}.js`);
}

function fixtureInput(name: string): string {
  return readFileSync(inputPath(name), 'utf8');
}

async function expectFixtureSnapshot(
  name: string,
  format: Format
): Promise<void> {
  const result = await fft({
    filename: `${name}.js`,
    format,
    source: fixtureInput(name),
    sourcemap: false,
  });

  await expect(result.code).toMatchFileSnapshot(outputPath(name, format));
}

describe('transform correctness snapshots', () => {
  const fixtures = fixtureNames();

  it('discovers at least one transform fixture', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)('%s matches pretty output', async (fixture) => {
    await expectFixtureSnapshot(fixture, 'pretty');
  });

  it.each(fixtures)('%s matches compact output', async (fixture) => {
    await expectFixtureSnapshot(fixture, 'compact');
  });
});
