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
import {ElementRepo} from '../element-repo';
import {existsSync, makeCommit} from './util';
import {injectAutodetectedLanguage} from '../markdown-lang-autodetect';
import {Element, Behavior} from 'hydrolysis';

/**
 * Generates README.md for the element, unless it's in the blacklist.
 */
async function generateReadme(element: ElementRepo): Promise<void> {
  const docInfo = extractDocumentationInfo(element);

  let readmeContents = `
<!---

This README is automatically generated from the comments in these files:
${Array.from(docInfo.implementationFiles).sort().join('  ')}

Edit those files, and our readme bot will duplicate them over here!
Edit this file, and the bot will squash your changes :)

The bot does some handling of markdown. Please file a bug if it does the wrong
thing! https://github.com/PolymerLabs/tedium/issues

-->

`;

  if (existsSync(path.join(element.dir, '.travis.yml'))) {
    readmeContents +=
        `[![Build status](https://travis-ci.org/${element.ghRepo.owner.login}/${
            element.ghRepo.name}.svg?branch=master)](https://travis-ci.org/${
            element.ghRepo.owner.login}/${element.ghRepo.name})\n\n`;
  }

  // These elements are going to have a page in the element catalog.
  if (/^(gold|platinum|paper|neon|iron|carbon)-/.test(element.ghRepo.name)) {
    readmeContents +=
        `_[Demo and API docs](https://elements.polymer-project.org/elements/${
            element.ghRepo.name})_` +
        '\n\n';
  }

  // If this repo is named after a behavior, what would that behavior be
  // named?
  // This turns e.g. iron-a11y-keys-behavior into
  // Polymer.IronA11yKeysBehavior
  let canonicalBehaviorName =
      'Polymer.' + wordsWithDashesToCamelCase(element.ghRepo.name);
  if (!canonicalBehaviorName.endsWith('Behavior')) {
    canonicalBehaviorName += 'Behavior';
  }

  if (docInfo.nameToContent.has(element.ghRepo.name)) {
    // If there's an element with the same name as the repo, that comes
    // first.
    readmeContents += docInfo.nameToContent.get(element.ghRepo.name);
    docInfo.nameToContent.delete(element.ghRepo.name);
  } else if (docInfo.nameToContent.has(canonicalBehaviorName)) {
    // Otherwise, if there's a behavior named the same as the repo, that
    // comes
    // first.
    readmeContents += docInfo.nameToContent.get(canonicalBehaviorName);
    docInfo.nameToContent.delete(canonicalBehaviorName);
  }

  // For the rest, it's the elements then the behaviors in sorted order.
  const names =
      [...docInfo.tagNames].sort().concat([...docInfo.behaviorNames].sort());
  for (const name of names) {
    readmeContents += docInfo.nameToContent.get(name) || '';
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

function extractDocumentationInfo(element: ElementRepo) {
  const implementationFiles = new Set<string>();

  const elementsByTagName = new Map<string, Element>();
  const behaviorsByName = new Map<string, Behavior>();
  for (const analyzedElement of element.analyzer!.elements) {
    if (!analyzedElement.contentHref) {
      continue;
    }
    if (analyzedElement.contentHref.startsWith(element.dir + '/')) {
      implementationFiles.add(path.basename(analyzedElement.contentHref));
      elementsByTagName.set(analyzedElement.is, analyzedElement);
    }
  }
  for (const behavior of element.analyzer!.behaviors) {
    if (!behavior.contentHref) {
      continue;
    }
    if (behavior.contentHref.startsWith(element.dir + '/')) {
      implementationFiles.add(path.basename(behavior.contentHref));
      behaviorsByName.set(behavior.is, behavior);
    }
  }

  const nameToContent = new Map<string, string>();
  for (const pair of behaviorsByName) {
    const name = pair[0];
    const behavior = pair[1];
    if (!behavior.desc || behavior.desc.trim() === '') {
      nameToContent.set(name, `\n<!-- No docs for ${name} found. -->\n`);
      continue;
    }

    nameToContent.set(name, `
##${name}

${injectAutodetectedLanguage(behavior.desc)}
`);
  }

  for (const pair of elementsByTagName) {
    const tagName = pair[0];
    const analyzedElement = pair[1];

    if (!analyzedElement.desc || analyzedElement.desc.trim() === '') {
      nameToContent.set(
          tagName, `\n<!-- No docs for <${tagName}> found. -->\n`);
      continue;
    }

    nameToContent.set(tagName, `
##&lt;${tagName}&gt;

${injectAutodetectedLanguage(analyzedElement.desc)}
`);
  }

  return {
    implementationFiles, behaviorNames: new Set(behaviorsByName.keys()),
        tagNames: new Set(elementsByTagName.keys()), nameToContent,
  }
}

function wordsWithDashesToCamelCase(wordsWithDashes: string): string {
  return wordsWithDashes.split('-')
      .map((word) => {
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join('');
}

register({name: 'readme', pass: generateReadme});
