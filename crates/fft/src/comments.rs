use std::collections::HashMap;

use fft_support::source_manager::SourceRange;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct CommentAnchorKey {
    end_col: u32,
    end_line: u32,
    file: u32,
    start_col: u32,
    start_line: u32,
}

impl From<SourceRange> for CommentAnchorKey {
    fn from(range: SourceRange) -> Self {
        Self {
            end_col: range.end.col,
            end_line: range.end.line,
            file: range.file.0,
            start_col: range.start.col,
            start_line: range.start.line,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CommentKind {
    Block,
    Hashbang,
    Line,
}

impl CommentKind {
    pub fn is_line_like(self) -> bool {
        matches!(self, Self::Hashbang | Self::Line)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CommentPlacement {
    Dangling,
    Leading,
    Trailing,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrintedComment {
    pub kind: CommentKind,
    pub text: String,
}

#[derive(Debug, Default)]
pub struct CommentTable {
    dangling: HashMap<CommentAnchorKey, Vec<PrintedComment>>,
    leading: HashMap<CommentAnchorKey, Vec<PrintedComment>>,
    trailing: HashMap<CommentAnchorKey, Vec<PrintedComment>>,
}

impl CommentTable {
    pub fn push(
        &mut self,
        range: SourceRange,
        placement: CommentPlacement,
        comment: PrintedComment,
    ) {
        let bucket = match placement {
            CommentPlacement::Dangling => &mut self.dangling,
            CommentPlacement::Leading => &mut self.leading,
            CommentPlacement::Trailing => &mut self.trailing,
        };

        bucket
            .entry(CommentAnchorKey::from(range))
            .or_default()
            .push(comment);
    }

    pub fn take_dangling(&mut self, range: SourceRange) -> Vec<PrintedComment> {
        self.dangling
            .remove(&CommentAnchorKey::from(range))
            .unwrap_or_default()
    }

    pub fn take_leading(&mut self, range: SourceRange) -> Vec<PrintedComment> {
        self.leading
            .remove(&CommentAnchorKey::from(range))
            .unwrap_or_default()
    }

    pub fn take_trailing(&mut self, range: SourceRange) -> Vec<PrintedComment> {
        self.trailing
            .remove(&CommentAnchorKey::from(range))
            .unwrap_or_default()
    }
}
