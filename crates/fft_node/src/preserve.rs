use std::cmp::max;
use std::convert::TryFrom;

use fft::ast;
use fft::hparser;
use fft::hparser::ParserDialect;
use fft::ast::Visitor;
use fft_support::NullTerminatedBuf;

use crate::transform::TransformFailure;
use crate::transform::TransformOutput;
use crate::transform::TransformRequest;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ByteSpan {
    end: usize,
    start: usize,
}

#[derive(Debug)]
struct PreserveCollector<'src> {
    edits: Vec<ByteSpan>,
    error: Option<TransformFailure>,
    line_starts: Vec<usize>,
    source_len: usize,
    source_start: *const u8,
    source_text: &'src [u8],
}

impl<'src> PreserveCollector<'src> {
    fn new(source_text: &'src [u8], source_start: *const u8) -> Self {
        Self {
            edits: Vec::new(),
            error: None,
            line_starts: line_starts(source_text),
            source_len: source_text.len(),
            source_start,
            source_text,
        }
    }

    fn build_output(mut self) -> Result<String, TransformFailure> {
        if let Some(error) = self.error {
            return Err(error);
        }

        merge_spans(&mut self.edits);
        let mut cursor = 0;
        let mut output = Vec::with_capacity(self.source_len);

        for span in self.edits {
            output.extend_from_slice(&self.source_text[cursor..span.start]);
            cursor = span.end;
        }

        output.extend_from_slice(&self.source_text[cursor..]);
        String::from_utf8(output).map_err(|error| TransformFailure {
            message: format!("generated output is not UTF-8: {}", error),
            line: None,
            column: None,
        })
    }

    fn loc_to_offset(&self, loc: ast::SourceLoc) -> usize {
        let line_index = usize::try_from(loc.line.saturating_sub(1)).unwrap();
        let line_start = self.line_starts.get(line_index).copied().unwrap_or(self.source_len);
        line_start + usize::try_from(loc.col.saturating_sub(1)).unwrap()
    }

    fn remove_comment_range(&mut self, comment: &hparser::Comment) {
        let start = unsafe { comment.source_range.start.as_ptr().offset_from(self.source_start) };
        let end = unsafe { comment.source_range.end.as_ptr().offset_from(self.source_start) };
        if start < 0 || end < 0 {
            return;
        }
        self.push_span(ByteSpan {
            start: start as usize,
            end: end as usize,
        });
    }

    fn remove_node_range(&mut self, node: &ast::Node) {
        self.remove_source_range(*node.range());
    }

    fn remove_optional_node(&mut self, node: Option<&ast::Node>) {
        if let Some(node) = node {
            self.remove_node_range(node);
        }
    }

    fn remove_source_range(&mut self, range: ast::SourceRange) {
        let start = self.loc_to_offset(range.start);
        let end = self.loc_to_offset(range.end).saturating_add(1);
        self.push_span(ByteSpan { start, end });
    }

    fn remove_identifier_type(&mut self, gc: &ast::GCLock, id: &ast::Identifier) {
        if let Some(type_annotation) = id.type_annotation {
            self.remove_node_range(type_annotation);
        }

        if id.optional {
            let start = self
                .loc_to_offset(id.metadata.range.start)
                .saturating_add(gc.str(id.name).len());
            self.push_span(ByteSpan {
                start,
                end: start.saturating_add(1),
            });
        }
    }

    fn push_span(&mut self, span: ByteSpan) {
        if span.start >= span.end || span.start >= self.source_len {
            return;
        }

        self.edits.push(ByteSpan {
            start: span.start,
            end: span.end.min(self.source_len),
        });
    }

    fn unsupported(&mut self, node: &ast::Node, message: &str) {
        if self.error.is_none() {
            self.error = Some(TransformFailure {
                message: message.to_string(),
                line: Some(node.range().start.line),
                column: Some(node.range().start.col),
            });
        }
    }
}

