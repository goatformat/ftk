import * as workerpool from 'workerpool';

import {State, Random} from '../../src';

workerpool.worker({
  search: (s: string, seed: number, cutoff: number, prescient = false, width = 0) => {
    // FIXME decode(s);
    const state = State.fromString(s);
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
});
