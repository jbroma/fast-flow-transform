use anyhow::anyhow;
use fft::ast;
use fft::gen_js;
use fft::hparser;
use fft::hparser::ParserDialect;
use fft_pass::PassManager;
use fft_pass::strip_flow::ReactRuntimeTarget;
use fft_pass::strip_flow::StripFlowOptions;
use fft_support::NullTerminatedBuf;

use crate::preserve;

#[derive(Debug, Clone)]
pub struct TransformRequest {
    pub filename: String,
    pub code: String,
    pub dialect: String,
    pub format: String,
    pub preserve_comments: bool,
    pub preserve_whitespace: bool,
    pub react_runtime_target: String,
    pub enum_runtime_module: String,
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

fn parser_flags(dialect: ParserDialect) -> hparser::ParserFlags {
    let mut flags = hparser::ParserFlags::default();
    flags.enable_jsx = true;
    flags.parse_flow_match = matches!(
        dialect,
        ParserDialect::Flow | ParserDialect::FlowDetect | ParserDialect::FlowUnambiguous
    );
    flags.dialect = dialect;
    flags
}

fn parse_ast(
    ctx: &mut ast::Context,
    request: &TransformRequest,
    dialect: ParserDialect,
) -> Result<ast::NodeRc, TransformFailure> {
    let file_id = ctx.sm_mut().add_source(
        request.filename.clone(),
        NullTerminatedBuf::from_str_copy(request.code.as_str()),
    );
    let input = ctx.sm().source_buffer_rc(file_id);
    let parsed = hparser::ParsedJS::parse(parser_flags(dialect), &input);

    if let Some((loc, message)) = parsed.first_error() {
        return Err(TransformFailure {
            message,
            line: Some(loc.line),
            column: Some(loc.col),
        });
    }

    let ast = {
        let gc = ast::GCLock::new(ctx);
        parsed
            .to_ast(&gc, file_id)
            .map(|node| ast::NodeRc::from_node(&gc, node))
    };

    ast.ok_or_else(|| TransformFailure {
        message: "failed to convert parser AST".to_string(),
        line: None,
        column: None,
    })
}

fn generate_output(
    ctx: &mut ast::Context,
    request: &TransformRequest,
    program: &ast::NodeRc,
    pretty: gen_js::Pretty,
) -> Result<TransformOutput, TransformFailure> {
    let mut output = Vec::<u8>::new();
    let generated_map = gen_js::generate(
        &mut output,
        ctx,
        program,
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

fn transform_once(
    request: &TransformRequest,
    dialect: ParserDialect,
    pretty: gen_js::Pretty,
    react_runtime_target: ReactRuntimeTarget,
) -> Result<TransformOutput, TransformFailure> {
    let mut ctx = ast::Context::new();
    let ast = parse_ast(&mut ctx, request, dialect)?;
    let transformed = PassManager::strip_flow_with_options(StripFlowOptions {
        react_runtime_target,
        enum_runtime_module: request.enum_runtime_module.clone(),
    })
    .run(&mut ctx, ast);

    generate_output(&mut ctx, request, &transformed, pretty)
}

pub fn transform(request: &TransformRequest) -> Result<TransformOutput, TransformFailure> {
    let requested_dialect = parse_dialect(request.dialect.as_str())?;
    let react_runtime_target = parse_react_runtime_target(request.react_runtime_target.as_str())?;

    if request.preserve_comments && !request.preserve_whitespace {
        return Err(TransformFailure {
            message: "preserveComments requires preserveWhitespace".to_string(),
            line: None,
            column: None,
        });
    }

    if request.preserve_whitespace {
        return if requested_dialect == ParserDialect::FlowDetect {
            match preserve::transform_preserving_layout(request, ParserDialect::FlowDetect) {
                Ok(result) => Ok(result),
                Err(primary_error) => {
                    match preserve::transform_preserving_layout(request, ParserDialect::Flow) {
                        Ok(result) => Ok(result),
                        Err(_) => Err(primary_error),
                    }
                }
            }
        } else {
            preserve::transform_preserving_layout(request, requested_dialect)
        };
    }

    let pretty = parse_format(request.format.as_str())?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use fft::ast;
    use fft::gen_js;

    fn request(code: &str) -> TransformRequest {
        TransformRequest {
            filename: "input.js".to_string(),
            code: code.to_string(),
            dialect: "flow".to_string(),
            format: "compact".to_string(),
            preserve_comments: false,
            preserve_whitespace: false,
            react_runtime_target: "18".to_string(),
            enum_runtime_module: "flow-enums-runtime".to_string(),
            sourcemap: true,
        }
    }

    fn pretty_request(code: &str) -> TransformRequest {
        let mut input = request(code);
        input.format = "pretty".to_string();
        input
    }

    fn preserve_request(code: &str) -> TransformRequest {
        let mut input = pretty_request(code);
        input.preserve_whitespace = true;
        input.sourcemap = false;
        input
    }

    #[test]
    fn strips_basic_flow_annotations() {
        let result =
            transform(&request("function f(x: number): number { return x; }"))
                .expect("transform should succeed");

        assert!(result.code.contains("function f(x)"));
        assert!(result.map_json.is_some(), "expected source map payload");
    }

    #[test]
    fn skips_source_map_generation_when_disabled() {
        let mut input = request("const value: number = 1;");
        input.sourcemap = false;

        let result = transform(&input).expect("transform should succeed");

        assert_eq!(result.code, "const value=1;\n");
        assert!(result.map_json.is_none(), "expected no source map payload");
    }

    #[test]
    fn emits_pretty_output_shape_for_flow_stripping() {
        let result = transform(&pretty_request(
            r#"
                // @flow
                import type { Node } from "./types.js";
                const value: Node = { id: 1 };
                export function read(node: Node): number {
                    return node.id;
                }
                export default value.id;
            "#,
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "const value = {id: 1};\nexport function read(node) {\n  return node.id;\n}\nexport default value.id;\n"
        );
    }

    #[test]
    fn keeps_compact_output_shape_when_requested() {
        let result = transform(&request(
            r#"
                // @flow
                import type { Node } from "./types.js";
                const value: Node = { id: 1 };
                export function read(node: Node): number {
                    return node.id;
                }
                export default value.id;
            "#,
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "const value={id:1};export function read(node){return node.id;}export default value.id;\n"
        );
    }

    #[test]
    fn rejects_invalid_dialect() {
        let mut input = request("const x = 1;");
        input.dialect = "javascript".to_string();

        let error = transform(&input).expect_err("transform should fail");
        assert!(error.message.contains("invalid dialect"));
    }

    #[test]
    fn preserves_whitespace_for_simple_flow_stripping() {
        let result = transform(&preserve_request(
            "import type { Node } from \"./types.js\";\n\nconst value: number = 1;\n\nexport function read(\n  node: Node,\n): number {\n  return value + node.id;\n}\n",
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "\n\nconst value = 1;\n\nexport function read(\n  node,\n) {\n  return value + node.id;\n}\n"
        );
    }

    #[test]
    fn preserves_comments_when_requested() {
        let mut input = preserve_request(
            "const value: number = 1;\n\n// keep me\nexport function read(node: number): number {\n  return node + value;\n}\n",
        );
        input.preserve_comments = true;

        let result = transform(&input).expect("transform should succeed");

        assert_eq!(
            result.code,
            "const value = 1;\n\n// keep me\nexport function read(node) {\n  return node + value;\n}\n"
        );
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
        let result = transform(&request(
            r#"
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
            "#,
        ))
        .expect("transform should succeed");

        assert!(!result.code.contains("match("));
        assert!(result.code.contains("_fft_match_"));
        assert!(result.map_json.is_some(), "expected source map payload");
    }

    #[test]
    fn strips_unknown_type_annotations() {
        let result = transform(&request(
            r#"
                // @flow
                type Value = unknown;
                function accept(value: unknown): unknown {
                    return value;
                }
            "#,
        ))
        .expect("transform should succeed");

        assert!(!result.code.contains("unknown"));
        assert!(result.code.contains("function accept(value)"));
        assert!(result.map_json.is_some(), "expected source map payload");
    }

    #[test]
    fn lowers_flow_match_expression_from_source() {
        let result = transform(&request(
            r#"
                // @flow
                function render(mode: number) {
                    return match (mode) {
                        0 => 'zero',
                        1 => 'one',
                        _ => 'other',
                    };
                }
            "#,
        ))
        .expect("transform should succeed");

        assert!(!result.code.contains("match("));
        assert!(result.code.contains("_fft_match_"));
        assert!(result.code.contains("return "));
        assert!(result.map_json.is_some(), "expected source map payload");
    }

    #[test]
    fn supports_class_static_blocks() {
        let mut input = request(
            r#"
                class Logger {
                    static {
                        const level = "info";
                        this.level = level;
                    }
                }
            "#,
        );
        input.dialect = "flow-detect".to_string();

        let result = transform(&input).expect("transform should succeed");
        assert!(result.code.contains("static {"));
        assert!(result.code.contains("this.level=level"));
    }

    #[test]
    fn supports_comment_only_programs() {
        let mut input =
            request("// Empty module as a target for NormalModuleReplacementPlugin.");
        input.dialect = "flow-detect".to_string();

        let result = transform(&input).expect("transform should succeed");
        assert_eq!(result.code, "\n");
        assert!(result.map_json.is_some(), "expected source map payload");
    }

    #[test]
    fn drops_ordinary_comments_in_pretty_and_compact_output() {
        let source = r#"
            // lead comment
            const value: number = 1; // trailing comment
            export default value;
        "#;

        let pretty = transform(&pretty_request(source)).expect("pretty transform should succeed");
        let compact = transform(&request(source)).expect("compact transform should succeed");

        assert_eq!(pretty.code, "const value = 1;\nexport default value;\n");
        assert_eq!(compact.code, "const value=1;export default value;\n");
        assert!(!pretty.code.contains("comment"));
        assert!(!compact.code.contains("comment"));
    }

    #[test]
    fn flow_detect_recovers_when_flow_pragma_is_missing() {
        let mut input = request(
            r#"
                import type {HostComponent} from './HostComponent';
                const x: HostComponent<{...}> = (null: any);
                export default x;
            "#,
        );
        input.dialect = "flow-detect".to_string();

        let result = transform(&input).expect("transform should succeed");
        assert!(!result.code.contains("import type"));
        assert!(result.code.contains("const x="));
    }

    #[test]
    fn flow_detect_recovers_from_cover_nodes_without_pragma() {
        let mut input = request(
            r#"
                let waitingForQueuedOperations = new Set<string>();
                export default waitingForQueuedOperations;
            "#,
        );
        input.dialect = "flow-detect".to_string();

        let result = transform(&input).expect("transform should succeed");
        assert!(result.code.contains("new Set()"));
        assert!(result.code.contains("export default"));
    }
}
