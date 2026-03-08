import { readFile } from 'node:fs/promises';

import fft from './index.js';
import type { TransformOptionsInput } from './transform/types.js';

export type FastFlowTransformEsbuildOptions = TransformOptionsInput;

interface EsbuildPluginBuild {
	onLoad(
		options: { filter: RegExp },
		callback: (args: { path: string }) => Promise<unknown> | unknown,
	): void;
}

export interface EsbuildPlugin {
	name: string;
	setup(build: EsbuildPluginBuild): void;
}

const MODULE_FILTER = /\.[cm]?jsx?$/;

export function createFastFlowTransformEsbuild(
	options: FastFlowTransformEsbuildOptions = {},
): EsbuildPlugin {
	return {
		name: 'fast-flow-transform:esbuild',
		setup(build) {
			build.onLoad({ filter: MODULE_FILTER }, async ({ path }) => {
				const source = await readFile(path, 'utf8');
				const result = await fft({
					...options,
					filename: path,
					source,
					sourcemap: false,
				});

				return { contents: result.code, loader: 'jsx' };
			});
		},
	};
}

export default createFastFlowTransformEsbuild;
