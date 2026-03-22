use std::convert::TryFrom;

use fft::ast;
use fft::ast::Visitor;
use fft::hparser;
use fft::hparser::ParserDialect;
use fft_support::NullTerminatedBuf;

use crate::preserve_output;
use crate::preserve_output::ByteSpan;
use crate::transform::TransformFailure;
use crate::transform::TransformOutput;
use crate::transform::TransformRequest;

#[derive(Debug)]
struct PreserveCollector<'src> {
    edits: Vec<ByteSpan>,
    error: Option<TransformFailure>,
    line_starts: Vec<usize>,
    remove_empty_imports: bool,
    source_len: usize,
    source_start: *const u8,
    source_text: &'src [u8],
}

impl<'src> PreserveCollector<'src> {
    fn new(source_text: &'src [u8], source_start: *const u8, remove_empty_imports: bool) -> Self {
        Self {
            edits: Vec::new(),
            error: None,
            line_starts: line_starts(source_text),
            remove_empty_imports,
            source_len: source_text.len(),
            source_start,
            source_text,
        }
    }

    fn build_output(
        mut self,
        filename: &str,
        sourcemap: bool,
    ) -> Result<TransformOutput, TransformFailure> {
        if let Some(error) = self.error {
            return Err(error);
        }

        let source = std::str::from_utf8(self.source_text).map_err(|error| TransformFailure {
            message: format!("generated output is not UTF-8: {}", error),
            line: None,
            column: None,
        })?;

        preserve_output::build_output(source, &mut self.edits, filename, sourcemap)
    }

    fn loc_to_offset(&self, loc: ast::SourceLoc) -> usize {
        let line_index = usize::try_from(loc.line.saturating_sub(1)).unwrap();
        let line_start = self
            .line_starts
            .get(line_index)
            .copied()
            .unwrap_or(self.source_len);
        line_start + usize::try_from(loc.col.saturating_sub(1)).unwrap()
    }

