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

import {ElementRepo} from './element-repo';
import {CleanupPass} from './cleanup-passes/util';
import {cleanupPasses as bowerPasses} from './cleanup-passes/bower';
import {cleanupPasses as readmePasses} from './cleanup-passes/readme';
import {cleanupPasses as testPasses} from './cleanup-passes/tests';
import {cleanupPasses as travisPasses} from './cleanup-passes/travis';


const cleanupPasses: CleanupPass[] = [].concat(
  bowerPasses,
  readmePasses,
  testPasses,
  travisPasses
);

/**
 * The meat of the implementation. If any cleanup step makes any changes it
 * should then set element.dirty. The rest of the implementation
 * will take care of pushing the changes up and making PRs.
 *
 * Each cleanup step is given an object that contains a ton of info about an
 * element repo.
 *
 * To add a cleanup step, just add it to the array of passes above.
 */
export async function cleanup(element : ElementRepo):Promise<void> {
  for (const step of cleanupPasses) {
    await step(element);
  }
}
