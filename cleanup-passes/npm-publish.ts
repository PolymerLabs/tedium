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
import * as sys from 'sys';
import {exec} from 'child_process';

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo.ts';
import {existsSync, makeCommit} from './util';

async function publishNpm(element: ElementRepo): Promise<void> {

  const readJson = (filePath: string) => {
    let fullPath = path.join(element.dir, filePath);
    if (fs.existsSync(fullPath)) {
      return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    }
  };

  let npmConfig: any = readJson('package.json');

  if (!npmConfig) {
    throw new Error('package.json not found');
  }

  return new Promise<void>((resolve, reject) => {
    exec("pwd", // "npm publish --access public",
      {
        cwd: element.dir,
      },
      function (error, stdout, stderr) {
        if (error != null) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
}

register({
  name: 'npm-publish',
  pass: publishNpm,
  runsByDefault: false,
});
