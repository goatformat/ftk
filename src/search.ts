import {IState} from './state';

export interface SearchResult {
  path: string[];
  trace: string[];
}

export interface Hash<K, V> {
  size: number;
  has(k: K): boolean;
  get(k: K): V | undefined;
  set(k: K, v: V): this;
}

// V8 Sets/Maps throw a RangeError at 2^24 entries
// https://bugs.chromium.org/p/v8/issues/detail?id=11852
const LIMIT = Math.pow(2, 24) - 1;

class BigMap<K, V> implements Hash<K, V> {
  private readonly maps: Map<K, V>[];

  constructor() {
    this.maps = [new Map<K, V>()];
  }

  get size() {
    let size = 0;
    for (const map of this.maps) {
      size += map.size;
    }
    return size;
  }

  has(k: K) {
    for (let i = this.maps.length - 1; i >= 0; i--) {
      if (this.maps[i].has(k)) return true;
    }
    return false;
  }

  get(k: K) {
    for (let i = this.maps.length - 1; i >= 0; i--) {
      const v = this.maps[i].get(k);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  set(k: K, v: V) {
    let map!: Map<K, V>;
    for (const m of this.maps) {
      if (m.has(k)) return this;
      map = m;
    }

    if (map.size === LIMIT) {
      map = new Map();
      this.maps.push(map);
    }
    map.set(k, v);

    return this;
  }
}

export function bestFirstSearch(
  node: IState, cutoff?: number, prescient?: boolean
): {visited: number} | SearchResult & {visited: number} {
  const hash: Hash<string, number> = cutoff && cutoff > LIMIT ? new BigMap() : new Map();
  const result = bestFirstProbe(node, hash, [], cutoff, prescient);
  return {visited: hash.size, ...result};
}

function bestFirstProbe(
  node: IState,
  visited: Hash<string, number>,
  path: string[],
  cutoff?: number,
  prescient?: boolean
): SearchResult | undefined {
  visited.set(node.key, 1);
  path.push(node.key);
  if (cutoff && visited.size > cutoff) throw new RangeError();
  const children = node.state.next(prescient);
  for (const child of children) {
    if (child.score >= Infinity) {
      path.push(child.key);
      return {path, trace: child.state.trace};
    }
    if (!visited.has(child.key)) {
      const result = bestFirstProbe(child, visited, path.slice(), cutoff, prescient);
      if (result) return result;
    }
  }
  return undefined;
}

const enum Status {
  // The first slice of this node has been visited (which implies the first slices of all of the
  // first slice's children's nodes have been visited)
  PARTIAL = 1,
  // All children of this node have been completely visited (which implies that all children of its
  // children's nodes have been completely visited)
  COMPLETE = 2,
}

export function bulbSearch(
  node: IState, B = 5, cutoff?: number, prescient?: boolean
): {visited: number} | SearchResult & {visited: number} {
  const visited: Hash<string, Status> = cutoff && cutoff > LIMIT ? new BigMap() : new Map();
  for (let discrepancies = 0; visited.get(node.key) !== Status.COMPLETE; discrepancies++) {
    const result = bulbProbe(node, B, discrepancies, visited, [], cutoff, prescient);
    if (result) return {visited: visited.size, ...result};
  }
  return {visited: visited.size};
}

function bulbProbe(
  node: IState,
  B: number,
  discrepancies: number,
  visited: Hash<string, Status>,
  path: string[],
  cutoff?: number,
  prescient?: boolean
): SearchResult | undefined {
  path.push(node.key);

  // No matter what, we will at least be visiting all of the first slice,
  // thus we can mark this node as partially visited
  visited.set(node.key, Status.PARTIAL);
  if (cutoff && visited.size > cutoff) throw new RangeError();

  let children = node.state.next(prescient);
  const num = children.length;
  const split = B >= 1 ? B : Math.ceil(num * B);
  if (!discrepancies) {
    // If we don't have any discrepancies we visit just the first slice (though
    // this could be all of the children)
    if (num > split) children = children.slice(0, split);

    let complete = 0;
    for (const child of children) {
      if (child.score >= Infinity) {
        path.push(child.key);
        return {path, trace: child.state.trace};
      }

      const v = visited.get(child.key);
      if (v === Status.COMPLETE) {
        // Track how many of our children are actually COMPLETE - if they all are
        // and we're visiting all of our children than we can mark this node as COMPLETE
        complete++;
      } else if (!v) {
        // If this node was visited at all we can skip visiting it further, as we will only
        // ever be looking in the first slice anyway since we have no discrepancies
        const result = bulbProbe(child, B, 0, visited, path.slice(), cutoff, prescient);
        if (result) return result;
        if (visited.get(child.key) === Status.COMPLETE) complete++;
      }
    }
    // If the slice actually encompassed all children and they were all COMPLETE
    //  we can mark this node as COMPLETE
    if (complete === num) {
      visited.set(node.key, Status.COMPLETE);
    }
  } else {
    // Pull out the best slice from children
    const best = children.splice(0, split);
    // Use up a discrepancy by investigating the other slices
    let complete = 0;
    for (const child of children) {
      if (child.score >= Infinity) {
        path.push(child.key);
        return {path, trace: child.state.trace};
      }

      const v = visited.get(child.key);
      if (v === Status.COMPLETE) {
        complete++;
      } else {
        // If we only have one discrepancy we don't need to bother recursing into children
        //  that have already been partially searched as we would only be expanding their
        // first slice anyway which has all already been searched
        if (discrepancies === 1 && v) continue;
        const result =
          bulbProbe(child, B, discrepancies - 1, visited, path.slice(), cutoff, prescient);
        if (result) return result;
        if (visited.get(child.key) === Status.COMPLETE) complete++;
      }
    }
    // Preserve our discrepancy by choosing the best slice
    for (const child of best) {
      if (child.score >= Infinity) {
        path.push(child.key);
        return {path, trace: child.state.trace};
      }

      const v = visited.get(child.key);
      if (v === Status.COMPLETE) {
        // Track how many of our children are actually COMPLETE - if they all are
        // and we're visiting all of our children than we can mark this node as COMPLETE
        complete++;
      } else {
        // In this case, we need to explore the child even if it is PARTIAL visited as we now
        // have discrepancies to spare which would cause us to explore into the other slices
        const result =
          bulbProbe(child, B, discrepancies, visited, path.slice(), cutoff, prescient);
        if (result) return result;
        if (visited.get(child.key) === Status.COMPLETE) complete++;
      }
    }
    // If the slice actually encompassed all children and they were all COMPLETE
    //  we can mark this node as COMPLETE
    if (complete === num) {
      visited.set(node.key, Status.COMPLETE);
    }
  }

  return undefined;
}
