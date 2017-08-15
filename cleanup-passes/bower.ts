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

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo';
import {existsSync, makeCommit, writeToConfig} from './util';

/**
 * Cleans up a number of common bower problems, like no "main" attribute,
 * "main" being an array rather than a string, etc.
 */
async function cleanupBower(element: ElementRepo): Promise<void> {
  let bowerConfig: any = null;
  const bowerPath = path.join(element.dir, 'bower.json');
  if (!existsSync(bowerPath)) {
    return;  // no bower file to cleanup!
  }
  bowerConfig = JSON.parse(fs.readFileSync(bowerPath, 'utf8'));

  if (!bowerConfig) {
    return;  // no bower to cleanup
  }

  // Clean up nonexistant Bower file main property
  if (!bowerConfig['main'] || bowerConfig['main'].length === 0) {
    const elemFile = path.basename(element.dir) + '.html';

    if (existsSync(path.join(element.dir, elemFile))) {
      bowerConfig['main'] = elemFile;
      writeToConfig(bowerPath, bowerConfig);
      await makeCommit(element, ['bower.json'], 'Add bower main file.');
    }
  }

  // Clean up an array Bower file main property:
  if (Array.isArray(bowerConfig['main']) && bowerConfig['main'].length === 1) {
    bowerConfig['main'] = bowerConfig['main'][0];
    writeToConfig(bowerPath, bowerConfig);
    await makeCommit(
        element, ['bower.json'], 'Convert bower main from array to string.');
  }

  /**
   * Step 1: tsc to compile
   * Step 2: node tedium.js # this is safe, does not push
   * Step 3: look at repos directory. do `git show` to see most recent commit.
   * Step 4: remember you need to pass -b to specify the element branch to start
   * from when making these automatic changes. So in this case: node tedium.js
   * -b 2.0-preview
   * Step 5: oh yeah, don't do everything, just do bower cleanups. node
   * tedium.js -b 2.0-preview --pass=bower
   * Step 6: if that looks good, I like to add the args: -c 1 --forceReview
   *    that makes it create one PR that has to be reviewed by me.
   */
  if (element.dir !== 'repos/polymer-starter-kit' && bowerConfig.dependencies) {
    const polymerVersion = bowerConfig.dependencies.polymer;
    if (polymerVersion === 'Polymer/polymer#2.0-preview') {
      bowerConfig.dependencies.polymer = 'Polymer/polymer#^2.0.0-rc.1';
      writeToConfig(bowerPath, bowerConfig);
      await makeCommit(element, ['bower.json'], `Point to Polymer 2.0 RC 1`);
    }
  }
};

register({
  name: 'bower',
  pass: cleanupBower,
  runsByDefault: true,
});
