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
import * as url from 'url';

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo';
import {existsSync, makeCommit} from './util';

type TravisEnv = {global?: string[], matrix?: string[]};

interface TravisConfig {
  script?: string[];
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
  sudo?: 'false' | 'required',
  env?: TravisEnv;
  node_js?: string | number;
}

function writeJson(filePath: string, config: string) {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
};

function replaceString(oldS:string, newS:string, fullS:string) {
  return fullS.split(oldS).join(newS);
}
function cleanVariant(obj: any):any {
  delete obj['hydrolysis'];
  delete obj['web-component-tester'];
  return obj;
}

const skipDependencies = [
  'web-component-tester',
  'hydrolysis',
  'promise-polyfill',
  'marked',
  'intl-messageformat',
  'intl',
  'pouchdb',
  'pouchdb-find',
  'note-app-elements',
  'moment',
  'web-animations-js',
  'sw-toolbox',
  'd3',
  'google-youtube',
  'prism',
  'web-animations-js',
  'polymerfire',
  'fetch',
];

function dependencyBackwardsMapper(name:string, value: string) {
  const valueLC = value.toLowerCase();
  if (skipDependencies.indexOf(name) !== -1) {
    return null;
  }
  if (valueLC === '*') {
    return null;
  }
  if (name === 'web-component-tester') {
    return 'v6.0.0-prerelease.5';
  }
  if (valueLC.startsWith('polymer/polymer')) {
    return 'Polymer/polymer#^1.1.0';
  }
  if (valueLC.startsWith('webcomponents/webcomponentsjs')) {
    return 'webcomponents/webcomponentsjs#^0.7.0';
  }
  if (valueLC.startsWith('polymerelements/test-fixture')) {
    return 'PolymerElements/test-fixture#^1.0.0';
  }
  if (name === 'paper-text-field') {
    return value.substring(0, value.indexOf('#')) + '#^0.1.0';
  }
  if (name === 'app-elements') {
    return value.substring(0, value.indexOf('#')) + '#^0.10.1';
  }
  if (name === 'app-localize-behavior') {
    return value.substring(0, value.indexOf('#')) + '#^0.10.1';
  }
  if (name === 'app-layout') {
    return value.substring(0, value.indexOf('#')) + '#^0.10.6';
  }
  if (name === 'iron-location') {
    return value.substring(0, value.indexOf('#')) + '#^0.8.11';
  }
  if (name === 'app-route') {
    return value.substring(0, value.indexOf('#')) + '#^0.9.3';
  }
  if (name === 'app-pouchdb') {
    return value.substring(0, value.indexOf('#')) + '#^0.9.5';
  }
  if (name === 'app-storage') {
    return value.substring(0, value.indexOf('#')) + '#^0.1.0';
  }
  if (valueLC.startsWith('polymerelements/')) {
    return value.substring(0, value.indexOf('#')) + '#^0.9.8';
  }
  console.log('NO TRANSFORMATION TO: ', name, value);
  return value;
}

function dependencyMapper(name:string, value: string) {
  const valueLC = value.toLowerCase();
  if (skipDependencies.indexOf(name) !== -1) {
    return value;
  }
  if (valueLC === '*') {
    return value;
  }
  if (name === 'web-component-tester') {
    return 'v6.0.0-prerelease.5';
  }
  if (valueLC.startsWith('polymer/polymer')) {
    return 'Polymer/polymer#2.0-preview';
  }
  if (valueLC.startsWith('webcomponents/webcomponentsjs')) {
    return 'webcomponents/webcomponentsjs#v1';
  }
  if (valueLC.startsWith('polymerelements/test-fixture')) {
    return 'PolymerElements/test-fixture#custom-elements-v1';
  }
  if (valueLC.startsWith('polymerelements/')) {
    return value.substring(0, value.indexOf('#')) + '#2.0-preview';
  }
  if (name === 'paper-button' && valueLC === '^1.0.0') {
    return 'PolymerElements/paper-button#2.0-preview';
  }
  console.log('NO TRANSFORMATION TO: ', name, value);
  return value;
}

/**
 * STEP 1: Fixup wct invocation in tests/
 *
 * if no test/ directory found, skip
 * for each HTML file where "WCT.loadSuites" is found:
 *   - find call to "WCT.loadSuites" and slice out the array
 *   - for each element in suite:
 *     - if dom=shadow, ignore
 *     - if other and no dom=shadow pair, ignore
 *     - otherwise, add queries
 *   - replace old array with new array (formatted)
 *   - if they match +/- dom=shadow, append "?wc-shadydom=true&wc-ce=true" to the first
 *   - write back to file
 *   - save
 */
