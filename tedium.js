'use strict';

const fs = require('fs');
const GitHubApi = require("github-cache");
const promisify = require("promisify-node");
const nodegit = require('nodegit');
const clone = require("nodegit").Clone.clone;
const path = require('path');
const ProgressBar = require('progress');
const rimraf = require('rimraf');
const hydrolysis = require('hydrolysis');

let GITHUB_TOKEN;

try {
  GITHUB_TOKEN = fs.readFileSync('token', 'utf8').trim();
} catch(e) {
  console.error(
`
You need to create a github token and place it in a file named 'token'.
The token only needs the 'public repos' permission.

Generate a token here:   https://github.com/settings/tokens
`
  )
  process.exit(1);
}

function getSignature() {
  return nodegit.Signature.now(
      'Polymer Format Bot', 'format-bot@polymer-project.org');
}

function existsSync(fn) {
  try {
    fs.statSync(fn);
    return true;
  } catch(_) {
    return false;
  }
}

function getRepos() {
  const per_page = 100;
  const repos = [];
  const getFromOrg = promisify(github.repos.getFromOrg);
  return Promise.resolve().then(() => {
    function getReposFromPageOnward(page) {
      return getFromOrg({org: 'PolymerElements', per_page, page}).then((results) => {
        repos.push.apply(repos, results);
        if (results.length === per_page) {
          return getReposFromPageOnward(page + 1);
        }
        return repos;
      });
    }

    return getReposFromPageOnward(0);
  });
}


function writeToBower(bowerPath, bowerConfig) {
  fs.writeFileSync(bowerPath, JSON.stringify(bowerConfig, null, 2) + '\n', 'utf8');
}

function promiseAllWithProgress(promises, label) {
  const progressBar = new ProgressBar(`${label} [:bar] :percent`, {
    total: promises.length});
  for (const promise of promises) {
    promise.then(() => progressBar.tick(), () => progressBar.tick());
  }
  return Promise.all(promises);
}

// The meat of the implementation. If any cleanup step makes any changes it
// should then set element.dirty. The rest of the implementation
// will take care of pushing the changes up and making PRs.
function cleanup(element) {
  return Promise.resolve()
      .then(cleanupBower.bind(null, element))
      .then(cleanupReadme.bind(null, element))
      .then(cleanupContributionGuide.bind(null, element))
}

