'use strict';

const {SourceMapConsumer, SourceMapGenerator} = require('source-map');

function sourceContentFor(consumer, source) {
  try {
    return consumer.sourceContentFor(source, true);
  } catch (_error) {
    return null;
  }
}

function mergeSourceMaps(inputMap, outputMap, generatedFile) {
  if (inputMap == null) {
    return outputMap;
  }

  const outputConsumer = new SourceMapConsumer(outputMap);
  const inputConsumer = new SourceMapConsumer(inputMap);
  const merged = new SourceMapGenerator({
    file: outputMap.file || generatedFile,
  });

  outputConsumer.eachMapping(mapping => {
    if (mapping.originalLine == null || mapping.originalColumn == null) {
      return;
    }

    const upstream = inputConsumer.originalPositionFor({
      line: mapping.originalLine,
      column: mapping.originalColumn,
    });

    const source = upstream.source || mapping.source;
    const originalLine = upstream.line || mapping.originalLine;
    const originalColumn =
      upstream.column != null ? upstream.column : mapping.originalColumn;

    if (source == null || originalLine == null || originalColumn == null) {
      return;
    }

    merged.addMapping({
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      },
      original: {
        line: originalLine,
        column: originalColumn,
      },
      source,
      name: upstream.name || mapping.name || undefined,
    });
  });

  for (const source of outputConsumer.sources) {
    const content = sourceContentFor(outputConsumer, source);
    if (content != null) {
      merged.setSourceContent(source, content);
    }
  }

  for (const source of inputConsumer.sources) {
    const content = sourceContentFor(inputConsumer, source);
    if (content != null) {
      merged.setSourceContent(source, content);
    }
  }

  if (typeof outputConsumer.destroy === 'function') {
    outputConsumer.destroy();
  }
  if (typeof inputConsumer.destroy === 'function') {
    inputConsumer.destroy();
  }

  return merged.toJSON();
}

module.exports = {
  mergeSourceMaps,
};
