#!/usr/bin/env node
require('source-map-support').install();

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const ProgressBar = require('progress');

const {hhmmss} = require('./utils');
const {benchmark} = require('./benchmark');
const {solve} = require('./solve');

const csv = path.join(__dirname, 'logs', 'results.csv');
const old = path.join(__dirname, 'logs', 'results.old.csv');
try {
  fs.copyFileSync(csv, old);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

(async () => {
  const n = +process.argv[2] || 1000;

  const progress = new ProgressBar('[:bar] :current/:total (:percent) | :elapsed/:etas', {
    total: n,
    incomplete: ' ',
  });
  const interval = setInterval(() => progress.render(), 1000);

  const start = Date.now();

  const complete = [];
  const incomplete = [];
  for (const r of await benchmark(n, 0.5, () => progress.tick())) {
    if (r[0] !== 'success' && r[0] !== 'fail') {
      incomplete.push(/* seed */ r[5]);
    } else {
      complete.push(r);
    }
  }

  clearInterval(interval);
  progress.terminate();

  console.log(`Completed ${complete.length}/${n} searches in ${hhmmss(Date.now() - start)}, attempting to solve ${incomplete.length}/${n} remaining searches\n`);

  for (const r of await solve(incomplete, 1)) {
    complete.push(r);
  }

  const out = complete.sort((a, b) => a[5] - b[5]).map(result => result.join(','));
  fs.writeFileSync(csv, `result,duration,hand,visited,path,seed\n${out.join('\n')}`);

  console.log(`Finished all ${n} searches in ${hhmmss(Date.now() - start)}`);
  if (fs.existsSync(old)) {
    execFileSync(path.join(__dirname, 'compare.js'), [old, csv], {stdio: 'inherit'});
  } else {
    execFileSync(path.join(__dirname, 'compare.js'), [csv], {stdio: 'inherit'});
  }
})();
