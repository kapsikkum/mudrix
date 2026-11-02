//! The Kotlin API for Android: kotlinx.serialization types and a class per object, calling
//! through the app's `Runtime`.

use std::{collections::BTreeMap, fmt::Write};

use specta::datatype::{DataType, Enum, Fields, NamedReferenceType, Primitive, Reference};

use super::{
    collect, doc_lines, is_json, literal, native, pascal, shape, unit_value, variants, Api, Native,
    Route, Shape,
};

const KEYWORDS: &[&str] = &[
    "as",
    "break",
    "class",
    "continue",
    "do",
    "else",
    "false",
    "for",
    "fun",
    "if",
    "in",
    "interface",
    "is",
    "null",
    "object",
    "package",
    "return",
    "super",
    "this",
    "throw",
    "true",
    "try",
    "typealias",
    "typeof",
    "val",
    "var",
    "when",
    "while",
];

fn ident(name: &str) -> String {
    if KEYWORDS.contains(&name) {
        format!("`{name}`")
    } else {
        name.to_string()
    }
}

/// A Kotlin string literal's contents
fn string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('$', "\\$")
}

fn kdoc(docs: &[&str], indent: &str) -> String {
    match docs {
        [] => String::new(),
        [line] => format!("{indent}/**{} */\n", line.replace("*/", "*&#47;")),
        lines => {
            let mut out = format!("{indent}/**\n");
            for line in lines {
                let _ = writeln!(out, "{indent} *{}", line.replace("*/", "*&#47;"));
            }
            let _ = writeln!(out, "{indent} */");
            out
        }
    }
}

struct Kotlin<'a> {
    api: &'a Api,
}

