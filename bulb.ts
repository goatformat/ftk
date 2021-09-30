import {State, Random} from './index';

const SIZE = 1e7;

function BULB(s: State, B = 1) {
  const g = new Map();
  g.set(s.toString(), 0);
  const hashtable = new Set<string>();
  hashtable.add(s.toString());

  for (let discrepancies = 0; ; discrepancies++) {
    const pathlength = BULBprobe(0, discrepancies, B, hashtable, g);
    if (pathlength < Infinity) return pathlength;
  }
}

function BULBprobe(depth: number, discrepancies: number, B: number, hashtable: Set<string>, g: Map<string, number>): number {
  console.debug('BULBprobe', depth, discrepancies, B, hashtable.size, g.size);
  let [SLICE, value, index] = nextSlice(depth, 0, B, hashtable, g);
  if (value >= 0) return value;

  if (discrepancies === 0) {
    if (!SLICE.length) return Infinity;
    const pathlength = BULBprobe(depth + 1, 0, B, hashtable, g);
    for (const s of SLICE) hashtable.delete(s.toString());
    return pathlength;
  } else {
    for (const s of SLICE) hashtable.delete(s.toString());
    while (true) {
      const foo = nextSlice(depth, index, B, hashtable, g);
      SLICE = foo[0]; value = foo[1]; index = foo[2];
      if (value >= 0) {
        if (value < Infinity) return value;
        break;
      }
      if (!SLICE.length) continue;
      const pathlength = BULBprobe(depth + 1, discrepancies - 1, B, hashtable, g);
      for (const s of SLICE) hashtable.delete(s.toString());
      if (pathlength < Infinity) return pathlength;
    }
    const bar = nextSlice(depth, 0, B, hashtable, g);
    SLICE = bar[0]; value = bar[1]; index = bar[2];
    if (value >= 0) return value;

    if (!SLICE.length) return Infinity;
    const pathlength = BULBprobe(depth + 1, discrepancies, B, hashtable, g);
    for (const s of SLICE) hashtable.delete(s.toString());
    return pathlength
  }
}

function nextSlice(depth: number, index: number, B: number, hashtable: Set<string>, g: Map<string, number>): [State[], number, number] {
  console.debug('nextSlice', depth, index, B, hashtable.size, g.size);
  const currentlayer = new Set<string>();
  for (const s of hashtable) {
    if (g.get(s) === depth) currentlayer.add(s);
  }
  const SUCCS = generateNewSuccessors(currentlayer, hashtable);
  if (!SUCCS.length || index === SUCCS.length) return [[], Infinity, -1];
  for (const s of SUCCS) if (s.end()) return [[], depth + 1, -1];
  const SLICE: State[] = []
  let i = index;
  for (; i < SUCCS.length && SLICE.length < B; i++) {
    if (!hashtable.has(SUCCS[i].toString())) {
      g.set(SUCCS[i].toString(), depth);
      SLICE.push(SUCCS[i]);
      hashtable.add(SUCCS[i].toString());
      if (hashtable.size > SIZE) {
        for (const s of SLICE) hashtable.delete(s.toString());
        return [[], Infinity, -1];
      }
    }

  }
  return [SLICE, -1, i];
}

function generateNewSuccessors(stateset: Set<string>, hashtable: Set<string>) {
  console.debug('generateNewSuccessors', stateset.size, hashtable.size);
  const SUCCS: State[] = [];
  for (const str of stateset) {
    for (const [s, {state}] of State.fromString(str).next()) { // NOTE: already sorts by h
      if (!hashtable.has(s.toString())) {
        SUCCS.push(state);
      }
    }
  }
  return SUCCS;
}

console.log(BULB(State.create(new Random(Random.seed(2)))));