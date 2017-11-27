declare module 'nodegit' {
  export class Signature { static now(name: string, email: string): Signature; }
  export class Cred {
    static userpassPlaintextNew(value: string, kind: string): Cred;
  }
  export class Branch {
    static create(
        repo: Repository,
        branchName: string,
        commit: Commit,
        force: boolean): Promise<Reference>;
    static lookup(
        repo: Repository,
        branchName: string,
        branch_type: Branch.BRANCH): Promise<Reference>;
  }
  export namespace Branch {
    enum BRANCH { LOCAL = 1, REMOTE = 2, ALL = 3 }
  }
  class CloneOptions {}
  export class Clone {
    static clone(url: string, local_path: string, options?: CloneOptions):
        Promise<Repository>;
  }
  export class Repository {
    static open(path: string): Promise<Repository>;
    createCommitOnHead(
        filesToAdd: string[],
        author: Signature,
        committer: Signature,
        message: string): Promise<Oid>;
    getHeadCommit(): Promise<Commit>;
    checkoutBranch(branch: string|Reference): Promise<void>;
    checkoutRef(ref: Reference): Promise<void>;
    getRemote(remote: string): Promise<Remote>;
    getCurrentBranch(): Promise<Reference>;
    getBranch(name: string): Promise<Reference>;
    getReferenceCommit(ref: Reference): Promise<Commit>;
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
  export class Oid { __oidBrand: Oid; }
  export class Commit { __commitBrand: Commit; }
  export class Reference {
    __referenceBrand: Reference;
    name(): string;
  }
}
