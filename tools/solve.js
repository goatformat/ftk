#!/usr/bin/env node
require('source-map-support').install();

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const workerpool = require('workerpool');

const {State, Random} = require('../build/src');
const {hhmmss, maxWorkers} = require('./utils');

const TIMEOUT = 60 * 60 * 1000;
const CUTOFF = 2e7;
const VERBOSE = isNaN(+process.env.VERBOSE) ? +!!process.env.VERBOSE : +process.env.VERBOSE;

async function solve(seeds, options = {verbose: VERBOSE, prescient: true}) {
  const verbose = options.verbose || 0;
  const prescience = options.prescient ? [true, false] : [false];
  const log = (...args) => verbose && console.log(...args);

  const pool = workerpool.pool(path.join(__dirname, 'worker.js'), {maxWorkers: maxWorkers(CUTOFF)});

  const cohorts = {};
  const searches = [];
  for (const seed of seeds) {
    cohorts[seed] = [];
    for (const width of [0.5, 0, 10, 0.25, 5, 0.1, 15]) {
      for (const prescient of prescience) {
        if (typeof cohorts[seed][0] === 'string') continue;

        const desc = `${prescient ? 'prescient' : 'non-prescient'} ${width === 0 ? 'best-first' : 'BULB'} search${width ? ` (width=${width})` : ''}`;
        const search = pool.exec('search', [Random.seed(seed), CUTOFF, prescient, width, verbose > 1]).timeout(TIMEOUT).then(result => {
          if (typeof cohorts[seed][0] === 'string') return;

          if (result[0] === 'success') {
            log(`Found a path of length ${result[4].length} for seed ${seed} in ${hhmmss(result[1])} after searching ${result[3]} states using ${desc}${verbose > 1 ? `:\n${State.display(result[4], result[5])}` : ''}`);
            for (const s of cohorts[seed]) if (s.pending && s !== search) s.cancel();
            cohorts[seed] = result;
          } else if (result[0] === 'fail') {
            log(`Searched all ${result[3]} states of seed ${seed} in ${hhmmss(result[1])} with ${desc} and did not find any winning path.`);
            // NOTE: we can only terminate if prescient because non-prescient might report failures due to having a smaller search space
            if (prescient) {
              for (const s of cohorts[seed]) if (s.pending && s !== search) s.cancel();
              cohorts[seed] = result;
            }
          } else {
            log(`Gave up after searching ${CUTOFF} states of seed ${seed} in ${hhmmss(result[1])} with ${desc} due to exhaustion.`);
          }
          return result;
        }).catch(err => {
          if (err instanceof workerpool.Promise.TimeoutError) {
            log(`Timed out after ${hhmmss(TIMEOUT)} of searching seed ${seed} using ${desc}.`);
          } else if (err instanceof workerpool.Promise.CancellationError) {
            log(`Cancelled ${desc} of seed ${seed}.`);
          } else {
            log(`Crashed which searching seed ${seed} using ${desc}`, err);
          }
        });
        if (typeof cohorts[seed][0] !== 'string') cohorts[seed].push(search);
        searches.push(search);
      }
    }
  }

  await Promise.all(searches);
  pool.terminate();

  return (Object.entries(cohorts)).map(([seed, [result, duration, hand, visited, p]]) =>
    (typeof result === 'string'
      ? [result, duration, hand, visited, p?.length, seed]
      : ['exhaust', 0, undefined, undefined, undefined, seed]
    ));
}

if (require.main === module) {
  (async () => {
    const seeds = [];
    if (process.argv.length < 3) {
      console.error('Usage: solve <seed|file of seeds> <non-prescient>?');
      process.exit(1);
    }

    if (isNaN(+process.argv[2])) {
      for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
        if (!line) continue;
        seeds.push(+line);
      }
    } else {
      seeds.push(+process.argv[2]);
    }

    const prescient = !process.argv[3];

    const start = Date.now();
    const results = await solve(seeds, {verbose: VERBOSE || +(seeds.length === 1), prescient});

    if (seeds.length > 1) {
      console.log(`Finished all ${seeds.length} searches in ${hhmmss(Date.now() - start)}`);
      const csv = path.join(__dirname, 'logs', 'solutions.csv');
      const old = path.join(__dirname, 'logs', 'solutions.old.csv');
      try {
        fs.copyFileSync(csv, old);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      const out = results.map(result => result.join(','));
      try {
        fs.mkdirSync(path.join(__dirname, 'logs'));
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
      fs.writeFileSync(csv, `result,duration,hand,visited,path,seed\n${out.join('\n')}`);
      execFileSync(path.join(__dirname, 'compare.js'), [csv], {stdio: 'inherit'});
    }
  })();
}

module.exports = {solve};
