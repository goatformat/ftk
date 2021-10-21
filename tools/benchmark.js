#!/usr/bin/env node
require('source-map-support').install();

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const workerpool = require('workerpool');
const ProgressBar = require('progress');

const {Random} = require('../build');
const {hhmmss, maxWorkers} = require('./utils');

const TIMEOUT = 20 * 60 * 1000;
const CUTOFF = 1e7;

async function benchmark(n, width, fn) {
  const pool = workerpool.pool(path.join(__dirname, 'worker.js'), {maxWorkers: maxWorkers(CUTOFF)});

  const results = [];
  for (let i = 0; i < n; i++) {
    results.push(pool.exec('search', [Random.seed(i), CUTOFF, true, width]).timeout(TIMEOUT).then(result => {
      if (fn) fn();
      return [...result, i];
    }).catch(err => {
      if (fn) fn();
      if (err instanceof workerpool.Promise.TimeoutError) {
        return ['exhaust', TIMEOUT, undefined, undefined, undefined, i];
      } else {
        return ['crash', 0, undefined, undefined, undefined, i];
      }
    }));
  }

  const r = (await Promise.all(results)).map(([result, duration, hand, visited, p, seed]) =>
    [result, duration, hand, visited, p?.length, seed]);
  pool.terminate();
  return r;
}

if (require.main === module) {
  const n = +process.argv[2] || 1000;
  const width = +process.argv[3] || undefined;

  (async () => {
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
    const results = await benchmark(n, width, () => progress.tick());
    console.log(`Finished all ${n} searches in ${hhmmss(Date.now() - start)}`);

    // Not really much point in turning this into a write stream as we're collecting all the results
    // in memory first anyway to be able to order them correctly.
    const out = results.map(result => result.join(','));
    const exit = results.filter(r => r[0] === 'crash').length;
    try {
      fs.mkdirSync(path.join(__dirname, 'logs'));
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    fs.writeFileSync(csv, `result,duration,hand,visited,path,seed\n${out.join('\n')}`);

    clearInterval(interval);
    progress.terminate();

    if (fs.existsSync(old)) {
      execFileSync(path.join(__dirname, 'compare.js'), [old, csv], {stdio: 'inherit'});
    } else {
      execFileSync(path.join(__dirname, 'compare.js'), [csv], {stdio: 'inherit'});
    }

    process.exit(exit);
  })();
}

module.exports = {benchmark};
