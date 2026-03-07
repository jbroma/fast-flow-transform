import type { TransformRequest, TransformResult } from './types.js';
declare class NativePool {
    #private;
    constructor(binaryPath: string, threads: number);
    transform(request: TransformRequest): Promise<TransformResult>;
    close(): void;
}
export declare function getPool(binaryPath: string, threadsOption?: number): NativePool;
export declare function closeAllPools(): void;
export {};
//# sourceMappingURL=pool.d.ts.map