import * as workerpool from 'workerpool';

import {State} from '../../src';

workerpool.worker({
  search: (s: string, cutoff?: number, prescient?: boolean, width?: number) => {
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
