use sourcemap::SourceMapBuilder;

use crate::transform::TransformFailure;
use crate::transform::TransformOutput;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ByteSpan {
    pub(crate) end: usize,
    pub(crate) start: usize,
}

#[derive(Clone, Copy, Default)]
struct Position {
    col: u32,
    line: u32,
}

pub(crate) fn build_output(
    source: &str,
    spans: &mut Vec<ByteSpan>,
    filename: &str,
    sourcemap: bool,
) -> Result<TransformOutput, TransformFailure> {
    merge_spans(spans);

    let mut cursor = 0;
    let mut output = String::with_capacity(source.len());
    let mut builder = sourcemap.then(|| SourceMapBuilder::new(None));
    let src_id = builder.as_mut().map(|map| map.add_source(filename));
    let mut src = Position::default();
    let mut dst = Position::default();

    for span in spans.iter() {
        append_chunk(
            slice(source, cursor, span.start)?,
            &mut output,
            &mut builder,
            src_id,
            &mut src,
            &mut dst,
        );
        advance_chunk(&mut src, slice(source, span.start, span.end)?);
        cursor = span.end;
    }

    append_chunk(
        slice(source, cursor, source.len())?,
        &mut output,
        &mut builder,
        src_id,
        &mut src,
        &mut dst,
    );

    Ok(TransformOutput {
        code: output,
        map_json: map_json(builder)?,
    })
}

fn append_chunk(
    chunk: &str,
    output: &mut String,
    builder: &mut Option<SourceMapBuilder>,
    src_id: Option<u32>,
    src: &mut Position,
    dst: &mut Position,
) {
    for ch in chunk.chars() {
        if let (Some(builder), Some(src_id)) = (builder.as_mut(), src_id) {
            builder.add_raw(dst.line, dst.col, src.line, src.col, Some(src_id), None);
        }
        output.push(ch);
        advance_char(src, ch);
        advance_char(dst, ch);
    }
}

fn advance_chunk(position: &mut Position, chunk: &str) {
    for ch in chunk.chars() {
        advance_char(position, ch);
    }
}

fn advance_char(position: &mut Position, ch: char) {
    if ch == '\n' {
        position.line += 1;
        position.col = 0;
    } else {
        position.col += 1;
    }
}

fn slice<'a>(source: &'a str, start: usize, end: usize) -> Result<&'a str, TransformFailure> {
    source.get(start..end).ok_or_else(|| TransformFailure {
        message: "format=preserve produced a non-character-aligned edit".to_string(),
        line: None,
        column: None,
    })
}

fn map_json(builder: Option<SourceMapBuilder>) -> Result<Option<String>, TransformFailure> {
    let Some(builder) = builder else {
        return Ok(None);
    };

    let mut map_bytes = Vec::new();
    builder
        .into_sourcemap()
        .to_writer(&mut map_bytes)
        .map_err(|error| TransformFailure {
            message: format!("generated source map is not UTF-8: {}", error),
            line: None,
            column: None,
        })?;

    Ok(Some(String::from_utf8(map_bytes).map_err(|error| {
        TransformFailure {
            message: format!("generated source map is not UTF-8: {}", error),
            line: None,
            column: None,
        }
    })?))
}

fn merge_spans(spans: &mut Vec<ByteSpan>) {
    spans.sort_by_key(|span| (span.start, span.end));
    let mut merged: Vec<ByteSpan> = Vec::with_capacity(spans.len());
    for span in spans.drain(..) {
        match merged.last_mut() {
            Some(previous) if span.start <= previous.end => {
                previous.end = previous.end.max(span.end);
            }
            _ => merged.push(span),
        }
    }
    *spans = merged;
}
