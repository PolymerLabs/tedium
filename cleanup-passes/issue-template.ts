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

const ISSUE_TEMPLATE =
`## Description
<!-- Example: The \`paper-foo\` element causes the page to turn pink when clicked. -->

## Expected outcome

<!-- Example: The page stays the same color. -->

## Actual outcome

<!-- Example: The page turns pink. -->

## Steps to reproduce

<!-- Example
1. Put a \`paper-foo\` element in the page.
2. Open the page in a web browser.
3. Click the \`paper-foo\` element.
-->

## Browsers Affected
<!-- Check all that apply -->
- [ ] Chrome
- [ ] Firefox
- [ ] Safari 9
- [ ] Safari 8
- [ ] Safari 7
- [ ] Edge
- [ ] IE 11
- [ ] IE 10
`;

async function addIssueTemplate(element: ElementRepo): Promise<void> {
  const templateFolderPath = path.join(element.dir, '.github');
  if (!existsSync(templateFolderPath)) {
    fs.mkdirSync(templateFolderPath);
  }
  const templatePath = path.join(templateFolderPath, 'ISSUE_TEMPLATE.md');
  let templateContent = '';
  if (existsSync(templatePath)) {
    templateContent = fs.readFileSync(templatePath, 'utf-8');
  }
  if (templateContent === ISSUE_TEMPLATE) {
    return;
  }

  const shortName = `${element.ghRepo.owner.login}/${element.ghRepo.name}`;
  templateContent =
  `<!-- Instructions: https://github.com/${shortName}/CONTRIBUTING.md#filing-issues -->
  ${ISSUE_TEMPLATE}`;

  fs.writeFileSync(templatePath, templateContent, 'utf-8');
  await makeCommit(element, [templatePath], '[ci skip] Update Issue Template');
}

register({
  name: 'issue-template',
  pass: addIssueTemplate,
  runsByDefault: false
})
