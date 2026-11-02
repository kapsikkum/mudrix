//! Writes the app APIs from the method declarations: the TypeScript module for the web app, the
//! Swift file for iOS and the Kotlin file for Android. Each gets every type the methods use
//! (reflected with specta, with serde's attributes applied) and a class per object whose methods
//! call through the app's runtime.

use std::{borrow::Cow, collections::BTreeMap, fmt::Write};

use specta::{
    datatype::{
        DataType, Enum, Fields, NamedDataType, NamedReference, NamedReferenceType, Primitive,
        Reference, Variant,
    },
    Format, Type,
};

use super::{Bytes, Handle, Listener, Obj, RoomListSubscription, RpcObject, Subscription};

mod kotlin;
pub use kotlin::kotlin;

pub struct Route {
    pub class: &'static str,
    pub method: &'static str,
    pub kind: &'static str,
    pub docs: Vec<&'static str>,
    pub params: Vec<Param>,
    pub returns: DataType,
}

pub struct Param {
    pub name: String,
    pub ty: DataType,
    pub optional: bool,
}

/// Types the generators render themselves instead of reflecting them
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Native {
    Alias {
        name: &'static str,
        docs: &'static str,
        ts: &'static str,
        swift: &'static str,
    },
    Object(&'static str),
    Listener(Box<DataType>),
    Bytes,
    Subscription,
    RoomListSubscription,
}

impl From<Native> for DataType {
    fn from(native: Native) -> Self {
        DataType::Reference(Reference::opaque(native))
    }
}

fn native(dt: &DataType) -> Option<&Native> {
    match dt {
        DataType::Reference(Reference::Opaque(reference)) => reference.downcast_ref::<Native>(),
        _ => None,
    }
}

impl Type for Bytes {
    fn definition(_: &mut specta::Types) -> DataType {
        Native::Bytes.into()
    }
}

impl Type for Subscription {
    fn definition(_: &mut specta::Types) -> DataType {
        Native::Subscription.into()
    }
}

impl Type for RoomListSubscription {
    fn definition(_: &mut specta::Types) -> DataType {
        Native::RoomListSubscription.into()
    }
}

impl<T: Type> Type for Listener<T> {
    fn definition(types: &mut specta::Types) -> DataType {
        Native::Listener(Box::new(T::definition(types))).into()
    }
}

impl<T: RpcObject> Type for Handle<T> {
    fn definition(_: &mut specta::Types) -> DataType {
        Native::Object(T::CLASS).into()
    }
}

impl<T: RpcObject> Type for Obj<T> {
    fn definition(_: &mut specta::Types) -> DataType {
        Native::Object(T::CLASS).into()
    }
}

#[derive(Default)]
pub struct Types {
    types: specta::Types,
}

impl Types {
    pub fn name<T: Type>(&mut self) -> DataType {
        T::definition(&mut self.types)
    }

    pub fn param<T: Type>(&mut self, name: &str) -> Param {
        let ty = self.name::<T>();
        Param {
            name: camel(name),
            optional: matches!(ty, DataType::Nullable(_)),
            ty,
        }
    }
}

struct Api {
    routes: Vec<Route>,
    types: specta::Types,
}

fn collect() -> Api {
    let mut types = Types::default();
    let mut routes = super::routes(&mut types);
    // Used by the runtime's own methods (`RoomListSubscription.setFilter`) or only by name
    types.name::<crate::RoomFilter>();
    let format = specta_serde::Format;
    let mapped = format
        .map_types(&types.types)
        .expect("serde attributes the generator understands")
        .into_owned();
    for route in &mut routes {
        route.returns = map(&format, &mapped, &route.returns);
        for param in &mut route.params {
            param.ty = map(&format, &mapped, &param.ty);
        }
    }
    Api {
        routes,
        types: mapped,
    }
}

fn map(format: &specta_serde::Format, types: &specta::Types, dt: &DataType) -> DataType {
    match format
        .map_type(types, dt)
        .expect("a type the generator understands")
    {
        Cow::Borrowed(dt) => dt.clone(),
        Cow::Owned(dt) => dt,
    }
}

/// A readable dump of the reflected types, for working on the generators
pub fn dump() -> String {
    let api = collect();
    let mut out = BTreeMap::new();
    for ty in api.types.into_sorted_iter() {
        out.insert(ty.name.to_string(), format!("{:#?}", ty));
    }
    out.into_values().collect::<Vec<_>>().join("\n\n")
}

fn camel(snake: &str) -> String {
    // Reserved in strict-mode JavaScript
    if matches!(
        snake,
        "private"
            | "public"
            | "package"
            | "interface"
            | "protected"
            | "static"
            | "let"
            | "yield"
            | "implements"
    ) {
        return format!("_{snake}");
    }
    let mut out = String::new();
    let mut upper = false;
    for c in snake.chars() {
        if c == '_' {
            upper = true;
        } else if upper {
            out.extend(c.to_uppercase());
            upper = false;
        } else {
            out.push(c);
        }
    }
    out
}

/// serde_json's `Value` and its parts: raw JSON the app interprets itself
fn is_json(named: &NamedDataType) -> bool {
    named.module_path.starts_with("serde_json")
}

impl Api {
    fn named(&self, reference: &NamedReference) -> &NamedDataType {
        self.types.get(reference).expect("a registered type")
    }

    fn classes(&self) -> Vec<&'static str> {
        let mut classes: Vec<&str> = Vec::new();
        for route in &self.routes {
            if !classes.contains(&route.class) {
                classes.push(route.class);
            }
        }
        classes
    }

    fn declared(&self) -> Vec<&NamedDataType> {
        let mut out: Vec<&NamedDataType> = self
            .types
            .into_unsorted_iter()
            .filter(|t| !is_json(t) && t.ty.as_ref().is_some_and(|ty| !is_inline_only(ty)))
            .collect();
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out.dedup_by(|a, b| a.name == b.name);
        out
    }

    fn aliases(&self) -> BTreeMap<&'static str, (&'static str, &'static str, &'static str)> {
        let mut out = BTreeMap::new();
        let mut visit = |dt: &DataType| {
            walk(dt, &mut |dt| {
                if let Some(Native::Alias {
                    name,
                    docs,
                    ts,
                    swift,
                }) = native(dt)
                {
                    out.insert(*name, (*docs, *ts, *swift));
                }
            })
        };
        for route in &self.routes {
            visit(&route.returns);
            route.params.iter().for_each(|p| visit(&p.ty));
        }
        for named in self.types.into_unsorted_iter() {
            if let Some(ty) = &named.ty {
                visit(ty);
            }
        }
        out
    }
}

