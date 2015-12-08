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

import * as fs from 'fs';
import * as path from 'path';
import {ElementRepo} from '../element-repo.ts';
import {existsSync, makeCommit} from './util';

/**
 * Cleans up a number of common bower problems, like no "main" attribute,
 * "main" being an array rather than a string, etc.
 */
async function cleanupBower(element: ElementRepo): Promise<void> {
  // Write the bower config object out to the given path
  function writeToBower(bowerPath: string, bowerConfig: Object) {
    fs.writeFileSync(
        bowerPath, JSON.stringify(bowerConfig, null, 2) + '\n', 'utf8');
  }

  let bowerConfig: any = null;
  const bowerPath = path.join(element.dir, 'bower.json');
  if (!existsSync(bowerPath)) {
    return;  // no bower file to cleanup!
  }
  bowerConfig = JSON.parse(fs.readFileSync(bowerPath, 'utf8'));

  if (!bowerConfig) {
    return;  // no bower to cleanup
  }

  // Clean up nonexistant bower file
  if (!bowerConfig['main'] || bowerConfig['main'].length === 0) {
    const elemFile = path.basename(element.dir) + '.html';

    if (existsSync(path.join(element.dir, elemFile))) {
      bowerConfig['main'] = elemFile;
      writeToBower(bowerPath, bowerConfig);
      await makeCommit(element, ['bower.json'], 'Add bower main file.');
    }
  }

  // Clean up an array bower file:
  if (Array.isArray(bowerConfig['main']) &&
      bowerConfig['main'].length === 1) {
    bowerConfig['main'] = bowerConfig['main'][0];
    writeToBower(bowerPath, bowerConfig);
    await makeCommit(
        element, ['bower.json'],
        'Convert bower main from array to string.');
  }

  if (!bowerConfig) {
    return null;
  }

  if (!bowerConfig['ignore']) {
    bowerConfig['ignore'] = [];
    writeToBower(bowerPath, bowerConfig);
    await makeCommit(
        element, ['bower.json'], 'Add an ignore property to bower.json.');
  }
}

export let cleanupPasses = [cleanupBower];
