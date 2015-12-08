## Tedium!

A helpful bot for doing mass changes to Polymer team's github repos.

## Requirements:

### Node v5:

Tedium is written in Typescript and compiled to ES2015, so you want the
latest version of node:

```
nvm install v5
```

### Github token

You need to create a github token and place it in a file named `token`.
The token only needs the 'public repos' permission.

Generate a token here:   https://github.com/settings/tokens

### Building

Just `npm install` then `npm run build`. For automatic building as files
changes, run `npm run build:watch`.

## Running tedium

After that, just `node tedium.js` will do the right thing.

Namely it will:

1. query github for all PolymerElements repos
2. clone every repo at master
3. attempt to apply all of its automatic changes to each repo
4. print out the repos that were changed so that you can inspect them
   in the repos directory

If you approve of the changes then you can run tedium again with the
--max_changes arg, and it will actually push the changes automatically to
github.

One important thing to keep in mind is that the repos directory is deleted
and regenerated from scratch each time it runs.

tedium has the concept of changes that need review, and changes that don't.
If there are any changes that do need review, you'll be assigned to the PRs
that are created. Otherwise the changes are just pushed to master.

Before tedium exits it always displays a summary of what it did and what, if
anything, was pushed up to github.
