import * as reactNative from 'react-native';

const packageBarrels = {
  'react-native': reactNative,
};

function summarizeNamespace(moduleNamespace) {
  return {
    keyCount: Object.keys(moduleNamespace).length,
  };
}

export const packageSummaries = Object.fromEntries(
  Object.entries(packageBarrels).map(([packageName, moduleNamespace]) => [
    packageName,
    summarizeNamespace(moduleNamespace),
  ])
);
