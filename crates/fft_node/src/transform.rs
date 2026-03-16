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
use crate::printer_comments;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OutputFormat {
    Compact,
    Preserve,
    Pretty,
}

#[derive(Debug, Clone)]
pub struct TransformRequest {
    pub filename: String,
    pub code: String,
    pub dialect: String,
    pub format: String,
    pub comments: bool,
    pub react_runtime_target: String,
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

fn parse_format(value: &str) -> Result<OutputFormat, TransformFailure> {
    match value {
        "compact" => Ok(OutputFormat::Compact),
        "preserve" => Ok(OutputFormat::Preserve),
        "pretty" => Ok(OutputFormat::Pretty),
        _ => Err(TransformFailure {
            message: format!("invalid format '{}', expected compact | pretty | preserve", value),
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

fn pretty_format(output_format: OutputFormat) -> gen_js::Pretty {
    match output_format {
        OutputFormat::Compact => gen_js::Pretty::No,
        OutputFormat::Pretty => gen_js::Pretty::Yes,
        OutputFormat::Preserve => unreachable!("preserve format uses the layout-preserving path"),
    }
}

fn generate_output(
    ctx: &mut ast::Context,
    request: &TransformRequest,
    program: &ast::NodeRc,
    pretty: gen_js::Pretty,
    comments: Option<fft::comments::CommentTable>,
) -> Result<TransformOutput, TransformFailure> {
    let mut output = Vec::<u8>::new();
    let generated_map = gen_js::generate(
        &mut output,
        ctx,
        program,
        gen_js::Opt {
            comments,
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
    let file_id = ctx.sm_mut().add_source(
        request.filename.clone(),
        NullTerminatedBuf::from_str_copy(request.code.as_str()),
    );
    let input = ctx.sm().source_buffer_rc(file_id);
    let source_text = &input.as_bytes()[..input.len().saturating_sub(1)];
    let mut flags = parser_flags(dialect);
    flags.store_comments = request.comments;
    let parsed = hparser::ParsedJS::parse(flags, &input);

    if let Some((loc, message)) = parsed.first_error() {
        return Err(TransformFailure {
            message,
            line: Some(loc.line),
            column: Some(loc.col),
        });
    }

    let original = {
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

    let transformed = PassManager::strip_flow_with_options(StripFlowOptions {
        react_runtime_target,
    })
    .run(&mut ctx, original.clone());

    let comments = if request.comments {
        let gc = ast::GCLock::new(&mut ctx);
        Some(printer_comments::build_comment_table(
            &gc,
            original.node(&gc),
            transformed.node(&gc),
            parsed.comments(),
            source_text,
        ))
    } else {
        None
    };

    generate_output(&mut ctx, request, &transformed, pretty, comments)
}

pub fn transform(request: &TransformRequest) -> Result<TransformOutput, TransformFailure> {
    let requested_dialect = parse_dialect(request.dialect.as_str())?;
    let requested_format = parse_format(request.format.as_str())?;
    let react_runtime_target = parse_react_runtime_target(request.react_runtime_target.as_str())?;

    if requested_format == OutputFormat::Preserve {
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

    let pretty = pretty_format(requested_format);

    if requested_dialect == ParserDialect::FlowDetect {
        match transform_once(
            request,
            ParserDialect::FlowDetect,
            pretty,
            react_runtime_target,
        ) {
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
    use sourcemap::SourceMap;

    fn request(code: &str) -> TransformRequest {
        TransformRequest {
            filename: "input.js".to_string(),
            code: code.to_string(),
            dialect: "flow".to_string(),
            format: "compact".to_string(),
            comments: false,
            react_runtime_target: "19".to_string(),
            sourcemap: true,
        }
    }

    fn pretty_request(code: &str) -> TransformRequest {
        let mut input = request(code);
        input.format = "pretty".to_string();
        input
    }

    fn preserve_request(code: &str) -> TransformRequest {
        let mut input = request(code);
        input.format = "preserve".to_string();
        input.sourcemap = false;
        input
    }

    fn comment_request(code: &str) -> TransformRequest {
        let mut input = pretty_request(code);
        input.comments = true;
        input
    }

    #[test]
    fn strips_basic_flow_annotations() {
        let result = transform(&request("function f(x: number): number { return x; }"))
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
        let input = preserve_request(
            "import type { Node } from \"./types.js\";\n\nconst value: number = 1;\n\nexport function read(\n  node: Node,\n): number {\n  return value + node.id;\n}\n",
        );
        let result = transform(&input).expect("transform should succeed");

        assert_eq!(
            result.code,
            "\n\nconst value = 1;\n\nexport function read(\n  node,\n) {\n  return value + node.id;\n}\n"
        );
    }

    #[test]
    fn preserves_whitespace_for_mixed_value_and_type_imports() {
        let result = transform(&preserve_request(
            "import { Foo, type Bar } from \"./mod.js\";\nimport DefaultThing, { type Qux } from \"./mod.js\";\nimport { type OnlyType } from \"./mod.js\";\nexport default Foo;\n",
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "import { Foo } from \"./mod.js\";\nimport DefaultThing from \"./mod.js\";\n\nexport default Foo;\n"
        );
    }

    #[test]
    fn preserves_whitespace_for_class_implements_and_fields() {
        let result = transform(&preserve_request(
            "class Example extends Base implements Foo, Bar {\n  declare removed: string;\n  kept: number = 1;\n  +covariant: number = 2;\n  #hidden: number;\n  #kept: number = 3;\n}\n",
        ))
        .expect("transform should succeed");

        assert!(!result.code.contains("implements"));
        assert!(!result.code.contains("declare removed"));
        assert!(!result.code.contains(": number"));
        assert!(!result.code.contains("+covariant"));
        assert!(result.code.contains("class Example extends Base {"));
        assert!(result.code.contains("kept = 1;"));
        assert!(result.code.contains("covariant = 2;"));
        assert!(result.code.contains("#hidden;"));
        assert!(result.code.contains("#kept = 3;"));
    }

    #[test]
    fn preserves_whitespace_for_this_parameters() {
        let result = transform(&preserve_request(
            "function first(this: string) {}\nfunction second(this: string, value: number) { return value; }\nconst third = function(this: string, value: number) { return value; };\n",
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "function first() {}\nfunction second(value) { return value; }\nconst third = function(value) { return value; };\n"
        );
    }

    #[test]
    fn preserves_whitespace_for_flow_cast_syntax() {
        let result = transform(&preserve_request(
            "const cast = (value: any);\nconst typed = foo as number;\nconst frozen = ({ ok: true } as const);\n",
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "const cast = (value);\nconst typed = foo;\nconst frozen = ({ ok: true });\n"
        );
    }

    #[test]
    fn preserves_whitespace_for_optional_function_parameters() {
        let result = transform(&preserve_request(
            "async function test(x: Type, y /*.*/ ? /*.*/ , z /*.*/ ? /*.*/ : /*.*/ number = 123): string {\n  return await (x: any);\n}\n",
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "async function test(x, y    , z     = 123) {\n  return await (x);\n}\n"
        );
    }

    #[test]
    fn preserves_whitespace_for_inferred_predicates_without_return_types() {
        let result = transform(&preserve_request(
            "function inferredPredicateWithoutType(arg: mixed): %checks {\n  return !!arg;\n}\n",
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "function inferredPredicateWithoutType(arg) {\n  return !!arg;\n}\n"
        );
    }

    #[test]
    fn preserves_whitespace_for_parenthesized_as_expressions() {
        let result = transform(&preserve_request(
            "const asComponent = (() => {}) as component(p: number, o?: string);\nconst asFunction = (() => {}) as () => void;\n",
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "const asComponent = (() => {});\nconst asFunction = (() => {});\n"
        );
    }

    #[test]
    fn preserves_whitespace_with_sourcemaps_for_new_span_shapes() {
        let mut input = preserve_request(
            "import { Foo, type Bar } from \"./mod.js\";\nconst typed = Foo as number;\nexport default typed;\n",
        );
        input.sourcemap = true;

        let result = transform(&input).expect("transform should succeed");
        let map_json = result
            .map_json
            .as_ref()
            .expect("expected source map payload");
        let map = SourceMap::from_slice(map_json.as_bytes()).expect("valid source map");

        assert_eq!(
            result.code,
            "import { Foo } from \"./mod.js\";\nconst typed = Foo;\nexport default typed;\n"
        );
        let token = map
            .lookup_token(1, 14)
            .expect("expected token at preserved Foo identifier");
        assert_eq!(token.get_source(), Some("input.js"));
        assert_eq!(token.get_src(), (1, 14));
    }

    #[test]
    fn preserves_comments_when_requested_on_preserve_format_path() {
        let mut input = preserve_request(
            "const value: number = 1;\n\n// keep me\nexport function read(node: number): number {\n  return node + value;\n}\n",
        );
        input.comments = true;

        let result = transform(&input).expect("transform should succeed");

        assert_eq!(
            result.code,
            "const value = 1;\n\n// keep me\nexport function read(node) {\n  return node + value;\n}\n"
        );
    }

    #[test]
    fn preserves_preserve_format_with_sourcemaps() {
        let mut input = preserve_request("const value: number = 1;\nexport default value;\n");
        input.sourcemap = true;

        let result = transform(&input).expect("transform should succeed");
        let map_json = result
            .map_json
            .as_ref()
            .expect("expected source map payload");
        let map = SourceMap::from_slice(map_json.as_bytes()).expect("valid source map");

        assert_eq!(result.code, "const value = 1;\nexport default value;\n");
        let token = map
            .lookup_token(0, 14)
            .expect("expected token at value literal");
        assert_eq!(token.get_source(), Some("input.js"));
        assert_eq!(token.get_src(), (0, 22));
    }

    #[test]
    fn preserves_preserve_format_and_comments_with_sourcemaps() {
        let mut input =
            preserve_request("const value: number = 1;\n// keep me\nexport default value;\n");
        input.comments = true;
        input.sourcemap = true;

        let result = transform(&input).expect("transform should succeed");
        let map_json = result
            .map_json
            .as_ref()
            .expect("expected source map payload");
        let map = SourceMap::from_slice(map_json.as_bytes()).expect("valid source map");

        assert_eq!(
            result.code,
            "const value = 1;\n// keep me\nexport default value;\n"
        );
        let token = map
            .lookup_token(2, 7)
            .expect("expected token on export line");
        assert_eq!(token.get_source(), Some("input.js"));
        assert_eq!(token.get_src(), (2, 7));
    }

    #[test]
    fn preserves_comments_in_pretty_output() {
        let result = transform(&comment_request(
            "// @flow\n/* eslint-disable no-console */\nconst value: number = 1; // trailing keep\nexport default value;\n",
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "/* eslint-disable no-console */\nconst value = 1; // trailing keep\nexport default value;\n"
        );
        assert!(result.map_json.is_some(), "expected source map payload");
    }

    #[test]
    fn preserves_comments_in_compact_output() {
        let mut input =
            comment_request("const value: number = 1; // trailing keep\nexport default value;\n");
        input.format = "compact".to_string();

        let result = transform(&input).expect("transform should succeed");

        assert_eq!(
            result.code,
            "const value=1;// trailing keep\nexport default value;\n"
        );
        assert!(result.map_json.is_some(), "expected source map payload");
    }

    #[test]
    fn reanchors_comments_from_removed_flow_only_declarations() {
        let result = transform(&comment_request(
            "// @flow\n// moved comment\ntype User = string;\nconst value: User = \"x\";\n",
        ))
        .expect("transform should succeed");

        assert_eq!(result.code, "// moved comment\nconst value = 'x';\n");
    }

    #[test]
    fn drops_ambiguous_comments_from_removed_flow_only_syntax() {
        let result = transform(&comment_request(
            "import type /* ambiguous */ { User } from \"./types.js\";\nconst value: number = 1;\n",
        ))
        .expect("transform should succeed");

        assert_eq!(result.code, "const value = 1;\n");
        assert!(!result.code.contains("ambiguous"));
    }

    #[test]
    fn reanchors_inline_annotation_comments_to_surviving_value_nodes() {
        let result = transform(&comment_request(
            "const value: /* inline */ number = 1;\nexport default value;\n",
        ))
        .expect("transform should succeed");

        assert_eq!(
            result.code,
            "const value = 1; /* inline */\nexport default value;\n"
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
        let mut input = request("// Empty module as a target for NormalModuleReplacementPlugin.");
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
