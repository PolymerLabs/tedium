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

import * as fse from 'fs-extra';
import * as path from 'path';

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo';
import {makeCommit} from './util';

/**
 * Generate a super minimal package.json from an existing bower.json, and adds
 * `node_modules` to `.gitignore` if needed. Does nothing if there's already a
 * package.json.
 */
async function generatePackageJson(element: ElementRepo): Promise<void> {
  const npmConfigPath = path.join(element.dir, 'package.json');
  if (await fse.pathExists(npmConfigPath)) {
    console.log(`${element.ghRepo.name} already has a package.json, skipping.`);
    return;
  }

  const bowerConfigPath = path.join(element.dir, 'bower.json');
  if (!await fse.pathExists(bowerConfigPath)) {
    throw new Error(`${element.ghRepo.name} has no bower.json.`);
  }
  const bowerConfig: BowerConfig = await fse.readJson(bowerConfigPath);

  const npmConfig: NpmConfig = {
    // This is the style of name we're using for the 3.0 elements on NPM. Might
    // as well be consistent, even though this is a 2.0 package.json.
    name: `@polymer/${bowerConfig.name}`,

    // Make sure we don't accidentally publish this repo.
    private: true,

    // Note that we exclude version because the bower version might not be well
    // maintained, plus it won't get updated here going forward if we do more
    // releases.

    // npm warns if any of these fields aren't set.
    description: bowerConfig.description,
    repository: bowerConfig.repository,
    license: bowerConfig.license,
  };

  // Since we're an NPM package now, we might get some dependencies installed,
  // which we don't want to commit.
  const gitIgnorePath = path.join(element.dir, '.gitignore');
  let gitIgnore = '';
  if (await fse.pathExists(gitIgnorePath)) {
    gitIgnore = (await fse.readFile(gitIgnorePath)).toString();
  }
  if (!gitIgnore.includes('node_modules')) {
    gitIgnore += '\nnode_modules\n';
    await fse.writeFile(gitIgnorePath, gitIgnore);
  }

  await fse.writeJson(npmConfigPath, npmConfig, {spaces: 2});

  await makeCommit(
      element,
      ['package.json', '.gitignore'],
      'Generate minimal package.json from bower.json');
}

register({
  name: 'package-json',
  pass: generatePackageJson,
  runsByDefault: false,
});