/// `String`, `Vec` and friends are registered but only ever used inline
fn is_inline_only(_: &DataType) -> bool {
    false
}

fn walk(dt: &DataType, f: &mut dyn FnMut(&DataType)) {
    f(dt);
    match dt {
        DataType::List(list) => walk(&list.ty, f),
        DataType::Map(map) => {
            walk(map.key_ty(), f);
            walk(map.value_ty(), f);
        }
        DataType::Nullable(inner) => walk(inner, f),
        DataType::Struct(s) => walk_fields(&s.fields, f),
        DataType::Enum(e) => e
            .variants
            .iter()
            .for_each(|(_, v)| walk_fields(&v.fields, f)),
        DataType::Tuple(t) => t.elements.iter().for_each(|e| walk(e, f)),
        DataType::Intersection(parts) => parts.iter().for_each(|p| walk(p, f)),
        DataType::Reference(Reference::Named(r)) => match &r.inner {
            NamedReferenceType::Inline { dt, .. } => walk(dt, f),
            NamedReferenceType::Reference { generics, .. } => {
                generics.iter().for_each(|(_, g)| walk(g, f))
            }
            NamedReferenceType::Recursive(_) => {}
        },
        DataType::Reference(Reference::Opaque(_)) => {
            if let Some(Native::Listener(payload)) = native(dt) {
                walk(payload, f);
            }
        }
        DataType::Primitive(_) | DataType::Generic(_) => {}
    }
}

fn walk_fields(fields: &Fields, f: &mut dyn FnMut(&DataType)) {
    match fields {
        Fields::Unit => {}
        Fields::Unnamed(u) => u
            .fields
            .iter()
            .filter_map(|x| x.ty.as_ref())
            .for_each(|t| walk(t, f)),
        Fields::Named(n) => n
            .fields
            .iter()
            .filter_map(|(_, x)| x.ty.as_ref())
            .for_each(|t| walk(t, f)),
    }
}

/// A union variant that's only a string, e.g. the `"event"` of `kind: "event"`
fn literal(dt: &DataType) -> Option<&str> {
    match dt {
        DataType::Enum(e)
            if e.variants.len() == 1 && matches!(e.variants[0].1.fields, Fields::Unit) =>
        {
            Some(&e.variants[0].0)
        }
        _ => None,
    }
}

/// The string a variant is on the wire if it's only a string (a unit variant, or one serde's
/// representation turned into a literal)
fn unit_value<'a>(name: &'a str, v: &'a Variant) -> Option<&'a str> {
    match &v.fields {
        Fields::Unit => Some(name),
        Fields::Unnamed(u) if u.fields.len() == 1 => u.fields[0].ty.as_ref().and_then(literal),
        _ => None,
    }
}

fn variants(e: &Enum) -> impl Iterator<Item = (&str, &Variant)> {
    e.variants
        .iter()
        .filter(|(_, v)| !v.skip)
        .map(|(n, v)| (n.as_ref(), v))
}

fn doc_lines(docs: &str) -> Vec<&str> {
    let docs = docs.trim_end_matches('\n');
    if docs.trim().is_empty() {
        return Vec::new();
    }
    docs.split('\n').collect()
}

