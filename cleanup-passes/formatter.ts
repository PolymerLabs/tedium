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

import * as fse from 'fs-extra';
import * as path from 'path';
import {execFile} from 'child_process';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import {promisify} from 'util';

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo';
import {makeCommit} from './util';

const execFilePromise = promisify(execFile);

const formatterPackageName = 'webmat';
const npmScriptName = 'format';
const npmScriptCommand = 'webmat && npm run update-types';

let latestFormatterVersion: string|undefined;
async function getLatestFormatterVersion(): Promise<string> {
  if (latestFormatterVersion === undefined) {
    const {stdout} =
        await execFilePromise('npm', ['info', formatterPackageName]);
    const match = stdout.match(/latest: '(\d+\.\d+\.\d+)'/);
    if (!match || !match[1]) {
      throw new Error(
          `Could not find latest version of ${formatterPackageName}`);
    }
    latestFormatterVersion = match[1];
  }
  return latestFormatterVersion;
}

/**
 * This pass updates an element repo to format projects using
 * https://github.com/PolymerLabs/webmat/ and configures a
 * "format" NPM script that can be run to re-format the project.
 *
 * Throws an error if the repo has a missing or invalid package.json or if npm
 * is not globally installed.
 */
async function formatPass(element: ElementRepo): Promise<void> {
  const packageJsonPath = path.join(element.dir, 'package.json');
  let packageJson: NpmConfig;
  try {
    packageJson = await fse.readJson(packageJsonPath);
  } catch {
    throw new Error(`${element.ghRepo.name}: Missing or invalid package.json.`);
  }

  // There are some changes we might write in this script that aren't important
  // enough to make a commit for (e.g. just updating the package-lock.json).
  let doCommit = false;

  if (packageJson.devDependencies === undefined) {
    packageJson.devDependencies = {};
  }
  if (packageJson.scripts === undefined) {
    packageJson.scripts = {};
  }

  const newFormatterVersion = await getLatestFormatterVersion();
  const oldFormatterRange = packageJson.devDependencies[formatterPackageName];
  if (oldFormatterRange === undefined ||
      !semver.satisfies(newFormatterVersion, oldFormatterRange)) {
    doCommit = true;
  }
  packageJson.devDependencies[formatterPackageName] = '^' + newFormatterVersion;

  if (packageJson.scripts[npmScriptName] !== npmScriptCommand) {
    packageJson.scripts[npmScriptName] = npmScriptCommand;
    doCommit = true;
  }

  await fse.writeJson(packageJsonPath, packageJson, {spaces: 2});

  // Update Travis config to fail if typings aren't up to date.
  const travisYamlPath = path.join(element.dir, '.travis.yml');
  if (await fse.pathExists(travisYamlPath)) {
    const travisYaml =
        yaml.safeLoad(await fse.readFile(travisYamlPath, 'utf8')) as {
      before_script?: string[];
    };
    if (!travisYaml.before_script) {
      travisYaml.before_script = [];
    }
    // Remove any prior version of this check.
    travisYaml.before_script =
        travisYaml.before_script.filter((line) => !line.includes('format'));

    const travisCommand =
        // Format the project.
        'npm run format && ' +
        // If there were any changes, this git command will return non-zero.
        'git diff --exit-code || ' +
        // Show an error message in the Travis log (escape code makes it red).
        '(echo -e \'\\n\\033[31mERROR:\\033[0m Project is not formatted. ' +
        'Please run "npm run format".\' && ' +
        // The echo command will succeed, so return a non-zero exit code again
        // here so that Travis errors.
        'false)';

    travisYaml.before_script.push(travisCommand);
    await fse.writeFile(travisYamlPath, yaml.safeDump(travisYaml));
  } else {
    console.log(`${element.ghRepo.name}: Missing .travis.yaml`);
  }

  const execOpts = {cwd: element.dir};

  // Install the formatter and its dependencies. Delete the package lock in case
  // a newer version of the formatter will change our types.
  const packageLockPath = path.join(element.dir, 'package-lock.json');
  if (await fse.pathExists(packageLockPath)) {
    await fse.remove(packageLockPath);
  }
  await execFilePromise('npm', ['install'], execOpts);

  // Run the formatter (using the script we added above).
  await execFilePromise('npm', ['run', npmScriptName], execOpts);

  const commitFiles = [];
  for (const changedFile of await element.repo.getStatus()) {
    const filepath = changedFile.path();
    if (filepath.endsWith('.ts') || filepath.endsWith('.js') ||
        filepath.endsWith('.html') || filepath === '.travis.yml') {
      doCommit = true;
    } else if (
        filepath === 'package.json' || filepath === 'package-lock.json') {
    } else {
      throw new Error(
          `${element.ghRepo.name}: Unexpected changed file: ${filepath}`);
    }
    commitFiles.push(filepath);
  }

  if (doCommit) {
    await makeCommit(element, commitFiles, 'Format project.');

  } else {
    console.log(`${element.ghRepo.name}: No files changed when formatted.`);
  }
}

register({
  name: 'formatter',
  pass: formatPass,
  runsByDefault: true,
});
