import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export const binaryPath = path.join(currentDirectory, 'bin', 'fft-strip');

export default { binaryPath };