/// Type and field docs, always as a multi-line `/** */` block
fn block_doc(docs: &[&str], indent: &str) -> String {
    if docs.is_empty() {
        return String::new();
    }
    let mut out = format!("{indent}/**\n");
    for line in docs {
        let _ = writeln!(out, "{indent} *{line}");
    }
    let _ = writeln!(out, "{indent} */");
    out
}

fn jsdoc(docs: &[&str], indent: &str) -> String {
    match docs {
        [] => String::new(),
        [line] => format!("{indent}/**{line} */\n"),
        lines => {
            let mut out = format!("{indent}/**\n");
            for line in lines {
                let _ = writeln!(out, "{indent} *{line}");
            }
            let _ = writeln!(out, "{indent} */");
            out
        }
    }
}

struct Ts<'a> {
    api: &'a Api,
}

impl Ts<'_> {
    fn ty(&self, dt: &DataType) -> String {
        match dt {
            DataType::Primitive(p) => match p {
                Primitive::bool => "boolean".into(),
                Primitive::str | Primitive::char => "string".into(),
                _ => "number".into(),
            },
            DataType::List(list) => match list.length {
                Some(n) => format!("[{}]", vec![self.ty(&list.ty); n].join(", ")),
                None => format!("Array<{}>", self.ty(&list.ty)),
            },
            DataType::Map(map) => {
                format!(
                    "{{ [key in {}]?: {} }}",
                    self.ty(map.key_ty()),
                    self.ty(map.value_ty())
                )
            }
            DataType::Nullable(inner) => format!("{} | null", self.ty(inner)),
            DataType::Struct(s) => self.fields(&s.fields),
            DataType::Enum(e) => {
                let parts: Vec<String> = variants(e)
                    .map(|(name, v)| match &v.fields {
                        Fields::Unit => format!("\"{name}\""),
                        fields => self.fields(fields),
                    })
                    .collect();
                if parts.is_empty() {
                    "never".into()
                } else {
                    parts.join(" | ")
                }
            }
            DataType::Tuple(t) if t.elements.is_empty() => "null".into(),
            DataType::Tuple(t) => {
                let parts: Vec<String> = t.elements.iter().map(|e| self.ty(e)).collect();
                format!("[{}]", parts.join(", "))
            }
            DataType::Intersection(parts) => {
                let parts: Vec<String> = parts.iter().map(|p| self.ty(p)).collect();
                parts.join(" & ")
            }
            DataType::Generic(g) => g.name().to_string(),
            DataType::Reference(Reference::Named(r)) => self.named(r),
            DataType::Reference(Reference::Opaque(_)) => {
                match native(dt).expect("a known opaque type") {
                    Native::Alias { name, .. } => (*name).into(),
                    Native::Object(class) => (*class).into(),
                    Native::Listener(payload) => match self.ty(payload).as_str() {
                        "null" => "() => void".into(),
                        payload => format!("(value: {payload}) => void"),
                    },
                    Native::Bytes => "Uint8Array".into(),
                    Native::Subscription => "Subscription".into(),
                    Native::RoomListSubscription => "RoomListSubscription".into(),
                }
            }
        }
    }

    fn named(&self, r: &NamedReference) -> String {
        match &r.inner {
            NamedReferenceType::Inline { dt, .. } => self.ty(dt),
            NamedReferenceType::Recursive(_) => self.api.named(r).name.to_string(),
            NamedReferenceType::Reference { generics, .. } => {
                let named = self.api.named(r);
                if is_json(named) {
                    return "JsonValue".into();
                }
                if generics.is_empty() {
                    named.name.to_string()
                } else {
                    let args: Vec<String> = generics.iter().map(|(_, g)| self.ty(g)).collect();
                    format!("{}<{}>", named.name, args.join(", "))
                }
            }
        }
    }

    fn fields(&self, fields: &Fields) -> String {
        match fields {
            Fields::Unit => "null".into(),
            Fields::Unnamed(u) => {
                let tys: Vec<String> = u
                    .fields
                    .iter()
                    .filter_map(|f| f.ty.as_ref())
                    .map(|t| self.ty(t))
                    .collect();
                match tys.as_slice() {
                    [one] => one.clone(),
                    many => format!("[{}]", many.join(", ")),
                }
            }
            Fields::Named(n) => {
                let mut out = String::from("{ ");
                for (name, field) in &n.fields {
                    let Some(ty) = &field.ty else { continue };
                    let docs = doc_lines(&field.docs);
                    if !docs.is_empty() {
                        out.push('\n');
                        out.push_str(&block_doc(&docs, ""));
                    }
                    let key = if literal(ty).is_some() {
                        format!("\"{name}\"")
                    } else {
                        name.to_string()
                    };
                    let opt = if field.optional { "?" } else { "" };
                    let _ = write!(out, "{key}{opt}: {}, ", self.ty(ty));
                }
                out.push('}');
                out
            }
        }
    }
}

