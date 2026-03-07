import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface Pool {
  transform(request: {
    code: string;
    dialect: 'flow-detect';
    enumRuntimeModule: string;
    filename: string;
    format: 'compact';
    reactRuntimeTarget: '18';
  }): Promise<{
    code: string;
    map: unknown;
  }>;
}

interface PoolModule {
  closeAllPools(): void;
  getPool(binaryPath: string, threads: number): Pool;
}

interface ResolveBinaryModule {
  resolveBinaryPath(): string;
}

function sourceModuleUrl(pathname: string): string {
  const benchDirectory = fileURLToPath(new URL('.', import.meta.url));
  return pathToFileURL(
    resolve(benchDirectory, '..', 'packages/core/src', pathname)
  ).href;
}

export async function loadBenchmarkRuntime(): Promise<{
  closeAllPools: PoolModule['closeAllPools'];
  getPool: PoolModule['getPool'];
  resolveBinaryPath: ResolveBinaryModule['resolveBinaryPath'];
}> {
  const [poolModule, resolveBinaryModule] = await Promise.all([
    import(sourceModuleUrl('pool.ts')) as Promise<PoolModule>,
    import(sourceModuleUrl('resolveBinary.ts')) as Promise<ResolveBinaryModule>,
  ]);

  return {
    closeAllPools: poolModule.closeAllPools,
    getPool: poolModule.getPool,
    resolveBinaryPath: resolveBinaryModule.resolveBinaryPath,
  };
}
