import { SourceMapConsumer, SourceMapGenerator } from 'source-map';
import type { RawSourceMap } from 'source-map';

type JsonSourceMapGenerator = SourceMapGenerator & {
  toJSON(): RawSourceMap;
};

function sourceContentFor(
  consumer: SourceMapConsumer,
  source: string
): string | null {
  try {
    return consumer.sourceContentFor(source, true);
  } catch {
    return null;
  }
}

function addMergedMappings(
  merged: SourceMapGenerator,
  inputConsumer: SourceMapConsumer,
  outputConsumer: SourceMapConsumer
): void {
  outputConsumer.eachMapping(
    (
      mapping: Parameters<SourceMapConsumer['eachMapping']>[0] extends (
        item: infer T,
        ...rest: never[]
      ) => void
        ? T
        : never
    ) => {
      if (mapping.originalLine === null || mapping.originalColumn === null) {
        return;
      }

      const upstream = inputConsumer.originalPositionFor({
        column: mapping.originalColumn,
        line: mapping.originalLine,
      });
      const source = upstream.source ?? mapping.source;
      const line = upstream.line ?? mapping.originalLine;
      const column = upstream.column ?? mapping.originalColumn;

      if (!source || line === null || column === null) {
        return;
      }

      merged.addMapping({
        generated: {
          column: mapping.generatedColumn,
          line: mapping.generatedLine,
        },
        name: upstream.name ?? mapping.name ?? undefined,
        original: { column, line },
        source,
      });
    }
  );
}

function copySourceContent(
  consumer: SourceMapConsumer,
  merged: SourceMapGenerator
): void {
  const { sources } = consumer as SourceMapConsumer & { sources: string[] };

  for (const source of sources) {
    const content = sourceContentFor(consumer, source);
    if (content !== null) {
      merged.setSourceContent(source, content);
    }
  }
}

function destroyConsumer(consumer: SourceMapConsumer): void {
  const { destroy } = consumer as SourceMapConsumer & { destroy?: () => void };
  if (typeof destroy === 'function') {
    destroy.call(consumer);
  }
}

function createMergedGenerator(
  outputMap: RawSourceMap,
  generatedFile: string
): SourceMapGenerator {
  return new SourceMapGenerator({
    file: outputMap.file || generatedFile,
  });
}

function mergedSourceMap(
  inputConsumer: SourceMapConsumer,
  outputConsumer: SourceMapConsumer,
  outputMap: RawSourceMap,
  generatedFile: string
): RawSourceMap {
  const merged = createMergedGenerator(outputMap, generatedFile);

  addMergedMappings(merged, inputConsumer, outputConsumer);
  copySourceContent(outputConsumer, merged);
  copySourceContent(inputConsumer, merged);
  destroyConsumer(outputConsumer);
  destroyConsumer(inputConsumer);
  return (merged as JsonSourceMapGenerator).toJSON();
}

export function mergeSourceMaps(
  inputMap: RawSourceMap | null | undefined,
  outputMap: RawSourceMap,
  generatedFile: string
): RawSourceMap {
  if (!inputMap) {
    return outputMap;
  }

  return mergedSourceMap(
    new SourceMapConsumer(inputMap),
    new SourceMapConsumer(outputMap),
    outputMap,
    generatedFile
  );
}
