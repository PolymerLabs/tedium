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
  throw new Error(`no npm name mapping found for ${name}:${version}`);
}

// TODO(justinfagnani): remove all special case versions
const polymerVersion = '1.2.5-npm-test.2';
const elementVersion = '0.0.3';
const promisePolyfillVersion = '1.0.0-npm-test.2';

function getPackageVersion(name: string, version: string) {
  if (name === 'polymer') {
    return polymerVersion;
  }
  // I accidentally published iron-ajax with a dep on promise-polyfill 1.0.0
  if (name === 'promise-polyfill') {
    return promisePolyfillVersion;
  }
  return elementVersion;
}

function getDependencyVersion(name: string, version: string) {
  version = version.toLowerCase();
  if (name === 'polymer') {
    return '^' + polymerVersion;
  }
  // I accidentally published iron-ajax with a dep on promise-polyfill 1.0.0
  if (version.startsWith('polymerlabs/promise-polyfill')) {
    return '^' + promisePolyfillVersion;
  }
  if ((version.startsWith('polymerelements/') ||
      version.startsWith('polymerlabs/') ||
      version.startsWith('polymer/')) &&
      !dependencyMap[name]) {
    return '^' + elementVersion;
  }
  return version.substring(version.indexOf('#') + 1);
}

/**
 * Generate or update package.json from bower.json
 */
async function generatePackageJson(element: ElementRepo): Promise<void> {
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

  // copies a property from bower.json to package.json
  // bower.json is the source of truth
  const copyProperty = (name: string, bowerName?: string) =>
      npmConfig[name] = bowerConfig[bowerName || name] || npmConfig[name];

  npmConfig['name'] = `@polymer/${bowerConfig['name']}`;
  npmConfig['version'] = getPackageVersion(bowerConfig['name'], bowerConfig['version']);

  // properties that can be directly copied
  ['description', 'repository', 'keywords']
      .forEach((s) => copyProperty(s));

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
  let bowerDevDependencies = bowerConfig['devDependencies'] || {};

  for (let bowerDep in bowerDependencies) {
    let bowerVersion = bowerDependencies[bowerDep];
    let npmDep = getNpmName(bowerDep, bowerVersion);
    npmDependencies[npmDep] = getDependencyVersion(bowerDep, bowerVersion);
  }

  for (let bowerDep in bowerDevDependencies) {
    let bowerVersion = bowerDevDependencies[bowerDep];
    let npmDep = getNpmName(bowerDep, bowerVersion);
    npmDevDependencies[npmDep] = getDependencyVersion(bowerDep, bowerVersion);
  }

  writeJson('package.json', npmConfig);

  await makeCommit(element, ['package.json'], 'Generate/update package.json');
}

register({
  name: 'package-json',
  pass: generatePackageJson,
  runsByDefault: false,
});
