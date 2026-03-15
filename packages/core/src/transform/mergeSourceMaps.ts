import { SourceMapConsumer, SourceMapGenerator } from 'source-map';
import type { BasicSourceMapConsumer, RawSourceMap } from 'source-map';

type JsonSourceMapGenerator = SourceMapGenerator & {
  toJSON(): RawSourceMap;
};

function sourceContentFor(
  consumer: BasicSourceMapConsumer,
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
  inputConsumer: BasicSourceMapConsumer,
  outputConsumer: BasicSourceMapConsumer
): void {
  outputConsumer.eachMapping(
    (
      mapping: Parameters<BasicSourceMapConsumer['eachMapping']>[0] extends (
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
  consumer: BasicSourceMapConsumer,
  merged: SourceMapGenerator
): void {
  for (const source of consumer.sources) {
    const content = sourceContentFor(consumer, source);
    if (content !== null) {
      merged.setSourceContent(source, content);
    }
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
  inputConsumer: BasicSourceMapConsumer,
  outputConsumer: BasicSourceMapConsumer,
  outputMap: RawSourceMap,
  generatedFile: string
): RawSourceMap {
  const merged = createMergedGenerator(outputMap, generatedFile);

  addMergedMappings(merged, inputConsumer, outputConsumer);
  copySourceContent(outputConsumer, merged);
  copySourceContent(inputConsumer, merged);
  return (merged as JsonSourceMapGenerator).toJSON();
}

async function withBasicConsumer<T>(
  map: RawSourceMap,
  callback: (consumer: BasicSourceMapConsumer) => Promise<T> | T
): Promise<T> {
  return await SourceMapConsumer.with(map, null, (consumer) =>
    callback(consumer as BasicSourceMapConsumer)
  );
}

export async function mergeSourceMaps(
  inputMap: RawSourceMap | null | undefined,
  outputMap: RawSourceMap,
  generatedFile: string
): Promise<RawSourceMap> {
  if (!inputMap) {
    return outputMap;
  }

  return await withBasicConsumer(inputMap, (inputConsumer) =>
    withBasicConsumer(outputMap, (outputConsumer) =>
      mergedSourceMap(inputConsumer, outputConsumer, outputMap, generatedFile)
    )
  );
}
