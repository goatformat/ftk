import {State, Random} from './index';

function search(
  self: State,
  cutoff = Infinity,
  visited = new Set<string>(),
  path: string[] = []
): { path?: string[]; visited: number } {
  const str = self.toString();
  visited.add(str);
  path.push(str);
  if (visited.size > cutoff) throw new RangeError();
  const next = self.next();
  for (const [s, {state, score}] of next) {
    if (score === Infinity) {
      path.push(s);
      return {path, visited: visited.size};
    }
    if (!visited.has(s)) {
      const result = search(state, cutoff, visited, path.slice());
      if (result.path) return result;
    }
  }
  return {visited: visited.size};
}

console.log(search(State.create(new Random(Random.seed(+process.argv[2])))));

/*
score() {
    // If we have reached a winning state we can simply ensure this gets sorted
    // to the front to ensure we don't bother expanding any sibling states.
    if (this.end()) return Infinity;
    let score = 0;
    const open = 5 - this.spells.length;
    let known = this.known();

    const LIBRARIES = [];
    for (const id of this.monsters) {
      if (ID.id(id) === Ids.RoyalMagicalLibrary) {
        LIBRARIES.push(ID.data(id));
      }
    }


    for (const id of this.spells) {
      const card = ID.decode(id);
      if (ID.facedown(id)) {
        // score += card.score / 2;
      } else if (card.id === Ids.ArchfiendsOath && !ID.data(id) && known) {
        // score++;
      }
    }

    for (const id of this.hand) {
      const card = ID.decode(id);
      if (card.type === 'Spell' && open) {
        // score += card.score;
      } else if (!this.summoned) {
        // score += card.id === Ids.RoyalMagicalLibrary ? card.score / 3 : card.score;
      }
    }

    return score;
  }*/