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
  fs.writeFileSync(bowerPath, JSON.stringify(bowerConfig, null, 2) + '\n');
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

    // Temporary:
    'repos/iron-iconset'
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
        `[![Build Status](https://travis-ci.org/${element.ghRepo.user}/${element.ghRepo.name}.svg?branch=master)](https://travis-ci.org/${element.ghRepo.user}/${element.ghRepo.name})`
    }

    // These elements are going to have a page in the element catalog.
    if (/^(gold|platinum|paper|neon|iron|carbon)-/.test(element.ghRepo.name)) {
      readmeContents += `_[Demo and API Docs](https://elements.polymer-project.org/elements/${element.ghRepo.name})_` + '\n\n';
    }

    for (const tagName in elementsByTagName) {
      const element = elementsByTagName[tagName];
      readmeContents += `
##&lt;${tagName}&gt;

${element.desc}
`;
    }
    for (const name in behaviorsByName) {
      const behavior = behaviorsByName[name];
      readmeContents += `
##${name}

${behavior.desc}
`;
    }

    const readmePath = path.join(element.dir, 'README.md')
    const oldContents = fs.readFileSync(readmePath, 'utf8');
    if (oldContents !== readmeContents) {
      fs.writeFileSync(readmePath, readmeContents);
      element.dirty = true;
      return element.repo.createCommitOnHead(
            ['README.md'], getSignature(), getSignature(),
            'Autogenerate README file.');
    }
  });
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
const allowedPushes = 20;
function pushIsAllowed() {
  if (elementsPushed < allowedPushes) {
    elementsPushed++;
    return true;
  }
  return false;
}

function pushChanges(element, branchName, assignee) {
  if (!element.dirty) {
    return Promise.resolve();
  }
  if (!pushIsAllowed()) {
    return Promise.resolve();
  }
  return Promise.resolve()
      .then(pushBranch.bind(null, element, branchName))
      .then(createPullRequest.bind(
          null, element, branchName, 'master', assignee))
}

function pushBranch(element, branchName) {
  return element.repo.getReference("refs/remotes/origin/" + branchName)
    .then(() => {
      console.warn(`${element.ghRepo.name} already has a ${branchName} branch.`);
    }, () => {
      return element.repo.getRemote("origin")
        .then(function(remote) {
          return remote.push(
            ["refs/heads/" + branchName + ":refs/heads/" + branchName],
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
        })
    }
  );
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


console.log('Discovering repos in PolymerElements...');


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

let user;

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
}).then(null, function(err) {
  console.error(`\n\n${err}`);
  process.exit(1);
});