    fn remove_comment_range(&mut self, comment: &hparser::Comment) {
        let start = unsafe {
            comment
                .source_range
                .start
                .as_ptr()
                .offset_from(self.source_start)
        };
        let end = unsafe {
            comment
                .source_range
                .end
                .as_ptr()
                .offset_from(self.source_start)
        };
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

    fn byte_span_for_node(&self, node: &ast::Node) -> ByteSpan {
        self.byte_span_for_range(*node.range())
    }

    fn byte_span_for_range(&self, range: ast::SourceRange) -> ByteSpan {
        let start = self.loc_to_offset(range.start);
        let end = self.loc_to_offset(range.end).saturating_add(1);
        ByteSpan { start, end }
    }

    fn remove_source_range(&mut self, range: ast::SourceRange) {
        self.push_span(self.byte_span_for_range(range));
    }

    fn remove_identifier_type(&mut self, gc: &ast::GCLock, id: &ast::Identifier) {
        if let Some(type_annotation) = id.type_annotation {
            self.remove_node_range(type_annotation);
        }

        if id.optional {
            let start = self
                .loc_to_offset(id.metadata.range.start)
                .saturating_add(gc.str(id.name).len());
            let end = id
                .type_annotation
                .map(|type_annotation| self.byte_span_for_node(type_annotation).start)
                .unwrap_or_else(|| self.optional_marker_search_end(start));

            self.remove_question_mark_between(start, end);
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

    fn remove_optional_marker_after(&mut self, node: &ast::Node) {
        let start = self.byte_span_for_node(node).end;
        if self.source_text.get(start) == Some(&b'?') {
            self.push_span(ByteSpan {
                start,
                end: start.saturating_add(1),
            });
        }
    }

    fn remove_trailing_syntax(&mut self, expression: &ast::Node, outer: &ast::Node) {
        let start = self.byte_span_for_node(expression).end;
        let end = self.byte_span_for_node(outer).end;
        self.push_span(ByteSpan { start, end });
    }

    fn remove_as_expression_syntax(&mut self, expression: &ast::Node, outer: &ast::Node) {
        let expression_span = self.byte_span_for_node(expression);
        let outer_span = self.byte_span_for_node(outer);
        let search_end = outer_span.end.min(self.source_len);
        let Some(relative_index) = self.source_text[expression_span.end..search_end]
            .windows(2)
            .position(|window| window == b"as")
        else {
            self.remove_trailing_syntax(expression, outer);
            return;
        };

        let mut start = expression_span.end + relative_index;
        while start > expression_span.end && matches!(self.source_text[start - 1], b' ' | b'\t') {
            start -= 1;
        }

        self.push_span(ByteSpan {
            start,
            end: outer_span.end,
        });
    }

    fn optional_marker_search_end(&self, start: usize) -> usize {
        let mut cursor = start;
        while let Some(byte) = self.source_text.get(cursor) {
            if matches!(byte, b',' | b')' | b'=' | b'{' | b'\n' | b';') {
                break;
            }
            cursor += 1;
        }
        cursor
    }

    fn remove_question_mark_between(&mut self, start: usize, end: usize) {
        let Some(relative_index) = self.source_text[start..end.min(self.source_len)]
            .iter()
            .position(|byte| *byte == b'?')
        else {
            return;
        };

        let question = start + relative_index;
        self.push_span(ByteSpan {
            start: question,
            end: question.saturating_add(1),
        });
    }

    fn remove_predicate(&mut self, return_type: Option<&ast::Node>, predicate: Option<&ast::Node>) {
        let Some(predicate) = predicate else {
            return;
        };

        if return_type.is_some() {
            self.remove_node_range(predicate);
            return;
        }

        let predicate_span = self.byte_span_for_node(predicate);
        let mut start = predicate_span.start;
        while start > 0 && matches!(self.source_text[start - 1], b' ' | b'\t') {
            start -= 1;
        }
        if start > 0 && self.source_text[start - 1] == b':' {
            start -= 1;
        }

        self.push_span(ByteSpan {
            start,
            end: predicate_span.end,
        });
    }

    fn remove_this_param<'gc>(
        &mut self,
        gc: &'gc ast::GCLock,
        params: impl Iterator<Item = &'gc ast::Node<'gc>>,
    ) {
        for param in params {
            let ast::Node::Identifier(id) = param else {
                continue;
            };
            if gc.str(id.name) != "this" {
                continue;
            }

            let span = self.byte_span_for_node(param);
            let mut end = span.end;
            while matches!(self.source_text.get(end), Some(byte) if byte.is_ascii_whitespace()) {
                end += 1;
            }
            if self.source_text.get(end) == Some(&b',') {
                end += 1;
                while matches!(self.source_text.get(end), Some(byte) if byte.is_ascii_whitespace())
                {
                    end += 1;
                }
            }
            self.push_span(ByteSpan {
                start: span.start,
                end,
            });
        }
    }

    fn remove_class_implements<'gc>(
        &mut self,
        class_node: &'gc ast::Node<'gc>,
        implements: impl Iterator<Item = &'gc ast::Node<'gc>>,
    ) {
        let mut implements = implements;
        let Some(first) = implements.next() else {
            return;
        };
        let mut last = first;
        for implement in implements {
            last = implement;
        }

        let class_span = self.byte_span_for_node(class_node);
        let first_span = self.byte_span_for_node(first);
        let last_span = self.byte_span_for_node(last);
        let search = &self.source_text[class_span.start..first_span.start];
        let Some(keyword_offset) = search
            .windows("implements".len())
            .rposition(|window| window == b"implements")
        else {
            return;
        };

        let mut start = class_span.start + keyword_offset;
        while start > class_span.start && matches!(self.source_text[start - 1], b' ' | b'\t') {
            start -= 1;
        }

        self.push_span(ByteSpan {
            start,
            end: last_span.end,
        });
    }

    fn named_import_group_span(&self, node: &ast::Node) -> Option<ByteSpan> {
        let span = self.byte_span_for_node(node);
        let source = &self.source_text[span.start..span.end];
        let open = source.iter().position(|byte| *byte == b'{')?;
        let close = source.iter().rposition(|byte| *byte == b'}')?;
        Some(ByteSpan {
            start: span.start + open,
            end: span.start + close + 1,
        })
    }

    fn remove_list_item(&mut self, item: ByteSpan, container: ByteSpan) {
        let mut end = item.end;
        while matches!(self.source_text.get(end), Some(byte) if byte.is_ascii_whitespace()) {
            end += 1;
        }
        if self.source_text.get(end) == Some(&b',') {
            end += 1;
            while matches!(self.source_text.get(end), Some(b' ' | b'\t')) {
                end += 1;
            }
            self.push_span(ByteSpan {
                start: item.start,
                end,
            });
            return;
        }

        let mut start = item.start;
        while start > container.start && matches!(self.source_text[start - 1], b' ' | b'\t') {
            start -= 1;
        }
        if start > container.start && self.source_text[start - 1] == b',' {
            start -= 1;
            while start > container.start && matches!(self.source_text[start - 1], b' ' | b'\t') {
                start -= 1;
            }
        }

        self.push_span(ByteSpan {
            start,
            end: item.end,
        });
    }

    fn remove_named_import_group(&mut self, group: ByteSpan) {
        let mut start = group.start;
        while start > 0 && matches!(self.source_text[start - 1], b' ' | b'\t') {
            start -= 1;
        }
        if start > 0 && self.source_text[start - 1] == b',' {
            start -= 1;
            while start > 0 && matches!(self.source_text[start - 1], b' ' | b'\t') {
                start -= 1;
            }
        }
        self.push_span(ByteSpan {
            start,
            end: group.end,
        });
    }

    fn remove_import_clause_for_side_effect<'gc>(
        &mut self,
        node: &'gc ast::Node<'gc>,
        source: &'gc ast::Node<'gc>,
    ) {
        let import_span = self.byte_span_for_node(node);
        let source_span = self.byte_span_for_node(source);
        let search = &self.source_text[import_span.start..source_span.start];
        let Some(keyword_offset) = search
            .windows("import".len())
            .position(|window| window == b"import")
        else {
            return;
        };

        let start = import_span.start + keyword_offset + "import".len();
        let mut end = start;
        while end < source_span.start
            && matches!(self.source_text.get(end), Some(byte) if byte.is_ascii_whitespace())
        {
            end += 1;
        }

        self.push_span(ByteSpan {
            start: end,
            end: source_span.start,
        });
    }

