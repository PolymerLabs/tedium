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

const fs = require('fs');
const nodegit = require('nodegit');
const path = require('path');


/**
 * The meat of the implementation. If any cleanup step makes any changes it
 * should then set element.dirty. The rest of the implementation
 * will take care of pushing the changes up and making PRs.
 *
 * Each cleanup step is given an object that contains a ton of info about an
 * element repo.
 *
 * Properties of element:
 *   dir: a string, like 'repos/paper-input' that's a relative path to a
 *       directory that contains a pristine checkout of the element as it
 *       exists at master.
 *   ghRepo: metadata about the elements' github repo.
 *       docs: https://developer.github.com/v3/repos/#get
 *   repo: a nodegit Repository object. Useful for modifying the on-disk
 *       git repo
 *   analyzer: a hydrolysis Analyzer for *all* elements in the PolymerElements
 *       org and their dependencies.
 *   dirty: set this to true if you make changes to the repo that need to be
 *       pushed.
 *   needsReview: set this to true if your changes need human review.
 *       if true, all changes made to the element will go out into a PR that
 *       will be assigned to you. otherwise the changes will be pushed directly
 *       to master. has no effect if dirty is false.
 *
 * To add a cleanup step, just add it to this promise chain.
 */
function cleanup(element) {
  return Promise.resolve()
      .then(cleanupBower.bind(null, element))
      .then(generateReadme.bind(null, element))
      .then(generateContributionGuide.bind(null, element))
      ;
}

/**
 * Cleans up a number of common bower problems, like no "main" attribute,
 * "main" being an array rather than a string, etc.
 */
function cleanupBower(element) {
  // Write the bower config object out to the given path
  function writeToBower(bowerPath, bowerConfig) {
    fs.writeFileSync(bowerPath,
        JSON.stringify(bowerConfig, null, 2) + '\n', 'utf8');
  }

  let bowerConfig = null;
  const bowerPath = path.join(element.dir, 'bower.json');
  return Promise.resolve().then(() => {
    if (!existsSync(bowerPath)) {
      return null; // no bower file to cleanup!
    }
    bowerConfig = JSON.parse(fs.readFileSync(bowerPath, 'utf8'));
  }).then(() => {
    if (!bowerConfig) {
      return null;
    }

    // Clean up nonexistant bower file
    if (!bowerConfig.main || bowerConfig.main.length === 0) {
      const elemFile = path.basename(element.dir) + '.html';

      if (existsSync(path.join(element.dir, elemFile))) {
        bowerConfig.main = elemFile;
        writeToBower(bowerPath, bowerConfig);
        element.dirty = true;
        return element.repo.createCommitOnHead(
            ['bower.json'], getSignature(), getSignature(),
            'Add bower main file.').then(() => element);
      }
      return null; // couldn't generate a bower main :(
    }

    // Clean up an array bower file:
    if (Array.isArray(bowerConfig.main) && bowerConfig.main.length === 1) {
      bowerConfig.main = bowerConfig.main[0];
      writeToBower(bowerPath, bowerConfig);
      element.dirty = true;
      return element.repo.createCommitOnHead(
          ['bower.json'], getSignature(), getSignature(),
          'Convert bower main from array to string.').then(() => element);
    }
  }).then(() => {
    if (!bowerConfig) {
      return null;
    }

    if (!bowerConfig.ignore) {
      bowerConfig.ignore = [];
      writeToBower(bowerPath, bowerConfig);
      element.dirty = true;
      return element.repo.createCommitOnHead(
          ['bower.json'], getSignature(), getSignature(),
          'Add an ignore property to bower.json.').then(() => element);
    }
  });
}


/**
 * Generates README.md for the element, unless it's in the blacklist.
 */
function generateReadme(element) {
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
    return Promise.resolve();
  }
  const implementationFiles = new Set();
  return Promise.resolve().then(() => {
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

      if (analyzedElement.desc.trim() === '') {
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

      if (behavior.desc.trim() === '') {
        readmeContents += `\n<!-- No docs for ${name} found. -->\n`;
        continue;
      }

      readmeContents += `
##${name}

${behavior.desc}
`;
    }

    const readmePath = path.join(element.dir, 'README.md');
    const oldContents = fs.readFileSync(readmePath, 'utf8');
    if (oldContents !== readmeContents) {
      fs.writeFileSync(readmePath, readmeContents, 'utf8');
      element.dirty = true;
      return element.repo.createCommitOnHead(
            ['README.md'], getSignature(), getSignature(),
            '[skip ci] Autogenerate README file.');
    }
  });
}


let contributionGuideContents = null;
/**
 * Generates the CONTRIBUTING.md file for the element.
 */
function generateContributionGuide(element) {
  const pathToCanonicalGuide = 'repos/ContributionGuide/CONTRIBUTING.md';
  if (!existsSync(pathToCanonicalGuide)) {
    return Promise.reject(new Error(
        'Couldn\'t find canonical contribution guide. git checkout error?'));
  }
  if (!contributionGuideContents) {
    contributionGuideContents = `
<!--
This file is autogenerated based on
https://github.com/PolymerElements/ContributionGuide/blob/master/CONTRIBUTING.md

If you edit that file, it will get updated everywhere else.
If you edit this file, your changes will get overridden :)
-->
`;
    contributionGuideContents += fs.readFileSync(pathToCanonicalGuide, 'utf8');
  }
  let existingGuideContents = '';
  const pathToExistingGuide = path.join(element.dir, 'CONTRIBUTING.md');
  let guideExists = false;
  if (existsSync(pathToExistingGuide)) {
    guideExists = true;
    existingGuideContents = fs.readFileSync(pathToExistingGuide, 'utf8');
  }
  if (contributionGuideContents === existingGuideContents) {
    return Promise.resolve();
  }
  fs.writeFileSync(pathToExistingGuide, contributionGuideContents, 'utf8');
  element.dirty = true;
  let commitMessage = '[skip ci] Update contribution guide';
  if (!guideExists) {
    commitMessage = '[skip ci] Create contribution guide';
  }
  return element.repo.createCommitOnHead(
        ['CONTRIBUTING.md'], getSignature(), getSignature(),
        commitMessage);
}

// Generates a git commit signature for the bot.
function getSignature() {
  return nodegit.Signature.now(
      'Polymer Format Bot', 'format-bot@polymer-project.org');
}

/**
 * Synchronously determines whether the given file exists.
 */
function existsSync(fn) {
  try {
    fs.statSync(fn);
    return true;
  } catch(_) {
    return false;
  }
}


module.exports = cleanup;
module.exports.existsSync = existsSync;