pub fn typescript() -> String {
    let api = collect();
    let ts = Ts { api: &api };
    let mut decls: BTreeMap<String, String> = BTreeMap::new();
    for (name, (docs, def, _)) in api.aliases() {
        decls.insert(
            name.into(),
            format!(
                "{}export type {name} = {def};",
                block_doc(&doc_lines(docs), "")
            ),
        );
    }
    for named in api.declared() {
        let generics: Vec<String> = named.generics.iter().map(|g| g.name.to_string()).collect();
        let generics = if generics.is_empty() {
            String::new()
        } else {
            format!("<{}>", generics.join(", "))
        };
        let body = ts.ty(named.ty.as_ref().expect("declared types have a definition"));
        decls.insert(
            named.name.to_string(),
            format!(
                "{}export type {}{generics} = {body};",
                block_doc(&doc_lines(&named.docs), ""),
                named.name
            ),
        );
    }
    decls.insert("JsonValue".into(), "export type JsonValue = any;".into());

    let mut out = String::from(
        "// @generated by `npm run core:types` from crates/core/src/rpc. Don't edit.\n\
         /* eslint-disable */\n\
         import { Remote, runtime, Subscription, RoomListSubscription, type HandleRef } from './runtime';\n\
         export { Subscription, RoomListSubscription };\n\n",
    );
    for decl in decls.values() {
        out.push_str(decl);
        out.push_str("\n\n");
    }

    for class in api.classes() {
        let _ = writeln!(out, "export class {class} extends Remote {{");
        let _ = writeln!(out, "  static readonly className = '{class}';");
        let methods: Vec<&Route> = api.routes.iter().filter(|r| r.class == class).collect();
        if methods
            .iter()
            .any(|r| r.kind == "bare" && r.method == "new")
        {
            let _ = writeln!(
                out,
                "  constructor(ref?: HandleRef | Promise<HandleRef>) {{\n    super(ref ?? runtime.create('{class}.new'));\n  }}"
            );
        }
        for route in methods {
            if route.kind == "bare" && route.method == "new" {
                continue;
            }
            out.push('\n');
            out.push_str(&jsdoc(&route.docs, "  "));
            // Trailing optional parameters may be left out
            let required = route
                .params
                .iter()
                .rposition(|p| !p.optional)
                .map_or(0, |i| i + 1);
            let params: Vec<String> = route
                .params
                .iter()
                .enumerate()
                .map(|(i, p)| {
                    let ty = ts.ty(&p.ty);
                    if i >= required {
                        format!("{}?: {ty}", p.name)
                    } else if p.optional {
                        format!("{}: {ty} | undefined", p.name)
                    } else {
                        format!("{}: {ty}", p.name)
                    }
                })
                .collect();
            let args: Vec<&str> = route.params.iter().map(|p| p.name.as_str()).collect();
            let (params, args) = (params.join(", "), args.join(", "));
            let returns = match ts.ty(&route.returns) {
                r if r == "null" => "void".to_string(),
                r => r,
            };
            let method = format!("{class}.{}", route.method);
            let _ = match route.kind {
                "bare" => writeln!(
                    out,
                    "  static {}({params}): Promise<{returns}> {{\n    return runtime.call('{method}', null, [{args}]) as Promise<{returns}>;\n  }}",
                    route.method
                ),
                "call" => writeln!(
                    out,
                    "  {}({params}): Promise<{returns}> {{\n    return runtime.call('{method}', this, [{args}]) as Promise<{returns}>;\n  }}",
                    route.method
                ),
                "prop" => writeln!(
                    out,
                    "  {}(): {returns} {{\n    return this.props['{}'] as {returns};\n  }}",
                    route.method, route.method
                ),
                _ => writeln!(
                    out,
                    "  {}({params}): {returns} {{\n    return runtime.watch('{method}', this, [{args}], {returns});\n  }}",
                    route.method
                ),
            };
        }
        out.push_str("}\n\n");
        let _ = writeln!(out, "runtime.define({class});\n");
    }
    out
}

const SWIFT_KEYWORDS: &[&str] = &[
    "associatedtype",
    "break",
    "case",
    "catch",
    "class",
    "continue",
    "default",
    "defer",
    "deinit",
    "do",
    "else",
    "enum",
    "extension",
    "fallthrough",
    "false",
    "fileprivate",
    "for",
    "func",
    "guard",
    "if",
    "import",
    "in",
    "init",
    "inout",
    "internal",
    "is",
    "let",
    "nil",
    "open",
    "operator",
    "private",
    "protocol",
    "public",
    "repeat",
    "rethrows",
    "return",
    "self",
    "Self",
    "static",
    "struct",
    "subscript",
    "super",
    "switch",
    "throw",
    "throws",
    "true",
    "try",
    "typealias",
    "var",
    "where",
    "while",
    "Type",
    "Protocol",
    "any",
    "some",
];

fn swift_ident(name: &str) -> String {
    if SWIFT_KEYWORDS.contains(&name) {
        format!("`{name}`")
    } else {
        name.to_string()
    }
}

