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
  if (Array.isArray(bowerConfig['main']) && bowerConfig['main'].length === 1) {
    bowerConfig['main'] = bowerConfig['main'][0];
    writeToBower(bowerPath, bowerConfig);
    await makeCommit(
        element, ['bower.json'], 'Convert bower main from array to string.');
  }

  if (!bowerConfig) {
    return undefined;
  }

  if (!bowerConfig['ignore']) {
    bowerConfig['ignore'] = [];
    writeToBower(bowerPath, bowerConfig);
    await makeCommit(
        element, ['bower.json'], 'Add an ignore property to bower.json.');
  }

  if (bowerConfig.devDependencies) {
    const dd = bowerConfig.devDependencies;

    const desiredWjsVersion = 'webcomponents/webcomponentsjs#^1.0.0-rc.1';
    if (dd['webcomponentsjs'] !== desiredWjsVersion) {
      dd['webcomponentsjs'] = desiredWjsVersion;
      writeToBower(bowerPath, bowerConfig);
      await makeCommit(
          element, ['bower.json'],
          `Update webcomponentsjs version to ${desiredWjsVersion}`);
    }
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
  if (bowerConfig.dependencies) {
    const polymerVersion = bowerConfig.dependencies.polymer;
    if (polymerVersion === 'Polymer/polymer#2.0-preview') {
      bowerConfig.dependencies.polymer = 'Polymer/polymer#^2.0.0-rc.1';
      writeToBower(bowerPath, bowerConfig);
      await makeCommit(element, ['bower.json'], `Point to Polymer 2.0 RC 1`);
    }
  }
};

register({
  name: 'bower',
  pass: cleanupBower,
  runsByDefault: true,
});
