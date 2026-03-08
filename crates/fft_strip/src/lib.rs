/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

use anyhow::anyhow;
use fft::ast;
use fft::gen_js;
use fft::hparser;
use fft::hparser::ParserDialect;
use fft_pass::PassManager;
use fft_pass::strip_flow::ReactRuntimeTarget;
use fft_pass::strip_flow::StripFlowOptions;
use fft_support::NullTerminatedBuf;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct TransformRequest {
    pub filename: String,
    pub code: String,
    #[serde(default = "default_dialect")]
    pub dialect: String,
    #[serde(default = "default_format")]
    pub format: String,
    #[serde(rename = "reactRuntimeTarget")]
    #[serde(default = "default_react_runtime_target")]
    pub react_runtime_target: String,
    #[serde(rename = "enumRuntimeModule")]
    #[serde(default = "default_enum_runtime_module")]
    pub enum_runtime_module: String,
    #[serde(default = "default_sourcemap")]
    pub sourcemap: bool,
}

#[derive(Debug, Clone)]
pub struct TransformOutput {
    pub code: String,
    pub map_json: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TransformFailure {
    pub message: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

impl TransformFailure {
    fn from_anyhow(error: anyhow::Error) -> Self {
        Self {
            message: format!("{:#}", error),
            line: None,
            column: None,
        }
    }
}

fn default_dialect() -> String {
    "flow-detect".to_string()
}

fn default_format() -> String {
    "compact".to_string()
}

fn default_react_runtime_target() -> String {
    "18".to_string()
}

fn default_enum_runtime_module() -> String {
    "flow-enums-runtime".to_string()
}

fn default_sourcemap() -> bool {
    true
}

fn parse_dialect(value: &str) -> Result<ParserDialect, TransformFailure> {
    match value {
        "flow" => Ok(ParserDialect::Flow),
        "flow-detect" => Ok(ParserDialect::FlowDetect),
        "flow-unambiguous" => Ok(ParserDialect::FlowUnambiguous),
        _ => Err(TransformFailure {
            message: format!(
                "invalid dialect '{}', expected flow | flow-detect | flow-unambiguous",
                value
            ),
            line: None,
            column: None,
        }),
    }
}

fn parse_format(value: &str) -> Result<gen_js::Pretty, TransformFailure> {
    match value {
        "compact" => Ok(gen_js::Pretty::No),
        "pretty" => Ok(gen_js::Pretty::Yes),
        _ => Err(TransformFailure {
            message: format!("invalid format '{}', expected compact | pretty", value),
            line: None,
            column: None,
        }),
    }
}

fn parse_react_runtime_target(value: &str) -> Result<ReactRuntimeTarget, TransformFailure> {
    match value {
        "18" => Ok(ReactRuntimeTarget::V18),
        "19" => Ok(ReactRuntimeTarget::V19),
        _ => Err(TransformFailure {
            message: format!("invalid reactRuntimeTarget '{}', expected 18 | 19", value),
            line: None,
            column: None,
        }),
    }
}

fn transform_once(
    request: &TransformRequest,
    dialect: ParserDialect,
    pretty: gen_js::Pretty,
    react_runtime_target: ReactRuntimeTarget,
) -> Result<TransformOutput, TransformFailure> {
    let mut ctx = ast::Context::new();
    let file_id = ctx.sm_mut().add_source(
        request.filename.clone(),
        NullTerminatedBuf::from_str_copy(request.code.as_str()),
    );
    let input = ctx.sm().source_buffer_rc(file_id);
    let mut parser_flags = hparser::ParserFlags::default();
    parser_flags.enable_jsx = true;
    parser_flags.parse_flow_match = matches!(
        dialect,
        ParserDialect::Flow | ParserDialect::FlowDetect | ParserDialect::FlowUnambiguous
    );
    parser_flags.dialect = dialect;

    let parsed = hparser::ParsedJS::parse(parser_flags, &input);
    if let Some((loc, message)) = parsed.first_error() {
        return Err(TransformFailure {
            message,
            line: Some(loc.line),
            column: Some(loc.col),
        });
    }

    let ast = {
        let gc = ast::GCLock::new(&mut ctx);
        parsed
            .to_ast(&gc, file_id)
            .map(|node| ast::NodeRc::from_node(&gc, node))
    };

    let ast = ast.ok_or_else(|| TransformFailure {
        message: "failed to convert parser AST".to_string(),
        line: None,
        column: None,
    })?;

    let transformed = PassManager::strip_flow_with_options(StripFlowOptions {
        react_runtime_target,
        enum_runtime_module: request.enum_runtime_module.clone(),
    })
    .run(&mut ctx, ast);

    let mut output = Vec::<u8>::new();
    let generated_map = gen_js::generate(
        &mut output,
        &mut ctx,
        &transformed,
        gen_js::Opt {
            pretty,
            sourcemap: request.sourcemap,
            ..gen_js::Opt::new()
        },
    )
    .map_err(|error| TransformFailure::from_anyhow(anyhow!(error)))?;

    let map_json = if request.sourcemap {
        let mut map_bytes = Vec::<u8>::new();
        generated_map
            .to_writer(&mut map_bytes)
            .map_err(|error| TransformFailure::from_anyhow(anyhow!(error)))?;
        Some(
            String::from_utf8(map_bytes).map_err(|error| TransformFailure {
                message: format!("generated source map is not UTF-8: {}", error),
                line: None,
                column: None,
            })?,
        )
    } else {
        None
    };

    let code = String::from_utf8(output).map_err(|error| TransformFailure {
        message: format!("generated output is not UTF-8: {}", error),
        line: None,
        column: None,
    })?;

    Ok(TransformOutput { code, map_json })
}

pub fn transform(request: &TransformRequest) -> Result<TransformOutput, TransformFailure> {
    let requested_dialect = parse_dialect(request.dialect.as_str())?;
    let pretty = parse_format(request.format.as_str())?;
    let react_runtime_target = parse_react_runtime_target(request.react_runtime_target.as_str())?;

    if requested_dialect == ParserDialect::FlowDetect {
        match transform_once(request, ParserDialect::FlowDetect, pretty, react_runtime_target) {
            Ok(result) => Ok(result),
            Err(primary_error) => {
                match transform_once(request, ParserDialect::Flow, pretty, react_runtime_target) {
                    Ok(result) => Ok(result),
                    Err(_) => Err(primary_error),
                }
            }
        }
    } else {
        transform_once(request, requested_dialect, pretty, react_runtime_target)
    }
}