fn pascal(name: &str) -> String {
    let mut out = String::new();
    let mut upper = true;
    for c in name.chars() {
        if c == '_' || c == '-' || c == '.' {
            upper = true;
        } else if upper {
            out.extend(c.to_uppercase());
            upper = false;
        } else {
            out.push(c);
        }
    }
    out
}

fn swift_doc(docs: &[&str], indent: &str) -> String {
    docs.iter()
        .map(|line| format!("{indent}///{line}\n"))
        .collect()
}

enum Shape<'a> {
    Strings(Vec<&'a str>),
    Tagged(&'a str),
    Untagged,
}

fn shape(e: &Enum) -> Shape<'_> {
    let vs: Vec<(&str, &Variant)> = variants(e).collect();
    let strings: Option<Vec<&str>> = vs.iter().map(|(n, v)| unit_value(n, v)).collect();
    if let Some(strings) = strings {
        return Shape::Strings(strings);
    }
    let first = vs.iter().find_map(|(_, v)| match &v.fields {
        Fields::Named(n) => Some(n),
        _ => None,
    });
    if let Some(first) = first {
        for (key, _) in &first.fields {
            let tagged = vs.iter().all(|(_, v)| match &v.fields {
                Fields::Named(n) => n
                    .fields
                    .iter()
                    .any(|(k, f)| k == key && f.ty.as_ref().and_then(literal).is_some()),
                _ => false,
            });
            if tagged {
                return Shape::Tagged(key);
            }
        }
    }
    Shape::Untagged
}

struct Swift<'a> {
    api: &'a Api,
}

