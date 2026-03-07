import { closeAllPools } from './pool.js';

interface HookRegistrar {
  tap?: (name: string, handler: () => void) => void;
  tapAsync?: (
    name: string,
    handler: (callback: (error?: Error) => void) => void
  ) => void;
  tapPromise?: (name: string, handler: () => Promise<void>) => void;
}

interface LoaderCompiler {
  hooks?: {
    afterDone?: HookRegistrar;
    done?: HookRegistrar;
    shutdown?: HookRegistrar;
    watchClose?: HookRegistrar;
  };
  options?: {
    watch?: boolean;
  };
}

export interface PoolCleanupLoaderContext {
  _compiler?: LoaderCompiler;
}

const CLEANUP_REGISTERED = new WeakSet<object>();
const POOL_CLEANUP_PLUGIN = 'FastFlowTransformPoolCleanup';

function tapHook(
  hook: HookRegistrar | undefined,
  handler: () => void
): boolean {
  if (typeof hook?.tap === 'function') {
    hook.tap(POOL_CLEANUP_PLUGIN, handler);
    return true;
  }

  if (typeof hook?.tapAsync === 'function') {
    hook.tapAsync(POOL_CLEANUP_PLUGIN, (callback) => {
      handler();
      callback();
    });
    return true;
  }

  if (typeof hook?.tapPromise === 'function') {
    hook.tapPromise(POOL_CLEANUP_PLUGIN, () => Promise.resolve().then(handler));
    return true;
  }

  return false;
}

function registerOneShotCleanup(compiler: LoaderCompiler): boolean {
  if (compiler.options?.watch) {
    return false;
  }

  return tapHook(
    compiler.hooks?.afterDone ?? compiler.hooks?.done,
    closeAllPools
  );
}

function registerCompilerHooks(compiler: LoaderCompiler): boolean {
  const hookedShutdown = tapHook(compiler.hooks?.shutdown, closeAllPools);
  const hookedWatchClose = tapHook(compiler.hooks?.watchClose, closeAllPools);
  const hookedAfterDone = registerOneShotCleanup(compiler);

  return hookedShutdown || hookedWatchClose || hookedAfterDone;
}

export function registerPoolCleanup(context: PoolCleanupLoaderContext): void {
  const compiler = context._compiler;
  if (!compiler || CLEANUP_REGISTERED.has(compiler)) {
    return;
  }

  if (!registerCompilerHooks(compiler)) {
    return;
  }

  CLEANUP_REGISTERED.add(compiler);
}
