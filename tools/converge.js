#!/usr/bin/env node --no-warnings --experimental-specifier-resolution=node
import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';

import ProgressBar from 'progress';

import {hhmmss, benchmark, solve, compare} from './utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
  const n = +process.argv[2] || 1000;
  const prescient = !process.argv[3];

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

  if (incomplete.length) {
    console.log(`Completed ${complete.length}/${n} searches in ${hhmmss(Date.now() - start)}, attempting to solve ${incomplete.length}/${n} remaining searches\n`);

    for (const r of await solve(incomplete, {verbose: 1, prescient})) {
      complete.push(r);
    }
  }

  console.log(`Finished all ${n} searches in ${hhmmss(Date.now() - start)}`);
  const out = complete.sort((a, b) => a[5] - b[5]).map(result => result.join(','));
  try {
    fs.mkdirSync(path.join(__dirname, 'logs'));
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  fs.writeFileSync(csv, `result,duration,hand,visited,path,seed\n${out.join('\n')}`);

  compare(csv, old);

  process.exit(exit);
})().catch(console.error);
