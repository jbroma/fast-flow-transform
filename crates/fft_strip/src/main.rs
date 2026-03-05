/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

use std::io;
use std::io::BufRead;
use std::io::Write;

use anyhow::Context;
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
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
struct Request {
    id: u64,
    filename: String,
    code: String,
    #[serde(default = "default_dialect")]
    dialect: String,
    #[serde(default = "default_format")]
    format: String,
    #[serde(rename = "reactRuntimeTarget")]
    #[serde(default = "default_react_runtime_target")]
    react_runtime_target: String,
    #[serde(rename = "enumRuntimeModule")]
    #[serde(default = "default_enum_runtime_module")]
    enum_runtime_module: String,
}

#[derive(Debug, Serialize)]
struct ResponseOk {
    id: u64,
    ok: bool,
    code: String,
    map: Value,
}

#[derive(Debug, Serialize)]
struct ResponseErr {
    id: u64,
    ok: bool,
    error: ErrorPayload,
}

#[derive(Debug, Serialize)]
struct ErrorPayload {
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    column: Option<u32>,
}

#[derive(Debug)]
struct TransformFailure {
    message: String,
    line: Option<u32>,
    column: Option<u32>,
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

fn run_transform(request: &Request) -> Result<(String, Value), TransformFailure> {
    let requested_dialect = parse_dialect(request.dialect.as_str())?;
    let pretty = parse_format(request.format.as_str())?;
    let react_runtime_target = parse_react_runtime_target(request.react_runtime_target.as_str())?;

    let transform_once = |dialect: ParserDialect| -> Result<(String, Value), TransformFailure> {
        let mut ctx = ast::Context::new();
        let file_id = ctx.sm_mut().add_source(
            request.filename.clone(),
            NullTerminatedBuf::from_str_copy(request.code.as_str()),
        );
        let input = ctx.sm().source_buffer_rc(file_id);
        let mut parser_flags = hparser::ParserFlags::default();
        parser_flags.enable_jsx = true;
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

        let ast = match ast {
            Some(node) => node,
            None => {
                return Err(TransformFailure {
                    message: "failed to convert parser AST".to_string(),
                    line: None,
                    column: None,
                });
            }
        };

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
                ..gen_js::Opt::new()
            },
        )
        .map_err(|error| TransformFailure::from_anyhow(anyhow!(error)))?;

        let mut map_bytes = Vec::<u8>::new();
        generated_map
            .to_writer(&mut map_bytes)
            .map_err(|error| TransformFailure::from_anyhow(anyhow!(error)))?;
        let map = serde_json::from_slice::<Value>(map_bytes.as_slice())
            .map_err(|error| TransformFailure::from_anyhow(anyhow!(error)))?;
        let code = String::from_utf8(output).map_err(|error| TransformFailure {
            message: format!("generated output is not UTF-8: {}", error),
            line: None,
            column: None,
        })?;

        Ok((code, map))
    };

    if requested_dialect == ParserDialect::FlowDetect {
        match transform_once(ParserDialect::FlowDetect) {
            Ok(result) => Ok(result),
            Err(primary_error) => match transform_once(ParserDialect::Flow) {
                Ok(result) => Ok(result),
                Err(_) => Err(primary_error),
            },
        }
    } else {
        transform_once(requested_dialect)
    }
}

fn request_id_for_error(input: &str) -> u64 {
    serde_json::from_str::<Value>(input)
        .ok()
        .and_then(|value| value.get("id").and_then(Value::as_u64))
        .unwrap_or(0)
}

