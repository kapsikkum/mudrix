// Rename stages for tools/rename/rename.mjs. Each stage must build and pass CI on its own.
const SELF = ['tools/rename/'];

export const stages = {
  // A: npm packages, Rust crates and the native library name (code identities, nothing stored)
  a: {
    skip: SELF,
    replace: [
      ['@wizardchat/', '@mudrix/'],
      ['wizardchat-core-wasm', 'mudrix-core-wasm'],
      ['wizardchat-core-ffi', 'mudrix-core-ffi'],
      ['wizardchat_core_ffi', 'mudrix_core_ffi'],
      ['wizardchat-core', 'mudrix-core'],
      ['wizardchat_core', 'mudrix_core'],
      ['wizardchat-desktop', 'mudrix-desktop'],
      ['wizardchat_desktop', 'mudrix_desktop'],
      [/("name":\s*)"wizardchat"/g, '$1"mudrix"'],
    ],
  },
};
