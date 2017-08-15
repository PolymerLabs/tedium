/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
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
import * as semver from 'semver';
import {ProjectOptions, LintOptions} from 'polymer-project-config';

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo';
import {existsSync, makeCommit, writeToConfig} from './util';

async function cleanupPolymer(element: ElementRepo): Promise<void> {
  const bowerPath = path.join(element.dir, 'bower.json');
  if (!existsSync(bowerPath)) {
    return;  // No Bower file, skip generating polymer.json
  }
  // Read bower.json for Polymer version to better set Polymer lint rules
  const bowerConfig: any = JSON.parse(fs.readFileSync(bowerPath, 'utf8'));

  if (!bowerConfig || !bowerConfig.dependencies ||
      bowerConfig.dependencies.length === 0 ||
      !bowerConfig.dependencies.polymer) {
    return;  // Not using Polymer, skip generating polymer.json
  }

  const polymerDefault: ProjectOptions = {lint: {rules: []}};

  let polymerConfig: ProjectOptions = polymerDefault;
  const polymerPath = path.join(element.dir, 'polymer.json');
  const configExists = existsSync(polymerPath);
  if (configExists) {
    polymerConfig =
        JSON.parse(fs.readFileSync(polymerPath, 'utf8')) || polymerDefault;
  }

  // Skip if lint rule(s) exist
  if (polymerConfig.lint && polymerConfig.lint.rules &&
      polymerConfig.lint.rules.length > 0) {
    return;
  } else {
    // Default lint property if it doesn't exist
    polymerConfig.lint = polymerDefault.lint as LintOptions;
  }

  // Update the lint property based on the Polymer version
  const polymerVersion = bowerConfig.dependencies.polymer.split('#')[1];
  if (semver.satisfies('2.0', polymerVersion)) {
    if (semver.satisfies('1.9', polymerVersion)) {
      polymerConfig.lint.rules.push('polymer-2-hybrid');
    } else {
      polymerConfig.lint.rules.push('polymer-2');
    }
  } else {
    polymerConfig.lint.rules.push('polymer-1');
  }

  // Write the Polymer config object out to the given path
  writeToConfig(polymerPath, polymerConfig);
  let commitMsg: string = 'Add basic polymer config';
  if (configExists) {
    commitMsg = 'Add polymer lint property';
  }
  await makeCommit(element, ['polymer.json'], commitMsg);
}

register({name: 'polymer', pass: cleanupPolymer, runsByDefault: true});
