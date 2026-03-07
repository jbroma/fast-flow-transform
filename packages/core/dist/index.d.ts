import { mergeSourceMaps } from './mergeSourceMaps.js';
import { parseOptions } from './options.js';
import type { LoaderOptions, LoaderOptionsInput, SourceMapLike } from './types.js';
type LoaderCallback = (error: Error | null, code?: string, map?: SourceMapLike | null, meta?: unknown) => void;
interface LoaderContext {
    async(): LoaderCallback;
    cacheable?: (cacheable?: boolean) => void;
    getOptions?: () => LoaderOptionsInput;
    query?: LoaderOptionsInput;
    resourcePath?: string;
}
export declare function buildCacheKey({ binarySignature, code, filename, inputSourceMap, options, }: {
    binarySignature: string;
    code: string;
    filename: string;
    inputSourceMap: SourceMapLike | null | undefined;
    options: LoaderOptions;
}): string;
declare function flowStripLoader(this: LoaderContext, source: string | Buffer, inputSourceMap: SourceMapLike | null | undefined, meta: unknown): void;
export default flowStripLoader;
export declare const _internal: {
    buildCacheKey: typeof buildCacheKey;
    mergeSourceMaps: typeof mergeSourceMaps;
    parseOptions: typeof parseOptions;
};
//# sourceMappingURL=index.d.ts.map