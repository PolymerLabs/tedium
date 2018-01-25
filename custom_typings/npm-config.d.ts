interface NpmConfig {
  name?: string;
  private?: boolean;
  version?: string;
  description?: string;
  repository?: string;
  license?: string;
  scripts?: {[key: string]: string};
  devDependencies?: {[key: string]: string};
}
