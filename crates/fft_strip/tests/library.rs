use fft_strip::TransformRequest;
use fft_strip::transform;

fn request(code: &str) -> TransformRequest {
    TransformRequest {
        filename: "input.js".to_string(),
        code: code.to_string(),
        dialect: "flow".to_string(),
        format: "compact".to_string(),
        react_runtime_target: "18".to_string(),
        enum_runtime_module: "flow-enums-runtime".to_string(),
        sourcemap: true,
    }
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
