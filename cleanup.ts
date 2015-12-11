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

import './cleanup-passes/bower';
import './cleanup-passes/contribution-guide';
import './cleanup-passes/readme';
import './cleanup-passes/tests';
import './cleanup-passes/travis';

import {ElementRepo} from './element-repo';
import {getPasses, CleanupConfig} from './cleanup-pass';

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
export async function cleanup(
    element: ElementRepo, config: CleanupConfig): Promise<void> {
  for (const step of getPasses()) {
    const stepConfig = config[step.name] || {};
    if (!step.runsByDefault) {
      continue;
    }
    if (stepConfig.blacklist &&
        stepConfig.blacklist.indexOf(element.dir) !== -1) {
      continue;
    }
    await step.pass(element);
  }
}
