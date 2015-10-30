## Tedium!

A helpful bot for doing mass changes to Polymer team's github repos.

## Requirements:

### Node v5:

Tedium is written in ES2015, so you want the latest version of node:

```
nvm install v5
```

### Github token

You need to create a github token and place it in a file named `token`.
The token only needs the 'public repos' permission.

Generate a token here:   https://github.com/settings/tokens

## Running tedium

After that, just `node tedium.js` will do the right thing.

Namely it will:

1. query github for all PolymerElements repos
2. clone every repo at master
3. attempt to apply all of its automatic changes to each repo
4. commit and push any changes that are needed

tedium has the concept of changes that need review, and changes that don't. If there are any changes that do need review, you'll be assigned to the PRs that are created. Otherwise the changes are just pushed to master.

After it's finished running you'll be told how many repos were updated.
