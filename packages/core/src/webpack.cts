type LoaderArgs = [string | Buffer, unknown?, unknown?];

type LoaderCallback = (
  error: Error | null,
  code?: string,
  map?: unknown,
  meta?: unknown
) => void;

interface LoaderContext {
  async(): LoaderCallback;
}

const loaderPromise = import('./webpack.js');

function fastFlowTransformWebpackLoader(
  this: LoaderContext,
  ...args: LoaderArgs
) {
  const callback = this.async();

  loaderPromise
    .then((entry) => {
      const loader = (entry.default ?? entry) as (
        this: LoaderContext,
        ...args: LoaderArgs
      ) => void;
      const context = Object.assign(
        Object.create(Object.getPrototypeOf(this)),
        this,
        { async: () => callback }
      );

      loader.call(context, ...args);
    })
    .catch((error) => {
      callback(error);
    });
}

export = fastFlowTransformWebpackLoader;
