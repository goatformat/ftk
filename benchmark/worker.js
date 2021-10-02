require('source-map-support').install();

const workerpool = require('workerpool');

const {State, Random} = require('../build');

const STATES = 1e7;

process.env.PROD = 'true';

workerpool.worker({
  search: seed => {
    const state = State.create(new Random(seed));
    const hand = state.hand.slice().sort().join('');
    let result;
    const start = Date.now();
    try {
      const search = state.search(STATES);
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
  }
});