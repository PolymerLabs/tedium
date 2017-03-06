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

import * as dom5 from 'dom5';
import * as escodegen from 'escodegen';
import * as espree from 'espree';
import * as estree_walker from 'estree-walker';
import * as fs from 'fs';
import * as path from 'path';

import {register} from '../cleanup-pass';
import {ElementRepo} from '../element-repo';
import {existsSync, makeCommit} from './util';


async function addShadowDomTests(element: ElementRepo): Promise<void> {
  const testDir = path.join(element.dir, 'test');
  if (!existsSync(testDir) || !fs.statSync(testDir).isDirectory()) {
    return;  // nothing to do
  }
  const testIndexFile = path.join(testDir, 'index.html');
  if (!existsSync(testIndexFile)) {
    return;  // nothing to do
  }

  const contents = fs.readFileSync(testIndexFile, 'utf8');
  const domTree = dom5.parse(contents);
  const scripts = dom5.queryAll(domTree, (n) => n.tagName === 'script');
  let updateNeeded = false;
  for (const script of scripts) {
    const data = (script.childNodes || [])[0];
    if (!data || data.nodeName !== '#text') {
      continue;
    }
    const program = espree.parse(data.value || '', {attachComment: true});
    estree_walker.walk(program, {
      enter(n) {
        if (!(n.type === 'CallExpression' &&
              n.callee.type === 'MemberExpression')) {
          return;
        }
        if (!(n.callee.object && n.callee.property)) {
          return;
        }
        if (!(n.callee.object.name === 'WCT' &&
              n.callee.property.name === 'loadSuites')) {
          return;
        }
        if (!(n.arguments && n.arguments.length === 1 &&
              n.arguments[0].type === 'ArrayExpression')) {
          return;
        }
        const testFilenameExpressions = n.arguments[0];
        const shadyFilenames = new Set<string>();
        const shadowFilenames = new Set<string>();
        for (const filenameExpression of testFilenameExpressions.elements) {
          if (/dom=shadow/.test(filenameExpression.value)) {
            shadowFilenames.add(filenameExpression.value);
          } else {
            shadyFilenames.add(filenameExpression.value);
          }
        }
        for (const shadyFilename of shadyFilenames) {
          if (!shadowFilenames.has(shadyFilename + '?dom=shadow')) {
            updateNeeded = true;
          }
        }
        testFilenameExpressions.elements = [];
        for (const shadyFilename of shadyFilenames) {
          testFilenameExpressions.elements.push(
              {type: 'Literal', value: shadyFilename});
        }
        for (const shadyFilename of shadyFilenames) {
          testFilenameExpressions.elements.push(
              {type: 'Literal', value: shadyFilename + '?dom=shadow'});
        }
      }
    });
    // Try to infer indentation
    let indentation = '  ';
    const parent = script.parentNode!;
    const scriptIndex = parent.childNodes!.indexOf(script);
    if (scriptIndex >= 0 &&
        parent.childNodes![scriptIndex - 1].nodeName === '#text') {
      const textJustBefore = parent.childNodes![scriptIndex - 1].value || '';
      const match = textJustBefore.match(/( +)$/);
      indentation = match ? match[1] : '';
    }
    data.value = '\n' + escodegen.generate(program, {
      comment: true,
      format: {
        indent: {
          style: '  ',
          base: (indentation.length / 2) + 1,
          adjustMultilineComment: true
        }
      }
    }) + '\n' + indentation;
  }

  if (updateNeeded) {
    fs.writeFileSync(testIndexFile, dom5.serialize(domTree) + '\n', 'utf8');
    element.needsReview = true;
    await makeCommit(
        element, ['test/index.html'],
        'Add shadow dom test configurations.');
  }
}

register({
  name: 'add-shadow-dom-tests',
  pass: addShadowDomTests,
  // Mark this as true once we've merged all the PRs from this
  // sheet:
  // https://docs.google.com/spreadsheets/d/166pE8UwkJQwtUzirEv03kDYQmilKO0-ggZBrrzyDh9g/edit#gid=0
  runsByDefault: false,
});
