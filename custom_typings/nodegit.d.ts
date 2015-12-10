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
