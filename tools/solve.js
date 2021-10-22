#!/usr/bin/env node --no-warnings --experimental-specifier-resolution=node
import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import * as fs from 'fs';
import * as path from 'path';
import {execFileSync} from 'child_process';
import {fileURLToPath} from 'url';

import {hhmmss, solve} from './utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VERBOSE = isNaN(+process.env.VERBOSE) ? +!!process.env.VERBOSE : +process.env.VERBOSE;

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
})().catch(console.error);
