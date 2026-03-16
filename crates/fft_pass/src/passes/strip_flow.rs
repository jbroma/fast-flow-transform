/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

//! Pass to strip the Flow type declarations from code.

use fft::ast::*;

use crate::Pass;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReactRuntimeTarget {
    V18,
    V19,
}

impl Default for ReactRuntimeTarget {
    fn default() -> Self {
        Self::V19
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StripFlowOptions {
    pub react_runtime_target: ReactRuntimeTarget,
}

impl Default for StripFlowOptions {
    fn default() -> Self {
        Self {
            react_runtime_target: Default::default(),
        }
    }
}

#[derive(Default)]
pub struct StripFlow {
    options: StripFlowOptions,
}

struct LoweredComponentDeclaration<'gc> {
    function_declaration: &'gc Node<'gc>,
    forward_ref_declaration: Option<&'gc Node<'gc>>,
    export_id: &'gc Node<'gc>,
}

enum ComponentParameterKind<'gc> {
    Component(&'gc ComponentParameter<'gc>),
    Rest(&'gc RestElement<'gc>),
}

impl StripFlow {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn with_options(options: StripFlowOptions) -> Self {
        Self { options }
    }

    fn lower_component_declaration<'gc>(
        &self,
        gc: &'gc GCLock<'_, '_>,
        n: &'gc ComponentDeclaration<'gc>,
    ) -> LoweredComponentDeclaration<'gc> {
        let component_id = match n.id {
            Node::Identifier(id) => id,
            _ => unreachable!(),
        };

        let should_extract_ref = self.options.react_runtime_target == ReactRuntimeTarget::V18;
        let mut ref_param: Option<&'gc Node<'gc>> = None;
        let mut params_without_ref = Vec::new();

        for param in n.params.iter() {
            match param {
                Node::ComponentParameter(component_param) => {
                    let is_ref = should_extract_ref
                        && match component_param.name {
                            Node::Identifier(id) => gc.str(id.name) == "ref",
                            _ => false,
                        };
                    if is_ref {
                        ref_param = Some(component_param.local);
                    } else {
                        params_without_ref.push(ComponentParameterKind::Component(component_param));
                    }
                }
                Node::RestElement(rest) => {
                    params_without_ref.push(ComponentParameterKind::Rest(rest));
                }
                _ => unreachable!("Unexpected node in component params"),
            }
        }

        let props_param =
            self.build_component_props_parameter(gc, n, &params_without_ref, ref_param);

        let (function_id, forward_ref_declaration) = if ref_param.is_some() {
            let internal_id = Self::build_identifier(
                gc,
                format!("{}_withRef", gc.str(component_id.name)).as_str(),
                n.metadata.range,
            );
            (
                Some(internal_id),
                Some(self.build_forward_ref_declaration(gc, n, internal_id)),
            )
        } else {
            (Some(n.id), None)
        };

        let params = {
            let mut params = Vec::new();
            if let Some(props) = props_param {
                params.push(props);
            }
            if let Some(ref_param) = ref_param {
                params.push(ref_param);
            }
            NodeList::from_iter(gc, params)
        };

        let function_declaration = builder::FunctionDeclaration::build_template(
            gc,
            template::FunctionDeclaration {
                metadata: TemplateMetadata {
                    range: n.metadata.range,
                    ..Default::default()
                },
                id: function_id,
                params,
                body: n.body,
                type_parameters: None,
                return_type: None,
                predicate: None,
                generator: false,
                is_async: n.is_async,
            },
        );

        LoweredComponentDeclaration {
            function_declaration,
            forward_ref_declaration,
            export_id: n.id,
        }
    }

    fn build_component_props_parameter<'gc>(
        &self,
        gc: &'gc GCLock<'_, '_>,
        n: &'gc ComponentDeclaration<'gc>,
        params_without_ref: &[ComponentParameterKind<'gc>],
        ref_param: Option<&'gc Node<'gc>>,
    ) -> Option<&'gc Node<'gc>> {
        if params_without_ref.is_empty() {
            return ref_param.map(|_| self.build_empty_component_props_placeholder(gc, n));
        }

        if let [ComponentParameterKind::Rest(RestElement { argument, .. })] = params_without_ref {
            if matches!(argument, Node::Identifier(_)) {
                return Some(*argument);
            }
        }

        let mut props_properties = Vec::new();
        for param in params_without_ref {
            match param {
                ComponentParameterKind::Component(ComponentParameter {
                    metadata,
                    name,
                    local,
                    shorthand,
                }) => {
                    props_properties.push(builder::Property::build_template(
                        gc,
                        template::Property {
                            metadata: TemplateMetadata {
                                range: metadata.range,
                                ..Default::default()
                            },
                            kind: PropertyKind::Init,
                            computed: false,
                            method: false,
                            shorthand: *shorthand,
                            key: name,
                            value: local,
                        },
                    ));
                }
                ComponentParameterKind::Rest(RestElement { metadata, argument }) => {
                    match argument {
                        Node::ObjectPattern(object_pattern) => {
                            props_properties.extend(object_pattern.properties.iter());
                        }
                        _ => {
                            props_properties.push(builder::RestElement::build_template(
                                gc,
                                template::RestElement {
                                    metadata: TemplateMetadata {
                                        range: metadata.range,
                                        ..Default::default()
                                    },
                                    argument,
                                },
                            ));
                        }
                    }
                }
            }
        }

        if props_properties.is_empty() {
            return ref_param.map(|_| self.build_empty_component_props_placeholder(gc, n));
        }

        Some(builder::ObjectPattern::build_template(
            gc,
            template::ObjectPattern {
                metadata: TemplateMetadata {
                    range: n.metadata.range,
                    ..Default::default()
                },
                properties: NodeList::from_iter(gc, props_properties),
                type_annotation: None,
            },
        ))
    }

    fn build_empty_component_props_placeholder<'gc>(
        &self,
        gc: &'gc GCLock<'_, '_>,
        n: &'gc ComponentDeclaration<'gc>,
    ) -> &'gc Node<'gc> {
        Self::build_identifier(gc, "_$$empty_props_placeholder$$", n.metadata.range)
    }

    fn build_identifier<'gc>(
        gc: &'gc GCLock<'_, '_>,
        name: &str,
        range: SourceRange,
    ) -> &'gc Node<'gc> {
        builder::Identifier::build_template(
            gc,
            template::Identifier {
                metadata: TemplateMetadata {
                    range,
                    ..Default::default()
                },
                name: gc.atom(name),
                optional: false,
                type_annotation: None,
            },
        )
    }

    fn build_forward_ref_declaration<'gc>(
        &self,
        gc: &'gc GCLock<'_, '_>,
        n: &'gc ComponentDeclaration<'gc>,
        internal_id: &'gc Node<'gc>,
    ) -> &'gc Node<'gc> {
        builder::VariableDeclaration::build_template(
            gc,
            template::VariableDeclaration {
                metadata: TemplateMetadata {
                    range: n.metadata.range,
                    ..Default::default()
                },
                kind: VariableDeclarationKind::Const,
                declarations: NodeList::from_iter(
                    gc,
                    [builder::VariableDeclarator::build_template(
                        gc,
                        template::VariableDeclarator {
                            metadata: Default::default(),
                            id: n.id,
                            init: Some(builder::CallExpression::build_template(
                                gc,
                                template::CallExpression {
                                    metadata: Default::default(),
                                    type_arguments: None,
                                    callee: builder::MemberExpression::build_template(
                                        gc,
                                        template::MemberExpression {
                                            metadata: Default::default(),
                                            computed: false,
                                            object: Self::build_identifier(
                                                gc,
                                                "React",
                                                n.metadata.range,
                                            ),
                                            property: Self::build_identifier(
                                                gc,
                                                "forwardRef",
                                                n.metadata.range,
                                            ),
                                        },
                                    ),
                                    arguments: NodeList::from_iter(gc, [internal_id]),
                                },
                            )),
                        },
                    )],
                ),
            },
        )
    }

    fn build_named_export<'gc>(
        &self,
        gc: &'gc GCLock<'_, '_>,
        range: SourceRange,
        export_id: &'gc Node<'gc>,
    ) -> &'gc Node<'gc> {
        builder::ExportNamedDeclaration::build_template(
            gc,
            template::ExportNamedDeclaration {
                metadata: TemplateMetadata {
                    range,
                    ..Default::default()
                },
                declaration: None,
                specifiers: NodeList::from_iter(
                    gc,
                    [builder::ExportSpecifier::build_template(
                        gc,
                        template::ExportSpecifier {
                            metadata: TemplateMetadata {
                                range,
                                ..Default::default()
                            },
                            exported: export_id,
                            local: export_id,
                        },
                    )],
                ),
                source: None,
                export_kind: ExportKind::Value,
            },
        )
    }

    fn build_default_export<'gc>(
        &self,
        gc: &'gc GCLock<'_, '_>,
        range: SourceRange,
        declaration: &'gc Node<'gc>,
    ) -> &'gc Node<'gc> {
        builder::ExportDefaultDeclaration::build_template(
            gc,
            template::ExportDefaultDeclaration {
                metadata: TemplateMetadata {
                    range,
                    ..Default::default()
                },
                declaration,
            },
        )
    }
}

