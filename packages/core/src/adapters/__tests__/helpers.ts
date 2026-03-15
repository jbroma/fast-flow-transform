type RawSourceMap = import('source-map').RawSourceMap;

export type RollupLikePlugin = {
  name: string;
  transform(
    code: string,
    id: string
  ):
    | Promise<{ code: string; map?: RawSourceMap } | null>
    | { code: string; map?: RawSourceMap }
    | null;
};

export type EsbuildPlugin = {
  name: string;
  setup(build: {
    onLoad(
      args: { filter: RegExp },
      callback: (args: { path: string }) => unknown
    ): void;
  }): void;
};

export type VitePlugin = {
  config?(config: {
    optimizeDeps?: {
      esbuildOptions?: {
        plugins?: unknown[];
      };
    };
  }): unknown;
  enforce?: string;
  name: string;
  transform?: RollupLikePlugin['transform'];
};

export function exampleMap(file: string): RawSourceMap {
  return {
    file,
    mappings: 'AAAA',
    names: [],
    sources: [file],
    version: 3,
  };
}
