declare module '@babel/core' {
  interface TransformOptions {
    babelrc?: boolean;
    configFile?: boolean;
    filename?: string;
    plugins?: unknown[];
    sourceMaps?: boolean;
    sourceType?: string;
  }

  interface BabelCore {
    transformSync(code: string, options?: TransformOptions): unknown;
  }

  const babel: BabelCore;
  export default babel;
}
