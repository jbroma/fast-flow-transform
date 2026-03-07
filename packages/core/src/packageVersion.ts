import { readFileSync } from 'node:fs';

let cachedVersion: string | undefined;

export function packageVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ) as { version: string };
  cachedVersion = packageJson.version;
  return cachedVersion;
}