impl Swift<'_> {
    fn ty(&self, dt: &DataType, nested: &str, decls: &mut Vec<String>) -> String {
        match dt {
            DataType::Primitive(p) => match p {
                Primitive::bool => "Bool".into(),
                Primitive::str | Primitive::char => "String".into(),
                Primitive::f16 | Primitive::f32 | Primitive::f64 | Primitive::f128 => {
                    "Double".into()
                }
                _ => "Int".into(),
            },
            DataType::List(list) => format!("[{}]", self.ty(&list.ty, nested, decls)),
            DataType::Map(map) => format!(
                "[{}: {}]",
                self.ty(map.key_ty(), nested, decls),
                self.ty(map.value_ty(), nested, decls)
            ),
            DataType::Nullable(inner) => {
                let inner = self.ty(inner, nested, decls);
                if inner.ends_with('?') {
                    inner
                } else {
                    format!("{inner}?")
                }
            }
            DataType::Struct(_) | DataType::Enum(_) => {
                if let Some(value) = literal(dt) {
                    let _ = value;
                    return "String".into();
                }
                decls.push(self.decl(nested, dt, &[], &[], "    "));
                nested.to_string()
            }
            DataType::Tuple(t) if t.elements.is_empty() => "Empty".into(),
            DataType::Tuple(t) => {
                // Fixed-size tuples arrive as JSON arrays; mixed ones as arrays of any JSON
                let types: Vec<String> = t
                    .elements
                    .iter()
                    .map(|e| self.ty(e, nested, decls))
                    .collect();
                if types.windows(2).all(|pair| pair[0] == pair[1]) {
                    format!("[{}]", types[0])
                } else {
                    "[JSONValue]".into()
                }
            }
            DataType::Intersection(_) => "JSONValue".into(),
            DataType::Generic(g) => g.name().to_string(),
            DataType::Reference(Reference::Named(r)) => match &r.inner {
                NamedReferenceType::Inline { dt, .. } => self.ty(dt, nested, decls),
                NamedReferenceType::Recursive(_) => self.api.named(r).name.to_string(),
                NamedReferenceType::Reference { generics, .. } => {
                    let named = self.api.named(r);
                    if is_json(named) {
                        return "JSONValue".into();
                    }
                    if generics.is_empty() {
                        named.name.to_string()
                    } else {
                        let args: Vec<String> = generics
                            .iter()
                            .map(|(_, g)| self.ty(g, nested, decls))
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
                    Native::Bytes => "Data".into(),
                    Native::Subscription => "Subscription".into(),
                    Native::RoomListSubscription => "RoomListSubscription".into(),
                }
            }
        }
    }

    fn decl(
        &self,
        name: &str,
        dt: &DataType,
        docs: &[&str],
        generics: &[String],
        indent: &str,
    ) -> String {
        let outer = &indent[4.min(indent.len())..];
        let generic_list = if generics.is_empty() {
            String::new()
        } else {
            let list: Vec<String> = generics
                .iter()
                .map(|g| format!("{g}: Codable & Hashable & Sendable"))
                .collect();
            format!("<{}>", list.join(", "))
        };
        let mut out = swift_doc(docs, outer);
        match dt {
            DataType::Enum(e) => match shape(e) {
                Shape::Strings(values) => {
                    let _ = writeln!(out, "{outer}public enum {name}: String, Codable, Hashable, Sendable, CaseIterable {{");
                    for value in values {
                        let case = swift_ident(value);
                        let _ = writeln!(out, "{indent}case {case} = \"{value}\"");
                    }
                    let _ = writeln!(out, "{outer}}}");
                }
                Shape::Tagged(tag) => {
                    out.push_str(&self.tagged(name, e, tag, &generic_list, indent))
                }
                Shape::Untagged => out.push_str(&self.untagged(name, e, &generic_list, indent)),
            },
            DataType::Struct(s) => match &s.fields {
                Fields::Named(_) => {
                    out.push_str(&self.record(name, &s.fields, None, &generic_list, indent))
                }
                Fields::Unnamed(u) if u.fields.len() == 1 => {
                    let mut nested = Vec::new();
                    let ty = u.fields[0]
                        .ty
                        .as_ref()
                        .map(|t| self.ty(t, "Value", &mut nested))
                        .unwrap_or("Empty".into());
                    let _ = writeln!(out, "{outer}public typealias {name}{generic_list} = {ty}");
                }
                _ => {
                    let _ = writeln!(out, "{outer}public typealias {name} = JSONValue");
                }
            },
            other => {
                let mut nested = Vec::new();
                let ty = self.ty(other, &format!("{name}Value"), &mut nested);
                let _ = writeln!(out, "{outer}public typealias {name}{generic_list} = {ty}");
                for n in nested {
                    out.push_str(&n);
                }
            }
        }
        out
    }

    fn record(
        &self,
        name: &str,
        fields: &Fields,
        skip: Option<&str>,
        generics: &str,
        indent: &str,
    ) -> String {
        let outer = &indent[4.min(indent.len())..];
        let Fields::Named(named) = fields else {
            return String::new();
        };
        let mut nested = Vec::new();
        let mut members = String::new();
        let mut params = Vec::new();
        let mut assigns = Vec::new();
        for (key, field) in &named.fields {
            let Some(ty) = &field.ty else { continue };
            if Some(key.as_ref()) == skip {
                continue;
            }
            let mut swift_ty = self.ty(ty, &pascal(key), &mut nested);
            if field.optional && !swift_ty.ends_with('?') {
                swift_ty.push('?');
            }
            let ident = swift_ident(key);
            members.push_str(&swift_doc(&doc_lines(&field.docs), indent));
            let _ = writeln!(members, "{indent}public var {ident}: {swift_ty}");
            let default = if swift_ty.ends_with('?') {
                " = nil"
            } else {
                ""
            };
            params.push(format!("{ident}: {swift_ty}{default}"));
            assigns.push(format!("{indent}    self.{ident} = {ident}"));
        }
        let mut out = String::new();
        let _ = writeln!(
            out,
            "{outer}public struct {name}{generics}: Codable, Hashable, Sendable {{"
        );
        for n in nested {
            out.push_str(&n);
        }
        out.push_str(&members);
        if !params.is_empty() {
            let _ = writeln!(out, "\n{indent}public init({}) {{", params.join(", "));
            for a in assigns {
                let _ = writeln!(out, "{a}");
            }
            let _ = writeln!(out, "{indent}}}");
        } else {
            let _ = writeln!(out, "{indent}public init() {{}}");
        }
        let _ = writeln!(out, "{outer}}}");
        out
    }

    fn tagged(&self, name: &str, e: &Enum, tag: &str, generics: &str, indent: &str) -> String {
        let outer = &indent[4.min(indent.len())..];
        let mut nested = String::new();
        let mut cases = String::new();
        let mut decode = String::new();
        let mut encode = String::new();
        for (variant, v) in variants(e) {
            let Fields::Named(fields) = &v.fields else {
                continue;
            };
            let value = fields
                .fields
                .iter()
                .find(|(k, _)| k == tag)
                .and_then(|(_, f)| f.ty.as_ref().and_then(literal))
                .unwrap_or(variant);
            let case = swift_ident(variant);
            let has_payload = fields
                .fields
                .iter()
                .any(|(k, f)| k != tag && f.ty.is_some());
            cases.push_str(&swift_doc(&doc_lines(&v.docs), indent));
            if has_payload {
                let payload = pascal(variant);
                nested.push_str(&self.record(
                    &payload,
                    &v.fields,
                    Some(tag),
                    "",
                    &format!("{indent}    "),
                ));
                let _ = writeln!(cases, "{indent}case {case}({payload})");
                let _ = writeln!(
                    decode,
                    "{indent}    case \"{value}\": self = .{case}(try {payload}(from: decoder))"
                );
                let _ = writeln!(
                    encode,
                    "{indent}    case .{case}(let value):\n{indent}        try container.encode(\"{value}\", forKey: AnyKey(\"{tag}\"))\n{indent}        try value.encode(to: encoder)"
                );
            } else {
                let _ = writeln!(cases, "{indent}case {case}");
                let _ = writeln!(decode, "{indent}    case \"{value}\": self = .{case}");
                let _ = writeln!(
                    encode,
                    "{indent}    case .{case}:\n{indent}        try container.encode(\"{value}\", forKey: AnyKey(\"{tag}\"))"
                );
            }
        }
        let mut out = String::new();
        let _ = writeln!(
            out,
            "{outer}public enum {name}{generics}: Codable, Hashable, Sendable {{"
        );
        out.push_str(&nested);
        out.push_str(&cases);
        let _ = writeln!(
            out,
            "\n{indent}public init(from decoder: Decoder) throws {{"
        );
        let _ = writeln!(
            out,
            "{indent}    let container = try decoder.container(keyedBy: AnyKey.self)"
        );
        let _ = writeln!(
            out,
            "{indent}    switch try container.decode(String.self, forKey: AnyKey(\"{tag}\")) {{"
        );
        out.push_str(&decode);
        let _ = writeln!(
            out,
            "{indent}    case let other: throw DecodingError.dataCorruptedError(forKey: AnyKey(\"{tag}\"), in: container, debugDescription: \"Unknown {name} \\(other)\")"
        );
        let _ = writeln!(out, "{indent}    }}\n{indent}}}");
        let _ = writeln!(
            out,
            "\n{indent}public func encode(to encoder: Encoder) throws {{"
        );
        let _ = writeln!(
            out,
            "{indent}    var container = encoder.container(keyedBy: AnyKey.self)"
        );
        let _ = writeln!(out, "{indent}    switch self {{");
        out.push_str(&encode);
        let _ = writeln!(out, "{indent}    }}\n{indent}}}");
        let _ = writeln!(out, "{outer}}}");
        out
    }

    fn untagged(&self, name: &str, e: &Enum, generics: &str, indent: &str) -> String {
        let outer = &indent[4.min(indent.len())..];
        let mut nested = String::new();
        let mut cases = String::new();
        let mut decode = String::new();
        let mut encode = String::new();
        for (variant, v) in variants(e) {
            let case = swift_ident(variant);
            cases.push_str(&swift_doc(&doc_lines(&v.docs), indent));
            if let Some(value) = unit_value(variant, v) {
                let _ = writeln!(cases, "{indent}case {case}");
                let _ = writeln!(
                    decode,
                    "{indent}    if let value = try? container.decode(String.self), value == \"{value}\" {{ self = .{case}; return }}"
                );
                let _ = writeln!(
                    encode,
                    "{indent}    case .{case}: try container.encode(\"{value}\")"
                );
                continue;
            }
            match &v.fields {
                Fields::Unit => {
                    let _ = writeln!(cases, "{indent}case {case}");
                    let _ = writeln!(
                        decode,
                        "{indent}    if let value = try? container.decode(String.self), value == \"{variant}\" {{ self = .{case}; return }}"
                    );
                    let _ = writeln!(
                        encode,
                        "{indent}    case .{case}: try container.encode(\"{variant}\")"
                    );
                }
                Fields::Unnamed(u) => {
                    let mut more = Vec::new();
                    let payload = u
                        .fields
                        .first()
                        .and_then(|f| f.ty.as_ref())
                        .map(|t| self.ty(t, &pascal(variant), &mut more))
                        .unwrap_or("Empty".into());
                    more.iter().for_each(|m| nested.push_str(m));
                    let _ = writeln!(cases, "{indent}case {case}({payload})");
                    let _ = writeln!(
                        decode,
                        "{indent}    if let value = try? container.decode({payload}.self) {{ self = .{case}(value); return }}"
                    );
                    let _ = writeln!(
                        encode,
                        "{indent}    case .{case}(let value): try container.encode(value)"
                    );
                }
                Fields::Named(_) => {
                    let payload = pascal(variant);
                    nested.push_str(&self.record(
                        &payload,
                        &v.fields,
                        None,
                        "",
                        &format!("{indent}    "),
                    ));
                    let _ = writeln!(cases, "{indent}case {case}({payload})");
                    let _ = writeln!(
                        decode,
                        "{indent}    if let value = try? container.decode({payload}.self) {{ self = .{case}(value); return }}"
                    );
                    let _ = writeln!(
                        encode,
                        "{indent}    case .{case}(let value): try container.encode(value)"
                    );
                }
            }
        }
        let mut out = String::new();
        let _ = writeln!(
            out,
            "{outer}public enum {name}{generics}: Codable, Hashable, Sendable {{"
        );
        out.push_str(&nested);
        out.push_str(&cases);
        let _ = writeln!(
            out,
            "\n{indent}public init(from decoder: Decoder) throws {{"
        );
        let _ = writeln!(
            out,
            "{indent}    let container = try decoder.singleValueContainer()"
        );
        out.push_str(&decode);
        let _ = writeln!(
            out,
            "{indent}    throw DecodingError.dataCorruptedError(in: container, debugDescription: \"No {name} matches\")"
        );
        let _ = writeln!(out, "{indent}}}");
        let _ = writeln!(
            out,
            "\n{indent}public func encode(to encoder: Encoder) throws {{"
        );
        let _ = writeln!(
            out,
            "{indent}    var container = encoder.singleValueContainer()"
        );
        let _ = writeln!(out, "{indent}    switch self {{");
        out.push_str(&encode);
        let _ = writeln!(out, "{indent}    }}\n{indent}}}");
        let _ = writeln!(out, "{outer}}}");
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
        for (i, p) in route.params.iter().enumerate() {
            let ident = swift_ident(&p.name);
            if let Some(Native::Listener(payload)) = native(&p.ty) {
                let payload = self.ty(payload, &pascal(&p.name), &mut nested);
                if payload == "Empty" {
                    params.push(format!("{ident}: @escaping @Sendable () -> Void"));
                    args.push(format!(".listener(Empty.self) {{ _ in {ident}() }}"));
                } else {
                    params.push(format!("{ident}: @escaping @Sendable ({payload}) -> Void"));
                    args.push(format!(".listener({payload}.self, {ident})"));
                }
                continue;
            }
            let ty = self.ty(&p.ty, &pascal(&p.name), &mut nested);
            let default = if i >= required { " = nil" } else { "" };
            params.push(format!("{ident}: {ty}{default}"));
            args.push(if native(&p.ty) == Some(&Native::Bytes) {
                format!(".bytes({ident})")
            } else {
                format!(".value({ident})")
            });
        }
        let returns = self.ty(&route.returns, &pascal(route.method), &mut nested);
        let (params, args) = (params.join(", "), args.join(", "));
        let method = format!("{class}.{}", route.method);
        let name = swift_ident(route.method);
        let mut out = swift_doc(&route.docs, "    ");
        let _ = match route.kind {
            "bare" if returns == "Empty" => writeln!(
                out,
                "    public static func {name}({params}) async throws {{\n        _ = try await Runtime.shared.call(\"{method}\", this: nil, [{args}]) as Empty\n    }}"
            ),
            "bare" => writeln!(
                out,
                "    public static func {name}({params}) async throws -> {returns} {{\n        try await Runtime.shared.call(\"{method}\", this: nil, [{args}])\n    }}"
            ),
            "call" if returns == "Empty" => writeln!(
                out,
                "    public func {name}({params}) async throws {{\n        _ = try await call(\"{method}\", [{args}]) as Empty\n    }}"
            ),
            "call" => writeln!(
                out,
                "    public func {name}({params}) async throws -> {returns} {{\n        try await call(\"{method}\", [{args}])\n    }}"
            ),
            "prop" => writeln!(out, "    public var {name}: {returns} {{\n        prop(\"{}\")\n    }}", route.method),
            _ => writeln!(
                out,
                "    @discardableResult\n    public func {name}({params}) -> {returns} {{\n        watch(\"{method}\", [{args}])\n    }}"
            ),
        };
        out
    }
}

