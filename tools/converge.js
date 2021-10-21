#!/usr/bin/env node
require('source-map-support').install();

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const ProgressBar = require('progress');

const {hhmmss} = require('./utils');
const {benchmark} = require('./benchmark');
const {solve} = require('./solve');

(async () => {
  const n = +process.argv[2] || 1000;
  const prescient = process.argv[3] ? false : true;

  const csv = path.join(__dirname, 'logs', 'results.csv');
  const old = path.join(__dirname, 'logs', 'results.old.csv');
  try {
    fs.copyFileSync(csv, old);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  const progress = new ProgressBar('[:bar] :current/:total (:percent) | :elapsed/:etas', {
    total: n,
    incomplete: ' ',
  });
  const interval = setInterval(() => progress.render(), 1000);

  const start = Date.now();

  const complete = [];
  const incomplete = [];
  let exit = 0;
  for (const r of await benchmark(n, 0.5, prescient, () => progress.tick())) {
    if (r[0] !== 'success' && r[0] !== 'fail') {
      if (r[0] === 'crash') exit++;
      incomplete.push(/* seed */ r[5]);
    } else {
      complete.push(r);
    }
  }

  clearInterval(interval);
  progress.terminate();

  console.log(`Completed ${complete.length}/${n} searches in ${hhmmss(Date.now() - start)}, attempting to solve ${incomplete.length}/${n} remaining searches\n`);

  for (const r of await solve(incomplete, {verbose: 1, prescient})) {
    complete.push(r);
  }

  console.log(`Finished all ${n} searches in ${hhmmss(Date.now() - start)}`);
  const out = complete.sort((a, b) => a[5] - b[5]).map(result => result.join(','));
  try {
    fs.mkdirSync(path.join(__dirname, 'logs'));
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  fs.writeFileSync(csv, `result,duration,hand,visited,path,seed\n${out.join('\n')}`);

  if (fs.existsSync(old)) {
    execFileSync(path.join(__dirname, 'compare.js'), [old, csv], {stdio: 'inherit'});
  } else {
    execFileSync(path.join(__dirname, 'compare.js'), [csv], {stdio: 'inherit'});
  }

  process.exit(exit);
})();
