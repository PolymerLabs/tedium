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
import {existsSync, makeCommit, getJsBinLink} from './util';

const issueTemplateName = 'ISSUE_TEMPLATE.md';
const repoTemplatePath = path.join('.github', issueTemplateName);

async function addIssueTemplate(element: ElementRepo): Promise<void> {
  const shortName = `${element.ghRepo.owner.login}/${element.ghRepo.name}`;
  const issueTemplate =
`<!-- Instructions: https://github.com/${shortName}/CONTRIBUTING.md#filing-issues -->
### Description
<!-- Example: The \`paper-foo\` element causes the page to turn pink when clicked. -->

### Expected outcome

<!-- Example: The page stays the same color. -->

### Actual outcome

<!-- Example: The page turns pink. -->

### Live Demo
<!-- Example: ${getJsBinLink(element)} -->

### Steps to reproduce

<!-- Example
1. Put a \`paper-foo\` element in the page.
* Open the page in a web browser.
* Click the \`paper-foo\` element.
-->

### Browsers Affected
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

  const templateFolderPath = path.join(element.dir, '.github');
  if (!existsSync(templateFolderPath)) {
    fs.mkdirSync(templateFolderPath);
  }
  const templatePath = path.join(element.dir, repoTemplatePath);
  const templateExisted = existsSync(templatePath);
  if (templateExisted) {
    if (fs.readFileSync(templatePath, 'utf8') === issueTemplate) {
      return;  // No changes to make.
    }
  }

  fs.writeFileSync(templatePath, issueTemplate, 'utf8');
  const message = `[ci skip] ${templateExisted ? 'Update' : 'Add'} Issue Template`;
  await makeCommit(element, [repoTemplatePath], message);
}

register({
  name: 'issue-template',
  pass: addIssueTemplate,
  runsByDefault: true
})
