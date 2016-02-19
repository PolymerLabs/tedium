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

/**
 * This file contains the main flow for the bot. i.e. discovering and cloning
 * repos, letting cleanup-passes run, noticing if anything's changed, and
 * pushing those changes back to github if needed.
 *
 * The actual changes that the bot does are in cleanup-passes.js
 *
 * Note that after the script is run, it leaves git repos for all the elements
 * it dealt with in the repos/ directory. This can be useful for examining
 * changes that would be pushed up, or investingating failures.
 *
 * However, don't store anything in the repos/ directory that you care about,
 * because tedium deletes it when it starts up.
 */

'use strict';

import * as cliArgs from 'command-line-args';
import * as fs from 'fs';
import * as GitHub from 'github';
import * as hydrolysis from 'hydrolysis';
import * as nodegit from 'nodegit';
import * as pad from 'pad';
import * as path from 'path';
import * as ProgressBar from 'progress';
import * as promisify from 'promisify-node';
import * as rimraf from 'rimraf';
import * as stripJsonComments from 'strip-json-comments';

import './cleanup-passes/register-all';
import {cleanup} from './cleanup';
import {CleanupConfig, getPasses} from './cleanup-pass';
import {existsSync} from './cleanup-passes/util';
import {ElementRepo, PushStatus} from './element-repo';

const passNames = getPasses().map(p => p.name);
const cli = cliArgs([
  {name: "help", type: Boolean, alias: "h", description: "Print usage."},
  {
    name: "max_changes",
    type: (x: string) => {
      if (!x) {
        return 0;
      }
      if (/^[0-9]+$/.test(x)) {
        return parseInt(x, 10);
      }
      throw new Error(`invalid max changes, expected an integer: ${x}`);
    },
    alias: "c",
    description: "The maximum number of repos to push. Default: 0",
    defaultValue: 0
  },
  {
    name: 'repo',
    type: (s) => {
      if (!s) {
        throw new Error('Value expected for --repo|-r flag');
      }
      let parts = s.split('/');
      if (parts.length !== 2) {
        throw new Error(`Given repo ${s} is not in form user/repo`);
      }
      return {user: parts[0], repo: parts[1]};
    },
    defaultValue: [],
    multiple: true,
    alias: 'r',
    description:
        'Explicit repos to process. Specifying explicit repos will disable running on the implicit set of repos for the user.'
  },
  {
    name: 'pass',
    multiple: true,
    type: (passName) => {
      if (passNames.indexOf(passName) < 0) {
        throw new Error(`Unknown cleanup pass name "${passName}"`);
      }
      return passName;
    },
    defaultValue: [],
    description: `Cleanup passes to run. If this flag is used then only the given passes will run, and they will run even if they're disabled by default. Pass names: ${passNames.join(', ')}`
  }
]);
interface UserRepo {
  user: string;
  repo: string;
}
interface Options {
  help: boolean;
  max_changes: number;
  repo: UserRepo[];
  pass: string[];
}
const opts: Options = cli.parse();

if (opts.help) {
  console.log(cli.getUsage({
    header: "tedium is a friendly bot for doing mass changes to Polymer repos!",
    title: "tedium"
  }));
  process.exit(0);
}

let GITHUB_TOKEN: string;

try {
  GITHUB_TOKEN = fs.readFileSync('token', 'utf8').trim();
} catch (e) {
  console.error(`
You need to create a github token and place it in a file named 'token'.
The token only needs the 'public repos' permission.

Generate a token here:   https://github.com/settings/tokens
`);
  process.exit(1);
}

interface Config {
  passes?: CleanupConfig;
}
let config: Config =
    JSON.parse(stripJsonComments(fs.readFileSync('config.json', 'utf8')));


const github = connectToGithub();

const progressMessageWidth = 40;
const progressBarWidth = 45;

/**
 * Returns a Promise of a list of Polymer github repos to automatically
 * cleanup / transform.
 */
