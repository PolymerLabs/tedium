/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import {ElementRepo} from '../element-repo.ts';
import {existsSync, makeCommit} from './util';


/**
 * Generates README.md for the element, unless it's in the blacklist.
 */
async function generateReadme(element: ElementRepo):Promise<void> {
  const manualReadmeRepos = new Set([
    'repos/molecules',
    'repos/iron-elements',
    'repos/paper-elements',
    'repos/neon-elements',
    'repos/gold-elements',
    'repos/platinum-elements',
    'repos/seed-element',
    'repos/app-layout-templates',
    'repos/polymer-starter-kit',
    'repos/quick-element',
    'repos/font-roboto',
    'repos/iron-test-helpers',
    'repos/font-roboto-local',

    // Temporary:
    // Blocked on https://github.com/Polymer/hydrolysis/issues/188
    'repos/iron-iconset',
    // Blocked on getting the order of elements more correct, and moving the
    // extra documentation that's currently only in the README somewhere that
    // tedium can access.
    'repos/platinum-sw',
    'repos/neon-animation',
  ]);
  if (manualReadmeRepos.has(element.dir)) {
    return;
  }
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
  if (/^(gold|platinum|paper|neon|iron|carbon)-/.test(element.ghRepo.name)) {
    readmeContents += `_[Demo and API Docs](https://elements.polymer-project.org/elements/${element.ghRepo.name})_` + '\n\n';
  }

  const tagNames = Object.keys(elementsByTagName);
  // Sort elements alphabetically, except that the element that the repository
  // is named after should come first.
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
  for (const name in behaviorsByName) {
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

export let cleanupPasses = [generateReadme];
