/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
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
import {ElementRepo} from '../element-repo';
import {existsSync, makeCommit} from './util';

type WCTConfig = {
  suites?: string[];
  environmentImports?: string[];
  plugins?: {local?: {browserOptions?: {[browser: string]: string[];}}}
};

// disable chrome sandbox due to travis-ci/travis-ci#8836
const ChromeSandbox = ['no-sandbox'];

const ChromeHeadlessConfig = [
  'headless',
  'disable-gpu',
];

const FirefoxHeadlessConfig = ['-headless'];

async function cleanupWctConf(element: ElementRepo): Promise<void> {
  const wctConfigPath = path.join(element.dir, 'wct.conf.json');
  let wctConfigBlob = '';
  let wctConfig: WCTConfig = {};

  if (existsSync(wctConfigPath)) {
    wctConfigBlob = fs.readFileSync(wctConfigPath).toString();
    wctConfig = JSON.parse(wctConfigBlob);
  }

  const headlessConfigs = {
    local: {
      browserOptions: {
        chrome: [...ChromeSandbox, ...ChromeHeadlessConfig],
        firefox: FirefoxHeadlessConfig
      }
    }
  };

  wctConfig.plugins = {...wctConfig.plugins, ...headlessConfigs};

  const updatedWctConfigBlob = JSON.stringify(wctConfig, null, 2);

  if (wctConfigBlob !== updatedWctConfigBlob) {
    element.needsReview = true;
    fs.writeFileSync(wctConfigPath, updatedWctConfigBlob, {encoding: 'utf-8'});
    await makeCommit(element, ['wct.conf.json'], 'Update WCT config');
  }
}

register({name: 'wct-conf', pass: cleanupWctConf});
