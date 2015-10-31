#!/usr/bin/env node

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

/**
 * This file contains the main flow for the bot. i.e. discovering and cloning
 * repos, letting cleanup-passes run, noticing if anything's changed, and
 * pushing those changes back to github if needed.
 *
 * The actual changes that the bot does are in cleanup-passes.js
 */


'use strict';

const fs = require('fs');
const GitHubApi = require("github-cache");
const promisify = require("promisify-node");
const nodegit = require('nodegit');
const path = require('path');
const ProgressBar = require('progress');
const rimraf = require('rimraf');
const cleanup = require('./cleanup-passes');
const hydrolysis = require('hydrolysis');
const pad = require('pad');
const nomnomLib = require('nomnom');
const nomnom = nomnomLib();
nomnom.script('tedium');

nomnom.option('max_changes', {
  abbr: 'c',
  default: 0,
  callback(max_changes) {
    if (!/^\d+$/.test(max_changes)) {
      return "max_changes must be an integer";
    }
  },
  transform(changes_str) {
     return parseInt(changes_str, 0);
  }
});
const opts = nomnom.parse();

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
  );
  process.exit(1);
}

const github = connectToGithub();

const progressMessageWidth = 40;
const progressBarWidth = 45;

function getRepos() {
  const per_page = 100;
  const repos = [];
  const getFromOrg = promisify(github.repos.getFromOrg);
  const promises = [];
  function getReposFromPageOnward(page) {
    return getFromOrg({org: 'PolymerElements', per_page, page}).then((results) => {
      repos.push.apply(repos, results);
      if (results.length === per_page) {
        return getReposFromPageOnward(page + 1);
      }
      return repos;
    });
  }

  // First get the Polymer repo, then get all of the PolymerElements repos.
  promises.push(promisify(github.repos.get)({user: 'Polymer', repo: 'polymer'})
    .then((repo) => {
      repos.push(repo);
    }));
  promises.push(getReposFromPageOnward(0));

  return promiseAllWithProgress(
      promises, 'Discovering repos in PolymerElements...').then(() => repos);
}

function promiseAllWithProgress(promises, label) {
  const progressBar = new ProgressBar(
    `${pad(label, progressMessageWidth)} [:bar] :percent`,
    {total: promises.length, width: progressBarWidth});
  for (const promise of promises) {
    promise.then(() => progressBar.tick(), () => progressBar.tick());
  }
  return Promise.all(promises);
}

// Call this as fast as you want, each time it returns a new promise that will
// resolve only after a delay, and only after every other promise returned by
// rateLimit has resolved.
let rateLimit = (function() {
  let previousPromise = Promise.resolve();
  return function rateLimit(delay) {
    let curr = previousPromise.then(function() {
      return new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    });
    previousPromise = curr;
    return curr;
  };
})();


function checkoutNewBranch(repo, branchName) {
  return repo.getHeadCommit().then((commit) => {
    return nodegit.Branch.create(repo, branchName, commit, false);
  }).then((branch) => {
    return repo.checkoutBranch(branch);
  });
}

let elementsPushed = 0;
let pushesDenied = 0;
function pushIsAllowed() {
  if (elementsPushed < opts.max_changes) {
    elementsPushed++;
    return true;
  }
  pushesDenied++;
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
          null, element, localBranchName, 'master', assignee));
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
            credentials() {
              return nodegit.Cred.userpassPlaintextNew(
                  GITHUB_TOKEN, "x-oauth-basic");
            }
          }
        }
      );
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

function analyzeRepos() {
  const dirs = fs.readdirSync('repos/');
  const htmlFiles = [];

  for (const dir of dirs) {
    for (const fn of fs.readdirSync(path.join('repos', dir))) {
      if (/demo|index\.html|dependencies\.html/.test(fn) ||
          !fn.endsWith('.html')) {
        continue;
      }
      htmlFiles.push(path.join('repos', dir, fn));
    }
  }

  function filter(repo) {
    return !cleanup.existsSync(repo);
  }

  // This code is conceptually simple, it's only complex due to ordering
  // and the progress bar. Basically we call analyzer.metadataTree on each
  // html file in sequence, then finally call analyzer.annotate() and return.
  return hydrolysis.Analyzer.analyze('repos/polymer/polymer.html', {filter})
    .then((analyzer) => {
      let promise = Promise.resolve();
      const progressBar = new ProgressBar(`:msg [:bar] :percent`, {
        total: htmlFiles.length + 1, width: progressBarWidth});

      for (const htmlFile of htmlFiles) {
        promise = promise.then(() => {
          return analyzer.metadataTree(htmlFile).then(() => {
            const msg = pad(`Analyzing ${htmlFile.slice(6)}`,
                            progressMessageWidth, {strip: true});
            progressBar.tick({msg});
          });
        });
      }
      return promise.then(() => {
        progressBar.tick({
            msg: pad('Analyzing with hydrolysis...', progressMessageWidth)});
        analyzer.annotate();
        return analyzer;
      });
    });
}

let user;

Promise.resolve().then(() => {
  return promisify(rimraf)('repos');
}).then(() => {
  fs.mkdirSync('repos');
}).then(() => {
  // We're going to need the github user later, better get it now.
  return promisify(github.user.get)({});
}).then((userResponse) => {
  user = userResponse;
}).then(() => {
  return getRepos();
}).then((ghRepos) => {
  const promises = [];

  for (const ghRepo of ghRepos) {
    promises.push(Promise.resolve().then(() => {
      const targetDir = path.join('repos', ghRepo.name);
      let repoPromise;
      if (cleanup.existsSync(targetDir)) {
        repoPromise = nodegit.Repository.open(targetDir);
      } else {
        repoPromise = rateLimit(100).then(() =>
            nodegit.Clone.clone(ghRepo.clone_url, targetDir, null));
      }
      return repoPromise.then((repo) => ({
          repo: repo, dir: targetDir, ghRepo: ghRepo}));
      })
    );
  }

  return promiseAllWithProgress(promises, 'Cloning repos...');
}).then((elements) => {
  return analyzeRepos().then((analyzer) => {
    for (const element of elements) {
      element.analyzer = analyzer;
    }
    return elements;
  });
}).then((elements) => {
  const promises = [];

  const excludes = new Set([
    'repos/style-guide',
    'repos/test-all',
    'repos/ContributionGuide',
    'repos/polymer',

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
        .then(rateLimit.bind(null, 0))
        .then(cleanup.bind(null, element))
        .then(pushChanges.bind(null, element, branchName, user.login))
        .catch((err) => {
          throw new Error(`Error updating ${element.dir}:\n${err}`);
        })
    );
  }
  return promiseAllWithProgress(promises, 'Applying transforms...');
}).then(() => {
  console.log();
  if (elementsPushed === 0 && pushesDenied === 0) {
    console.log('No changes needed!');
  } else if (pushesDenied === 0) {
    console.log(`Successfully pushed to ${elementsPushed} repos.`);
  } else if (opts.max_changes === 0) {
    console.log(`${pushesDenied} changes ready to push. ` +
                `Call with --max_changes=N to push them up!`)
  } else {
    console.log(`Successfully pushed to ${elementsPushed} repos. ` +
                `${pushesDenied} remain.`);
  }
}, function(err) {
  console.error('\n\n');
  console.error(err);

  process.exit(1);
});
