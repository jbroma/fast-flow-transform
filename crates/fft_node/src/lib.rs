use napi_derive::napi;

mod comment_support;
mod preserve;
mod preserve_output;
mod printer_comments;
mod transform;

use crate::transform::TransformRequest;

#[napi(object)]
pub struct BindingTransformRequest {
    pub filename: String,
    pub code: String,
    pub dialect: String,
    pub format: String,
    pub comments: bool,
    pub remove_empty_imports: bool,
    pub react_runtime_target: String,
    pub sourcemap: bool,
}

#[napi(object)]
pub struct BindingTransformResponse {
    pub ok: bool,
    pub code: Option<String>,
    pub map_json: Option<String>,
    pub error_message: Option<String>,
    pub error_line: Option<u32>,
    pub error_column: Option<u32>,
}

fn transform_request(input: BindingTransformRequest) -> TransformRequest {
    TransformRequest {
        filename: input.filename,
        code: input.code,
        dialect: input.dialect,
        format: input.format,
        comments: input.comments,
        remove_empty_imports: input.remove_empty_imports,
        react_runtime_target: input.react_runtime_target,
        sourcemap: input.sourcemap,
    }
}

#[napi]
pub fn transform(input: BindingTransformRequest) -> BindingTransformResponse {
    match crate::transform::transform(&transform_request(input)) {
        Ok(result) => BindingTransformResponse {
            ok: true,
            code: Some(result.code),
            map_json: result.map_json,
            error_message: None,
            error_line: None,
            error_column: None,
        },
        Err(error) => BindingTransformResponse {
            ok: false,
            code: None,
            map_json: None,
            error_message: Some(error.message),
            error_line: error.line,
            error_column: error.column,
        },
    }
}
