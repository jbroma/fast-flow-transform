'use strict';

const crypto = require('crypto');
const fs = require('fs');

const { mergeSourceMaps } = require('./mergeSourceMaps');
const { parseOptions, stableOptionsKey } = require('./options');
const { getPool } = require('./pool');
const { resolveBinaryPath } = require('./resolveBinary');

const PACKAGE_VERSION = require('../package.json').version;
const TRANSFORM_CACHE = new Map();
const BINARY_VERSION_CACHE = new Map();

function stableMapKey(inputMap) {
  if (inputMap == null) {
    return 'null';
  }
  return JSON.stringify(inputMap);
}

function getBinaryVersion(binaryPath) {
  let version = BINARY_VERSION_CACHE.get(binaryPath);
  if (version != null) {
    return version;
  }

  const stat = fs.statSync(binaryPath);
  version = `${PACKAGE_VERSION}:${binaryPath}:${String(stat.size)}:${String(
    stat.mtimeMs
  )}`;
  BINARY_VERSION_CACHE.set(binaryPath, version);
  return version;
}

function buildCacheKey({
  code,
  filename,
  options,
  binaryVersion,
  inputSourceMap,
}) {
  const hash = crypto.createHash('sha256');
  hash.update(code);
  hash.update('\0');
  hash.update(filename);
  hash.update('\0');
  hash.update(stableOptionsKey(options));
  hash.update('\0');
  hash.update(binaryVersion);
  hash.update('\0');
  hash.update(stableMapKey(inputSourceMap));
  return hash.digest('hex');
}

function toLoaderError(nativeError, resourcePath) {
  if (nativeError instanceof Error) {
    return nativeError;
  }

  const line = nativeError != null ? nativeError.line : null;
  const column = nativeError != null ? nativeError.column : null;
  const location =
    line == null || column == null
      ? ''
      : ` (${resourcePath}:${String(line)}:${String(column)})`;
  const message =
    nativeError != null && typeof nativeError.message === 'string'
      ? nativeError.message
      : 'Unknown fft-strip native error';

  return new Error(`fft-strip transform failed${location}: ${message}`);
}

function getRawLoaderOptions(loaderContext) {
  if (typeof loaderContext.getOptions === 'function') {
    return loaderContext.getOptions() || {};
  }
  if (loaderContext.query != null && typeof loaderContext.query === 'object') {
    return loaderContext.query;
  }
  return {};
}

function createTransformRequest(resourcePath, code, options) {
  return {
    filename: resourcePath,
    code,
    dialect: options.dialect,
    format: options.format,
    reactRuntimeTarget: options.reactRuntimeTarget,
    enumRuntimeModule: options.enumRuntimeModule,
  };
}

function withCallback(callback, operation) {
  try {
    return operation();
  } catch (error) {
    callback(error);
    return null;
  }
}

function transformSource(
  pool,
  request,
  inputSourceMap,
  resourcePath,
  cacheKey
) {
  return pool.transform(request).then((nativeResult) => {
    const mergedMap = mergeSourceMaps(
      inputSourceMap,
      nativeResult.map,
      resourcePath
    );
    const result = {
      code: nativeResult.code,
      map: mergedMap,
    };
    TRANSFORM_CACHE.set(cacheKey, result);
    return result;
  });
}

function getLoaderState(
  loaderContext,
  callback,
  code,
  resourcePath,
  inputSourceMap
) {
  const options = withCallback(callback, () =>
    parseOptions(getRawLoaderOptions(loaderContext))
  );
  if (options == null) {
    return null;
  }

  const binaryPath = withCallback(callback, resolveBinaryPath);
  if (binaryPath == null) {
    return null;
  }

  const cacheKey = withCallback(callback, () =>
    buildCacheKey({
      code,
      filename: resourcePath,
      options,
      binaryVersion: getBinaryVersion(binaryPath),
      inputSourceMap,
    })
  );
  if (cacheKey == null) {
    return null;
  }

  return {
    binaryPath,
    cacheKey,
    options,
  };
}

function flowStripLoader(source, inputSourceMap, meta) {
  const callback = this.async();
  const resourcePath = this.resourcePath || '<unknown>';

  if (typeof this.cacheable === 'function') {
    this.cacheable(true);
  }

  const code = Buffer.isBuffer(source)
    ? source.toString('utf8')
    : String(source);
  const loaderState = getLoaderState(
    this,
    callback,
    code,
    resourcePath,
    inputSourceMap
  );
  if (loaderState == null) {
    return;
  }
  const { binaryPath, cacheKey, options } = loaderState;

  const cached = TRANSFORM_CACHE.get(cacheKey);
  if (cached != null) {
    callback(null, cached.code, cached.map, meta);
    return;
  }

  const pool = getPool(binaryPath, options.threads);
  transformSource(
    pool,
    createTransformRequest(resourcePath, code, options),
    inputSourceMap,
    resourcePath,
    cacheKey
  )
    .then((nativeResult) => {
      callback(null, nativeResult.code, nativeResult.map, meta);
    })
    .catch((error) => {
      callback(toLoaderError(error, resourcePath));
    });
}

module.exports = flowStripLoader;
module.exports.default = flowStripLoader;
module.exports._internal = {
  buildCacheKey,
  mergeSourceMaps,
  parseOptions,
};
