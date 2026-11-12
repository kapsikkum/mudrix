// The package's ESM build calls `import * as nanoid` as a function, which bundlers reject, so the
// CommonJS build is imported by path; its types are the package's own.
declare module 'hunspell-asm/dist/cjs/index.js' {
  export * from 'hunspell-asm';
}
