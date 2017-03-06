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
import {EOL} from 'os';

import * as promisify from 'promisify-node';
import * as glob from 'glob';

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo';
import {makeCommit} from './util';

const polymerHeader = `@license
Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt`;

const roughPolymerHeader = polymerHeader.split(EOL)
                               .slice(1)
                               .join(EOL)
                               .replace(/\s/g, '')
                               .toLowerCase();

interface GlobOptions {
  cwd: string;
}

const findFiles: (globPath: string, options: GlobOptions) => Promise<string[]> =
    promisify(glob);

function hasLicense(lines: string[], start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (lines[i].indexOf('@license') > -1) {
      return true;
    }
  }
  return false;
}

function findFirstMatchingLine(lines: string[], regex: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      return i;
    }
  }
  return -1;
}

interface CommentLocation {
  start: number;
  end: number;
}

function findFirstComment(
    lines: string[], start: RegExp, end: RegExp): CommentLocation {
  return {
    start: findFirstMatchingLine(lines, start),
    end: findFirstMatchingLine(lines, end)
  };
}

function licenseRoughlyEqual(
    lines: string[], start: number, end: number): boolean {
  // "fix" the date
  const firstLine = lines[start + 1].replace(/\d{4}/, '2016');
  const license =
      [firstLine, ...lines.slice(start + 2, end)].join(EOL).replace(/\s/g, '');
  return license.toLowerCase() === roughPolymerHeader;
}

function addLicense(lines: string[]) {
  const shebangLoc = findFirstMatchingLine(lines, /^#!/);
  lines.splice(shebangLoc + 1, 0, '/**', polymerHeader, '*/');
}

function addLicenseHTML(lines: string[]) {
  const doctypeLoc = findFirstMatchingLine(lines, /^<!\s*doctype/i);
  lines.splice(doctypeLoc + 1, 0, '<!--', polymerHeader, '-->');
}

async function addLicenseHeader(element: ElementRepo):
    Promise<void> {
      const foundFiles =
          await findFiles('**/*.{css,html,js}', {cwd: element.dir});
      const modifiedFiles: string[] = [];
      for (const filename of foundFiles) {
        const realFilePath = path.join(element.dir, filename);
        const isHTML = path.extname(filename) === '.html';
        const startToken = isHTML ? /<!--/ : /\/[*]{1,2}/;
        const endToken = isHTML ? /-->/ : /\*\//;
        let content: string;
        try {
          content = fs.readFileSync(realFilePath, 'utf-8');
        } catch (e) {
          // app-pouchdb ships a symlink into bower_components that doesn't
          // resolve unless you've done a bower install. In any case, we don't
          // need to add a license to the file in the app-pouchdb repo.
          if (filename === 'sw-import.js' &&
              element.ghRepo.name === 'app-pouchdb') {
            continue;
          }
          throw e;
        }
        const lines = content.split(EOL);
        const commentLoc = findFirstComment(lines, startToken, endToken);
        const start = commentLoc.start;
        const end = commentLoc.end;
        const licenseFn: (lines: string[]) => void =
            isHTML ? addLicenseHTML : addLicense;
        if (start === -1 || end === -1) {
          // missing any comment
          licenseFn(lines);
        } else if (hasLicense(lines, start, end)) {
          // @license is good!
          continue;
        } else if (licenseRoughlyEqual(lines, start, end)) {
          // add @license after the startToken
          lines.splice(start + 1, 0, '@license');
        } else {
          // some other random comment, add the full license
          licenseFn(lines);
        }
        content = lines.join(EOL);
        fs.writeFileSync(realFilePath, content, 'utf-8');
        modifiedFiles.push(filename);
      }

      if (modifiedFiles.length) {
        await makeCommit(
            element, modifiedFiles, '[skip ci] Add license headers');
      }
    }

register({name: 'license', pass: addLicenseHeader, runsByDefault: true});
