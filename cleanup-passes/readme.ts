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


/**
 * Generates README.md for the element, unless it's in the blacklist.
 */
async function generateReadme(element: ElementRepo): Promise<void> {
  const implementationFiles = new Set();

  const elementsByTagName = {};
  const behaviorsByName = {};
  for (const analyzedElement of element.analyzer.elements) {
    if (path.dirname(analyzedElement.contentHref) === element.dir) {
      implementationFiles.add(path.basename(analyzedElement.contentHref));
      elementsByTagName[analyzedElement.is] = analyzedElement;
    }
  }
  for (const behavior of element.analyzer.behaviors) {
    if (path.dirname(behavior.contentHref) === element.dir) {
      implementationFiles.add(path.basename(behavior.contentHref));
      behaviorsByName[behavior.is] = behavior;
    }
  }
  let readmeContents = `
<!---

This README is automatically generated from the comments in these files:
${Array.from(implementationFiles).sort().join('  ')}

Edit those files, and our readme bot will duplicate them over here!
Edit this file, and the bot will squash your changes :)

-->

`;

  if (existsSync(path.join(element.dir, '.travis.yml'))) {
    readmeContents +=
        `[![Build Status](https://travis-ci.org/${element.ghRepo.owner.login}/${element.ghRepo.name}.svg?branch=master)](https://travis-ci.org/${element.ghRepo.owner.login}/${element.ghRepo.name})\n\n`;
  }

  // These elements are going to have a page in the element catalog.
  if (/^(gold|platinum|paper|neon|iron|carbon)-/.test(
          element.ghRepo.name)) {
    readmeContents +=
        `_[Demo and API Docs](https://elements.polymer-project.org/elements/${element.ghRepo.name})_` +
        '\n\n';
  }

  const tagNames = Object.keys(elementsByTagName);
  // Sort elements alphabetically, except that the element that the
  // repository is named after should come first.
  tagNames.sort((l, r) => {
    if (l === element.ghRepo.name) {
      return -1;
    }
    if (r === element.ghRepo.name) {
      return 1;
    }
    return l.localeCompare(r);
  });

  for (const tagName of tagNames) {
    const analyzedElement = elementsByTagName[tagName];

    if (!analyzedElement.desc || analyzedElement.desc.trim() === '') {
      readmeContents += `\n<!-- No docs for <${tagName}> found. -->\n`;
      continue;
    }

    readmeContents += `
##&lt;${tagName}&gt;

${analyzedElement.desc}
`;
  }
  // If this repo is named after a behavior, what would that behavior be named?
  // This turns e.g. iron-a11y-keys-behavior into
  // Polymer.IronA11yKeysBehavior
  const canonicalBehaviorName =
      'Polymer.' + wordsWithDashesToCamelCase(element.ghRepo.name);
  const behaviorNames = Object.keys(behaviorsByName).sort((l, r) => {
    if (l === canonicalBehaviorName) {
      return -1;
    }
    if (r === canonicalBehaviorName) {
      return 1;
    }
    return l.localeCompare(r);
  });
  for (const name of behaviorNames) {
    const behavior = behaviorsByName[name];

    if (!behavior.desc || behavior.desc.trim() === '') {
      readmeContents += `\n<!-- No docs for ${name} found. -->\n`;
      continue;
    }

    readmeContents += `
##${name}

${behavior.desc}
`;
  }

  const readmePath = path.join(element.dir, 'README.md');
  let oldContents = '';
  if (existsSync(readmePath)) {
    oldContents = fs.readFileSync(readmePath, 'utf8');
  }
  if (oldContents !== readmeContents) {
    fs.writeFileSync(readmePath, readmeContents, 'utf8');
    await makeCommit(
        element, ['README.md'], '[skip ci] Autogenerate README file.');
  }
}

function wordsWithDashesToCamelCase(wordsWithDashes:string):string {
  return wordsWithDashes.split('-').map((word) => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join('');
}

register({
  name: 'readme',
  pass: generateReadme,
  runsByDefault: true,
});