impl Pass for StripFlow {
    fn name(&self) -> &'static str {
        "Strip Flow"
    }
    fn description(&self) -> &'static str {
        "Strip Flow declarations"
    }

    fn run<'gc>(
        &mut self,
        gc: &'gc GCLock<'_, '_>,
        node: &'gc Node<'gc>,
    ) -> TransformResult<&'gc Node<'gc>> {
        VisitorMut::call(self, gc, node, None)
    }
}

impl<'gc> VisitorMut<'gc> for StripFlow {
    fn call(
        &mut self,
        gc: &'gc GCLock<'_, '_>,
        node: &'gc Node<'gc>,
        _parent: Option<Path<'gc>>,
    ) -> TransformResult<&'gc Node<'gc>> {
        match node {
            Node::TypeCastExpression(TypeCastExpression { expression, .. }) => {
                let expression = match self.call(gc, expression, None) {
                    TransformResult::Unchanged => *expression,
                    TransformResult::Changed(node) => node,
                    TransformResult::Removed | TransformResult::Expanded(_) => {
                        unreachable!("Expression replacements cannot be removed or expanded")
                    }
                };
                return node.replace_with_existing(expression, gc, self);
            }

            Node::Identifier(id) => {
                if id.type_annotation.is_some() || id.optional {
                    let mut builder = builder::Identifier::from_node(id);
                    builder.type_annotation(None);
                    builder.optional(false);
                    return node.replace_with_new(builder::Builder::Identifier(builder), gc, self);
                }
            }

            Node::ImportDeclaration(decl) => {
                if decl.import_kind != ImportKind::Value {
                    return TransformResult::Removed;
                }
            }
            Node::ImportSpecifier(spec) => {
                if spec.import_kind != ImportKind::Value {
                    return TransformResult::Removed;
                }
            }
            Node::ExportNamedDeclaration(ExportNamedDeclaration {
                metadata,
                declaration: Some(Node::ComponentDeclaration(component_declaration)),
                export_kind: ExportKind::Value,
                ..
            }) => {
                let lowered_component = self.lower_component_declaration(gc, component_declaration);
                if let Some(forward_ref_declaration) = lowered_component.forward_ref_declaration {
                    return node.replace_with_multiple(
                        vec![
                            builder::Builder::from_node(forward_ref_declaration),
                            builder::Builder::from_node(lowered_component.function_declaration),
                            builder::Builder::from_node(self.build_named_export(
                                gc,
                                metadata.range,
                                lowered_component.export_id,
                            )),
                        ],
                        gc,
                        self,
                    );
                }
                return node.replace_with_existing(
                    builder::ExportNamedDeclaration::build_template(
                        gc,
                        template::ExportNamedDeclaration {
                            metadata: TemplateMetadata {
                                range: metadata.range,
                                ..Default::default()
                            },
                            declaration: Some(lowered_component.function_declaration),
                            specifiers: NodeList::new(gc),
                            source: None,
                            export_kind: ExportKind::Value,
                        },
                    ),
                    gc,
                    self,
                );
            }
            Node::ExportNamedDeclaration(spec) => {
                if spec.export_kind != ExportKind::Value {
                    return TransformResult::Removed;
                }
            }
            Node::ExportAllDeclaration(spec) => {
                if spec.export_kind != ExportKind::Value {
                    return TransformResult::Removed;
                }
            }
            Node::InterfaceDeclaration { .. }
            | Node::TypeAlias { .. }
            | Node::OpaqueType { .. }
            | Node::DeclareTypeAlias { .. }
            | Node::DeclareOpaqueType { .. }
            | Node::DeclareInterface { .. }
            | Node::DeclareClass { .. }
            | Node::DeclareFunction { .. }
            | Node::DeclareHook { .. }
            | Node::DeclareVariable { .. }
            | Node::DeclareComponent { .. }
            | Node::DeclareEnum { .. }
            | Node::DeclareExportDeclaration { .. }
            | Node::DeclareExportAllDeclaration { .. }
            | Node::DeclareModule { .. }
            | Node::DeclareModuleExports { .. } => return TransformResult::Removed,

            Node::FunctionDeclaration(n) => {
                let mut builder = builder::FunctionDeclaration::from_node(n);
                builder.params(NodeList::from_iter(
                    gc,
                    n.params.iter().filter(|p| match p {
                        Node::Identifier(Identifier { name, .. }) => gc.str(*name) != "this",
                        _ => true,
                    }),
                ));
                builder.type_parameters(None);
                builder.return_type(None);
                builder.predicate(None);
                return node.replace_with_new(
                    builder::Builder::FunctionDeclaration(builder),
                    gc,
                    self,
                );
            }
            Node::FunctionExpression(n) => {
                let mut builder = builder::FunctionExpression::from_node(n);
                builder.params(NodeList::from_iter(
                    gc,
                    n.params.iter().filter(|p| match p {
                        Node::Identifier(Identifier { name, .. }) => gc.str(*name) != "this",
                        _ => true,
                    }),
                ));
                builder.type_parameters(None);
                builder.return_type(None);
                builder.predicate(None);
                return node.replace_with_new(
                    builder::Builder::FunctionExpression(builder),
                    gc,
                    self,
                );
            }
            Node::ArrowFunctionExpression(n) => {
                let mut builder = builder::ArrowFunctionExpression::from_node(n);
                builder.type_parameters(None);
                builder.return_type(None);
                builder.predicate(None);
                return node.replace_with_new(
                    builder::Builder::ArrowFunctionExpression(builder),
                    gc,
                    self,
                );
            }

            Node::ClassDeclaration(n) => {
                let mut builder = builder::ClassDeclaration::from_node(n);
                builder.implements(NodeList::new(gc));
                builder.super_type_arguments(None);
                builder.type_parameters(None);
                return node.replace_with_new(
                    builder::Builder::ClassDeclaration(builder),
                    gc,
                    self,
                );
            }
            Node::ClassExpression(n) => {
                let mut builder = builder::ClassExpression::from_node(n);
                builder.implements(NodeList::new(gc));
                builder.super_type_arguments(None);
                builder.type_parameters(None);
                return node.replace_with_new(builder::Builder::ClassExpression(builder), gc, self);
            }

            Node::ClassProperty(n) => {
                if n.value.is_none() || n.declare {
                    return TransformResult::Removed;
                }

                let mut builder = builder::ClassProperty::from_node(n);
                builder.declare(false);
                builder.optional(false);
                builder.type_annotation(None);
                builder.variance(None);
                return node.replace_with_new(builder::Builder::ClassProperty(builder), gc, self);
            }
            Node::ClassPrivateProperty(n) => {
                if n.declare {
                    return TransformResult::Removed;
                }

                let mut builder = builder::ClassPrivateProperty::from_node(n);
                builder.declare(false);
                builder.optional(false);
                builder.type_annotation(None);
                builder.variance(None);
                return node.replace_with_new(
                    builder::Builder::ClassPrivateProperty(builder),
                    gc,
                    self,
                );
            }

            Node::CallExpression(n) => {
                let mut builder = builder::CallExpression::from_node(n);
                builder.type_arguments(None);
                return node.replace_with_new(builder::Builder::CallExpression(builder), gc, self);
            }
            Node::NewExpression(n) => {
                let mut builder = builder::NewExpression::from_node(n);
                builder.type_arguments(None);
                return node.replace_with_new(builder::Builder::NewExpression(builder), gc, self);
            }
            Node::OptionalCallExpression(n) => {
                let mut builder = builder::OptionalCallExpression::from_node(n);
                builder.type_arguments(None);
                return node.replace_with_new(
                    builder::Builder::OptionalCallExpression(builder),
                    gc,
                    self,
                );
            }
            Node::ObjectPattern(n) => {
                if n.type_annotation.is_some() {
                    let mut builder = builder::ObjectPattern::from_node(n);
                    builder.type_annotation(None);
                    return node.replace_with_new(
                        builder::Builder::ObjectPattern(builder),
                        gc,
                        self,
                    );
                }
            }
            Node::ArrayPattern(n) => {
                if n.type_annotation.is_some() {
                    let mut builder = builder::ArrayPattern::from_node(n);
                    builder.type_annotation(None);
                    return node.replace_with_new(
                        builder::Builder::ArrayPattern(builder),
                        gc,
                        self,
                    );
                }
            }
            Node::TSTypeAssertion(TSTypeAssertion { expression, .. })
            | Node::TSAsExpression(TSAsExpression { expression, .. })
            | Node::AsExpression(AsExpression { expression, .. })
            | Node::AsConstExpression(AsConstExpression { expression, .. }) => {
                let expression = match self.call(gc, expression, None) {
                    TransformResult::Unchanged => *expression,
                    TransformResult::Changed(node) => node,
                    TransformResult::Removed | TransformResult::Expanded(_) => {
                        unreachable!("Expression replacements cannot be removed or expanded")
                    }
                };
                return node.replace_with_existing(expression, gc, self);
            }
            Node::ComponentParameter(ComponentParameter { local, .. }) => {
                let local = match self.call(gc, local, None) {
                    TransformResult::Unchanged => *local,
                    TransformResult::Changed(node) => node,
                    TransformResult::Removed | TransformResult::Expanded(_) => {
                        unreachable!("Parameter replacements cannot be removed or expanded")
                    }
                };
                return node.replace_with_existing(local, gc, self);
            }
            Node::ExportDefaultDeclaration(ExportDefaultDeclaration {
                metadata,
                declaration: Node::ComponentDeclaration(component_declaration),
            }) => {
                let lowered_component = self.lower_component_declaration(gc, component_declaration);
                if let Some(forward_ref_declaration) = lowered_component.forward_ref_declaration {
                    return node.replace_with_multiple(
                        vec![
                            builder::Builder::from_node(forward_ref_declaration),
                            builder::Builder::from_node(lowered_component.function_declaration),
                            builder::Builder::from_node(self.build_default_export(
                                gc,
                                metadata.range,
                                lowered_component.export_id,
                            )),
                        ],
                        gc,
                        self,
                    );
                }
                return node.replace_with_existing(
                    self.build_default_export(
                        gc,
                        metadata.range,
                        lowered_component.function_declaration,
                    ),
                    gc,
                    self,
                );
            }
            Node::ComponentDeclaration(n) => {
                let lowered_component = self.lower_component_declaration(gc, n);
                if let Some(forward_ref_declaration) = lowered_component.forward_ref_declaration {
                    return node.replace_with_multiple(
                        vec![
                            builder::Builder::from_node(forward_ref_declaration),
                            builder::Builder::from_node(lowered_component.function_declaration),
                        ],
                        gc,
                        self,
                    );
                }
                return node.replace_with_existing(
                    lowered_component.function_declaration,
                    gc,
                    self,
                );
            }
            Node::HookDeclaration(n) => {
                return node.replace_with_new(
                    builder::Builder::FunctionDeclaration(
                        builder::FunctionDeclaration::from_template(
                            template::FunctionDeclaration {
                                metadata: TemplateMetadata {
                                    range: n.metadata.range,
                                    ..Default::default()
                                },
                                id: Some(n.id),
                                params: n.params,
                                body: n.body,
                                type_parameters: None,
                                return_type: None,
                                predicate: None,
                                generator: false,
                                is_async: n.is_async,
                            },
                        ),
                    ),
                    gc,
                    self,
                );
            }

            Node::EnumDeclaration(n) => {
                return node.replace_with_existing(transform_enum(gc, n), gc, self);
            }
            Node::ExportDefaultDeclaration(ExportDefaultDeclaration {
                metadata,
                declaration: Node::EnumDeclaration(e),
            }) => {
                return node.replace_with_multiple(
                    vec![
                        builder::Builder::from_node(transform_enum(gc, e)),
                        builder::Builder::ExportDefaultDeclaration(
                            builder::ExportDefaultDeclaration::from_template(
                                template::ExportDefaultDeclaration {
                                    metadata: TemplateMetadata {
                                        range: metadata.range,
                                        ..Default::default()
                                    },
                                    declaration: e.id,
                                },
                            ),
                        ),
                    ],
                    gc,
                    self,
                );
            }
            _ => {}
        }
        node.visit_children_mut(gc, self)
    }
}

