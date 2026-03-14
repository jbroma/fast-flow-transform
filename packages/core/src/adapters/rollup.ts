import fft from '../index.js';
import type {
  SourceMapLike,
  TransformOptionsInput,
} from '../transform/types.js';

export type FastFlowTransformRollupOptions = TransformOptionsInput;

export interface RollupTransformPlugin {
  name: string;
  transform(
    code: string,
    id: string
  ): Promise<{ code: string; map?: SourceMapLike } | null>;
}

const JAVASCRIPT_MODULE_ID_PATTERN = /\.[cm]?jsx?(?:[?#].*)?$/;

export function createFastFlowTransformRollup(
  options: FastFlowTransformRollupOptions = {}
): RollupTransformPlugin {
  return {
    name: 'fast-flow-transform:rollup',
    async transform(code, id) {
      if (id.startsWith('\0') || !JAVASCRIPT_MODULE_ID_PATTERN.test(id)) {
        return null;
      }

      return await fft({
        ...options,
        filename: id,
        source: code,
        sourcemap: true,
      });
    },
  };
}

export default createFastFlowTransformRollup;
