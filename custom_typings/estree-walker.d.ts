declare module 'estree-walker' {
  export function walk(n: any, callbacks: {enter: (node: any) => any}): void;
}