fn transform_enum<'gc>(
    gc: &'gc GCLock<'_, '_>,
    n: &'gc EnumDeclaration<'gc>,
) -> &'gc Node<'gc> {
    let (method, args) = match n.body {
        Node::EnumStringBody(body)
            if matches!(body.members.head(), Some(Node::EnumDefaultedMember(_))) =>
        {
            let elements = body.members.iter().map(|m| match m {
                Node::EnumDefaultedMember(m) => builder::StringLiteral::build_template(
                    gc,
                    template::StringLiteral {
                        metadata: Default::default(),
                        value: gc.atom_u16(match m.id {
                            Node::Identifier(id) => {
                                gc.str(id.name).encode_utf16().collect::<Vec<u16>>()
                            }
                            _ => unreachable!(),
                        }),
                    },
                ),
                _ => unreachable!(),
            });

            (
                Some("Mirrored"),
                NodeList::from_iter(
                    gc,
                    [builder::ArrayExpression::build_template(
                        gc,
                        template::ArrayExpression {
                            metadata: Default::default(),
                            trailing_comma: false,
                            elements: NodeList::from_iter(gc, elements),
                        },
                    )],
                ),
            )
        }
        Node::EnumSymbolBody(EnumSymbolBody { members, .. })
        | Node::EnumStringBody(EnumStringBody { members, .. })
        | Node::EnumBooleanBody(EnumBooleanBody { members, .. })
        | Node::EnumNumberBody(EnumNumberBody { members, .. }) => (
            None,
            NodeList::from_iter(
                gc,
                [builder::ObjectExpression::build_template(
                    gc,
                    template::ObjectExpression {
                        metadata: Default::default(),
                        properties: NodeList::from_iter(
                            gc,
                            members.iter().map(|m| match m {
                                Node::EnumStringMember(EnumStringMember { metadata, id, init })
                                | Node::EnumNumberMember(EnumNumberMember { metadata, id, init })
                                | Node::EnumBooleanMember(EnumBooleanMember {
                                    metadata,
                                    id,
                                    init,
                                }) => builder::Property::build_template(
                                    gc,
                                    template::Property {
                                        metadata: TemplateMetadata {
                                            range: metadata.range,
                                            ..Default::default()
                                        },
                                        kind: PropertyKind::Init,
                                        computed: false,
                                        method: false,
                                        shorthand: false,
                                        key: id,
                                        value: init,
                                    },
                                ),

                                // Has to be contained in a EnumSymbolBody
                                Node::EnumDefaultedMember(m) => builder::Property::build_template(
                                    gc,
                                    template::Property {
                                        metadata: TemplateMetadata {
                                            range: m.metadata.range,
                                            ..Default::default()
                                        },
                                        kind: PropertyKind::Init,
                                        computed: false,
                                        method: false,
                                        shorthand: false,
                                        key: m.id,
                                        value: builder::CallExpression::build_template(
                                            gc,
                                            template::CallExpression {
                                                metadata: Default::default(),
                                                type_arguments: None,
                                                callee: builder::Identifier::build_template(
                                                    gc,
                                                    template::Identifier {
                                                        metadata: Default::default(),
                                                        name: gc.atom("Symbol"),
                                                        optional: false,
                                                        type_annotation: None,
                                                    },
                                                ),
                                                arguments: NodeList::from_iter(
                                                    gc,
                                                    [builder::StringLiteral::build_template(
                                                        gc,
                                                        template::StringLiteral {
                                                            metadata: Default::default(),
                                                            value: gc.atom_u16(match m.id {
                                                                Node::Identifier(id) => gc
                                                                    .str(id.name)
                                                                    .encode_utf16()
                                                                    .collect::<Vec<u16>>(),
                                                                _ => unreachable!(),
                                                            }),
                                                        },
                                                    )],
                                                ),
                                            },
                                        ),
                                    },
                                ),
                                _ => unreachable!(),
                            }),
                        ),
                    },
                )],
            ),
        ),
        _ => unreachable!(),
    };
    let runtime = builder::CallExpression::build_template(
        gc,
        template::CallExpression {
            metadata: Default::default(),
            type_arguments: None,
            callee: builder::Identifier::build_template(
                gc,
                template::Identifier {
                    metadata: Default::default(),
                    name: gc.atom("require"),
                    optional: false,
                    type_annotation: None,
                },
            ),
            arguments: NodeList::from_iter(
                gc,
                [builder::StringLiteral::build_template(
                    gc,
                    template::StringLiteral {
                        metadata: Default::default(),
                        value: gc.atom_u16("flow-enums-runtime".encode_utf16().collect::<Vec<u16>>()),
                    },
                )],
            ),
        },
    );
    return builder::VariableDeclaration::build_template(
        gc,
        template::VariableDeclaration {
            metadata: TemplateMetadata {
                range: n.metadata.range,
                ..Default::default()
            },
            kind: VariableDeclarationKind::Const,
            declarations: NodeList::from_iter(
                gc,
                [builder::VariableDeclarator::build_template(
                    gc,
                    template::VariableDeclarator {
                        metadata: Default::default(),
                        id: n.id,
                        init: Some(builder::CallExpression::build_template(
                            gc,
                            template::CallExpression {
                                metadata: Default::default(),
                                type_arguments: None,
                                callee: match method {
                                    Some(m) => builder::MemberExpression::build_template(
                                        gc,
                                        template::MemberExpression {
                                            metadata: Default::default(),
                                            computed: false,
                                            object: runtime,
                                            property: builder::Identifier::build_template(
                                                gc,
                                                template::Identifier {
                                                    metadata: Default::default(),
                                                    name: gc.atom(m),
                                                    optional: false,
                                                    type_annotation: None,
                                                },
                                            ),
                                        },
                                    ),
                                    None => runtime,
                                },
                                arguments: args,
                            },
                        )),
                    },
                )],
            ),
        },
    );
}