impl Kotlin<'_> {
    fn ty(&self, dt: &DataType, nested: &str, decls: &mut Vec<String>, indent: &str) -> String {
        match dt {
            DataType::Primitive(p) => match p {
                Primitive::bool => "Boolean".into(),
                Primitive::str | Primitive::char => "String".into(),
                Primitive::f16 | Primitive::f32 | Primitive::f64 | Primitive::f128 => {
                    "Double".into()
                }
                _ => "Long".into(),
            },
            DataType::List(list) => format!("List<{}>", self.ty(&list.ty, nested, decls, indent)),
            DataType::Map(map) => format!(
                "Map<{}, {}>",
                self.ty(map.key_ty(), nested, decls, indent),
                self.ty(map.value_ty(), nested, decls, indent)
            ),
            DataType::Nullable(inner) => {
                let inner = self.ty(inner, nested, decls, indent);
                if inner.ends_with('?') {
                    inner
                } else {
                    format!("{inner}?")
                }
            }
            DataType::Struct(_) | DataType::Enum(_) => {
                if literal(dt).is_some() {
                    return "String".into();
                }
                decls.push(self.decl(nested, dt, &[], &[], indent));
                nested.to_string()
            }
            DataType::Tuple(t) if t.elements.is_empty() => "Empty".into(),
            DataType::Tuple(t) => {
                let types: Vec<String> = t
                    .elements
                    .iter()
                    .map(|e| self.ty(e, nested, decls, indent))
                    .collect();
                if types.windows(2).all(|pair| pair[0] == pair[1]) {
                    format!("List<{}>", types[0])
                } else {
                    "List<JsonElement>".into()
                }
            }
            DataType::Intersection(_) => "JsonElement".into(),
            DataType::Generic(g) => g.name().to_string(),
            DataType::Reference(Reference::Named(r)) => match &r.inner {
                NamedReferenceType::Inline { dt, .. } => self.ty(dt, nested, decls, indent),
                NamedReferenceType::Recursive(_) => self.api.named(r).name.to_string(),
                NamedReferenceType::Reference { generics, .. } => {
                    let named = self.api.named(r);
                    if is_json(named) {
                        return "JsonElement".into();
                    }
                    if generics.is_empty() {
                        named.name.to_string()
                    } else {
                        let args: Vec<String> = generics
                            .iter()
                            .map(|(_, g)| self.ty(g, nested, decls, indent))
                            .collect();
                        format!("{}<{}>", named.name, args.join(", "))
                    }
                }
            },
            DataType::Reference(Reference::Opaque(_)) => {
                match native(dt).expect("a known opaque type") {
                    Native::Alias { name, .. } => (*name).into(),
                    Native::Object(class) => (*class).into(),
                    Native::Listener(_) => "Listener".into(),
                    Native::Bytes => "Bytes".into(),
                    Native::Subscription => "Subscription".into(),
                    Native::RoomListSubscription => "RoomListSubscription".into(),
                }
            }
        }
    }

    /// A declaration at `indent`; nested types go one level deeper
    fn decl(
        &self,
        name: &str,
        dt: &DataType,
        docs: &[&str],
        generics: &[String],
        indent: &str,
    ) -> String {
        let generic_list = if generics.is_empty() {
            String::new()
        } else {
            format!("<{}>", generics.join(", "))
        };
        let mut out = kdoc(docs, indent);
        match dt {
            DataType::Enum(e) => match shape(e) {
                Shape::Strings(values) => {
                    let _ = writeln!(out, "{indent}@Serializable\n{indent}enum class {name} {{");
                    for value in values {
                        let _ = writeln!(
                            out,
                            "{indent}    @SerialName(\"{}\") {},",
                            string(value),
                            ident(value)
                        );
                    }
                    let _ = writeln!(out, "{indent}}}");
                }
                shape => out.push_str(&self.union(name, e, shape, generics, indent)),
            },
            DataType::Struct(s) => match &s.fields {
                Fields::Named(_) => {
                    out.push_str(&self.record(name, &s.fields, None, &generic_list, "", indent))
                }
                Fields::Unnamed(u) if u.fields.len() == 1 => {
                    let mut nested = Vec::new();
                    let ty = u.fields[0]
                        .ty
                        .as_ref()
                        .map(|t| self.ty(t, &format!("{name}Value"), &mut nested, indent))
                        .unwrap_or("Empty".into());
                    let _ = writeln!(out, "{indent}typealias {name}{generic_list} = {ty}");
                    nested.iter().for_each(|n| out.push_str(n));
                }
                _ => {
                    let _ = writeln!(out, "{indent}typealias {name} = JsonElement");
                }
            },
            other => {
                let mut nested = Vec::new();
                let ty = self.ty(other, &format!("{name}Value"), &mut nested, indent);
                let _ = writeln!(out, "{indent}typealias {name}{generic_list} = {ty}");
                nested.iter().for_each(|n| out.push_str(n));
            }
        }
        out
    }

    /// A data class (or an object when it has no fields), optionally a case of `parent`
    fn record(
        &self,
        name: &str,
        fields: &Fields,
        skip: Option<&str>,
        generics: &str,
        parent: &str,
        indent: &str,
    ) -> String {
        let Fields::Named(named) = fields else {
            return String::new();
        };
        let inner = format!("{indent}    ");
        let mut nested = Vec::new();
        let mut params = String::new();
        for (key, field) in &named.fields {
            let Some(ty) = &field.ty else { continue };
            if Some(key.as_ref()) == skip {
                continue;
            }
            let mut kotlin_ty = self.ty(ty, &pascal(key), &mut nested, &inner);
            if field.optional && !kotlin_ty.ends_with('?') {
                kotlin_ty.push('?');
            }
            let default = if kotlin_ty.ends_with('?') {
                " = null"
            } else {
                ""
            };
            params.push_str(&kdoc(&doc_lines(&field.docs), &inner));
            let _ = writeln!(params, "{inner}val {}: {kotlin_ty}{default},", ident(key));
        }
        let supertype = if parent.is_empty() {
            String::new()
        } else {
            format!(" : {parent}")
        };
        let mut out = String::new();
        if params.is_empty() {
            let _ = writeln!(
                out,
                "{indent}@Serializable\n{indent}data object {name}{supertype}"
            );
            return out;
        }
        let _ = write!(
            out,
            "{indent}@Serializable\n{indent}data class {name}{generics}(\n{params}{indent}){supertype}"
        );
        if nested.is_empty() {
            out.push('\n');
        } else {
            out.push_str(" {\n");
            nested.iter().for_each(|n| out.push_str(n));
            let _ = writeln!(out, "{indent}}}");
        }
        out
    }

    /// A sealed interface with a case per variant, read and written through JSON by hand: by
    /// its tag field, or (untagged) by trying each case in order
    fn union(
        &self,
        name: &str,
        e: &Enum,
        shape: Shape,
        generics: &[String],
        indent: &str,
    ) -> String {
        let inner = format!("{indent}    ");
        // Generic cases carry the parameters, and the serializer gets one serializer per parameter
        let (generic, parent, empty_parent, serializers) = if generics.is_empty() {
            (
                String::new(),
                name.to_string(),
                name.to_string(),
                String::new(),
            )
        } else {
            let list = generics.join(", ");
            let nothing = vec!["Nothing"; generics.len()].join(", ");
            let serializers = (0..generics.len())
                .map(|i| format!("s{i}"))
                .collect::<Vec<_>>()
                .join(", ");
            (
                format!("<{list}>"),
                format!("{name}<{list}>"),
                format!("{name}<{nothing}>"),
                serializers,
            )
        };
        assert!(
            generics.is_empty() || matches!(shape, Shape::Tagged(_)),
            "{name}: only tagged unions can be generic in Kotlin"
        );
        let body = format!("{inner}        ");
        let mut cases = String::new();
        let mut read = String::new();
        let mut write = String::new();
        let tag = match shape {
            Shape::Tagged(tag) => Some(tag),
            _ => None,
        };
        for (variant, v) in variants(e) {
            let case = pascal(variant);
            cases.push_str(&kdoc(&doc_lines(&v.docs), &inner));
            if let Some(tag) = tag {
                let Fields::Named(fields) = &v.fields else {
                    continue;
                };
                let value = string(
                    fields
                        .fields
                        .iter()
                        .find(|(k, _)| k == tag)
                        .and_then(|(_, f)| f.ty.as_ref().and_then(literal))
                        .unwrap_or(variant),
                );
                let has_payload = fields
                    .fields
                    .iter()
                    .any(|(k, f)| k != tag && f.ty.is_some());
                if has_payload {
                    cases.push_str(&self.record(
                        &case,
                        &v.fields,
                        Some(tag),
                        &generic,
                        &parent,
                        &inner,
                    ));
                    let _ = writeln!(
                        read,
                        "{body}\"{value}\" -> CoreJson.decodeFromJsonElement({case}.serializer({serializers}), json)"
                    );
                    let cast = if generic.is_empty() {
                        String::new()
                    } else {
                        format!(" as {case}{generic}")
                    };
                    let _ = writeln!(
                        write,
                        "{body}is {case}{star} -> tagged(CoreJson.encodeToJsonElement({case}.serializer({serializers}), value{cast}), \"{tag}\", \"{value}\")",
                        star = if generic.is_empty() { String::new() } else { format!("<{}>", vec!["*"; generics.len()].join(", ")) }
                    );
                } else {
                    let _ = writeln!(cases, "{inner}data object {case} : {empty_parent}");
                    let _ = writeln!(read, "{body}\"{value}\" -> {case}");
                    let _ = writeln!(
                        write,
                        "{body}{case} -> tagged(JsonObject(emptyMap()), \"{tag}\", \"{value}\")"
                    );
                }
                continue;
            }
            if let Some(value) = unit_value(variant, v) {
                let value = string(value);
                let _ = writeln!(cases, "{inner}data object {case} : {name}");
                let _ = writeln!(
                    read,
                    "{body}if (json is JsonPrimitive && json.isString && json.content == \"{value}\") return {case}"
                );
                let _ = writeln!(write, "{body}{case} -> JsonPrimitive(\"{value}\")");
                continue;
            }
            match &v.fields {
                Fields::Unit => unreachable!("unit variants are strings"),
                Fields::Unnamed(u) => {
                    let mut more = Vec::new();
                    let payload = u
                        .fields
                        .first()
                        .and_then(|f| f.ty.as_ref())
                        .map(|t| self.ty(t, &format!("{case}Value"), &mut more, &inner))
                        .unwrap_or("Empty".into());
                    more.iter().for_each(|m| cases.push_str(m));
                    let _ = writeln!(
                        cases,
                        "{inner}data class {case}(val value: {payload}) : {name}"
                    );
                    let _ = writeln!(
                        read,
                        "{body}runCatching {{ return {case}(CoreJson.decodeFromJsonElement<{payload}>(json)) }}"
                    );
                    let _ = writeln!(
                        write,
                        "{body}is {case} -> CoreJson.encodeToJsonElement<{payload}>(value.value)"
                    );
                }
                Fields::Named(_) => {
                    cases.push_str(&self.record(&case, &v.fields, None, "", name, &inner));
                    let _ = writeln!(
                        read,
                        "{body}runCatching {{ return CoreJson.decodeFromJsonElement({case}.serializer(), json) }}"
                    );
                    let _ = writeln!(
                        write,
                        "{body}is {case} -> CoreJson.encodeToJsonElement({case}.serializer(), value)"
                    );
                }
            }
        }
        let mut out = String::new();
        let variance = if generics.is_empty() {
            String::new()
        } else {
            format!(
                "<{}>",
                generics
                    .iter()
                    .map(|g| format!("out {g}"))
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        };
        let _ = writeln!(
            out,
            "{indent}@Serializable(with = {name}.Serializer::class)\n{indent}sealed interface {name}{variance} {{"
        );
        out.push_str(&cases);
        if generics.is_empty() {
            let _ = writeln!(
                out,
                "\n{inner}object Serializer : JsonUnionSerializer<{name}>(\"{name}\") {{"
            );
        } else {
            let params = generics
                .iter()
                .enumerate()
                .map(|(i, g)| format!("private val s{i}: KSerializer<{g}>"))
                .collect::<Vec<_>>()
                .join(", ");
            let _ = writeln!(
                out,
                "\n{inner}@Suppress(\"UNCHECKED_CAST\")\n{inner}class Serializer{generic}({params}) : JsonUnionSerializer<{parent}>(\"{name}\") {{"
            );
        }
        match tag {
            Some(tag) => {
                let _ = writeln!(
                    out,
                    "{inner}    override fun read(json: JsonElement): {parent} = when (val tag = json.jsonObject[\"{tag}\"]?.jsonPrimitive?.content) {{"
                );
                out.push_str(&read);
                let _ = writeln!(
                    out,
                    "{inner}        else -> throw SerializationException(\"Unknown {name} $tag\")\n{inner}    }}"
                );
            }
            None => {
                let _ = writeln!(
                    out,
                    "{inner}    override fun read(json: JsonElement): {name} {{"
                );
                out.push_str(&read);
                let _ = writeln!(
                    out,
                    "{inner}        throw SerializationException(\"No {name} matches $json\")\n{inner}    }}"
                );
            }
        }
        let _ = writeln!(
            out,
            "\n{inner}    override fun write(value: {parent}): JsonElement = when (value) {{"
        );
        out.push_str(&write);
        let _ = writeln!(out, "{inner}    }}\n{inner}}}\n{indent}}}");
        out
    }

    fn method(&self, class: &str, route: &Route) -> String {
        let mut nested = Vec::new();
        let mut params = Vec::new();
        let mut args = Vec::new();
        let required = route
            .params
            .iter()
            .rposition(|p| !p.optional)
            .map_or(0, |i| i + 1);
        let indent = if route.kind == "bare" {
            "        "
        } else {
            "    "
        };
        for (i, p) in route.params.iter().enumerate() {
            let name = ident(&p.name);
            if let Some(Native::Listener(payload)) = native(&p.ty) {
                let payload = self.ty(payload, &pascal(&p.name), &mut nested, indent);
                if payload == "Empty" {
                    params.push(format!("{name}: () -> Unit"));
                    args.push(format!("Arg.listener<Empty> {{ {name}() }}"));
                } else {
                    params.push(format!("{name}: ({payload}) -> Unit"));
                    args.push(format!("Arg.listener<{payload}>({name})"));
                }
                continue;
            }
            let ty = self.ty(&p.ty, &pascal(&p.name), &mut nested, indent);
            let default = if i >= required { " = null" } else { "" };
            params.push(format!("{name}: {ty}{default}"));
            args.push(if native(&p.ty) == Some(&Native::Bytes) {
                format!("Arg.bytes({name})")
            } else {
                format!("Arg.value<{ty}>({name})")
            });
        }
        let returns = self.ty(&route.returns, &pascal(route.method), &mut nested, indent);
        assert!(
            nested.is_empty(),
            "{class}.{}: inline types in a signature need a name",
            route.method
        );
        let (params, args) = (params.join(", "), args.join(", "));
        let method = format!("{class}.{}", route.method);
        let name = ident(route.method);
        let mut out = kdoc(&route.docs, indent);
        let _ = match route.kind {
            "bare" if returns == "Empty" => writeln!(
                out,
                "{indent}suspend fun {name}({params}) {{\n{indent}    Runtime.callUnit(\"{method}\", null, listOf({args}))\n{indent}}}"
            ),
            "bare" => writeln!(
                out,
                "{indent}suspend fun {name}({params}): {returns} =\n{indent}    Runtime.call(\"{method}\", null, listOf({args}))"
            ),
            "call" if returns == "Empty" => writeln!(
                out,
                "{indent}suspend fun {name}({params}) {{\n{indent}    Runtime.callUnit(\"{method}\", handle, listOf({args}))\n{indent}}}"
            ),
            "call" => writeln!(
                out,
                "{indent}suspend fun {name}({params}): {returns} =\n{indent}    Runtime.call(\"{method}\", handle, listOf({args}))"
            ),
            "prop" => writeln!(
                out,
                "{indent}val {name}: {returns}\n{indent}    get() = prop(\"{}\")",
                route.method
            ),
            _ => writeln!(
                out,
                "{indent}fun {name}({params}): {returns} =\n{indent}    Runtime.watch(\"{method}\", handle, listOf({args}), ::{returns})"
            ),
        };
        out
    }
}

