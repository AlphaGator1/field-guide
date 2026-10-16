// esbuild bundles these as plain strings (--loader:.html=text --loader:.md=text).
declare module "*.html" {
  const text: string
  export default text
}
declare module "*.md" {
  const text: string
  export default text
}
declare const __VERSION__: string