fn main() -> anyhow::Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = io::BufReader::new(stdin.lock());
    let mut writer = io::BufWriter::new(stdout.lock());
    let mut line = String::new();

    loop {
        line.clear();
        let bytes_read = reader.read_line(&mut line)?;
        if bytes_read == 0 {
            break;
        }

        let payload = line.trim();
        if payload.is_empty() {
            continue;
        }

        let request = serde_json::from_str::<Request>(payload);
        let response_value = match request {
            Ok(request) => match run_transform(&request) {
                Ok((code, map)) => serde_json::to_value(ResponseOk {
                    id: request.id,
                    ok: true,
                    code,
                    map,
                })?,
                Err(error) => serde_json::to_value(ResponseErr {
                    id: request.id,
                    ok: false,
                    error: ErrorPayload {
                        message: error.message,
                        line: error.line,
                        column: error.column,
                    },
                })?,
            },
            Err(parse_error) => {
                let id = request_id_for_error(payload);
                serde_json::to_value(ResponseErr {
                    id,
                    ok: false,
                    error: ErrorPayload {
                        message: format!("invalid request JSON: {}", parse_error),
                        line: None,
                        column: None,
                    },
                })?
            }
        };

        serde_json::to_writer(&mut writer, &response_value)
            .with_context(|| "failed to serialize response")?;
        writer.write_all(b"\n")?;
        writer.flush()?;
    }

    writer
        .flush()
        .map_err(|error| anyhow!(error))
        .context("failed to flush stdout")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_basic_flow_annotations() {
        let request = Request {
            id: 1,
            filename: "input.js".to_string(),
            code: "function f(x: number): number { return x; }".to_string(),
            dialect: "flow".to_string(),
            format: "compact".to_string(),
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "flow-enums-runtime".to_string(),
        };

        let (code, map) = run_transform(&request).expect("transform should succeed");
        assert!(code.contains("function f(x)"));
        assert!(map.is_object(), "expected source map object");
    }

    #[test]
    fn applies_custom_enum_runtime_module() {
        let request = Request {
            id: 1,
            filename: "input.js".to_string(),
            code: "enum E {A, B}".to_string(),
            dialect: "flow".to_string(),
            format: "compact".to_string(),
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "@acme/runtime".to_string(),
        };

        let (code, _) = run_transform(&request).expect("transform should succeed");
        assert!(code.contains("@acme/runtime"));
    }

    #[test]
    fn rejects_invalid_dialect() {
        let request = Request {
            id: 1,
            filename: "input.js".to_string(),
            code: "const x = 1;".to_string(),
            dialect: "javascript".to_string(),
            format: "compact".to_string(),
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "flow-enums-runtime".to_string(),
        };

        let error = run_transform(&request).expect_err("transform should fail");
        assert!(error.message.contains("invalid dialect"));
    }

    #[test]
    fn lowers_flow_match_statement() {
        let mut ctx = ast::Context::new();
        let program = {
            let gc = ast::GCLock::new(&mut ctx);
            let mode = ast::builder::Identifier::build_template(
                &gc,
                ast::template::Identifier {
                    metadata: Default::default(),
                    name: gc.atom("mode"),
                    type_annotation: None,
                    optional: false,
                },
            );

            let case_body = |value: f64| {
                ast::builder::BlockStatement::build_template(
                    &gc,
                    ast::template::BlockStatement {
                        metadata: Default::default(),
                        body: ast::NodeList::from_iter(
                            &gc,
                            [ast::builder::ExpressionStatement::build_template(
                                &gc,
                                ast::template::ExpressionStatement {
                                    metadata: Default::default(),
                                    expression: ast::builder::NumericLiteral::build_template(
                                        &gc,
                                        ast::template::NumericLiteral {
                                            metadata: Default::default(),
                                            value,
                                        },
                                    ),
                                    directive: None,
                                },
                            )],
                        ),
                    },
                )
            };

            let cases = ast::NodeList::from_iter(
                &gc,
                [
                    ast::builder::MatchStatementCase::build_template(
                        &gc,
                        ast::template::MatchStatementCase {
                            metadata: Default::default(),
                            pattern: ast::builder::MatchLiteralPattern::build_template(
                                &gc,
                                ast::template::MatchLiteralPattern {
                                    metadata: Default::default(),
                                    literal: ast::builder::NumericLiteral::build_template(
                                        &gc,
                                        ast::template::NumericLiteral {
                                            metadata: Default::default(),
                                            value: 0.0,
                                        },
                                    ),
                                },
                            ),
                            body: case_body(10.0),
                            guard: None,
                        },
                    ),
                    ast::builder::MatchStatementCase::build_template(
                        &gc,
                        ast::template::MatchStatementCase {
                            metadata: Default::default(),
                            pattern: ast::builder::MatchLiteralPattern::build_template(
                                &gc,
                                ast::template::MatchLiteralPattern {
                                    metadata: Default::default(),
                                    literal: ast::builder::NumericLiteral::build_template(
                                        &gc,
                                        ast::template::NumericLiteral {
                                            metadata: Default::default(),
                                            value: 1.0,
                                        },
                                    ),
                                },
                            ),
                            body: case_body(20.0),
                            guard: None,
                        },
                    ),
                ],
            );

            ast::NodeRc::from_node(
                &gc,
                ast::builder::Program::build_template(
                    &gc,
                    ast::template::Program {
                        metadata: Default::default(),
                        body: ast::NodeList::from_iter(
                            &gc,
                            [ast::builder::MatchStatement::build_template(
                                &gc,
                                ast::template::MatchStatement {
                                    metadata: Default::default(),
                                    argument: mode,
                                    cases,
                                },
                            )],
                        ),
                    },
                ),
            )
        };

        let mut output = Vec::<u8>::new();
        gen_js::generate(
            &mut output,
            &mut ctx,
            &program,
            gen_js::Opt {
                pretty: gen_js::Pretty::No,
                ..gen_js::Opt::new()
            },
        )
        .expect("code generation should succeed");

        let code = String::from_utf8(output).expect("generated code should be UTF-8");
        assert!(!code.contains("match("));
        assert!(code.contains("_fft_match_"));
    }

    #[test]
    fn supports_class_static_blocks() {
        let request = Request {
            id: 1,
            filename: "input.js".to_string(),
            code: r#"
                class Logger {
                    static {
                        const level = "info";
                        this.level = level;
                    }
                }
            "#
            .to_string(),
            dialect: "flow-detect".to_string(),
            format: "compact".to_string(),
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "flow-enums-runtime".to_string(),
        };

        let (code, _) = run_transform(&request).expect("transform should succeed");
        assert!(code.contains("static {"));
        assert!(code.contains("this.level=level"));
    }

    #[test]
    fn supports_comment_only_programs() {
        let request = Request {
            id: 1,
            filename: "input.js".to_string(),
            code: "// Empty module as a target for NormalModuleReplacementPlugin.".to_string(),
            dialect: "flow-detect".to_string(),
            format: "compact".to_string(),
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "flow-enums-runtime".to_string(),
        };

        let (_code, map) = run_transform(&request).expect("transform should succeed");
        assert!(map.is_object(), "expected source map object");
    }

    #[test]
    fn flow_detect_recovers_when_flow_pragma_is_missing() {
        let request = Request {
            id: 1,
            filename: "input.js".to_string(),
            code: r#"
                import type {HostComponent} from './HostComponent';
                const x: HostComponent<{...}> = (null: any);
                export default x;
            "#
            .to_string(),
            dialect: "flow-detect".to_string(),
            format: "compact".to_string(),
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "flow-enums-runtime".to_string(),
        };

        let (code, _) = run_transform(&request).expect("transform should succeed");
        assert!(!code.contains("import type"));
        assert!(code.contains("const x="));
    }

    #[test]
    fn flow_detect_recovers_from_cover_nodes_without_pragma() {
        let request = Request {
            id: 1,
            filename: "input.js".to_string(),
            code: r#"
                let waitingForQueuedOperations = new Set<string>();
                export default waitingForQueuedOperations;
            "#
            .to_string(),
            dialect: "flow-detect".to_string(),
            format: "compact".to_string(),
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "flow-enums-runtime".to_string(),
        };

        let (code, _) = run_transform(&request).expect("transform should succeed");
        assert!(code.contains("new Set()"));
        assert!(code.contains("export default"));
    }
}