async function getRepos(): Promise<GitHub.Repo[]> {
  const per_page = 100;
  const getFromOrg: (o: Object) => Promise<GitHub.Repo[]> =
      promisify(github.repos.getFromOrg);
  let progressLength = 2;
  if (opts.repo.length) {
    progressLength += opts.repo.length
  }
  const progressBar = standardProgressBar(
      'Discovering repos in PolymerElements...', progressLength);

  // First get the Polymer repo, then get all of the PolymerElements repos.
  const repo: GitHub.Repo =
      await promisify(github.repos.get)({user: 'Polymer', repo: 'polymer'});
  progressBar.tick();
  const repos = [repo];
  if (opts.repo.length) {
    // cleanup passes wants ContributionGuide around
    repos.push(
        await promisify(github.repos.get)(
            {user: 'PolymerElements', repo: 'ContributionGuide'}));
    progressBar.tick();
    for (let repo of opts.repo) {
      repos.push(await promisify(github.repos.get)(repo));
      progressBar.tick();
    }
  } else {
    let page = 0;
    while (true) {
      const resultsPage =
          await getFromOrg({org: 'PolymerElements', per_page, page});
      repos.push.apply(repos, resultsPage);
      page++;
      if (resultsPage.length < per_page) {
        break;
      }
    }
    repos.push(
        await promisify(github.repos.get)(
            {user: 'PolymerLabs', repo: 'promise-polyfill'}));
    progressBar.tick();
  }

  // github pagination is... not entirely consistent, and
  // sometimes gives us duplicate repos.
  const repoIds = new Set<string>();
  const dedupedRepos: GitHub.Repo[] = [];
  for (const repo of repos) {
    if (repoIds.has(repo.name)) {
      continue;
    }
    repoIds.add(repo.name);
    dedupedRepos.push(repo);
  }
  return dedupedRepos;
}

/**
 * Like Promise.all, but also displays a progress bar that fills as the
 * promises resolve. The label is a helpful string describing the operation
 * that the user is waiting on.
 */
function promiseAllWithProgress<T>(
    promises: Promise<T>[], label: string): Promise<T[]> {
  const progressBar = standardProgressBar(label, promises.length);
  for (const promise of promises) {
    Promise.resolve(promise)
        .then(() => progressBar.tick(), () => progressBar.tick());
  }
  return Promise.all(promises);
}

function standardProgressBar(label: string, total: number) {
  const pb = new ProgressBar(
      `${pad(label, progressMessageWidth)} [:bar] :percent`,
      {total, width: progressBarWidth}
    );
  // force the progress bar to start at 0%
  pb.render();
  return pb;
}

/**
 * Returns a promise that resolves after a delay. The more often it's been
 * called recently, the longer the delay.
 *
 * This is useful for stuff like github write APIs, where they don't like it
 * if you do many writes in parallel.
 *
 *     rateLimit().then(() => doAGithubWrite());
 *
 */
let rateLimit = (function() {
  let previousPromise = Promise.resolve(null);
  return function rateLimit(delay: number) {
    let curr = previousPromise.then(function() {
      return new Promise((resolve) => { setTimeout(resolve, delay); });
    });
    previousPromise = curr;
    return curr;
  };
})();

/**
 * Creates a branch with the given name on the given repo.
 *
 * returns a promise of the nodegit Branch object for the new branch.
 */
async function checkoutNewBranch(
    repo: nodegit.Repository, branchName: string): Promise<void> {
  const commit = await repo.getHeadCommit();
  const branch =
      await nodegit.Branch.create(repo, branchName, commit, false);
  return repo.checkoutBranch(branch);
}

let elementsPushed = 0;
let pushesDenied = 0;
/**
 * Will return true at most opts.max_changes times. After that it will always
 * return false.
 *
 * Counts how many times both happen.
 * TODO(rictic): this should live in a class rather than as globals.
 */
function pushIsAllowed() {
  if (elementsPushed < opts.max_changes) {
    elementsPushed++;
    return true;
  }
  pushesDenied++;
  return false;
}

/**
 * Will push the given element at the given branch name up to github if needed.
 *
 * Depending on whether the element's changes need review, it will either
 * push directly to master, or push to a branch with the same name as the local
 * branch, then create a PR and assign it to `assignee`.
 *
 * Returns a promise.
 */
