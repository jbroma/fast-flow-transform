use fft::comments::CommentKind as PrintedCommentKind;
use fft::hparser;

pub fn comment_offsets(source: &[u8], comment: &hparser::Comment) -> Option<(usize, usize)> {
    let start = unsafe {
        comment
            .source_range
            .start
            .as_ptr()
            .offset_from(source.as_ptr())
    };
    let end = unsafe {
        comment
            .source_range
            .end
            .as_ptr()
            .offset_from(source.as_ptr())
    };
    if start < 0 || end < 0 {
        return None;
    }
    Some((start as usize, end as usize))
}

pub fn raw_comment_text(source: &[u8], comment: &hparser::Comment) -> Option<String> {
    let (start, end) = comment_offsets(source, comment)?;
    String::from_utf8(source[start..end].to_vec()).ok()
}

pub fn printed_kind(kind: &hparser::CommentKind) -> PrintedCommentKind {
    match kind {
        hparser::CommentKind::Block => PrintedCommentKind::Block,
        hparser::CommentKind::Hashbang => PrintedCommentKind::Hashbang,
        hparser::CommentKind::Line => PrintedCommentKind::Line,
    }
}

pub fn is_flow_pragma(comment: &hparser::Comment) -> bool {
    comment
        .get_string()
        .to_string()
        .lines()
        .map(|line| line.trim().trim_start_matches('*').trim())
        .any(|line| line.starts_with("@flow") || line.starts_with("@noflow"))
}