    fn remove_mixed_imports<'gc>(
        &mut self,
        node: &'gc ast::Node<'gc>,
        decl: &'gc ast::ImportDeclaration<'gc>,
    ) {
        let mut removed_named = Vec::new();
        let mut surviving_named = 0usize;
        let mut surviving_non_named = false;

        for specifier in decl.specifiers.iter() {
            match specifier {
                ast::Node::ImportSpecifier(ast::ImportSpecifier { import_kind, .. }) => {
                    if *import_kind == ast::ImportKind::Value {
                        surviving_named += 1;
                    } else {
                        removed_named.push(specifier);
                    }
                }
                ast::Node::ImportDefaultSpecifier(_) | ast::Node::ImportNamespaceSpecifier(_) => {
                    surviving_non_named = true;
                }
                _ => {}
            }
        }

        if surviving_named == 0 && !surviving_non_named {
            if self.remove_empty_imports {
                self.remove_node_range(node);
            } else {
                self.remove_import_clause_for_side_effect(node, decl.source);
            }
            return;
        }

        let Some(group) = self.named_import_group_span(node) else {
            return;
        };
        for specifier in removed_named {
            self.remove_list_item(self.byte_span_for_node(specifier), group);
        }

        if surviving_named == 0 {
            self.remove_named_import_group(group);
        }
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
                    self.remove_mixed_imports(node, decl);
                }
            }
            ast::Node::ExportNamedDeclaration(decl)
                if decl.export_kind != ast::ExportKind::Value =>
            {
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
                self.remove_predicate(n.return_type, n.predicate);
                self.remove_this_param(gc, n.params.iter());
            }
            ast::Node::FunctionExpression(n) => {
                self.remove_optional_node(n.type_parameters);
                self.remove_optional_node(n.return_type);
                self.remove_predicate(n.return_type, n.predicate);
                self.remove_this_param(gc, n.params.iter());
            }
            ast::Node::ArrowFunctionExpression(n) => {
                self.remove_optional_node(n.type_parameters);
                self.remove_optional_node(n.return_type);
                self.remove_predicate(n.return_type, n.predicate);
            }
            ast::Node::ObjectPattern(n) => self.remove_optional_node(n.type_annotation),
            ast::Node::ArrayPattern(n) => self.remove_optional_node(n.type_annotation),
            ast::Node::CallExpression(n) => self.remove_optional_node(n.type_arguments),
            ast::Node::NewExpression(n) => self.remove_optional_node(n.type_arguments),
            ast::Node::OptionalCallExpression(n) => self.remove_optional_node(n.type_arguments),
            ast::Node::ClassDeclaration(n) => {
                self.remove_optional_node(n.type_parameters);
                self.remove_optional_node(n.super_type_arguments);
                self.remove_class_implements(node, n.implements.iter());
            }
            ast::Node::ClassExpression(n) => {
                self.remove_optional_node(n.type_parameters);
                self.remove_optional_node(n.super_type_arguments);
                self.remove_class_implements(node, n.implements.iter());
            }
            ast::Node::TypeCastExpression(n) => self.remove_node_range(n.type_annotation),
            ast::Node::AsExpression(n) => self.remove_as_expression_syntax(n.expression, node),
            ast::Node::AsConstExpression(n) => self.remove_as_expression_syntax(n.expression, node),
            ast::Node::TSTypeAssertion { .. }
            | ast::Node::TSAsExpression { .. }
            | ast::Node::ComponentDeclaration { .. }
            | ast::Node::HookDeclaration { .. }
            | ast::Node::EnumDeclaration { .. }
            | ast::Node::MatchStatement { .. }
            | ast::Node::MatchExpression { .. } => {
                self.unsupported(
                    node,
                    "format=preserve does not yet support this Flow transform",
                );
                return;
            }
            ast::Node::ClassProperty(n) => {
                if n.declare || n.value.is_none() {
                    self.remove_node_range(node);
                    return;
                }
                self.remove_optional_node(n.variance);
                self.remove_optional_node(n.type_annotation);
                if n.optional {
                    self.remove_optional_marker_after(n.key);
                }
            }
            ast::Node::ClassPrivateProperty(n) => {
                if n.declare {
                    self.remove_node_range(node);
                    return;
                }
                self.remove_optional_node(n.variance);
                self.remove_optional_node(n.type_annotation);
                if n.optional {
                    self.remove_optional_marker_after(n.key);
                }
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

    let mut collector = PreserveCollector::new(
        request.code.as_bytes(),
        input.as_bytes().as_ptr(),
        request.remove_empty_imports,
    );
    if !request.comments {
        for comment in parsed.comments() {
            collector.remove_comment_range(comment);
        }
    }

    {
        let gc = ast::GCLock::new(&mut ctx);
        collector.call(&gc, program.node(&gc), None);
    }

    collector.build_output(request.filename.as_str(), request.sourcemap)
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
