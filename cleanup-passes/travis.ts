/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import {ElementRepo} from '../element-repo';
import {existsSync, makeCommit} from './util';
import * as yaml from 'js-yaml';

async function cleanupTravisConfig(element:ElementRepo):Promise<void> {
  const travisConfigPath = path.join(element.dir, '.travis.yml');

  if (!existsSync(travisConfigPath)) {
    return;
  }

  const travisConfigBlob = fs.readFileSync(travisConfigPath, 'utf8');

  let travis = yaml.safeLoad(travisConfigBlob);

  let needsReview = false;

  // update travis config
  // Add polylint to all elements
  if (Array.isArray(travis.before_script)) {
    const installStep = 'npm install polylint';
    const runStep = 'polylint';

    // assume we need a review
    needsReview = true;

    const bs: string[] = travis.before_script;
    const installIndex = bs.indexOf(installStep);
    const runIndex = bs.indexOf(runStep);

    if (installIndex < 0 && runIndex < 0) {
      // add both steps
      bs.push(installStep);
      bs.push(runStep);
    } else if (runIndex >= 0 && installIndex < 0) {
      // add install step before run step
      bs.splice(runIndex, 0, installStep);
    } else if (runIndex < 0 && installIndex >= 0) {
      // add run step after install step
      bs.push(runStep);
    } else if (runIndex < installIndex) {
      // reorder install step to be before run step
      bs.splice(installIndex, 1);
      bs.splice(runIndex, 0, installStep);
    } else {
      // all is well
      needsReview = false;
    }
  }

  // update travis config

  const updatedTravisConfigBlob = yaml.safeDump(travis);

  if (travisConfigBlob !== updatedTravisConfigBlob) {
    fs.writeFileSync(travisConfigPath, updatedTravisConfigBlob, 'utf8');
    element.needsReview = needsReview;
    // if this commit needs review, run the tests
    // otherwise this is probably an innocuous run
    const commitMessage = `${!needsReview ? '[ci skip] ' : ''}Update travis config`;
    await makeCommit(element, ['.travis.yml'], commitMessage);
  }
}




export let cleanupPasses = [cleanupTravisConfig];