async function pushChanges(
    element: ElementRepo, localBranchName: string, assignee: string) {
  if (!element.dirty) {
    return;
  }
  if (!pushIsAllowed()) {
    element.pushStatus = PushStatus.denied;
    return;
  }
  let remoteBranchName = 'master';
  if (element.needsReview) {
    remoteBranchName = localBranchName;
  }

  try {
    await pushBranch(element, localBranchName, remoteBranchName);
    if (element.needsReview) {
      await createPullRequest(element, localBranchName, 'master', assignee);
    }
  } catch (e) {
    element.pushStatus = PushStatus.failed;
    throw e;
  }
  element.pushStatus = PushStatus.succeeded;
}

/**
 * Pushes the given element's local branch name up to
 * the remote branch name on github.
 *
 * returns a promise
 */
async function pushBranch(
    element: ElementRepo, localBranchName: string, remoteBranchName: string) {
  const remote = await element.repo.getRemote("origin")

  return remote.push(
     [
       "refs/heads/" + localBranchName + ":refs/heads/" +
       remoteBranchName
     ],
     {
       callbacks: {
         credentials() {
           return nodegit.Cred.userpassPlaintextNew(
               GITHUB_TOKEN, "x-oauth-basic");
         }
       }
     }
  );
}

/**
 * Creates a pull request to merge the branch identified by `head` into the
 * branch identified by `base`, then assign the new pull request to `asignee`.
 */
async function createPullRequest(
    element: ElementRepo, head: string, base: string, assignee: string) {
  const user = element.ghRepo.owner.login;
  const repo = element.ghRepo.name;
  await rateLimit(5000);
  const pr = await promisify(github.pullRequests.create)({
    title: 'Automatic cleanup!',
    user,
    repo,
    head,
    base,
  });
  await promisify(github.issues.edit)({
    number: pr.number,
    user,
    repo,
    assignee,
    labels: ['autogenerated'],
  });
}

/**
 * Returns an authenticated github connection.
 */
function connectToGithub() {
  const github = new GitHub({
    version: "3.0.0",
    protocol: "https",
  });

  github.authenticate({type: 'oauth', token: GITHUB_TOKEN});
  return github;
}


/**
 * Analyzes all of the HTML in 'repos/*' with hydrolysis.
 *
 * Returns a promise of the hydrolysis.Analyzer with all of the info loaded.
 */
async function analyzeRepos() {
  const dirs = fs.readdirSync('repos/');
  const htmlFiles: string[] = [];

  for (const dir of dirs) {
    for (const fn of fs.readdirSync(path.join('repos', dir))) {
      if (/index\.html|dependencies\.html/.test(fn) || !fn.endsWith('.html')) {
        continue;
      }
      // We want to ignore files with 'demo' in them, unless the element's
      // directory has the word 'demo' in it, in which case that's
      // the whole point of the element.
      if (!/\bdemo\b/.test(dir) && /demo/.test(fn)) {
        continue;
      }
      htmlFiles.push(path.join('repos', dir, fn));
    }
  }

  function filter(repo: string) { return !existsSync(repo); }

  // This code is conceptually simple, it's only complex due to ordering
  // and the progress bar. Basically we call analyzer.metadataTree on each
  // html file in sequence, then finally call analyzer.annotate() and return.
  const analyzer =
      await hydrolysis.Analyzer.analyze('repos/polymer/polymer.html', {filter});

  const progressBar = new ProgressBar(
      `:msg [:bar] :percent`,
      {total: htmlFiles.length + 1, width: progressBarWidth});

  for (const htmlFile of htmlFiles) {
    await analyzer.metadataTree(htmlFile);
    const msg = pad(
        `Analyzing ${htmlFile.slice(6)}`, progressMessageWidth, {strip: true});
    progressBar.tick({msg});
  }


  progressBar.tick(
      {msg: pad('Analyzing with hydrolysis...', progressMessageWidth)});
  analyzer.annotate();
  return analyzer;
}

/**
 * Should be called after everything is done. Looks through the elements and
 * reports which ones would be pushed,
 */
