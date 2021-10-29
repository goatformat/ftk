import * as workerpool from 'workerpool';

import {State, Random} from '../src';

workerpool.worker({
  search: (s: string, seed: number, cutoff: number, prescient = false, width = 0) => {
    const state = State.decode(s);
    // We don't know the actual state of the deck, so we reseed and shuffle
    state.random = new Random(seed);
    state.shuffle();

    try {
      const result = state.search({cutoff, prescient, width});
      return 'path' in result ? result.path.length : 0;
    } catch (err) {
      if (err instanceof RangeError) return -1;
      throw err;
    }
  },
  solve: (s: string, cutoff?: number, prescient?: boolean, width?: number) => {
    const state = State.decode(s, true);
    const start = Date.now();
    try {
      const search = state.search({cutoff, prescient, width});
      if ('path' in search) {
        return ['success', Date.now() - start, search.visited, search.path, search.trace];
      } else {
        return ['fail', Date.now() - start, search.visited];
      }
    } catch (e) {
      if (e instanceof RangeError) {
        return ['exhaust', Date.now() - start, cutoff];
      }
      throw e;
    }
  },
});
