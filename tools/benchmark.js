#!/usr/bin/env node --no-warnings --experimental-specifier-resolution=node
import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import * as fs from 'fs';
import * as path from 'path';
import {execFileSync} from 'child_process';
import {fileURLToPath} from 'url';

import ProgressBar from 'progress';

import {hhmmss, benchmark} from './utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const n = +process.argv[2] || 1000;
const width = +process.argv[3] || undefined;
const prescient = !process.argv[4];

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

  const results = await benchmark(n, width, prescient, () => progress.tick());
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
})().catch(console.error);