pub fn swift() -> String {
    let api = collect();
    let sw = Swift { api: &api };
    let mut decls: BTreeMap<String, String> = BTreeMap::new();
    for (name, (docs, _, swift)) in api.aliases() {
        decls.insert(
            name.into(),
            format!(
                "{}public typealias {name} = {swift}\n",
                swift_doc(&doc_lines(docs), "")
            ),
        );
    }
    for named in api.declared() {
        let generics: Vec<String> = named.generics.iter().map(|g| g.name.to_string()).collect();
        let dt = named.ty.as_ref().expect("declared types have a definition");
        decls.insert(
            named.name.to_string(),
            sw.decl(&named.name, dt, &doc_lines(&named.docs), &generics, "    "),
        );
    }

    let mut out = String::from(
        "// @generated by `npm run core:types` from crates/core/src/rpc. Don't edit.\n\
         // swiftlint:disable all\n\
         import Foundation\n\n",
    );
    for decl in decls.values() {
        out.push_str(decl);
        out.push('\n');
    }
    let classes = api.classes();
    for class in &classes {
        let _ = writeln!(
            out,
            "public final class {class}: Remote, @unchecked Sendable {{"
        );
        let _ = writeln!(
            out,
            "    override public class var className: String {{ \"{class}\" }}"
        );
        for route in api.routes.iter().filter(|r| r.class == *class) {
            if route.kind == "bare" && route.method == "new" {
                let _ = writeln!(
                    out,
                    "\n    public static func create() async throws -> {class} {{\n        try await Runtime.shared.call(\"{class}.new\", this: nil, [])\n    }}"
                );
                continue;
            }
            out.push('\n');
            out.push_str(&sw.method(class, route));
        }
        out.push_str("}\n\n");
    }
    let _ = writeln!(
        out,
        "/// Every object class, so handles from the core turn into the right Swift class\npublic let remoteClasses: [Remote.Type] = [{}]",
        classes.iter().map(|c| format!("{c}.self")).collect::<Vec<_>>().join(", ")
    );
    out
}
