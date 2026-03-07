declare module '@babel/core' {
  type TransformOptions = {
    babelrc?: boolean;
    configFile?: boolean;
    filename?: string;
    plugins?: unknown[];
    sourceMaps?: boolean;
    sourceType?: string;
  };

  type BabelCore = {
    transformSync(code: string, options?: TransformOptions): unknown;
  };

  const babel: BabelCore;
  export default babel;
}
