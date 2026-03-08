import type {
	ExistingRawSourceMap,
	TransformResult as RollupTransformResult,
} from 'rollup';
import type { Plugin as VitePlugin } from 'vite';

import fft from './index.js';
import type { TransformOptionsInput } from './transform/types.js';

export type FastFlowTransformViteOptions = TransformOptionsInput;

const JAVASCRIPT_MODULE_ID_PATTERN = /\.[cm]?jsx?(?:[?#].*)?$/;

export function createFastFlowTransformVite(
	options: FastFlowTransformViteOptions = {},
): VitePlugin {
	return {
		enforce: 'pre',
		name: 'fast-flow-transform:vite',
		async transform(code, id, _options) {
			if (id.startsWith('\0') || !JAVASCRIPT_MODULE_ID_PATTERN.test(id)) {
				return null;
			}

			const result = await fft({
				...options,
				filename: id,
				source: code,
				sourcemap: true,
			});

			const map = result.map
				? ({
						...result.map,
						version: Number(result.map.version),
					} as ExistingRawSourceMap)
				: null;

			return { code: result.code, map } satisfies RollupTransformResult;
		},
	};
}

export default createFastFlowTransformVite;
