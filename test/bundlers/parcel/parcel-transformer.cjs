const { Transformer } = require('@parcel/plugin');
const sourceMapModule = require('@parcel/source-map');
const { transform: transformWithSwc } = require('@swc/core');

const ParcelSourceMap = sourceMapModule.default ?? sourceMapModule;

let fftPromise;

function fftModule() {
  fftPromise ??= import('fast-flow-transform');
  return fftPromise;
}

function normalizedMap(rawMap) {
  if (!rawMap) {
    return null;
  }

  return {
    ...rawMap,
    version: rawMap.version ?? 3,
  };
}

async function runSwc(code, filename, inputSourceMap, sourcemap) {
  const result = await transformWithSwc(code, {
    filename,
    sourceMaps: sourcemap,
    inputSourceMap: inputSourceMap ? JSON.stringify(inputSourceMap) : undefined,
    jsc: {
      parser: {
        jsx: true,
        syntax: 'ecmascript',
      },
      transform: {
        optimizer: {
          globals: {
            vars: {
              __DEV__: 'false',
            },
          },
        },
        react: {
          runtime: 'classic',
        },
      },
    },
  });

  return {
    code: result.code,
    map: result.map ? JSON.parse(result.map) : (inputSourceMap ?? null),
  };
}

function parcelMap(projectRoot, rawMap) {
  if (!rawMap) {
    return null;
  }

  const map = new ParcelSourceMap(projectRoot);
  map.addVLQMap(rawMap);
  return map;
}

module.exports = new Transformer({
  async transform({ asset, options }) {
    const { default: fft } = await fftModule();
    const sourcemap = asset.env?.sourceMap !== false;
    const inputSourceMap = sourcemap ? await asset.getMap() : null;
    const rawInputSourceMap = normalizedMap(inputSourceMap?.toVLQ() ?? null);
    const fftResult = await fft({
      dialect: 'flow-detect',
      filename: asset.filePath,
      format: 'compact',
      inputSourceMap: rawInputSourceMap,
      source: await asset.getCode(),
      sourcemap,
    });
    const swcResult = await runSwc(
      fftResult.code,
      asset.filePath,
      normalizedMap(fftResult.map ?? null),
      sourcemap
    );

    asset.setCode(swcResult.code);
    asset.setMap(parcelMap(options.projectRoot, swcResult.map));
    return [asset];
  },
});
