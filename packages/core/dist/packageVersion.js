import { readFileSync } from 'node:fs';
let cachedVersion;
export function packageVersion() {
    if (cachedVersion) {
        return cachedVersion;
    }
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    cachedVersion = packageJson.version;
    return cachedVersion;
}
//# sourceMappingURL=packageVersion.js.map