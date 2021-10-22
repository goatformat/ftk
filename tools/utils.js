import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {execFileSync} from 'child_process';
import {fileURLToPath} from 'url';

import * as workerpool from 'workerpool';

import {State, Random} from '../build/src';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Technically, storing 10M state strings (length ~68 = 12 + 4 * Math.ceil(68 /4) = 80 bytes) should
// require 800 MB, though if they're in a cons-string representation instead of flat strings they
// will use considerably more. Empirically allowing threads ~2 GB of memory each helps ensure we
// stay at around 75-85% utilization for the system and don't start swapping or crashing.
export const maxWorkers = (cutoff) => Math.round(os.totalmem() / (200 * cutoff));

export function hhmmss(ms, round = true) {
  let s = ms / 1000;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s - (h * 3600)) / 60);
  s = s - (h * 3600) - (m * 60);
  if (round) s = Math.round(s);

  const mm = m < 10 ? `0${m}` : `${m}`;
  const ss = s < 10 ? `0${s}` : `${s}`;
  if (h > 0) {
    const hh = h < 10 ? `0${h}` : `${h}`;
    return `${hh}h${mm}m${ss}s`;
  } else {
    return `${mm}m${ss}s`;
  }
}

export async function benchmark(n, width, prescient = true, fn) {
  const timeout = 20 * 60 * 1000;
  const cutoff = 1e7;
  const pool = workerpool.pool(path.join(__dirname, 'worker.js'), {maxWorkers: maxWorkers(cutoff)});

  const results = [];
  for (let i = 0; i < n; i++) {
    results.push(pool.exec('search', [Random.seed(i), cutoff, prescient, width]).timeout(timeout).then(result => {
      if (fn) fn();
      return [...result, i];
    }).catch(err => {
      if (fn) fn();
      if (err instanceof workerpool.Promise.TimeoutError) {
        return ['exhaust', timeout, undefined, undefined, undefined, i];
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

export async function solve(seeds, options = {verbose: false, prescient: true}) {
  const timeout = 60 * 60 * 1000;
  const cutoff = 2e7;
  const verbose = options.verbose || 0;
  const prescience = options.prescient ? [true, false] : [false];
  const log = (...args) => verbose && console.log(...args);

  const pool = workerpool.pool(path.join(__dirname, 'worker.js'), {maxWorkers: maxWorkers(cutoff)});

  const cohorts = {};
  const searches = [];
  for (const seed of seeds) {
    cohorts[seed] = [];
    for (const width of [0.5, 0, 10, 0.25, 5, 0.1, 15]) {
      for (const prescient of prescience) {
        if (typeof cohorts[seed][0] === 'string') continue;

        const desc = `${prescient ? 'prescient' : 'non-prescient'} ${width === 0 ? 'best-first' : 'BULB'} search${width ? ` (width=${width})` : ''}`;
        const search = pool.exec('search', [Random.seed(seed), cutoff, prescient, width, verbose > 1]).timeout(timeout).then(result => {
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
            log(`Gave up after searching ${cutoff} states of seed ${seed} in ${hhmmss(result[1])} with ${desc} due to exhaustion.`);
          }
          return result;
        }).catch(err => {
          if (err instanceof workerpool.Promise.TimeoutError) {
            log(`Timed out after ${hhmmss(timeout)} of searching seed ${seed} using ${desc}.`);
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

export function compare(csv, old) {
  const CMP = [
    '--no-warnings',
    '--experimental-specifier-resolution=node',
    path.join(__dirname, 'compare.js'),
  ];
  if (fs.existsSync(old)) {
    execFileSync('node', [...CMP, old, csv], {stdio: 'inherit'});
  } else {
    execFileSync('node', [...CMP, csv], {stdio: 'inherit'});
  }
}

