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
#[cfg(test)]
use fft::ast;
#[cfg(test)]
use fft::gen_js;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use fft_strip::TransformFailure;
use fft_strip::TransformRequest;
use fft_strip::transform;

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
    #[serde(default = "default_sourcemap")]
    sourcemap: bool,
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

fn transform_failure(error: anyhow::Error) -> TransformFailure {
    TransformFailure {
        message: format!("{:#}", error),
        line: None,
        column: None,
    }
}

fn run_transform(request: &Request) -> Result<(String, Value), TransformFailure> {
    let result = transform(&TransformRequest {
        filename: request.filename.clone(),
        code: request.code.clone(),
        dialect: request.dialect.clone(),
        format: request.format.clone(),
        react_runtime_target: request.react_runtime_target.clone(),
        enum_runtime_module: request.enum_runtime_module.clone(),
        sourcemap: request.sourcemap,
    })?;
    let map = match result.map_json {
        Some(map_json) => serde_json::from_str::<Value>(&map_json)
            .map_err(|error| transform_failure(anyhow!(error)))?,
        None => Value::Null,
    };

    Ok((result.code, map))
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
            sourcemap: true,
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
            sourcemap: true,
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
            sourcemap: true,
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
                        implicit: false,
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
    fn lowers_flow_match_statement_from_source() {
        let request = Request {
            id: 1,
            filename: "input.js".to_string(),
            code: r#"
                // @flow
                function render(mode: number) {
                    match (mode) {
                        0 => {
                            return 10;
                        }
                        1 => {
                            return 20;
                        }
                    }
                }
            "#
            .to_string(),
            dialect: "flow".to_string(),
            format: "compact".to_string(),
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "flow-enums-runtime".to_string(),
            sourcemap: true,
        };

        let (code, map) = run_transform(&request).expect("transform should succeed");
        assert!(!code.contains("match("));
        assert!(code.contains("_fft_match_"));
        assert!(map.is_object(), "expected source map object");
    }

    #[test]
    fn strips_unknown_type_annotations() {
        let request = Request {
            id: 1,
            filename: "input.js".to_string(),
            code: r#"
                // @flow
                type Value = unknown;
                function accept(value: unknown): unknown {
                    return value;
                }
            "#
            .to_string(),
            dialect: "flow".to_string(),
            format: "compact".to_string(),
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "flow-enums-runtime".to_string(),
            sourcemap: true,
        };

        let (code, map) = run_transform(&request).expect("transform should succeed");
        assert!(!code.contains("unknown"));
        assert!(code.contains("function accept(value)"));
        assert!(map.is_object(), "expected source map object");
    }

    #[test]
    fn lowers_flow_match_expression_from_source() {
        let request = Request {
            id: 1,
            filename: "input.js".to_string(),
            code: r#"
                // @flow
                function render(mode: number) {
                    return match (mode) {
                        0 => 'zero',
                        1 => 'one',
                        _ => 'other',
                    };
                }
            "#
            .to_string(),
            dialect: "flow".to_string(),
            format: "compact".to_string(),
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "flow-enums-runtime".to_string(),
            sourcemap: true,
        };

        let (code, map) = run_transform(&request).expect("transform should succeed");
        assert!(!code.contains("match("));
        assert!(code.contains("_fft_match_"));
        assert!(code.contains("return "));
        assert!(map.is_object(), "expected source map object");
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
            sourcemap: true,
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
            sourcemap: true,
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
            sourcemap: true,
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
            sourcemap: true,
        };

        let (code, _) = run_transform(&request).expect("transform should succeed");
        assert!(code.contains("new Set()"));
        assert!(code.contains("export default"));
    }
}
