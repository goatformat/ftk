require('source-map-support').install();

const fs = require('fs')
const path = require('path');
const {execFileSync} = require('child_process');
const os = require('os');

const workerpool = require('workerpool');
const ProgressBar = require('progress');

const {Random} = require('../build');

// Technically, storing 1M state strings (length ~68) should only take 650 MiB, but we
// instead see threads using considerably more memory empirically. Allowing threads ~3.2 GiB of
// memory each helps ensure we stay at around 75-85% utilization for the system and don't start
// swapping or crashing.
const MEMORY = 3.436e9;

const hhmmss = (ms, round = true) => {
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
};

const csv = path.join(__dirname, 'results.csv');
const old = path.join(__dirname, 'results.old.csv');
try {
  fs.copyFileSync(csv, old);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const maxWorkers = Math.round(os.totalmem() / MEMORY);
const pool = workerpool.pool(path.join(__dirname, 'worker.js'), {maxWorkers});

(async () => {
  const results = [];
  const start = Date.now();
  const n = +process.argv[2] || 1000;

  const progress = new ProgressBar('[:bar] :current/:total (:percent) | :elapsed/:etas', {
    total: n,
    incomplete: ' ',
  });
  const interval = setInterval(() => progress.render(), 1000);

  for (let i = 0; i < n; i++) {
    results.push(pool.exec('search', [Random.seed(i)]).then(result => {
      progress.tick();
      return result;
    }));
  }

  // Not really much point in turning this into a write stream as we're collecting all the results
  // in memory first anyway to be able to order them correctly.
  fs.writeFileSync(csv,
    `result,duration,hand,visited,path\n${(await Promise.all(results)).join('\n')}`);

  pool.terminate();
  clearInterval(interval);
  progress.terminate();

  console.log(`Finished all ${n} searches in ${hhmmss(Date.now() - start)}`);
  if (fs.existsSync(old)) {
    execFileSync(path.join(__dirname, 'compare'), [old, csv], {stdio: 'inherit'});
  } else {
    execFileSync(path.join(__dirname, 'compare'), [csv], {stdio: 'inherit'});
  }
})();