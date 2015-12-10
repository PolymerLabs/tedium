declare module 'espree' {
  interface ParseOpts {
    attachComment: boolean;
  }
  export function parse(text: string, opts?: ParseOpts): any;
}
