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
import * as travisEncrypt from 'travis-encrypt';
import * as promisify from 'promisify-node';

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo';
import {existsSync, makeCommit, arraysEqual} from './util';

type SecureEnv = {
  secure: string;
};

type GlobalEnvKey = string|SecureEnv;

type TravisEnv = {
  global?: GlobalEnvKey[];
  matrix?: string[];
};

interface TravisConfig {
  before_script?: string[];
  install?: string[];
  addons?: {
    firefox?: string|number;
    chrome?: string | number;
    sauce_connect?: boolean;
    apt?: {packages?: string[]; sources?: string[];};
  };
  script?: string[];
  dist?: string;
  sudo?: 'false'|'required';
  env?: TravisEnv;
  node_js?: string|number|string[];
  cache?: {directories?: string[];};
}

type SauceCredentials = {
  username: string; accessKey: string;
};

async function cleanupTravisConfig(element: ElementRepo): Promise<void> {
  const travisConfigPath = path.join(element.dir, '.travis.yml');
  if (!existsSync(travisConfigPath)) {
    return;
  }

  const travisConfigBlob = fs.readFileSync(travisConfigPath, 'utf8');

  let travis: TravisConfig = yaml.safeLoad(travisConfigBlob) || {};

  const tools = ['polymer-cli'];

  // Override install script for all elements
  const install =
      [`npm install -g ${tools.join(' ')}`, 'polymer install --variants'];
  if (!Array.isArray(travis.install) || !arraysEqual(travis.install, install)) {
    travis.install = install;
  }

  // Add polymer lint to all elements
  const beforeScript = ['polymer lint'];
  if (!Array.isArray(travis.before_script) ||
      !arraysEqual(travis.before_script, beforeScript)) {
    travis.before_script = beforeScript;
  }

  // Use Ubuntu Trusty
  travis.dist = 'trusty';

  // Use Docker
  // Note: must explicitly set to 'false' to enable docker instances
  // https://docs.travis-ci.com/user/reference/trusty/#Container-based-with-sudo%3A-false
  travis.sudo = 'false';

  // Use LTS Node
  travis.node_js = 'stable';

  // Ensure all variants are being tested across all browsers
  const script = [
    'polymer test',
    '>-\nif [ "${TRAVIS_PULL_REQUEST}" = "false" ]; then polymer test -s \'default\';\nfi'
  ];
  if (!Array.isArray(travis.script) || !arraysEqual(travis.script, script)) {
    travis.script = script;
  }

  // Setup Travis Add-ons
  if (!travis.addons) {
    travis.addons = {};
  }
  const ta = travis.addons;

  // Use stable Chrome
  ta.chrome = 'stable';
  // Use latest FireFox
  ta.firefox = 'latest';

  // Do not use Sauce Connect Add-on, let WCT handle it
  if (ta.sauce_connect !== undefined) {
    delete ta.sauce_connect;
  }
  if (ta.apt) {
    delete ta.apt;
  }

  // Cache node_modules
  // https://docs.travis-ci.com/user/caching/#Arbitrary-directories
  if (!travis.cache) {
    travis.cache = {};
  }
  if (!travis.cache.directories) {
    travis.cache.directories = ['node_modules'];
  }
  const cachedirs = travis.cache.directories;
  if (!cachedirs.includes('node_modules')) {
    cachedirs.push('node_modules');
  }

  // Shape Travis ENV to object with global and/or matrix arrays
  let te = travis.env;
  if (!te) {
    te = {global: []};
  } else if (Array.isArray(te)) {
    te = {global: <GlobalEnvKey[]>te};
  }
  if (!te.global) {
    te.global = [];
  }

  const sauceCredentials: SauceCredentials =
      JSON.parse(fs.readFileSync('sauce-credentials.json').toString());

  // Set up sauce keys
  // remove secure keys
  const global = te.global.filter((g) => g instanceof String);
  // encrypt new sauce keys
  const repoName = `${element.ghRepo.owner.login}/${element.ghRepo.name}`;
  const encryptor = promisify(travisEncrypt);
  const username = await encryptor(
      {repo: repoName, data: `SAUCE_USERNAME=${sauceCredentials.username}`});
  const accessKey = await encryptor(
      {repo: repoName, data: `SAUCE_ACCESS_KEY=${sauceCredentials.accessKey}`});
  global.push({secure: username});
  global.push({secure: accessKey});
  te.global = global;

  travis.env = te;

  const updatedTravisConfigBlob = yaml.safeDump(travis);

  if (travisConfigBlob !== updatedTravisConfigBlob) {
    // Changes to Travis should always need review
    element.needsReview = true;
    fs.writeFileSync(
        travisConfigPath, updatedTravisConfigBlob, {encoding: 'utf8'});
    await makeCommit(element, ['.travis.yml'], 'Update travis config');
  }
}

register({name: 'travis', pass: cleanupTravisConfig, runsByDefault: true});
