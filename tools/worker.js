import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import * as workerpool from 'workerpool';

import {State, Random, Formatter} from '../build/src';

workerpool.worker({
  search: (option, seed, cutoff, prescient, width, trace) => {
    const state = State.create(option.charCodeAt(0), new Random(seed), trace);
    const hand = Formatter.encode(state.hand.slice().sort());
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
