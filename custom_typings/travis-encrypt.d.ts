declare module 'travis-encrypt' {
  interface EncryptOptions {
    repo: string;
    data: string;
    username?: string;
    password?: string;
  }

  function encrypt(
      options: EncryptOptions, cb: (err: any, res: string) => void): void;
  module encrypt {
  }
  export = encrypt;
}