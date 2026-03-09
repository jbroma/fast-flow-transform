use fft::ast;
use fft::ast::Visitor;
use fft::comments::CommentPlacement;
use fft::comments::CommentTable;
use fft::comments::PrintedComment;
use fft::hparser;
use fft_support::source_manager::SourceRange;

use crate::comment_support;

#[derive(Clone, Copy)]
struct ByteRange {
    end_line: u32,
    end_offset: usize,
    start_line: u32,
    start_offset: usize,
}

#[derive(Clone, Copy)]
struct ChildRange {
    anchor: SourceRange,
    bytes: ByteRange,
}

struct StatementContainer {
    anchor: SourceRange,
    bytes: ByteRange,
    children: Vec<ChildRange>,
}

struct RangeCollector<'src> {
    containers: Vec<StatementContainer>,
    line_starts: &'src [usize],
    removed_nodes: Vec<ByteRange>,
    source_len: usize,
}

impl<'src> RangeCollector<'src> {
    fn new(line_starts: &'src [usize], source_len: usize) -> Self {
        Self {
            containers: Vec::new(),
            line_starts,
            removed_nodes: Vec::new(),
            source_len,
        }
    }

    fn add_container<'gc>(
        &mut self,
        node: &'gc ast::Node<'gc>,
        body: ast::NodeList<'gc>,
        spans_entire_file: bool,
    ) {
        let bytes = if spans_entire_file {
            ByteRange {
                end_line: self.line_starts.len() as u32,
                end_offset: self.source_len,
                start_line: 1,
                start_offset: 0,
            }
        } else {
            range_info(self.line_starts, *node.range())
        };
        let children = body
            .iter()
            .map(|child| ChildRange {
                anchor: *child.range(),
                bytes: range_info(self.line_starts, *child.range()),
            })
            .collect();
        self.containers.push(StatementContainer {
            anchor: *node.range(),
            bytes,
            children,
        });
    }

    fn add_removed_node<'gc>(&mut self, node: &'gc ast::Node<'gc>) {
        self.removed_nodes
            .push(range_info(self.line_starts, *node.range()));
    }
}

impl<'gc> ast::Visitor<'gc> for RangeCollector<'_> {
    fn call(
        &mut self,
        gc: &'gc ast::GCLock,
        node: &'gc ast::Node<'gc>,
        _path: Option<ast::Path<'gc>>,
    ) {
        match node {
            ast::Node::Program(ast::Program { body, .. })
            | ast::Node::Module(ast::Module { body, .. }) => self.add_container(node, *body, true),
            ast::Node::BlockStatement(ast::BlockStatement { body, .. })
            | ast::Node::StaticBlock(ast::StaticBlock { body, .. }) => {
                self.add_container(node, *body, false);
            }
            ast::Node::SwitchCase(ast::SwitchCase { consequent, .. }) => {
                self.add_container(node, *consequent, false);
            }
            ast::Node::ImportDeclaration(decl) if decl.import_kind != ast::ImportKind::Value => {
                self.add_removed_node(node);
            }
            ast::Node::ExportNamedDeclaration(decl)
                if decl.export_kind != ast::ExportKind::Value =>
            {
                self.add_removed_node(node);
            }
            ast::Node::ExportAllDeclaration(decl) if decl.export_kind != ast::ExportKind::Value => {
                self.add_removed_node(node);
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
            | ast::Node::DeclareModuleExports { .. } => self.add_removed_node(node),
            _ => {}
        }

        node.visit_children(gc, self);
    }
}

