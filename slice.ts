import {State, Random} from './index';

function topsearch(
  self: State,
  cutoff = Infinity,
  width = 5,
  visited = new Set<string>(),
  path: string[] = []
): { path?: string[]; visited: number } {
  for (let i = 0; ; i++) {
    const result = search(self, cutoff, i, width, visited, path);
    if (result.path || result.visited > 0) return result;
  }
}

function search(
  self: State,
  cutoff = Infinity,
  slice = 0,
  width = 5,
  visited = new Set<string>(),
  path: string[] = []
): { path?: string[]; visited: number } {
  const str = self.toString();
  visited.add(str);
  path.push(str);
  if (visited.size > cutoff) throw new RangeError();
  const next = self.next();
  const limit = (slice + 1) * width;
  for (const [s, {state}] of next.slice(0, limit)) {
    if (state.end()) {
      path.push(s);
      return {path, visited: visited.size};
    }
    if (!visited.has(s)) {
      const result = search(state, cutoff, slice, width, visited, path.slice());
      if (result.path) return result;
    }
  }
  return {visited: limit < next.length ? -1 : visited.size};
}

console.log(topsearch(State.create(new Random(Random.seed(+process.argv[2])))));