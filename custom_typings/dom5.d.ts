declare module 'dom5' {
  export interface Node {
    nodeName: string;
    tagName: string;
    childNodes: Node[];
    parentNode: Node;
    attrs: {
      name: string;
      value: string;
    }[];
    value?: string;
  }
  export function parse(text: string): Node;
  export function parseFragment(text: string): Node;
  export function serialize(node: Node): string;
  export function query(root: Node, predicate: (n: Node) => boolean): Node;
  export function queryAll(root: Node, predicate: (n: Node) => boolean): Node[];
}