pub fn kotlin() -> String {
    let api = collect();
    let kt = Kotlin { api: &api };
    let mut decls: BTreeMap<String, String> = BTreeMap::new();
    for (name, (docs, _, swift)) in api.aliases() {
        let ty = if swift == "JSONValue" {
            "JsonElement"
        } else {
            swift
        };
        decls.insert(
            name.into(),
            format!("{}typealias {name} = {ty}\n", kdoc(&doc_lines(docs), "")),
        );
    }
    for named in api.declared() {
        let generics: Vec<String> = named.generics.iter().map(|g| g.name.to_string()).collect();
        let dt = named.ty.as_ref().expect("declared types have a definition");
        decls.insert(
            named.name.to_string(),
            kt.decl(&named.name, dt, &doc_lines(&named.docs), &generics, ""),
        );
    }

    let mut out = String::from(
        "// @generated by `npm run core:types` from crates/core/src/rpc. Don't edit.\n\
         @file:Suppress(\"unused\", \"RedundantVisibilityModifier\", \"ClassName\", \"EnumEntryName\", \"PropertyName\")\n\n\
         package org.wizardchat.core\n\n\
         import kotlinx.serialization.KSerializer\n\
         import kotlinx.serialization.SerialName\n\
         import kotlinx.serialization.Serializable\n\
         import kotlinx.serialization.SerializationException\n\
         import kotlinx.serialization.json.JsonElement\n\
         import kotlinx.serialization.json.JsonObject\n\
         import kotlinx.serialization.json.JsonPrimitive\n\
         import kotlinx.serialization.json.decodeFromJsonElement\n\
         import kotlinx.serialization.json.encodeToJsonElement\n\
         import kotlinx.serialization.json.jsonObject\n\
         import kotlinx.serialization.json.jsonPrimitive\n\n",
    );
    for decl in decls.values() {
        out.push_str(decl);
        out.push('\n');
    }
    for class in api.classes() {
        let routes: Vec<&Route> = api.routes.iter().filter(|r| r.class == class).collect();
        let _ = writeln!(
            out,
            "@Serializable(with = {class}.Serializer::class)\nclass {class}(handle: Long, props: JsonObject) : Remote(handle, props) {{"
        );
        let _ = writeln!(
            out,
            "    object Serializer : RemoteSerializer<{class}>(\"{class}\", ::{class})"
        );
        let statics: Vec<&&Route> = routes.iter().filter(|r| r.kind == "bare").collect();
        if !statics.is_empty() {
            out.push_str("\n    companion object {\n");
            for (i, route) in statics.iter().enumerate() {
                if i > 0 {
                    out.push('\n');
                }
                if route.method == "new" {
                    let _ = writeln!(
                        out,
                        "        suspend fun create(): {class} =\n            Runtime.call(\"{class}.new\", null, listOf())"
                    );
                    continue;
                }
                out.push_str(&kt.method(class, route));
            }
            out.push_str("    }\n");
        }
        for route in routes.iter().filter(|r| r.kind != "bare") {
            out.push('\n');
            out.push_str(&kt.method(class, route));
        }
        out.push_str("}\n\n");
    }
    out
}
