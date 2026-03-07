'use strict';

const { SourceMapConsumer, SourceMapGenerator } = require('source-map');

function sourceContentFor(consumer, source) {
  try {
    return consumer.sourceContentFor(source, true);
  } catch {
    return null;
  }
}

function addMergedMappings(merged, inputConsumer, outputConsumer) {
  outputConsumer.eachMapping((mapping) => {
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
}

function copySourceContent(fromConsumer, merged) {
  for (const source of fromConsumer.sources) {
    const content = sourceContentFor(fromConsumer, source);
    if (content != null) {
      merged.setSourceContent(source, content);
    }
  }
}

function destroyConsumer(consumer) {
  if (typeof consumer.destroy === 'function') {
    consumer.destroy();
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

  addMergedMappings(merged, inputConsumer, outputConsumer);
  copySourceContent(outputConsumer, merged);
  copySourceContent(inputConsumer, merged);
  destroyConsumer(outputConsumer);
  destroyConsumer(inputConsumer);
  return merged.toJSON();
}

module.exports = {
  mergeSourceMaps,
};
