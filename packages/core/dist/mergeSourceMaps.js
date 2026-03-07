import { SourceMapConsumer, SourceMapGenerator } from 'source-map';
function sourceContentFor(consumer, source) {
    try {
        return consumer.sourceContentFor(source, true);
    }
    catch {
        return null;
    }
}
function addMergedMappings(merged, inputConsumer, outputConsumer) {
    outputConsumer.eachMapping((mapping) => {
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
    });
}
function copySourceContent(consumer, merged) {
    const { sources } = consumer;
    for (const source of sources) {
        const content = sourceContentFor(consumer, source);
        if (content !== null) {
            merged.setSourceContent(source, content);
        }
    }
}
function destroyConsumer(consumer) {
    const { destroy } = consumer;
    if (typeof destroy === 'function') {
        destroy.call(consumer);
    }
}
function createMergedGenerator(outputMap, generatedFile) {
    return new SourceMapGenerator({
        file: outputMap.file || generatedFile,
    });
}
function mergedSourceMap(inputConsumer, outputConsumer, outputMap, generatedFile) {
    const merged = createMergedGenerator(outputMap, generatedFile);
    addMergedMappings(merged, inputConsumer, outputConsumer);
    copySourceContent(outputConsumer, merged);
    copySourceContent(inputConsumer, merged);
    destroyConsumer(outputConsumer);
    destroyConsumer(inputConsumer);
    return merged.toJSON();
}
export function mergeSourceMaps(inputMap, outputMap, generatedFile) {
    if (!inputMap) {
        return outputMap;
    }
    return mergedSourceMap(new SourceMapConsumer(inputMap), new SourceMapConsumer(outputMap), outputMap, generatedFile);
}
//# sourceMappingURL=mergeSourceMaps.js.map