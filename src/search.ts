import {IState} from './state';

// Use State.display() to actually turn these results into something useful
export interface SearchResult {
  // Encoded array of State objects which represent each step required to win
  path: string[];
  // The trace of the final State object - the human readable description of the playout
  trace: string[];
}

// Simplistic Map-compatible interface that we can implement with BigMap below
export interface Hash<K, V> {
  size: number;
  has(k: K): boolean;
  get(k: K): V | undefined;
  set(k: K, v: V): this;
}

// V8 Sets/Maps throw a RangeError at 2^24 entries
// https://bugs.chromium.org/p/v8/issues/detail?id=11852
const LIMIT = Math.pow(2, 24) - 1;

// Workaround for V8's system limits - please note that if you are storing enough states that you
// need this you will probably also need to set --max-old-space-size=8092 or higher to avoid OOMs.
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

// Standard best-first search - most game trees have far too many children to exhaustively search
// with BFS or even uninformed DFS (consider trees of depth 50 with 5-20+ nodes at each depth...).
// cutoff should probably be set to around 10M to avoid running out of memory. This can perform
// better than BULB search when the heuristic is good, especially since it can more effectively
// take advantage of caching. Note that while tracking each state isn't strictly required for
// correctness reasons (nothing should cause a true cycle), in large trees 95%+ of the nodes are
// duplicates (sometimes seen 1000s of times), so removing the cache would effectively result in a
// 20-100x performance hit (ie. we trade memory for latency).
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

// A modified Limited Discrepancy Beam Search (BULB) implementation. In the original paper
// (http://idm-lab.org/bib/abstracts/papers/ijcai05a.pdf) the hash table is used to ensure
// correctness in the presence of cycles (which as stated above, is not possible here), and a
// solution is always assumed to exist. The latter isn't the case, so we need to track each visited
// node in order to determine when we have completed the search in the case of failure (as opposed
// to continually trying with more and more discrepancies). More importantly, due to the nature of
// the game tree having so many duplicated states, we rely on being able to leverage the hash to
// dedupe for performance reasons. Because of how the search works we need to be more careful about
// tracking the visited status of the node to know whether it is safe to use the cache or not, but
// ultimately it still pays off tremendously performance wise.
//
// The beam width B is typically a fixed width, but this implementation also allows for having the
// beam width change dynamically depending on the number of children a node has. This is very useful
// given that some states have 1-5 children while others (eg. Reload / Card Destruction / Spell
// Reproduction / Different Dimension Capsule) can result in tens if not 100+ children meaning
// a fractional width is generally more useful.
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
    // FIXME try moving this first and seeing what happens
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