pub fn build_comment_table<'gc>(
    gc: &'gc ast::GCLock,
    original: &'gc ast::Node<'gc>,
    transformed: &'gc ast::Node<'gc>,
    comments: &[hparser::Comment],
    source: &[u8],
) -> CommentTable {
    let line_starts = line_starts(source);
    let mut original_ranges = RangeCollector::new(&line_starts, source.len());
    original_ranges.call(gc, original, None);

    let mut transformed_ranges = RangeCollector::new(&line_starts, source.len());
    transformed_ranges.call(gc, transformed, None);

    let mut table = CommentTable::default();
    for comment in comments {
        if comment_support::is_flow_pragma(comment) {
            continue;
        }

        let Some(comment_bytes) = comment_range(source, &line_starts, comment) else {
            continue;
        };
        let Some(container) = best_container(&transformed_ranges.containers, comment_bytes) else {
            continue;
        };
        let Some((anchor, placement, direct_child)) = classify_comment(comment_bytes, container)
        else {
            continue;
        };

        if !direct_child
            && original_ranges
                .removed_nodes
                .iter()
                .any(|range| contains_range(*range, comment_bytes))
        {
            continue;
        }

        let Some(text) = comment_support::raw_comment_text(source, comment) else {
            continue;
        };

        table.push(
            anchor,
            placement,
            PrintedComment {
                kind: comment_support::printed_kind(&comment.kind),
                text,
            },
        );
    }

    table
}

fn best_container<'a>(
    containers: &'a [StatementContainer],
    comment: ByteRange,
) -> Option<&'a StatementContainer> {
    containers
        .iter()
        .filter(|container| contains_range(container.bytes, comment))
        .min_by_key(|container| container.bytes.end_offset - container.bytes.start_offset)
}

fn classify_comment(
    comment: ByteRange,
    container: &StatementContainer,
) -> Option<(SourceRange, CommentPlacement, bool)> {
    if container.children.is_empty() {
        return Some((container.anchor, CommentPlacement::Dangling, false));
    }

    if comment.end_offset < container.children[0].bytes.start_offset {
        return Some((
            container.children[0].anchor,
            CommentPlacement::Leading,
            false,
        ));
    }

    for (index, child) in container.children.iter().enumerate() {
        if contains_range(child.bytes, comment) {
            return Some((child.anchor, CommentPlacement::Trailing, true));
        }

        if let Some(next_child) = container.children.get(index + 1) {
            if comment.start_offset > child.bytes.end_offset
                && comment.end_offset < next_child.bytes.start_offset
            {
                return if comment.start_line == child.bytes.end_line {
                    Some((child.anchor, CommentPlacement::Trailing, false))
                } else {
                    Some((next_child.anchor, CommentPlacement::Leading, false))
                };
            }
        }
    }

    let last = container.children.last()?;
    if comment.start_line == last.bytes.end_line {
        Some((last.anchor, CommentPlacement::Trailing, false))
    } else {
        Some((container.anchor, CommentPlacement::Dangling, false))
    }
}

fn contains_range(container: ByteRange, inner: ByteRange) -> bool {
    inner.start_offset >= container.start_offset && inner.end_offset <= container.end_offset
}

fn range_info(line_starts: &[usize], range: SourceRange) -> ByteRange {
    let start_offset = offset_from_loc(line_starts, range.start);
    let end_offset = offset_from_loc(line_starts, range.end).saturating_add(1);
    ByteRange {
        end_line: line_number(line_starts, end_offset),
        end_offset,
        start_line: line_number(line_starts, start_offset),
        start_offset,
    }
}

fn offset_from_loc(line_starts: &[usize], loc: ast::SourceLoc) -> usize {
    line_starts
        .get(loc.line.saturating_sub(1) as usize)
        .copied()
        .unwrap_or_default()
        + loc.col.saturating_sub(1) as usize
}

fn line_number(line_starts: &[usize], offset: usize) -> u32 {
    line_starts
        .binary_search(&offset)
        .map_or_else(|index| index as u32, |index| index as u32 + 1)
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

fn comment_range(
    source: &[u8],
    line_starts: &[usize],
    comment: &hparser::Comment,
) -> Option<ByteRange> {
    let (start, end) = comment_support::comment_offsets(source, comment)?;
    Some(ByteRange {
        end_line: line_number(line_starts, end),
        end_offset: end,
        start_line: line_number(line_starts, start),
        start_offset: start,
    })
}
