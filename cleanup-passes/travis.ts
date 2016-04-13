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
import * as yaml from 'js-yaml';
import * as path from 'path';

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo';
import {existsSync, makeCommit} from './util';

type TravisEnv = {global?: string[], matrix?: string[]};

interface TravisConfig {
  before_script?: string[];
  addons?: {
    firefox?: string | number,
    sauce_connect?: boolean,
    apt?: {
      packages?: string[],
      sources?: string[]
    }
  };
  dist?: string,
  sudo?: string,
  env?: TravisEnv;
  node_js?: string;
}

async function cleanupTravisConfig(element: ElementRepo): Promise<void> {
  const travisConfigPath = path.join(element.dir, '.travis.yml');

  if (!existsSync(travisConfigPath)) {
    return;
  }

  const travisConfigBlob = fs.readFileSync(travisConfigPath, 'utf8');

  let travis: TravisConfig = yaml.safeLoad(travisConfigBlob);

  const tools = [
    'bower',
    'polylint',
    'web-component-tester'
  ];

  const beforeScript = [
    `npm install -g ${tools.join(" ")}`,
    'bower install',
    'polylint'
  ];

  // update travis config
  // Add polylint to all elements
  if (Array.isArray(travis.before_script)) {
    const beforeScriptEqual = travis.before_script.reduce(
      (acc, s, idx) => { return acc && (beforeScript[idx] === s) }, true);
    if (!beforeScriptEqual) {
      travis.before_script = beforeScript;
    }
  }

  // use ubuntu trusty
  travis.dist = 'trusty';
  travis.sudo = 'required';

  // use stable node (v5+)
  travis.node_js = 'stable';

  // travis addons

  if (!travis.addons) {
    travis.addons = {};
  }
  const ta = travis.addons;

  // use latest firefox, unless specified
  if (!ta.firefox) {
    ta.firefox = 'latest';
  }

  // use sauce addon to speed up tunnel creation
  ta.sauce_connect = true;

  if (!ta.apt) {
    ta.apt = {
      sources: [],
      packages: []
    }
  }

  // use stable chrome
  const ChromeSource = 'google-chrome';
  const ChromePackage = 'google-chrome-stable';
  if (ta.apt.sources.indexOf(ChromeSource) === -1) {
    ta.apt.sources.push(ChromeSource);
  }
  if (ta.apt.packages.indexOf(ChromePackage) === -1) {
    ta.apt.packages.push(ChromePackage);
  }

  // Shape travis env to object with global and/or matrix arrays
  let te = travis.env;
  if (!te) {
    te = {global: []};
  } else if (Array.isArray(te)) {
    te = {global: <string[]>te};
  }

  // C11 dependencies for node >= 4
  // unneeded for trusty
  // https://docs.travis-ci.com/user/languages/javascript-with-nodejs#Node.js-v4-(or-io.js-v3)-compiler-requirements
  const C11Source = 'ubuntu-toolchain-r-test';
  const C11Package = 'g++-4.8';
  const C11Env = 'CXX=g++-4.8';

  // remove C11 config (not needed in trusty dist)
  ta.apt.sources = ta.apt.sources.filter(s => s !== C11Source);
  ta.apt.packages = ta.apt.packages.filter(p => p !== C11Package);
  te.global = te.global.filter(e => e !== C11Env);

  travis.env = te;

  const updatedTravisConfigBlob = yaml.safeDump(travis);

  if (travisConfigBlob !== updatedTravisConfigBlob) {
    // changes to travis should always need review
    element.needsReview = true;
    fs.writeFileSync(travisConfigPath, updatedTravisConfigBlob, 'utf8');
    await makeCommit(element, ['.travis.yml'], 'Update travis config');
  }
}

register({
  name: 'travis',
  pass: cleanupTravisConfig,
  runsByDefault: true,
});