function updateTestIndex(element: ElementRepo) {
  let indexPath = path.join(element.dir, 'test', 'index.html');
  let indexHtml: string;
  try {
    indexHtml = fs.readFileSync(indexPath, 'utf8');
  } catch (err) {
    console.log('skipping', indexPath);
    return;
  }
  const suitesArrayLocation = [
    indexHtml.indexOf('WCT.loadSuites(') + 'WCT.loadSuites('.length,
    indexHtml.indexOf(']);') + 1,
  ];

  if (suitesArrayLocation.some((n) => n <= 15)) {
   return;
  }

  const suiteArrayStr = indexHtml.substring(suitesArrayLocation[0], suitesArrayLocation[1]);
  let suiteArray: string[];
  try {
    suiteArray = eval(suiteArrayStr);
  } catch (err) {
    console.log('BAD JS', suiteArrayStr);
    console.log('BAD HTML', indexHtml);
    throw err;
  }

  suiteArray.forEach((el: string) => {
    if (el.indexOf('dom=shadow') > -1) {
      return;
    }
    if (typeof suiteArray.find((x: string) => x === el + '?dom=shadow') === 'undefined') {
      return;
    }
    const newTestPath = url.parse(el).pathname + '?wc-shadydom=true&wc-ce=true';
    indexHtml = indexHtml.replace(`'${el}'`, `'${newTestPath}'`);
  });

  return indexHtml;
};

function upgradeBowerVariantsAndDeps(bowerConfig: any): any {
  bowerConfig.variants = {};
  bowerConfig.variants['1.x'] = {};
  if (bowerConfig.dependencies) {
    bowerConfig.variants['1.x'].dependencies = cleanVariant(Object.assign({}, bowerConfig.dependencies));
  }
  if (bowerConfig.devDependencies) {
    bowerConfig.variants['1.x'].devDependencies = cleanVariant(Object.assign({}, bowerConfig.devDependencies));
  }

  for (const dep in bowerConfig.dependencies) {
    if (bowerConfig.dependencies.hasOwnProperty(dep)) {
      let depVersion = bowerConfig.dependencies[dep];
      let newDepVersion = dependencyMapper(dep, depVersion);
      if (newDepVersion) {
        bowerConfig.dependencies[dep] = newDepVersion;
      }
    }
  }

  for (const dep in bowerConfig.devDependencies) {
    if (bowerConfig.devDependencies.hasOwnProperty(dep)) {
      let depVersion = bowerConfig.devDependencies[dep];
      let newDepVersion = dependencyMapper(dep, depVersion);
      if (newDepVersion) {
        bowerConfig.devDependencies[dep] = newDepVersion;
      }
    }
  }

  return bowerConfig;
}


function downgradeBowerVariants(bowerConfig: any): any {
  bowerConfig.variants = {};
  bowerConfig.variants['1.x'] = {};

  if(bowerConfig.dependencies) {
    bowerConfig.variants['1.x']['dependencies'] = {};
    for (const dep in bowerConfig.dependencies) {
      if (bowerConfig.dependencies.hasOwnProperty(dep)) {
        let depVersion = bowerConfig.dependencies[dep];
        let newDepVersion = dependencyBackwardsMapper(dep, depVersion);
        if (newDepVersion) {
          bowerConfig.variants['1.x'].dependencies[dep] = newDepVersion;
        }
      }
    }
  }

  if(bowerConfig.devDependencies) {
    bowerConfig.variants['1.x']['devDependencies'] = {};
    for (const dep in bowerConfig.devDependencies) {
      if (bowerConfig.devDependencies.hasOwnProperty(dep)) {
        let depVersion = bowerConfig.devDependencies[dep];
        let newDepVersion = dependencyBackwardsMapper(dep, depVersion);
        if (newDepVersion) {
          bowerConfig.variants['1.x'].devDependencies[dep] = dependencyBackwardsMapper(dep, depVersion);
        }
      }
    }
  }

  return bowerConfig;
}
/**
 * Step 2: Add variants to  bower.json
 * - read bower.json
 * - change version number to 2.0
 * - for each dependency & devDependency:
 *   - copy as-is to "1.x" variants
 *   - if PolymerElements/ or whitelisted, change branch to #2.0-preview
 * - save back to bower.json
 */
