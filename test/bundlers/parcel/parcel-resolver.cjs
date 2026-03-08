const { existsSync } = require('node:fs');
const { dirname, extname, resolve } = require('node:path');

const { Resolver } = require('@parcel/plugin');

const REACT_NATIVE_EXTENSIONS = ['.ios.js', '.android.js', '.native.js', '.js'];

function resolvedReactNativeFile(specifier, parent) {
  if (!specifier.startsWith('.') || extname(specifier) !== '') {
    return null;
  }

  const basePath = resolve(dirname(parent), specifier);

  for (const extension of REACT_NATIVE_EXTENSIONS) {
    const candidate = `${basePath}${extension}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

module.exports = new Resolver({
  resolve({ dependency }) {
    const filePath = resolvedReactNativeFile(
      dependency.specifier,
      dependency.resolveFrom
    );

    return filePath ? { filePath } : null;
  },
});