impl<'gc> ast::Visitor<'gc> for PreserveCollector<'_> {
    fn call(
        &mut self,
        gc: &'gc ast::GCLock,
        node: &'gc ast::Node<'gc>,
        _path: Option<ast::Path<'gc>>,
    ) {
        if self.error.is_some() {
            return;
        }

        match node {
            ast::Node::ImportDeclaration(decl) => {
                if decl.import_kind != ast::ImportKind::Value {
                    self.remove_node_range(node);
                    return;
                }

                if decl.specifiers.iter().any(|specifier| {
                    matches!(
                        specifier,
                        ast::Node::ImportSpecifier(ast::ImportSpecifier {
                            import_kind,
                            ..
                        }) if *import_kind != ast::ImportKind::Value
                    )
                }) {
                    self.unsupported(
                        node,
                        "preserveWhitespace does not yet support mixed value/type imports",
                    );
                    return;
                }
            }
            ast::Node::ExportNamedDeclaration(decl) if decl.export_kind != ast::ExportKind::Value => {
                self.remove_node_range(node);
                return;
            }
            ast::Node::ExportAllDeclaration(decl) if decl.export_kind != ast::ExportKind::Value => {
                self.remove_node_range(node);
                return;
            }
            ast::Node::InterfaceDeclaration { .. }
            | ast::Node::TypeAlias { .. }
            | ast::Node::OpaqueType { .. }
            | ast::Node::DeclareTypeAlias { .. }
            | ast::Node::DeclareOpaqueType { .. }
            | ast::Node::DeclareInterface { .. }
            | ast::Node::DeclareClass { .. }
            | ast::Node::DeclareFunction { .. }
            | ast::Node::DeclareHook { .. }
            | ast::Node::DeclareVariable { .. }
            | ast::Node::DeclareComponent { .. }
            | ast::Node::DeclareEnum { .. }
            | ast::Node::DeclareExportDeclaration { .. }
            | ast::Node::DeclareExportAllDeclaration { .. }
            | ast::Node::DeclareModule { .. }
            | ast::Node::DeclareModuleExports { .. } => {
                self.remove_node_range(node);
                return;
            }
            ast::Node::Identifier(id) => self.remove_identifier_type(gc, id),
            ast::Node::FunctionDeclaration(n) => {
                self.remove_optional_node(n.type_parameters);
                self.remove_optional_node(n.return_type);
                self.remove_optional_node(n.predicate);
                if has_this_param(gc, n.params.iter()) {
                    self.unsupported(
                        node,
                        "preserveWhitespace does not yet support Flow `this` parameters",
                    );
                    return;
                }
            }
            ast::Node::FunctionExpression(n) => {
                self.remove_optional_node(n.type_parameters);
                self.remove_optional_node(n.return_type);
                self.remove_optional_node(n.predicate);
                if has_this_param(gc, n.params.iter()) {
                    self.unsupported(
                        node,
                        "preserveWhitespace does not yet support Flow `this` parameters",
                    );
                    return;
                }
            }
            ast::Node::ArrowFunctionExpression(n) => {
                self.remove_optional_node(n.type_parameters);
                self.remove_optional_node(n.return_type);
                self.remove_optional_node(n.predicate);
            }
            ast::Node::ObjectPattern(n) => self.remove_optional_node(n.type_annotation),
            ast::Node::ArrayPattern(n) => self.remove_optional_node(n.type_annotation),
            ast::Node::CallExpression(n) => self.remove_optional_node(n.type_arguments),
            ast::Node::NewExpression(n) => self.remove_optional_node(n.type_arguments),
            ast::Node::OptionalCallExpression(n) => self.remove_optional_node(n.type_arguments),
            ast::Node::ClassDeclaration(n) => {
                self.remove_optional_node(n.type_parameters);
                self.remove_optional_node(n.super_type_arguments);
                if !n.implements.is_empty() {
                    self.unsupported(
                        node,
                        "preserveWhitespace does not yet support Flow class implements clauses",
                    );
                    return;
                }
            }
            ast::Node::ClassExpression(n) => {
                self.remove_optional_node(n.type_parameters);
                self.remove_optional_node(n.super_type_arguments);
                if !n.implements.is_empty() {
                    self.unsupported(
                        node,
                        "preserveWhitespace does not yet support Flow class implements clauses",
                    );
                    return;
                }
            }
            ast::Node::TypeCastExpression { .. }
            | ast::Node::AsExpression { .. }
            | ast::Node::TSTypeAssertion { .. }
            | ast::Node::TSAsExpression { .. }
            | ast::Node::ComponentDeclaration { .. }
            | ast::Node::HookDeclaration { .. }
            | ast::Node::EnumDeclaration { .. }
            | ast::Node::MatchStatement { .. }
            | ast::Node::MatchExpression { .. } => {
                self.unsupported(
                    node,
                    "preserveWhitespace does not yet support this Flow transform",
                );
                return;
            }
            ast::Node::ClassProperty(n)
                if n.declare
                    || n.optional
                    || n.type_annotation.is_some()
                    || n.variance.is_some() =>
            {
                self.unsupported(
                    node,
                    "preserveWhitespace does not yet support Flow class property annotations",
                );
                return;
            }
            ast::Node::ClassPrivateProperty(n)
                if n.declare
                    || n.optional
                    || n.type_annotation.is_some()
                    || n.variance.is_some() =>
            {
                self.unsupported(
                    node,
                    "preserveWhitespace does not yet support Flow class property annotations",
                );
                return;
            }
            _ => {}
        }

        node.visit_children(gc, self);
    }
}

