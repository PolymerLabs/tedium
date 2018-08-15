/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.  This
 * code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

'use strict';

import * as fse from 'fs-extra';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {execFile} from 'child_process';
import {promisify} from 'util';

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo';
import {makeCommit} from './util';

const execFilePromise = promisify(execFile);

const filesWeMightChange = new Set<string>([
  '.travis.yml',
  '.npmignore',
  '.gitignore',
  'package.json',
  'package-lock.json',
]);

/**
 * Perform updates for 3.0 Polymer elements.
 */
async function v3ElementPass(element: ElementRepo): Promise<void> {
  await updateNpmIgnore(element);
  await updateGitIgnore(element);
  await updateTravisYaml(element);
  await updatePackageJson(element);
  await regeneratePackageLock(element);

  let shouldCommit = false;
  for (const changedFile of await element.repo.getStatus()) {
    const filePath = changedFile.path();
    if (filesWeMightChange.has(filePath)) {
      shouldCommit = true;
    } else {
      throw new Error(
          `${element.ghRepo.name}: Unexpected changed file: ${filePath}`);
    }
  }
  if (shouldCommit) {
    await makeCommit(
        element,
        [...filesWeMightChange],
        'Tedium automated v3 element updates.');
  }
}

register({name: 'v3-elements', pass: v3ElementPass});

const addToNpmIgnore = [
  '*.tgz',
  '.github',
  '.travis.yml',
  'formatconfig.json',
  'gen-tsd.json',
  'test/',
  'wct.conf.json',
];

async function updateNpmIgnore(element: ElementRepo): Promise<void> {
  const npmIgnorePath = path.join(element.dir, '.npmignore');
  let npmIgnore = '';
  if (await fse.pathExists(npmIgnorePath)) {
    npmIgnore = await fse.readFile(npmIgnorePath, 'utf8');
  }
  for (const pattern of addToNpmIgnore) {
    if (!npmIgnore.includes(pattern)) {
      if (!npmIgnore.endsWith('\n') && npmIgnore !== '') {
        npmIgnore += '\n';
      }
      npmIgnore += pattern + '\n'
    }
  }
  await fse.writeFile(npmIgnorePath, npmIgnore);
}

const addToGitIgnore = [
  '*.d.ts',
  '*.tgz',
  'node_modules',
];

async function updateGitIgnore(element: ElementRepo): Promise<void> {
  const gitIgnorePath = path.join(element.dir, '.gitignore');
  let gitIgnore = '';
  if (await fse.pathExists(gitIgnorePath)) {
    gitIgnore = await fse.readFile(gitIgnorePath, 'utf8');
  }
  for (const pattern of addToGitIgnore) {
    if (!gitIgnore.includes(pattern)) {
      if (!gitIgnore.endsWith('\n') && gitIgnore !== '') {
        gitIgnore += '\n';
      }
      gitIgnore += pattern + '\n'
    }
  }
  await fse.writeFile(gitIgnorePath, gitIgnore);
}

const generateTypesNpmScriptName = 'generate-types';

async function updatePackageJson(element: ElementRepo): Promise<void> {
  const packageJsonPath = path.join(element.dir, 'package.json');
  const packageJson: NpmConfig = await fse.readJson(packageJsonPath);
  if (!packageJson.devDependencies) {
    packageJson.devDependencies = {};
  }
  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }

  // Configure type generation.
  // TODO(aomarks) Update to 1.5.0 once published.
  packageJson.devDependencies['@polymer/gen-typescript-declarations'] =
      '^1.4.0';
  // TODO(aomarks) Add --verify once all elements have been published for
  // the first time.
  packageJson.scripts[generateTypesNpmScriptName] =
      'gen-typescript-declarations --deleteExisting --outDir .';
  packageJson.scripts['prepack'] = `npm run ${generateTypesNpmScriptName}`;

  // Install lodash 3 as a top-level dependency so that `polymer serve` will
  // always prefer serving this version to the version might arbitrarily be at
  // the top level of node_modules/ due to transitive dependencies (e.g. babel
  // which depends on lodash 4).
  // TODO(aomarks) Remove this once WCT dependency management is standardized.
  packageJson.devDependencies['lodash'] = '^3.0.0';

  await fse.writeJson(packageJsonPath, packageJson, {spaces: 2});
}

async function updateTravisYaml(element: ElementRepo): Promise<void> {
  const travisYamlPath = path.join(element.dir, '.travis.yml');
  if (!(await fse.pathExists(travisYamlPath))) {
    console.log(`${element.ghRepo.name}: Missing .travis.yaml`);
    return;
  }
  const travisYaml =
      yaml.safeLoad(await fse.readFile(travisYamlPath, 'utf8')) as {
    before_script?: string[];
  }
  if (!travisYaml.before_script) {
    travisYaml.before_script = [];
  }
  // Remove any prior version of this check.
  travisYaml.before_script = travisYaml.before_script.filter(
      (line) => !line.includes(generateTypesNpmScriptName));
  travisYaml.before_script.push(`npm run ${generateTypesNpmScriptName}`);
  await fse.writeFile(travisYamlPath, yaml.safeDump(travisYaml));
}

async function regeneratePackageLock(element: ElementRepo): Promise<void> {
  const packageLockPath = path.join(element.dir, 'package-lock.json');
  if (await fse.pathExists(packageLockPath)) {
    await fse.remove(packageLockPath);
  }
  await execFilePromise('npm', ['install'], {cwd: element.dir});
}
