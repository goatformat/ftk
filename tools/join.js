#!/usr/bin/env node
require('source-map-support').install();

const fs = require('fs');
const path = require('path');

const {Random} = require('../build');

const parse = line => {
  const [result, d, hand, visited, p] = line.split(',');
  return {result, duration: +d, hand, visited, path: +p};
};

const read = csv => {
  const result = [];
  const lines = fs.readFileSync(path.join(__dirname, csv), 'utf8').split('\n');
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    result.push(parse(lines[i]));
  }
  return result;
};

const bfsNonPrescient = read('logs/2357567b/bfs.nonprescient.csv');
const bfsPrescient = read('logs/2357567b/bfs.prescient.csv');
const bulbNonPrescient = read('logs/2357567b/bulb05.nonprescient.csv');
const bulbPrescient = read('logs/2357567b/bulb05.prescient.csv');

const groups = {
  success: {full: [], partial: []},
  fail: {full: [], partial: []},
  other: [],
};

for (let i = 0; i < 10000; i++) {
  const results = [bfsNonPrescient[i].result, bfsPrescient[i].result, bulbNonPrescient[i].result, bulbPrescient[i].result];

  let fail = 0;
  let success = 0;
  for (const result of results) {
    if (result === 'success') success++;
    else if (result === 'fail') fail++;
  }

  if (success === results.length) {
    groups.success.full.push(i);
  } else if (fail === results.length) {
    groups.fail.full.push(i);
  } else if (success) {
    groups.success.partial.push(i);
  } else if (fail && (bfsPrescient[i].result === 'fail' || bulbPrescient[i].result === 'fail')) {
    groups.fail.partial.push(i);
  } else {
    groups.other.push(i);
  }
}

// console.log(
//   groups.success.full.length + groups.success.partial.length,
//   groups.fail.full.length + groups.fail.partial.length,
//   groups.other.length);

// 85.89%, 11.77% fail, 2.34%

// console.log(
//   groups.success.full.length,
//   groups.success.partial.length,
//   groups.fail.full.length,
//   groups.fail.partial.length,
//   groups.other.length);

// 6883 1706 1172 5 234

const random = new Random(Random.seed(4));
const sample = (a, n) => {
  const r = [];
  if (a.length < n) throw new RangeError();
  while (r.length < n) {
    r.push(random.sample(a, true))
  }
  return r;
}

const result = [
  ...sample(groups.success.full, 248),
  ...groups.success.partial,
  ...sample(groups.fail.full, 34),
  ...groups.fail.partial,
  ...sample(groups.other, 7)
].sort();

console.log(result.join('\n'));
