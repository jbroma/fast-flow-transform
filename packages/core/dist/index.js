import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { mergeSourceMaps } from './mergeSourceMaps.js';
import { parseOptions, stableOptionsKey } from './options.js';
import { packageVersion } from './packageVersion.js';
import { getPool } from './pool.js';
import { resolveBinaryPath } from './resolveBinary.js';
const BINARY_VERSION_CACHE = new Map();
const TRANSFORM_CACHE = new Map();
function stableMapKey(inputMap) {
    return inputMap ? JSON.stringify(inputMap) : 'null';
}
function binaryVersion(binaryPath) {
    const cachedVersion = BINARY_VERSION_CACHE.get(binaryPath);
    if (cachedVersion) {
        return cachedVersion;
    }
    const stat = statSync(binaryPath);
    const version = `${packageVersion()}:${binaryPath}:${String(stat.size)}:${String(stat.mtimeMs)}`;
    BINARY_VERSION_CACHE.set(binaryPath, version);
    return version;
}
export function buildCacheKey({ binarySignature, code, filename, inputSourceMap, options, }) {
    return createHash('sha256')
        .update(code)
        .update('\0')
        .update(filename)
        .update('\0')
        .update(stableOptionsKey(options))
        .update('\0')
        .update(binarySignature)
        .update('\0')
        .update(stableMapKey(inputSourceMap))
        .digest('hex');
}
function loaderErrorMessage(nativeError, resourcePath) {
    const hasLocation = typeof nativeError.line === 'number' &&
        typeof nativeError.column === 'number';
    const location = hasLocation
        ? ` (${resourcePath}:${String(nativeError.line)}:${String(nativeError.column)})`
        : '';
    const message = typeof nativeError.message === 'string'
        ? nativeError.message
        : 'Unknown fft-strip native error';
    return `fft-strip transform failed${location}: ${message}`;
}
function toLoaderError(nativeError, resourcePath) {
    if (nativeError instanceof Error) {
        return nativeError;
    }
    return new Error(loaderErrorMessage((nativeError ?? {}), resourcePath));
}
function rawLoaderOptions(loaderContext) {
    if (typeof loaderContext.getOptions === 'function') {
        return loaderContext.getOptions() ?? {};
    }
    if (loaderContext.query && typeof loaderContext.query === 'object') {
        return loaderContext.query;
    }
    return {};
}
function transformRequest(resourcePath, code, options) {
    return {
        code,
        dialect: options.dialect,
        enumRuntimeModule: options.enumRuntimeModule,
        filename: resourcePath,
        format: options.format,
        reactRuntimeTarget: options.reactRuntimeTarget,
    };
}
function withCallbackResult(callback, operation) {
    try {
        return operation();
    }
    catch (error) {
        callback(error);
        return null;
    }
}
function loaderState(loaderContext, callback, code, resourcePath, inputSourceMap) {
    const options = withCallbackResult(callback, () => parseOptions(rawLoaderOptions(loaderContext)));
    const binaryPath = withCallbackResult(callback, resolveBinaryPath);
    if (!options || !binaryPath) {
        return null;
    }
    const cacheKey = withCallbackResult(callback, () => buildCacheKey({
        binarySignature: binaryVersion(binaryPath),
        code,
        filename: resourcePath,
        inputSourceMap,
        options,
    }));
    if (!cacheKey) {
        return null;
    }
    return { binaryPath, cacheKey, options };
}
function cachedTransform(cacheKey) {
    return TRANSFORM_CACHE.get(cacheKey);
}
async function transformAndCache(request, inputSourceMap, resourcePath, cacheKey, threads, binaryPath) {
    const nativeResult = await getPool(binaryPath, threads).transform(request);
    const result = {
        code: nativeResult.code,
        map: mergeSourceMaps(inputSourceMap, nativeResult.map, resourcePath),
    };
    TRANSFORM_CACHE.set(cacheKey, result);
    return result;
}
function sourceText(source) {
    return Buffer.isBuffer(source) ? source.toString('utf8') : String(source);
}
function callbackWithCachedResult(callback, cachedResult, meta) {
    callback(null, cachedResult.code, cachedResult.map, meta);
}
function handleCachedResult(callback, cacheKey, meta) {
    const cachedResult = cachedTransform(cacheKey);
    if (!cachedResult) {
        return false;
    }
    callbackWithCachedResult(callback, cachedResult, meta);
    return true;
}
function loaderRuntime(context) {
    return {
        callback: context.async(),
        resourcePath: context.resourcePath ?? '<unknown>',
    };
}
function requestTransform(callback, state, code, inputSourceMap, meta, resourcePath) {
    transformAndCache(transformRequest(resourcePath, code, state.options), inputSourceMap, resourcePath, state.cacheKey, state.options.threads, state.binaryPath)
        .then((result) => {
        callback(null, result.code, result.map, meta);
    })
        .catch((error) => {
        callback(toLoaderError(error, resourcePath));
    });
}
function flowStripLoader(source, inputSourceMap, meta) {
    const { callback, resourcePath } = loaderRuntime(this);
    this.cacheable?.(true);
    const code = sourceText(source);
    const state = loaderState(this, callback, code, resourcePath, inputSourceMap);
    if (!state) {
        return;
    }
    if (handleCachedResult(callback, state.cacheKey, meta)) {
        return;
    }
    requestTransform(callback, state, code, inputSourceMap, meta, resourcePath);
}
export default flowStripLoader;
export const _internal = {
    buildCacheKey,
    mergeSourceMaps,
    parseOptions,
};
//# sourceMappingURL=index.js.map