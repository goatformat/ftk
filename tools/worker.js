require('source-map-support').install();

const workerpool = require('workerpool');

const {State, Random} = require('../build');

workerpool.worker({
  search: (seed, cutoff, prescient, width, trace) => {
    const state = State.create(new Random(seed), trace);
    const hand = state.hand.slice().sort().join('');
    const start = Date.now();
    try {
      const search = state.search({cutoff, prescient, width});
      if (search.path) {
        return ['success', Date.now() - start, hand, search.visited, search.path, search.trace];
      } else {
        return ['fail', Date.now() - start, hand, search.visited, undefined];
      }
    } catch (e) {
      if (e instanceof RangeError) {
        return ['exhaust', Date.now() - start, hand, undefined, undefined];
      }
      throw e;
    }
  },
});
