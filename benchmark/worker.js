require('source-map-support').install();

const workerpool = require('workerpool');

const {State, Random} = require('../build/src');

const STATES = 1e7;

process.env.PROD = 'true';

workerpool.worker({
  search: (seed, width) => {
    const state = State.create(new Random(seed));
    const hand = state.hand.slice().sort().join('');
    let result;
    const start = Date.now();
    try {
      const search = state.search({cutoff: STATES, width});
      if (search.path) {
        result = ['success', Date.now() - start, hand, search.visited, search.path.length];
      } else {
        result = ['fail', Date.now() - start, hand, search.visited, undefined];
      }
    } catch (e) {
      if (e instanceof RangeError) {
        result = ['exhaust', Date.now() - start, hand, undefined, undefined];
      }
    }
    return result.join(',');
  },
});
