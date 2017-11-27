/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

'use strict';

import * as nodegit from 'nodegit';
import * as fs from 'fs';
import * as path from 'path';
import {ElementRepo} from '../element-repo';

/**
 * Synchronously determines whether the given file exists.
 */
export function existsSync(fn: string): boolean {
  try {
    fs.statSync(fn);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Creates a commit for the element and marks it as dirty.
 */
export async function makeCommit(
    element: ElementRepo, files: string[], commitMessage: string):
    Promise<void> {
  const getSignature = () => nodegit.Signature.now(
      'Polymer Format Bot', 'format-bot@polymer-project.org');

  element.dirty = true;
  await element.repo.createCommitOnHead(
      files, getSignature(), getSignature(), commitMessage);
}

/**
 * Given an element repo, return the canonical JSBin example
 */
export function getJsBinLink(element: ElementRepo): string {
  // default jsbin
  let jsbin = 'https://jsbin.com/cagaye/edit?html,output';
  const pathToGuide = path.join(element.dir, 'CONTRIBUTING.md');
  if (existsSync(pathToGuide)) {
    const guideContents = fs.readFileSync(pathToGuide, 'utf8');
    // Extract the line that looks like:
    //     jsbin=https://jsbin.com/...
    const m =
        guideContents.match(/\n\s*jsbin\s*=\s*(https:\/\/jsbin\.com\/[^\s]*)/);
    if (m) {
      jsbin = m[1];
    }
  }
  return jsbin;
}
