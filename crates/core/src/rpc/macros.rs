/// Declares methods of one class. Each method is
///
/// ```ignore
/// /// Docs (end up in the TypeScript API)
/// kind fn jsName(arg: Type, ...) -> Return { body }
/// ```
///
/// with `kind` one of `bare` (static), `call` (async, on `this`), `prop` (a synchronous getter,
/// also sent with the handle) and `watch` (synchronous, returns a subscription). Bodies return
/// `crate::Result<Return>`; `call` and `bare` bodies may `.await`.
macro_rules! rpc_methods {
    (
        $class:ident ($this:ident : $ty:ty) {
            $(
                $(#[doc = $doc:literal])*
                $kind:ident fn $name:ident ( $($p:ident : $t:ty),* $(,)? ) -> $ret:ty $body:block
            )*
        }
    ) => {
        #[allow(unused_variables, unused_mut, non_snake_case, unreachable_code, clippy::redundant_closure_call)]
        pub(crate) async fn call(
            call: &mut $crate::rpc::Call,
            class: &str,
            method: &str,
        ) -> Option<Result<$crate::rpc::Reply, $crate::rpc::RpcError>> {
            if class != stringify!($class) {
                return None;
            }
            Some(match method {
                $(stringify!($name) => {
                    Box::pin(async {
                        rpc_methods!(@arm call, $this, $ty, $kind, ($($p: $t),*), $ret, $body)
                    })
                    .await
                })*
                _ => return None,
            })
        }

        #[cfg(feature = "typegen")]
        #[allow(unused_variables)]
        pub(crate) fn routes(types: &mut $crate::rpc::typegen::Types) -> Vec<$crate::rpc::typegen::Route> {
            vec![$(
                $crate::rpc::typegen::Route {
                    class: stringify!($class),
                    method: stringify!($name),
                    kind: stringify!($kind),
                    docs: vec![$($doc),*],
                    params: vec![$(types.param::<$t>(stringify!($p))),*],
                    returns: types.name::<$ret>(),
                }
            ),*]
        }
    };

    (@arm $call:ident, $this:ident, $ty:ty, bare, ($($p:ident: $t:ty),*), $ret:ty, $body:block) => {{
        let ($($p,)*) = $call.args(|args| Ok(($(args.take::<$t>()?,)*)))?;
        $call.reply($crate::rpc::typed::<$ret, _>(async move $body).await)
    }};
    (@arm $call:ident, $this:ident, $ty:ty, call, ($($p:ident: $t:ty),*), $ret:ty, $body:block) => {{
        let $this = $call.this::<$ty>()?;
        let ($($p,)*) = $call.args(|args| Ok(($(args.take::<$t>()?,)*)))?;
        $call.reply($crate::rpc::typed::<$ret, _>(async move $body).await)
    }};
    (@arm $call:ident, $this:ident, $ty:ty, $sync:ident, ($($p:ident: $t:ty),*), $ret:ty, $body:block) => {{
        let $this = $call.this::<$ty>()?;
        let ($($p,)*) = $call.args(|args| Ok(($(args.take::<$t>()?,)*)))?;
        $call.reply($crate::rpc::typed_sync::<$ret>(move || $body))
    }};
}