pub fn transform_preserving_layout(
    request: &TransformRequest,
    dialect: ParserDialect,
) -> Result<TransformOutput, TransformFailure> {
    if request.sourcemap {
        return Err(TransformFailure {
            message: "preserveWhitespace does not support sourcemaps yet".to_string(),
            line: None,
            column: None,
        });
    }

    let mut ctx = ast::Context::new();
    let file_id = ctx.sm_mut().add_source(
        request.filename.clone(),
        NullTerminatedBuf::from_str_copy(request.code.as_str()),
    );
    let input = ctx.sm().source_buffer_rc(file_id);
    let mut flags = hparser::ParserFlags::default();
    flags.enable_jsx = true;
    flags.parse_flow_match = matches!(
        dialect,
        ParserDialect::Flow | ParserDialect::FlowDetect | ParserDialect::FlowUnambiguous
    );
    flags.dialect = dialect;
    flags.store_comments = true;
    let parsed = hparser::ParsedJS::parse(flags, &input);

    if let Some((loc, message)) = parsed.first_error() {
        return Err(TransformFailure {
            message,
            line: Some(loc.line),
            column: Some(loc.col),
        });
    }

    let program = {
        let gc = ast::GCLock::new(&mut ctx);
        parsed
            .to_ast(&gc, file_id)
            .map(|node| ast::NodeRc::from_node(&gc, node))
    }
    .ok_or_else(|| TransformFailure {
        message: "failed to convert parser AST".to_string(),
        line: None,
        column: None,
    })?;

    let mut collector = PreserveCollector::new(request.code.as_bytes(), input.as_bytes().as_ptr());
    if !request.preserve_comments {
        for comment in parsed.comments() {
            collector.remove_comment_range(comment);
        }
    }

    {
        let gc = ast::GCLock::new(&mut ctx);
        collector.call(&gc, program.node(&gc), None);
    }

    Ok(TransformOutput {
        code: collector.build_output()?,
        map_json: None,
    })
}

fn has_this_param<'gc>(
    gc: &ast::GCLock,
    mut params: impl Iterator<Item = &'gc ast::Node<'gc>>,
) -> bool {
    params.any(|param| match param {
        ast::Node::Identifier(id) => gc.str(id.name) == "this",
        _ => false,
    })
}

fn line_starts(source: &[u8]) -> Vec<usize> {
    let mut starts = vec![0];
    for (index, byte) in source.iter().enumerate() {
        if *byte == b'\n' {
            starts.push(index + 1);
        }
    }
    starts
}

fn merge_spans(spans: &mut Vec<ByteSpan>) {
    spans.sort_by_key(|span| (span.start, span.end));
    let mut merged: Vec<ByteSpan> = Vec::with_capacity(spans.len());
    for span in spans.drain(..) {
        match merged.last_mut() {
            Some(previous) if span.start <= previous.end => {
                previous.end = max(previous.end, span.end);
            }
            _ => merged.push(span),
        }
    }
    *spans = merged;
}
