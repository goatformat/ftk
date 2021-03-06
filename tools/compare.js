#!/usr/bin/env node --no-warnings --experimental-specifier-resolution=node
import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import * as fs from 'fs';

import * as trakr from 'trakr';

const stats = {
  before: {success: [], fail: [], exhaust: [], crash: []},
  after: {success: [], fail: [], exhaust: [], crash: []},
  path: {before: [], after: []},
  diff: {
    success: {success: 0, fail: 0, exhaust: 0, crash: 0},
    fail: {success: 0, fail: 0, exhaust: 0, crash: 0},
    exhaust: {success: 0, fail: 0, exhaust: 0, crash: 0},
    crash: {success: 0, fail: 0, exhaust: 0, crash: 0},
  },
};

const pct = (a, b) => `${(-(b - a) * 100 / b).toFixed(2)}%`;

const dec = n => {
  const abs = Math.abs(n);
  if (abs < 1) return n.toFixed(3);
  if (abs < 10) return n.toFixed(2);
  if (abs < 100) return n.toFixed(1);
  return n.toFixed();
};

const report = (a, b) => {
  const std = n => !isNaN(n.std) ? ` ± ${dec(n.std)}` : '';
  if (b?.cnt) {
    console.log(`count: ${dec(a.cnt)} vs ${dec(b.cnt)} (${pct(a.cnt, b.cnt)})`);
    console.log(`average: ${dec(a.avg)}${std(a)} vs ${dec(b.avg)}${std(b)} (${pct(a.avg, b.avg)})`);
    console.log(`p50: ${dec(a.p50)} vs ${dec(b.p50)} (${pct(a.p50, b.p50)})`);
    console.log(`p95: ${dec(a.p95)} vs ${dec(b.p95)} (${pct(a.p95, b.p95)})`);
  } else {
    console.log(`count: ${dec(a.cnt)}`);
    console.log(`average: ${dec(a.avg)}${std(a)}`);
    console.log(`p50: ${dec(a.p50)}`);
    console.log(`p95: ${dec(a.p95)}`);
  }
};

const parse = line => {
  const [result, d, hand, visited, p] = line.split(',');
  return {result, duration: +d, hand, visited, path: +p};
};

const read = (csv, when, input) => {
  const result = [];
  const lines = fs.readFileSync(csv, 'utf8').split('\n');
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const a = parse(lines[i]);
    stats[when][a.result].push(a.duration);
    if (a.result === 'success') stats.path[when].push(a.path);
    if (input && input[i - 1]) stats.diff[input[i - 1].result][a.result]++;
    result.push(a);
  }
  return result;
};

const input = read(process.argv[2], 'before');
const before = {
  success: trakr.Stats.compute(stats.before.success),
  fail: trakr.Stats.compute(stats.before.fail),
  exhaust: trakr.Stats.compute(stats.before.exhaust),
};

if (!process.argv[3]) {
  for (const result of ['success', 'fail', 'exhaust']) {
    const a = before[result];
    if (!a.cnt) continue;
    console.log(`\n${result.toUpperCase()}\n---`);
    report(a);
  }
  if (stats.before.crash.length || stats.after.crash.length) {
    console.log(`\nCRASHES\n---`);
    console.log(`${stats.after.crash.length} vs ${stats.before.crash.length}`);
  }
  console.log(`\nPATH\n---`);
  report(trakr.Stats.compute(stats.path.before));
  process.exit(0);
}

read(process.argv[3], 'after', input);
const after = {
  success: trakr.Stats.compute(stats.after.success),
  fail: trakr.Stats.compute(stats.after.fail),
  exhaust: trakr.Stats.compute(stats.after.exhaust),
};


for (const result of ['success', 'fail', 'exhaust']) {
  const a = after[result];
  const b = before[result];
  if (!(b.cnt || a.cnt)) continue;
  console.log(`\n${result.toUpperCase()}\n---`);
  report(a, b);
  if (stats.before.crash.length || stats.after.crash.length) {
    console.log(`${stats.before[result].length} -> success: ${stats.diff[result].success}, fail: ${stats.diff[result].fail}, exhaust: ${stats.diff[result].exhaust}, crash: ${stats.diff[result].crash}`);
  } else {
    console.log(`${stats.before[result].length} -> success: ${stats.diff[result].success}, fail: ${stats.diff[result].fail}, exhaust: ${stats.diff[result].exhaust}`);
  }
}
if (stats.before.crash.length || stats.after.crash.length) {
  console.log(`\nCRASHES\n---`);
  console.log(`${stats.after.crash.length} vs ${stats.before.crash.length}`);
  if (stats.before.crash.length) {
    console.log(`${stats.before.crash.length} -> success: ${stats.diff.crash.success}, fail: ${stats.diff.crash.fail}, exhaust: ${stats.diff.crash.exhaust}, crash: ${stats.diff.crash.crash}`);
  }
}
console.log(`\nPATH\n---`);
report(trakr.Stats.compute(stats.path.after), trakr.Stats.compute(stats.path.before));
