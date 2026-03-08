import { Transformer } from '@parcel/plugin';
import SourceMap from '@parcel/source-map';

import programmaticTransform from './index.js';
import type {
  SourceMapLike,
  TransformOptionsInput,
} from './transform/types.js';

interface ParcelAssetMap {
  toVLQ(): SourceMapLike;
}

interface ParcelMutableAsset {
  env?: {
    sourceMap?: unknown;
  };
  filePath: string;
  getCode(): Promise<string>;
  getMap(): Promise<ParcelAssetMap | null>;
  setCode(code: string): void;
  setMap(map: unknown): void;
}

type SourceMapConstructor = new (projectRoot?: string) => {
  addVLQMap(map: SourceMapLike): void;
};

const ParcelSourceMap =
  (
    SourceMap as unknown as {
      default?: SourceMapConstructor;
    } & SourceMapConstructor
  ).default ?? (SourceMap as unknown as SourceMapConstructor);

function resolvedSourceMapOption(
  asset: ParcelMutableAsset,
  options: TransformOptionsInput
): boolean {
  if (typeof options.sourcemap === 'boolean') {
    return options.sourcemap;
  }

  return asset.env?.sourceMap !== false && asset.env?.sourceMap !== null;
}

async function inputSourceMapFor(
  asset: ParcelMutableAsset,
  sourcemap: boolean
): Promise<SourceMapLike | null> {
  if (!sourcemap) {
    return null;
  }

  const inputSourceMap = await asset.getMap();
  return inputSourceMap?.toVLQ() ?? null;
}

function parcelSourceMap(
  projectRoot: string,
  rawMap: SourceMapLike | undefined
): unknown {
  if (!rawMap) {
    return null;
  }

  const map = new ParcelSourceMap(projectRoot);
  map.addVLQMap(rawMap);
  return map;
}

export function createFastFlowTransformParcel(
  options: TransformOptionsInput = {}
) {
  return new Transformer({
    async transform({ asset, options: parcelOptions }) {
      const parcelAsset = asset as ParcelMutableAsset;
      const sourcemap = resolvedSourceMapOption(parcelAsset, options);
      const result = await programmaticTransform({
        ...options,
        filename: parcelAsset.filePath,
        inputSourceMap: await inputSourceMapFor(parcelAsset, sourcemap),
        source: await parcelAsset.getCode(),
        sourcemap,
      });

      parcelAsset.setCode(result.code);
      parcelAsset.setMap(
        parcelSourceMap(parcelOptions.projectRoot, result.map)
      );

      return [asset];
    },
  });
}

const fastFlowTransformParcel = createFastFlowTransformParcel();

export default fastFlowTransformParcel;