function cleanupBower(element) {
  return Promise.resolve().then(() => {
    const bowerPath = path.join(element.dir, 'bower.json');
    if (!existsSync(bowerPath)) {
      throw new Error('no bower.json');
    }
    const bowerConfig = JSON.parse(fs.readFileSync(bowerPath, 'utf8'));

    // Clean up nonexistant bower file
    if (!bowerConfig.main || bowerConfig.main.length === 0) {
      var elemFile = path.basename(element.dir) + '.html';

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

  });
}

function cleanupReadme(element) {
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
  const implementationFiles = [];
  return Promise.resolve().then(() => {
    const promises = [];
    const allFiles = fs.readdirSync(element.dir);
    for (const filename of allFiles) {
      const fullPath = path.join(element.dir, filename);
      if (/\.html$/.test(filename) && !/(index|demo)/.test(filename)) {
        implementationFiles.push(filename);
        promises.push(
          hydrolysis.Analyzer.analyze(fullPath)
            .then((analyzer) => ({filename, analyzer}))
        );
      }
    }
    return Promise.all(promises);
  }).then((results) => {
    const elementsByTagName = {};
    const behaviorsByName = {};
    for (const result of results) {
      for (const element of result.analyzer.elements) {
        elementsByTagName[element.is] = element;
      }
      for (const behavior of result.analyzer.behaviors) {
        behaviorsByName[behavior.is] = behavior;
      }
    }
    let readmeContents = `
<!---

This README is automatically generated from the comments in these files:
${implementationFiles.join('  ')}

Edit those files, and our readme bot will duplicate them over here!
Edit this file, and the bot will squash your changes :)

-->

`

    if (existsSync(path.join(element.dir, '.travis.yml'))) {
      readmeContents +=
        `[![Build Status](https://travis-ci.org/${element.ghRepo.owner.login}/${element.ghRepo.name}.svg?branch=master)](https://travis-ci.org/${element.ghRepo.owner.login}/${element.ghRepo.name})\n\n`
    }

    // These elements are going to have a page in the element catalog.
    if (/^(gold|platinum|paper|neon|iron|carbon)-/.test(element.ghRepo.name)) {
      readmeContents += `_[Demo and API Docs](https://elements.polymer-project.org/elements/${element.ghRepo.name})_` + '\n\n';
    }

    var tagNames = Object.keys(elementsByTagName);
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
    })

    for (const tagName of tagNames) {
      const element = elementsByTagName[tagName];

      if (element.desc.trim() === '') {
        readmeContents += `\n<!-- No docs for <${tagName}> found. -->\n`;
        continue;
      }

      readmeContents += `
##&lt;${tagName}&gt;

${element.desc}
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

    const readmePath = path.join(element.dir, 'README.md')
    const oldContents = fs.readFileSync(readmePath, 'utf8');
    if (oldContents !== readmeContents) {
      fs.writeFileSync(readmePath, readmeContents, 'utf8');
      element.dirty = true;
      return element.repo.createCommitOnHead(
            ['README.md'], getSignature(), getSignature(),
            'Autogenerate README file.');
    }
  });
}

let contributionGuideContents = null;
function cleanupContributionGuide(element) {
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
    contributionGuideContents += fs.readFileSync(pathToCanonicalGuide, 'utf8')
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
  let commitMessage = 'Update contribution guide';
  if (!guideExists) {
    commitMessage = 'Create contribution guide';
  }
  return element.repo.createCommitOnHead(
        ['CONTRIBUTING.md'], getSignature(), getSignature(),
        commitMessage);
}

// Call this as fast as you want, each time it returns a new promise that will
// resolve only after a delay, and only after every other promise returned by
// rateLimit has resolved.
let rateLimit = (function() {
  let previousPromise = Promise.resolve();
  return function rateLimit(delay) {
    let prev = previousPromise;
    let curr = previousPromise.then(function() {
      return new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    });
    previousPromise = curr;
    return curr;
  }
})()


function checkoutNewBranch(repo, branchName) {
  return repo.getHeadCommit().then((commit) => {
    return nodegit.Branch.create(repo, branchName, commit, false)
  }).then((branch) => {
    return repo.checkoutBranch(branch);
  });
}

let elementsPushed = 0;
const allowedPushes = 100;
function pushIsAllowed() {
  if (elementsPushed < allowedPushes) {
    elementsPushed++;
    return true;
  }
  return false;
}

function pushChanges(element, localBranchName, assignee) {
  if (!element.dirty) {
    return Promise.resolve();
  }
  if (!pushIsAllowed()) {
    return Promise.resolve();
  }
  let remoteBranchName = 'master';
  if (element.needsReview) {
    remoteBranchName = localBranchName;
  }
  const pushPromise = Promise.resolve()
      .then(pushBranch.bind(null, element, localBranchName, remoteBranchName));
  if (element.needsReview) {
    return pushPromise.then(createPullRequest.bind(
          null, element, branchName, 'master', assignee))
  }
  return pushPromise;
}

function pushBranch(element, localBranchName, remoteBranchName) {
  return element.repo.getRemote("origin")
    .then(function(remote) {
      return remote.push(
        ["refs/heads/" + localBranchName + ":refs/heads/" + remoteBranchName],
        {
          callbacks: {
            credentials: function() {
              return nodegit.Cred.userpassPlaintextNew(
                  GITHUB_TOKEN, "x-oauth-basic");
            }
          }
        }
      );

      return remote.connect(nodegit.Enums.DIRECTION.PUSH);
    });
}

function createPullRequest(element, head, base, assignee) {
  const user = element.ghRepo.owner.login;
  const repo = element.ghRepo.name;
  return rateLimit(5000).then(() => {
    return promisify(github.pullRequests.create)({
      title: 'Automatic cleanup!',
      user, repo, head, base,
    });
  }).then((pr) => {
    return promisify(github.issues.edit)({
      number: pr.number,
      user, repo,
      assignee,
      labels: ['autogenerated'],
    });
  });
}

function connectToGithub() {
  const github = new GitHubApi({
      version: "3.0.0",
      protocol: "https",
      cachedb: './.github-cachedb',
      validateCache: true
  });

  github.authenticate({
    type: 'oauth',
    token: GITHUB_TOKEN
  });
  return github;
}


const github = connectToGithub();

let user;

console.log('Discovering repos in PolymerElements...');


Promise.resolve().then(() => {
  return promisify(rimraf)('repos');
}).then(() => {
  fs.mkdirSync('repos');
}).then(() => {
  // We're going to need the github user later, better get it now.
  return promisify(github.user.get)({})
}).then((userResponse) => {
  user = userResponse;
}).then(() => {
  return getRepos();
}).then((ghRepos) => {
  const promises = [];

  for (const ghRepo of ghRepos) {
    promises.push(rateLimit(100).then(() => {
      const targetDir = path.join('repos', ghRepo.name)
      let repoPromise;
      if (existsSync(targetDir)) {
        repoPromise = nodegit.Repository.open(targetDir);
      } else {
        repoPromise = nodegit.Clone.clone(ghRepo.clone_url, targetDir, null);
      }
      return repoPromise.then((repo) => ({
          repo: repo, dir: targetDir, ghRepo: ghRepo}));
      })
    );
  }

  return promiseAllWithProgress(promises, 'Checking out repos...');
}).then((elements) => {
  const promises = [];

  const excludes = new Set([
    'repos/style-guide',
    'repos/test-all',
    'repos/ContributionGuide',

    // Temporary, because of a weird unknown 403?:
    'repos/paper-listbox',
  ]);

  const branchName = 'auto-cleanup';
  for (const element of elements) {
    if (excludes.has(element.dir)) {
      continue;
    }
    promises.push(
      Promise.resolve()
        .then(checkoutNewBranch.bind(null, element.repo, branchName))
        .then(cleanup.bind(null, element))
        .then(pushChanges.bind(null, element, branchName, user.login))
        .catch((err) => {
          throw new Error(`Error updating ${element.dir}:\n${err}`);
        })
    );
  }
  return promiseAllWithProgress(promises, 'Cleaning...');
}).then(() => {
  if (elementsPushed === 0) {
    console.log('No changes needed!');
  } else {
    console.log(`Successfully pushed to ${elementsPushed} repos.`)
  }
}, function(err) {
  console.error(`\n\n${err}`);
  process.exit(1);
});
