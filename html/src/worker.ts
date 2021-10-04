import * as workerpool from 'workerpool';

import {State, Random} from '../../src';

workerpool.worker({
  search: (s: string, seed: number, cutoff: number, width: number) => {
    const state = State.fromString(s);
    // We don't know the actual state of the deck, so we reseed and shuffle
    // state.random = new Random(seed);
    // state.shuffle();

    console.log(state.toString());

    try {
      const result = state.search({cutoff});
      return 'path' in result ? result.path.length : 0;
    } catch (err) {
      if (err instanceof RangeError) return -1;
      throw err;
    }
  },
});