function reportOnChangesMade(elements: ElementRepo[]) {
  const pushedElements = elements.filter((e) =>
      e.pushStatus === PushStatus.succeeded);
  const failedElements = elements.filter((e) =>
      e.pushStatus === PushStatus.failed);
  const deniedElements = elements.filter((e) =>
      e.pushStatus === PushStatus.denied);;

  const messageAndElements:[{0: string, 1: ElementRepo[]}] = [
    ['Elements that would have been pushed:', deniedElements],
    ['Elements pushed successfully:', pushedElements],
    ['Elements that I tried to push that FAILED:', failedElements],
  ];

  for (const mAndE of messageAndElements) {
    const message = mAndE[0];
    const elements = mAndE[1];
    if (elements.length === 0) {
      continue;
    }
    console.log('\n' + message);
    for (const element of elements) {
      console.log(`    ${element.dir}`);
    }
  }
}

async function _main(elements: ElementRepo[]) {
  await promisify(rimraf)('repos');
  fs.mkdirSync('repos');

  const user = await promisify(github.user.get)({});
  const ghRepos = await getRepos();

  const promises: Promise<ElementRepo>[] = [];

  // Clone git repos.
  for (const ghRepo of ghRepos) {
    promises.push(Promise.resolve().then(() => {
      const dir = path.join('repos', ghRepo.name);
      let repoPromise: Promise<nodegit.Repository>;
      if (existsSync(dir)) {
        repoPromise = nodegit.Repository.open(dir);
      } else {
        repoPromise = rateLimit(100).then(
            () => nodegit.Clone.clone(ghRepo.clone_url, dir, null));
      }
      return repoPromise.then((repo) =>
        new ElementRepo({repo, dir, ghRepo, analyzer: null})
      );
    }));
  }
  elements.push(...await promiseAllWithProgress(promises, 'Cloning repos...'));

  // Analyze with hydrolysis
  const analyzer = await analyzeRepos();
  for (const element of elements) {
    element.analyzer = analyzer;
  }
  elements.sort((l, r) => { return l.dir.localeCompare(r.dir); });

  // Transform code on disk and push it up to github
  // (if that's what the user wants)
  const cleanupPromises: Promise<any>[] = [];
  const excludes = new Set([
    'repos/style-guide',
    'repos/test-all',
    'repos/ContributionGuide',
    'repos/molecules', // Was deleted
    'repos/polymer',
  ]);

  const branchName = 'auto-cleanup';
  const cleanupProgress =
      standardProgressBar('Applying transforms...', elements.length);
  for (const element of elements) {
    let passesToRun: string[] = null;
    if (opts.pass.length > 0) {
      passesToRun = opts.pass;
    }
    if (excludes.has(element.dir)) {
      cleanupProgress.tick();
      continue;
    }

    try {
      await checkoutNewBranch(element.repo, branchName);
      await rateLimit(0);
      await cleanup(element, config.passes || {}, passesToRun);
      await pushChanges(element, branchName, user.login);
    } catch (err) {
      throw new Error(
          `Error updating ${element.dir}:\n${err.stack || err}`);
    }
    cleanupProgress.tick();
  }

  reportOnChangesMade(elements);
  if (elementsPushed === 0 && pushesDenied === 0) {
    console.log('No changes needed!');
  } else if (pushesDenied === 0) {
    console.log(`Successfully pushed to ${elementsPushed} repos.`);
  } else if (opts.max_changes === 0) {
    console.log(
        `${pushesDenied} changes ready to push. ` +
        `Call with --max_changes=N to push them up!`);
  } else {
    console.log(
        `Successfully pushed to ${elementsPushed} repos. ` +
        `${pushesDenied} remain.`);
  }
}

async function main() {
  // We do this weird thing, where we pass in an empty array and have the
  // actual _main() add elements to it just so that we can report on
  // what elements did and didn't get pushed even in the case of an error
  // midway through.
  const elements: ElementRepo[] = [];
  try {
    await _main(elements);
  } catch (err) {
    // Try to report on changes made, but we may not have gotten far enough
    // for that to be possible. If not, don't worry about it.
    try {
      reportOnChangesMade(elements);
    } catch (_) {
    }

    // Report the error and crash.
    console.error('\n\n');
    console.error(err.stack || err);
    process.exit(1);
  }
}

main();
