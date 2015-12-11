import {ElementRepo} from './element-repo';

const passes: CleanupPass[] = [];

/**
 * Add a cleanup pass to the global registry.
 */
export function register(p: CleanupPass) {
  passes.push(p);
}

/**
 * Return all cleanup passes that have been registered so far.
 */
export function getPasses() {
  return passes.slice();
}

export interface CleanupPass {
  /**
   * Name of the cleanup pass. Also used as an identifier in the config.json.
   */
  name: string;

  /**
   * Is this cleanup pass stable / reliable enough to run by default?
   */
  runsByDefault: boolean;

  /**
   * The implementation function for the cleanup pass.
   */
  pass(element: ElementRepo): Promise<void>;
}

/**
 * Type of the "passes" section of the config.json.
 *
 * See tedium.ts for the full type of config.json.
 */
export interface CleanupConfig {
  [passName: string]: {
    blacklist?: string[];
  }
}
