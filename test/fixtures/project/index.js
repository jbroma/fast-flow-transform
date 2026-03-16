// @flow

import * as reactNative from 'react-native';

enum Status {
  Draft,
  Published,
}

enum Label of string {
  Short = 'short',
  Long = 'long',
}

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

export const enumSummary = {
  castDraft: Status.cast('Draft'),
  draft: Status.Draft,
  labelMembers: Array.from(Label.members()),
  labelShort: Label.Short,
  publishedName: Status.getName(Status.Published),
  statusMembers: Array.from(Status.members()),
};