function updateBowerJson(element: ElementRepo) {
  const bowerPath = path.join(element.dir, 'bower.json');
  if (!existsSync(bowerPath)) {
    return;  // no bower file to cleanup!
  }
  let bowerConfig = JSON.parse(fs.readFileSync(bowerPath, 'utf8'));

  if (!bowerConfig) {
    return;  // no bower to cleanup
  }

  const hasWct = !!bowerConfig.devDependencies && bowerConfig.devDependencies['web-component-tester'];
  if (hasWct) {
    bowerConfig.devDependencies['web-component-tester'] = 'v6.0.0-prerelease.5';
  }

  if (bowerConfig.variants) {
    if (hasWct) {
      return bowerConfig;
    }
    return;
  }

  if (!bowerConfig.dependencies) {
    return;
  }
  if (!bowerConfig.dependencies['polymer']) {
      return;
  }
  bowerConfig.version = '2.0.0';

  const currentPolymerVersion = bowerConfig.dependencies['polymer'];
  if (currentPolymerVersion.indexOf('#2.0-preview') === -1) {
    bowerConfig = upgradeBowerVariantsAndDeps(bowerConfig);
  } else {
    bowerConfig = downgradeBowerVariants(bowerConfig);
  }


  // fs.writeFileSync(bowerPath, JSON.stringify(bowerConfig, null, 2) + '\n', 'utf8');

  return bowerConfig;
}

function updateTravisYaml(element: ElementRepo) {

  // Step 3: Add config to travis
    // install polymer cli
    // change bower install to polymer install
    // wct -> polymer test

  const travisConfigPath = path.join(element.dir, '.travis.yml');
  if (!existsSync(travisConfigPath)) {
    return;  // no travis file to cleanup!
  }

  const travisConfigBlob = fs.readFileSync(travisConfigPath, 'utf8');
  let travis: TravisConfig = yaml.safeLoad(travisConfigBlob);

  if (!travis.before_script || !travis.script) {
    return;
  }

  const beforeScriptHasBowerInstall = travis.before_script.some((s) => {
    return s === 'bower install';
  });
  const beforeScriptHasNpmInstall = travis.before_script.some((s) => {
    return s.indexOf('npm install') !== -1;
  });
  const scriptHasWCT = travis.script.some((s) => {
    return s.indexOf('wct') !== -1;
  });

  if(!beforeScriptHasBowerInstall || !beforeScriptHasNpmInstall || !scriptHasWCT) {
    return;
  }

  travis.before_script = travis.before_script.map((s) => {
    if (s === 'polylint') {
      return null;
    }
    if (s === 'bower install') {
      s = 'polymer install --variants';
    }
    if (s.indexOf('npm install') !== -1) {
      s = s.replace('web-component-tester', 'polymer-cli@next');
      s = s.replace(' polylint', '');
    }
    return s;
  }).filter((s) => !!s);

  travis.script = travis.script.map((s) => {
    return s.replace('wct', 'polymer test');
  });

  const updatedTravisConfigBlob = yaml.safeDump(travis, {lineWidth: 1000});
  return updatedTravisConfigBlob;
}

async function addVariants(element: ElementRepo): Promise<void> {

  const indexHtmlPath = path.join(element.dir, 'test', 'index.html');
  const bowerJsonPath = path.join(element.dir, 'bower.json');
  const travisYamlPath = path.join(element.dir, '.travis.yml');
  const newIndexHtml = updateTestIndex(element);
  const newBowerJson = updateBowerJson(element);
  const newTravisYaml = updateTravisYaml(element);

  if(newIndexHtml || newBowerJson || newTravisYaml) {
    element.needsReview = true;
    const filesToCommit:string[] = [];

    if(newIndexHtml) {
      fs.writeFileSync(indexHtmlPath, newIndexHtml, 'utf8');
      filesToCommit.push('test/index.html');
    }
    if(newBowerJson) {
      writeJson(bowerJsonPath, newBowerJson);
      filesToCommit.push('bower.json');
    }
    if(newTravisYaml) {
      fs.writeFileSync(travisYamlPath, newTravisYaml, 'utf8');
      filesToCommit.push('.travis.yml');
    }

    await makeCommit(element, filesToCommit, 'auto-generated: update repo for v2');
  }
}


register({
  name: 'add-variants',
  pass: addVariants,
  runsByDefault: true,
});
