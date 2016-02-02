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
import {ElementRepo} from '../element-repo.ts';
import {existsSync, makeCommit} from './util';

const dependencyMap = {
  "webcomponentsjs": "webcomponents.js",
  "web-component-tester": "web-component-tester",
  "polymer": "@polymer/polymer",
  "chartjs": "chart.js",
  "hydrolysis": "hydrolysis",
  "dom5": "dom5",
  "page": "page",
  "prism": "prismjs-package",
  "d3": "d3",
  "marked": "marked",
  "web-animations-js": "web-animations-js",
  "sw-toolbox": "sw-toolbox",
  "fetch": "whatwg-fetch",
  // TODO: need to tedium the following separately with --repo
  "promise-polyfill": "@polymer/promise-polyfill",
  "app-layout": "@polymer/app-layout",
};

function getNpmName(name: string, version: string) {
  version = version.toLowerCase();
  if (dependencyMap[name]) {
    return dependencyMap[name];
  }
  if (version.startsWith('polymerelements/')) {
    return `@polymer/${name}`;
  }
}

function getPackageVersion(name: string) {
  if (name === 'polymer') {
    return '1.2.5-npm-test.1';
  } else {
    return '0.0.1';
  }
}

function getDependencyVersion(name: string, version: string) {
  version = version.toLowerCase();
  if (name === 'polymer') {
    return '1.2.5-npm-test.1';
  } else if (version.startsWith('polymerelements/')) {
    return '^0.0.1';
  }
  return version.substring(version.indexOf('#') + 1);
}

/**
 * Cleans up a number of common bower problems, like no "main" attribute,
 * "main" being an array rather than a string, etc.
 */
async function cleanupNpm(element: ElementRepo): Promise<void> {
  const writeJson = (filePath: string, config: Object) => {
    let fullPath = path.join(element.dir, filePath);
    fs.writeFileSync(fullPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  };

  const readJson = (filePath: string) => {
    let fullPath = path.join(element.dir, filePath);
    if (fs.existsSync(fullPath)) {
      return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    }
    return {};
  };

  let bowerConfig: any = readJson('bower.json');
  let npmConfig: any = readJson('package.json');

  if (!bowerConfig) {
    throw new Error('bower.json not found');
  }

  if (bowerConfig['name'] !== 'polymer' && npmConfig['name']) {
    console.warn(`\nunexpected existing package.json for ${element.repo}`);
    // throw new Error(`unexpected existing package.json for ${element.repo}`);
  }

  const copyProperty = (name: string, bowerName?: string) =>
      npmConfig[name] = bowerConfig[bowerName || name] || npmConfig[name];

  npmConfig['name'] = `@polymer/${bowerConfig['name']}`;
  npmConfig['version'] = getPackageVersion(bowerConfig['name']);

  // properties that can be directly copied
  ['description', 'repository', 'ignore', 'keywords']
      .forEach((s, _) => copyProperty(s));

  // authors => contributors
  // https://docs.npmjs.com/files/package.json#people-fields-author-contributors
  copyProperty('contributors', 'authors');

  // make it public
  delete npmConfig['private'];

  // https://docs.npmjs.com/files/package.json#license
  npmConfig['license'] = "BSD-3-Clause";

  let npmDependencies = npmConfig['dependencies'] =
      npmConfig['dependencies'] || {};
  let bowerDependencies = bowerConfig['dependencies'] || {};
  let npmDevDependencies = npmConfig['devDependencies'] =
      npmConfig['devDependencies'] || {};
  let bowerDevDependencies = bowerConfig['devDependencies'] =
      bowerConfig['devDependencies'] || {};

  npmDevDependencies['web-component-tester'] = '^4.0.0';

  for (let bowerDep in bowerDependencies) {
    let bowerVersion = bowerDependencies[bowerDep];
    let npmDep = getNpmName(bowerDep, bowerVersion);
    if (!npmDep) {
      // console.warn(`*** no npm name mapping found for ${bowerDep}:${bowerVersion} in ${bowerConfig['name']}`);
      throw new Error(`no npm name mapping found for ${bowerDep}:${bowerVersion} in ${bowerConfig['name']}`);
    }
    npmDependencies[npmDep] = getDependencyVersion(bowerDep, bowerVersion);
  }

  for (let bowerDep in bowerDevDependencies) {
    let bowerVersion = bowerDevDependencies[bowerDep];
    let npmDep = getNpmName(bowerDep, bowerVersion);
    if (!npmDep) {
      // console.warn(`*** no npm name mapping found for ${bowerDep}:${bowerVersion} in ${bowerConfig['name']}`);
      throw new Error(`no npm name mapping found for ${bowerDep}:${bowerVersion} in ${bowerConfig['name']}`);
    }
    bowerDevDependencies[npmDep] = getDependencyVersion(bowerDep, bowerVersion);
  }

  console.log(`\npackage.json for ${element.repo}`, JSON.stringify(npmConfig, null, 2));

  writeJson('package.json', npmConfig);

  // element.needsReview = true;
  await makeCommit(element, ['package.json'], 'Update package.json');
}

register({
  name: 'npm',
  pass: cleanupNpm,
  runsByDefault: false,
});
