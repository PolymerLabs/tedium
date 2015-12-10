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
import {ElementRepo} from '../element-repo';
import {existsSync, makeCommit} from './util';

async function cleanupTravisConfig(element: ElementRepo): Promise<void> {
  const travisConfigPath = path.join(element.dir, '.travis.yml');

  if (!existsSync(travisConfigPath)) {
    return;
  }

  const travisConfigBlob = fs.readFileSync(travisConfigPath, 'utf8');

  let travis = yaml.safeLoad(travisConfigBlob);

  // a small state class to represent the decision to make a PR or a commit to head
  // Once tripped, a PR will be made
  class Reviewer {
    private _needsReview = false
    get needsReview() {
      return this._needsReview;
    }
    set needsReview(value: boolean) {
      if (!this._needsReview) {
        this._needsReview = value;
      }
    }
  }

  const review = new Reviewer();

  const tools: string[] = [
    'bower',
    'polylint',
    'web-component-tester'
  ];

  const beforeScript: string[] = [
    `npm install -g ${tools.join(" ")}`,
    'bower install',
    'polylint'
  ];

  // update travis config
  // Add polylint to all elements
  if (Array.isArray(travis.before_script)) {
    // assume we need review
    const bs: string[] = travis.before_script;
    if (bs.length !== beforeScript.length) {
      travis.before_script = beforeScript;
      review.needsReview = true;
    } else {
      for (let i = 0; i < bs.length; i++) {
        if (bs[i] !== beforeScript[i]) {
          travis.before_script = beforeScript;
          review.needsReview = true;
          break;
        }
      }
    }
  }

  // use stable node (v5+)

  if (travis.node_js !== 'stable') {
    travis.node_js = 'stable';
  }

  // travis addons

  if (!travis.addons) {
    travis.addons = {};
  }
  const ta = travis.addons;

  //use latest firefox

  if (!ta.firefox) {
    ta.firefox = 'latest';
  }

  // use sauce addon to speed up tunnel creation
  if (!ta.sauce_connect) {
    ta.sauce_connect = true;
  }

  // update node >= 4 dependencies
  // https://docs.travis-ci.com/user/languages/javascript-with-nodejs#Node.js-v4-(or-io.js-v3)-compiler-requirements

  const C11Source = 'ubuntu-toolchain-r-test';
  const C11Package = 'g++-4.8';
  const C11Env = 'CXX=g++-4.8';

  if (!ta.apt) {
    ta.apt = {
      sources: [],
      packages: []
    }
  }

  if (ta.apt.sources.indexOf(C11Source) === -1) {
    ta.apt.sources.push(C11Source);
  }
  if (ta.apt.packages.indexOf(C11Package) === -1) {
    ta.apt.packages.push(C11Package);
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

  // travis env
  let te = travis.env;
  if (!te) {
    te = {global: []};
  } else if (Array.isArray(te)) {
    te = {global: te};
  }

  if (te.global.indexOf(C11Env) === -1) {
    te.global.push(C11Env);
  }

  travis.env = te;

  const updatedTravisConfigBlob = yaml.safeDump(travis);

  if (travisConfigBlob !== updatedTravisConfigBlob) {
    fs.writeFileSync(travisConfigPath, updatedTravisConfigBlob, 'utf8');
    element.needsReview = review.needsReview;
    // if this commit needs review, run the tests
    // otherwise this is probably an innocuous run
    const commitMessage =
        `${!review.needsReview ? '[ci skip] ' : ''}Update travis config`;
    await makeCommit(element, ['.travis.yml'], commitMessage);
  }
}

export let cleanupPasses = [cleanupTravisConfig];
