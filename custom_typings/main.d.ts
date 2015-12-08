declare interface NodeCallback<T> { (err: any, res: T): any; }

declare module 'pad' {
  interface Options {
    strip: boolean;
  }
  function pad(s: string, padding: number, options?: Options): string;
  module pad {}
  export = pad;
}

declare module 'github-cache' {
  interface Options {
    version: string;
    protocol: string;
    cachedb: string;
    validateCache: boolean;
  }
  interface CreatePullRequestOpts {
    user: string;
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
  }
  interface IssuesEditOpts {
    headers?: Object;
    user: string;
    repo: string;
    number: number;
    title?: string;
    body?: string;
    assignee?: string;
    milestone?: number;
    labels?: string[];
    state?: string;
  }
  interface GetFromOrgOpts {
    org: string;
    per_page?: number;
    page?: number;
  }
  class GitHubApi {
    constructor(options: Options);
    repos: {
      getFromOrg(msg: GetFromOrgOpts, cb: NodeCallback<GitHubApi.Repo[]>): void;
      get(msg: {user: string, repo: string},
          cb: NodeCallback<GitHubApi.Repo>): void;
    }
    pullRequests: {
      create(
          msg: CreatePullRequestOpts, cb: NodeCallback<GitHubApi.Issue>): void;
    }
    issues: {
      edit(msg: IssuesEditOpts, cb: NodeCallback<GitHubApi.Issue>): void;
    }
    authenticate(credentials: {type: string, token: string}): void;
    user: { get(msg: {}, cb: NodeCallback<GitHubApi.User>): void; }
  }
  module GitHubApi {
    class Repo {
      owner: User;
      name: string;
      clone_url: string;
    }
    interface User {
      login: string;
    }
    interface Issue {
      number: number;
      title: string;
      body: string;
      assignee: User;
      milestone: Milestone;
      state: string;
      labels: { name: string, color: string, url: string }[];
      user: User;
    }
    interface PullRequest extends Issue {}
    interface Milestone {}
  }
  export = GitHubApi;
}

declare module 'promisify-node' {
  function promisify<T>(f: (cb: NodeCallback<T>) => void): () => Promise<T>;
  function promisify<A1, T>(f: (a: A1, cb: NodeCallback<T>) => void): (a: A1) =>
      Promise<T>;
  function promisify<A1, A2, T>(
      f: (a: A1, a2: A2, cb: NodeCallback<T>) => void): (a: A1, a2: A2) =>
      Promise<T>;
  function promisify<A1, A2, A3, T>(
      f: (a: A1, a2: A2, a3: A3, cb: NodeCallback<T>) =>
          void): (a: A1, a2: A2, a3: A3) => Promise<T>;
  module promisify {}
  export = promisify;
}

declare module 'nodegit' {
  export class Signature { static now(name: string, email: string): Signature; }
  export class Cred {
    static userpassPlaintextNew(value: string, kind: string): Cred;
  }
  export class Branch {
    static create(
        repo: Repository, branchName: string, commit: Commit,
        force: boolean): Promise<Reference>;
  }
  class CloneOptions {}
  export class Clone {
    static clone(url: string, local_path: string, options?: CloneOptions):
        Promise<Repository>;
  }
  export class Repository {
    static open(path: string): Promise<Repository>;
    createCommitOnHead(
        filesToAdd: string[], author: Signature, committer: Signature,
        message: string): Promise<Oid>;
    getHeadCommit(): Promise<Commit>;
    checkoutBranch(branch: string | Reference): Promise<void>;
    getRemote(remote: string): Promise<Remote>
  }
  interface RemoteCallbacks {
    credentials?: () => Cred;
  }
  interface PushOptions {
    callbacks?: RemoteCallbacks;
    pbParallelism?: number;
    version?: number;
  }
  export class Remote {
    push(refSpecs: string[], options: PushOptions): Promise<number>;
  }
  export class Oid {}
  export class Commit {}
  export class Reference {}
}

declare module 'hydrolysis' {
  interface Options {
    filter?: (path: string) => boolean;
  }
  interface Element {
    is: string;
    contentHref: string;
    desc?: string;
  }
  interface Behavior {
    is: string;
    contentHref: string;
    desc?: string;
  }
  export class Analyzer {
    static analyze(path: string, options: Options): Promise<Analyzer>;
    metadataTree(path: string): Promise<void>;
    annotate(): void;
    elements: Element[];
    behaviors: Behavior[];
  }
}

declare module 'command-line-args' {
  interface ArgDescriptor {
    name: string;
    // type: Object;
    alias?: string;
    description: string;
    defaultValue?: any;
    type: (val: string) => any;
    multiple?: boolean;
  }
  interface UsageOpts {
    title: string;
    header: string;
  }
  interface CLI {
    parse(): any;
    getUsage(opts: UsageOpts): string;
  }
  function commandLineArgs(args: ArgDescriptor[]): CLI;
  module commandLineArgs {}

  export = commandLineArgs;
}

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

declare module 'espree' {
  interface ParseOpts {
    attachComment: boolean;
  }
  export function parse(text: string, opts?: ParseOpts): any;
}

declare module 'estree-walker' {
  export function walk(n: any, callbacks: {enter: (node: any) => any}): void;
}

declare module 'escodegen' {
  interface GenerateOpts {
    comment?: boolean;
    format?: {
      indent?: {
        style?: string;
        base?: number;
        adjustMultilineComment: boolean;
      }
    }
  }
  export function generate(ast: any, opts?: GenerateOpts): string;
}
