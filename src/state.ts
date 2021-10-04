import {ARCHFIEND, DATA, Type, Location} from './data';
import {Ids, ID, DeckID, FieldID} from './ids';
import {Random} from './random';
import {bestFirstSearch, bulbSearch, SearchResult} from './search';
import * as deckJSON from './deck.json';

const DECK: {[name: string]: number} = deckJSON;

// By default a 'trace' is built during a search to provide a detailed human-readable representation
// of how to arrive at a solution. This can be disabled (eg. during benchmarking to save time and
// memory) if you are only interested in whether or not a solution is possible.
// NOTE: set PROD to anything, even false and it will be turn off tracing (as its actually 'false')
const TRACE = !process.env.PROD;
// Used to enable state verification sanity checking which has a large impact on performance.
// NOTE: set DEBUG to anything, even false and it will be turn on verification (as its actually 'false')
const DEBUG = !!process.env.DEBUG;

export interface IState {
  key: string;
  state: State;
  score: number;
}

export class State {
  random: Random;
  lifepoints: number;
  summoned: boolean;
  monsters: FieldID[];
  spells: FieldID[];
  hand: ID[];
  banished: DeckID[];
  graveyard: ID[];
  deck: DeckID[];
  reversed: boolean;

  trace: string[];

  static create(random: Random) {
    const deck: ID[] = [];
    for (const name in DECK) {
      for (let i = 0; i < DECK[name]; i++) deck.push(DATA[name].id);
    }
    random.shuffle(deck);

    const state = new State(random, 8000, false, [], [], [], [], [], deck, false, []);
    state.draw(6, true);
    return state;
  }

  constructor(
    random: Random,
    lifepoints: number,
    summoned: boolean,
    monsters: FieldID[],
    spells: FieldID[],
    hand: ID[],
    banished: DeckID[],
    graveyard: ID[],
    deck: DeckID[],
    reversed: boolean,
    trace: string[],
  ) {
    this.random = random;
    this.lifepoints = lifepoints;
    this.summoned = summoned;
    this.monsters = monsters;
    this.spells = spells;
    this.hand = hand;
    this.banished = banished;
    this.graveyard = graveyard;
    this.deck = deck;
    this.reversed = reversed;

    this.trace = trace;
  }

  add(location: 'spells', id: FieldID): number;
  add(location: 'banished', id: DeckID): number;
  add(location: 'hand' | 'graveyard', id: ID): number;
  add(location: Exclude<Location, 'deck' | 'monsters'>, id: ID /* | DeckID | FieldID */) {
    let i = 0;
    for (; i < this[location].length; i++) {
      if (this[location][i] >= id) {
        this[location].splice(i, 0, id);
        return i;
      }
    }
    this[location].push(id);
    return i;
  }

  remove(location: 'spells', i: number): FieldID;
  remove(location: 'banished', id: number): DeckID;
  remove(location: 'hand' | 'graveyard', i: number): ID;
  remove(location: Exclude<Location, 'deck' | 'monsters'>, i: number): ID | DeckID | FieldID;
  remove(location: Exclude<Location, 'deck' | 'monsters'>, i: number) {
    return this[location].splice(i, 1)[0];
  }

  madd(id: ID | FieldID) {
    const zone = this.add('monsters' as any, id); // "I know what I'm doing" (handle equips below)
    for (let i = 0; i < this.spells.length; i++) {
      const card = ID.decode(this.spells[i]);
      if (!ID.facedown(this.spells[i]) && card.type === 'Spell' && card.subType === 'Equip') {
        const data = ID.data(this.spells[i]);
        // NOTE: only one of each equip so don't need to worry about sort order being affected
        if (data >= zone) this.spells[i] = `${card.id}${data + 1}` as FieldID;
      }
    }
    return zone;
  }

  mremove(i: number) {
    const id = ID.id(this.remove('monsters' as any, i)); // "I am very smrt" (handle equips below)
    const equips: ID[] = [];
    const spells: FieldID[] = [];
    for (const spell of this.spells) {
      const card = ID.decode(spell);
      if (!ID.facedown(spell) && card.type === 'Spell' && card.subType === 'Equip') {
        const data = ID.data(spell);
        // NOTE: only one of each equip so don't need to worry about sort order being affected
        if (data > i) {
          spells.push(`${card.id}${data - 1}` as FieldID);
        } else if (data === i) {
          equips.push(card.id);
        } else {
          spells.push(spell);
        }
      } else {
        spells.push(spell);
      }
    }
    this.spells = spells;

    return {id, equips};
  }

  mclear(i: number) {
    const {id, equips} = this.mremove(i);
    const zone = this.madd(ID.id(id));
    for (const equip of equips) {
      this.add('spells', `${equip}${zone}` as FieldID);
    }
  }

  summon(id: ID | FieldID, special = false) {
    this.summoned = !special;
    return this.madd(id);
  }

  tribute(fi: number, hi: number) {
    const {id, equips} = this.mremove(fi);
    this.add('graveyard', id);
    for (const equip of equips) {
      this.add('graveyard', equip);
    }
    if (equips.length) {
      this.minor(`Sending ${ID.names(equips)} equipped to "${ID.decode(id).name}" to the Graveyard`);
    }
    const h = this.remove('hand', hi);
    return this.summon(h);
  }

  banish() {
    // There is at most one face-down banished card at a time and since '(' always sorts before
    // any ID we simply need to check the first element
    if (this.banished[0] && ID.facedown(this.banished[0])) {
      const id = this.remove('banished', 0);
      this.add('banished', ID.id(id));
    }
  }

  major(s: string) {
    if (TRACE) this.trace.push(s);
  }

  minor(s: string) {
    if (TRACE) this.trace.push(`  ${s}`);
  }

  discard(indices: number[]) {
    // PRECONDITION: sorted indices
    let removed = 0;
    for (const i of indices) {
      const id = this.hand.splice(i - removed++, 1)[0];
      this.add('graveyard', id);
    }
  }

  inc(ignore?: number) {
    for (let i = 0; i < this.monsters.length; i++) {
      if (typeof ignore === 'number' && ignore === i) continue;
      const id = this.monsters[i];
      const card = ID.decode(id);
      if (ID.facedown(id) || card.name !== 'Royal Magical Library') continue;
      const data = ID.data(id);
      // NOTE: since we are incrementing *all* Library counter cards we don't alter the ordering
      if (data < 3) {
        this.monsters[i] = `${card.id}${data + 1}` as FieldID;
        this.minor(`Add Spell Counter to "${card.name}" (${data} -> ${data + 1})`);
      }
    }
  }

  shuffle() {
    this.deck = this.deck.map(id => ID.id(id));
    this.random.shuffle(this.deck);
    this.minor('Shuffle Deck');
  }

  reverse(revert = false) {
    if (revert) {
      if (!this.reversed) return;
      this.reversed = false;
      if (this.deck.length) {
        this.deck.reverse();
        if (!ID.known(this.deck[0])) this.deck[0] = `(${this.deck[0]})` as DeckID;
        this.minor(`Turn Deck back face-down ("${ID.decode(this.deck[0]).name}" now on bottom)`);
      }
    } else {
      if (this.reversed) return;
      this.reversed = true;
      if (this.deck.length) {
        this.deck.reverse();
        this.minor(`Turn Deck face-up ("${ID.decode(this.deck[this.deck.length - 1]).name}" now on top)`);
      }
    }
  }

  known(quiz = false) {
    if (!this.deck.length) return undefined;
    const top = this.deck[this.deck.length - 1];
    if (!quiz && this.reversed) return top;
    if (!this.reversed && ID.known(this.deck[this.deck.length - 1])) return top;

    const unknown = new Set<ID>();
    const types = new Set<Type>();

    for (const id of this.deck) {
      // Could technically have known cards are the bottom which would still allow us to determine the card
      if (ID.known(id)) continue;

      const card = ID.decode(id);
      unknown.add(card.id);
      types.add(card.type);

      if (!quiz && unknown.size > 1) return undefined;
      if (!quiz && (unknown.size > 1 && types.size > 1)) return undefined;
    }

    return (quiz && this.reversed) ? this.deck[0] : top;
  }

  search(
    options: {cutoff?: number; prescient?: boolean; width?: number} = {}
  ): {visited: number} | SearchResult & {visited: number} {
    const node = {key: this.toString(), state: this, score: this.score()};
    if (options.width) {
      return bulbSearch(node, options.width, options.cutoff, options.prescient);
    } else {
      return bestFirstSearch(node, options.cutoff, options.prescient);
    }
  }

  static transition(next: Map<string, IState>, state: State) {
    const key = state.toString();
    next.set(key, {key, state, score: state.score()});
    if (DEBUG) {
      const errors = State.verify(state);
      if (errors.length) {
        console.error(`INVALID STATE ${key}:\n\n${errors.join('\n')}`);
        console.error(state);
        console.error(state.trace.join('\n'));
        process.exit(1);
      }
    }
  }

  next(prescient = true) {
    if (this.lifepoints <= 0) return [];
    const next = new Map<string, IState>();

    for (let i = 0; i < this.monsters.length; i++) {
      const id = this.monsters[i];
      const card = ID.decode(id);
      if (card.id !== Ids.RoyalMagicalLibrary) continue;
      if (!ID.facedown(id) && ID.data(id) === 3 && this.deck.length) {
        const s = this.clone();
        s.major(`Remove 3 Spell Counters from "${card.name}"`);
        s.mclear(i);
        s.draw();
        State.transition(next, s);
      }
    }

    const spells = new Set<FieldID>();
    for (let i = 0; i < this.spells.length; i++) {
      const id = this.spells[i];
      if (spells.has(id)) continue;
      spells.add(id);
      const card = ID.decode(id);
      if (ID.facedown(id)) {
        card.play(this, 'spells', i, next, card, prescient);
      } else if (card.id === Ids.ArchfiendsOath && !ID.data(id)) {
        ARCHFIEND(this, 'spells', i, next, card, prescient);
      }
    }

    const hand = new Set<ID>();
    for (let i = 0; i < this.hand.length; i++) {
      const id = this.hand[i];
      if (hand.has(id)) continue;
      hand.add(id);
      const card = ID.decode(id);
      if (id === Ids.ThunderDragon) {
        const targets: number[] = [];
        for (let j = 0; j < this.deck.length && targets.length < 2; j++) {
          if (ID.id(this.deck[j]) === Ids.ThunderDragon) targets.push(j);
        }
        if (targets.length === 2) {
          const s = this.clone();
          s.major(`Discard "${card.name}"`);
          s.minor(`Add 2 "${card.name}" from Deck to hand`);
          s.remove('hand', i);
          s.add('graveyard', card.id);
          // PRECONDITION: targets[0] < targets[1]
          s.add('hand', ID.id(s.deck.splice(targets[0], 1)[0]));
          s.add('hand', ID.id(s.deck.splice(targets[1] - 1, 1)[0]));
          s.shuffle();
          State.transition(next, s);
        }
        // NOTE: This also covers the case where there are 2 targets but we only retrieve 1
        if (targets.length) {
          const s = this.clone();
          s.major(`Discard "${card.name}"`);
          s.minor(`Add "${card.name}" from Deck to hand`);
          s.remove('hand', i);
          s.add('graveyard', card.id);
          // Due to symmetry it doesn't matter which we choose
          s.add('hand', ID.id(s.deck.splice(targets[0], 1)[0]));
          s.shuffle();
          State.transition(next, s);
        } else {
          if (prescient || this.reversed) {
            // Failure to find
            const s = this.clone();
            s.major(`Discard "${card.name}"`);
            s.minor(`Fail to find "${card.name}" in Deck`);
            s.remove('hand', i);
            s.add('graveyard', card.id);
            s.shuffle();
            State.transition(next, s);
          }
        }
      } else if (card.type === 'Monster' && this.monsters.length < 5 && !this.summoned) {
        card.play(this, 'hand', i, next, card, prescient);

        // TODO: add support for setting Cyber Jar in multi-turn scenarios
        // if (card.name === 'Cyber Jar') {
        //   const set = this.clone();
        //   set.major(`Set "${card.name}" face-down in Defense Position`);
        //   set.summon(`(${id})` as FieldID);
        //   set.remove('hand', i);
        //   next.set(set.toString(), set);
        // }
      } else if (card.type === 'Spell' && this.spells.length < 5) {
        card.play(this, 'hand', i, next, card, prescient);
      }
    }

    return Array.from(next.values()).sort(State.compare);
  }

  static compare(a: IState, b: IState) {
    return (b.score - a.score ||
    a.state.lifepoints - b.state.lifepoints ||
    a.state.deck.length - b.state.deck.length ||
    (+ID.known(b.state.deck[b.state.deck.length - 1]) -
      +ID.known(a.state.deck[a.state.deck.length - 1])) ||
    +b.state.reversed - +a.state.reversed);
  }

  score() {
    // If we have reached a winning state we can simply ensure this gets sorted
    // to the front to ensure we don't bother expanding any sibling states.
    if (this.end()) return Infinity;
    let score = 0;

    const libraries = {active: 0, total: 0};
    for (const id of this.monsters) {
      const card = ID.decode(id);
      if (card.id === Ids.RoyalMagicalLibrary) {
        libraries.total++;
        if (ID.data(id) < 3) libraries.active++;
      }
      score += card.score(this, 'monsters', id);
    }

    for (const id of this.spells) {
      const card = ID.decode(id);
      const n = card.score(this, 'spells', id);
      if (!n) continue;
      if (ID.facedown(id)) {
        score += n * 0.9; // TODO how much to reduce for facedown?
        score += libraries.active / 3 + libraries.total / 6;
      } else {
        score += n;
      }
    }

    const open = this.spells.length < 5;
    for (const id of this.hand) {
      const card = ID.decode(id);
      if (card.type === 'Spell' && !open) continue;
      if (card.type === 'Monster' && this.summoned) continue;
      score += card.score(this, 'hand', id);
      if (card.type === 'Spell') score += libraries.active / 3 + libraries.total / 6;
    }

    return score;
  }

  end() {
    if (this.lifepoints > 500) return false;
    if (!this.monsters.length || !this.deck.length) return false;
    const known = this.known(true);
    if (!known) return false;
    const hand = {pendant: false, quiz: false};
    for (const id of this.hand) {
      if (id === Ids.BlackPendant) {
        hand.pendant = true;
      } else if (id === Ids.ReversalQuiz) {
        hand.quiz = true;
      }
    }
    if (hand.pendant && hand.quiz && this.spells.length <= 3) {
      return this.win(known, true, {pendant: false, quiz: false});
    }
    let equip = true;
    const spells = {pendant: false, quiz: false};
    for (const fid of this.spells) {
      const id = ID.id(fid);
      if (id === Ids.BlackPendant) {
        spells.pendant = true;
        if (!ID.facedown(id)) equip = false;
      } else if (id === Ids.ReversalQuiz) {
        spells.quiz = true;
      }
    }
    if (spells.quiz && spells.pendant) {
      return this.win(known, equip, {pendant: true, quiz: true});
    }
    if (hand.pendant && this.spells.length <= 4 && spells.quiz) {
      return this.win(known, equip, {pendant: false, quiz: true});
    }
    if (hand.quiz && this.spells.length <= 4 && spells.pendant) {
      return this.win(known, equip, {pendant: true, quiz: false});
    }
    return false;
  }

  win(known: DeckID, equip: boolean, facedown: {pendant: boolean; quiz: boolean}) {
    if (equip) {
      const monster = ID.decode(this.monsters[0]);
      this.major(`${facedown.pendant ? 'Flip face-down "Black Pendant" and equip' : 'Equip "Black Pendant"'}  to "${monster.name}"`);
    }
    this.major(`Activate${facedown.quiz ? ' face-down' : ''} "Reversal Quiz"`);
    if (this.hand.length) {
      this.minor(`Send ${ID.names(this.hand)} from hand to Graveyard`);
    }
    if (this.monsters.length || this.spells.length) {
      this.minor(`Send ${ID.names([...this.monsters, ...this.spells])} from field to Graveyard`);
    }
    for (const id of this.spells) {
      const card = ID.decode(id);
      if (card.id === Ids.ConvulsionOfNature) {
        this.reverse(true);
        break;
      }
    }
    this.minor(`Call "${ID.decode(known).type}", reveal "${ID.decode(this.deck[this.deck.length - 1]).name}"`);
    this.major(`After exchanging Life Points, opponent has ${this.lifepoints} LP and then takes 500 damage from "Black Pendant" being sent from the field to the Graveyard`);
    return true;
  }

  clone() {
    return new State(
      new Random(this.random.seed),
      this.lifepoints,
      this.summoned,
      this.monsters.slice(),
      this.spells.slice(),
      this.hand.slice(),
      this.banished.slice(),
      this.graveyard.slice(),
      this.deck.slice(),
      this.reversed,
      this.trace.slice(),
    );
  }

  draw(n = 1, initial = false) {
    if (n > this.deck.length) throw new Error('Deck out');
    const ids = [];
    for (let i = 0; i < n; i++) {
      const id = ID.id(this.deck.pop()!);
      ids.push(id);
      this.add('hand', id);
    }
    if (initial) {
      this.major(`Opening hand contains ${ID.names(ids)}`);
    } else {
      this.minor(`Draw ${ID.names(ids)}`);
    }
  }

  equals(s: State) {
    return (this.random.seed === s.random.seed &&
      this.lifepoints === s.lifepoints &&
      this.summoned === s.summoned &&
      this.reversed === s.reversed &&
      equals(this.monsters, s.monsters) &&
      equals(this.spells, s.spells) &&
      equals(this.hand, s.hand) &&
      equals(this.banished, s.banished) &&
      equals(this.graveyard, s.graveyard) &&
      equals(this.deck, s.deck));
  }

  toString() {
    // Using `join` here on an array instead of using a template string or string concatenation
    // is deliberate as it reuslts in V8 creating a flat string instead of a cons-string, the
    // latter of which results in significantly higher memory usage. This is a V8 implementation
    // detail and the approach to forcing a flattened string to be created may change over time.
    // https://gist.github.com/mraleph/3397008
    return [this.random.seed, this.lifepoints, +this.summoned,
      this.monsters.join(''), this.spells.join(''), this.hand.join(''),
      this.banished.join(''), this.graveyard.join(''), this.deck.join(''),
      +this.reversed].join('|');
  }

  static fromString(s: string) {
    let i = 0;
    let j = s.indexOf('|');
    const random = new Random(+s.slice(0, j));

    i = j + 1;
    j = s.indexOf('|', i);
    const lifepoints = +s.slice(i, j);

    i = j + 1;
    j = j + 2;
    const summoned = s.slice(i, j) === '1';

    i = j + 1;
    j = s.indexOf('|', i);
    const monsters = this.parse(s.slice(i, j)) as FieldID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const spells = this.parse(s.slice(i, j)) as FieldID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const hand = s.slice(i, j).split('') as ID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const banished = this.parse(s.slice(i, j)) as DeckID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const graveyard = s.slice(i, j).split('') as ID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const deck = this.parse(s.slice(i, j)) as DeckID[];

    i = j + 1;
    const reversed = s.slice(i) === '1';

    return new State(
      random, lifepoints, summoned, monsters, spells, hand, banished, graveyard, deck, reversed, []
    );
  }

  static display(path: string[], trace: string[]) {
    const buf = [];

    let major = 0;
    for (const line of trace) {
      const minor = line.startsWith('  ');
      if (!minor) {
        if (path[major - 1]) buf.push(`\n${path[major - 1]}\n`);
        major++;
      }
      buf.push(line);
    }

    return buf.join('\n');
  }

  private static parse(s: string): (FieldID | DeckID)[] {
    const ids: (FieldID | DeckID)[] = [];
    let id = '';
    let ok = true;
    for (let i = 0; i < s.length; i++) {
      if (ok && id) {
        ids.push(id as FieldID | DeckID);
        id = '';
      }
      id += s[i];
      ok = i < s.length - 1 && s[i + 1] === '(' ||
        (id[0] === '(' ? id[id.length - 1] === ')' : (s[i + 1] >= 'A' && s[i + 1] <= 'Z'));
    }
    if (id) ids.push(id as FieldID | DeckID);
    return ids;
  }

  static verify(s: State) {
    const errors: string[] = [];
    const pretty = (ids: (ID | FieldID | DeckID)[]) => ids.map(id => ID.pretty(id)).join(', ');

    if (s.lifepoints > 8000 || s.lifepoints <= 0) {
      errors.push(`LP: ${s.lifepoints}`);
    }

    if (s.monsters.length > 5 || !equals(s.monsters.slice().sort(), s.monsters)) {
      errors.push(`Monsters: ${pretty(s.monsters)}`);
    } else {
      for (const id of s.monsters) {
        const card = ID.decode(id);
        if (card.type !== 'Monster' ||
          ((ID.facedown(id) || card.id !== Ids.RoyalMagicalLibrary) && ID.data(id)) ||
          ID.data(id) > 3) {
          errors.push(`Monsters: ${pretty(s.monsters)}`);
          break;
        }
      }
    }

    if (s.spells.length > 5 || !equals(s.spells.slice().sort(), s.spells)) {
      errors.push(`Spells: ${pretty(s.spells)}`);
    } else {
      for (const id of s.spells) {
        const card = ID.decode(id);
        const facedown = ID.facedown(id);
        const data = ID.data(id);
        if (card.type !== 'Spell' || (facedown && data) ||
          (card.id === Ids.ArchfiendsOath && data > 1) ||
          (!facedown && card.type === 'Spell' &&
            (!(['Continuous', 'Equip'].includes(card.subType) ||
              card.id === Ids.DifferentDimensionCapsule)))) {
          errors.push(`Spells: ${pretty(s.spells)}`);
          break;
        } else if (!facedown && card.type === 'Spell' &&
          card.subType === 'Equip' && !s.monsters[data]) {
          errors.push(`Spells: ${pretty(s.spells)}`);
          break;
        }
      }
    }

    if (s.hand.filter(i => i.length > 1).length || !equals(s.hand.slice().sort(), s.hand)) {
      errors.push(`Hand: ${pretty(s.hand)}`);
    }

    if (s.banished.length > 40 ||
      !equals(s.banished.slice().sort(), s.banished) ||
      s.banished.filter(i => ID.facedown(i)).length > 1) {
      errors.push(`Banished: ${pretty(s.banished)}`);
    }

    if (s.graveyard.length > 40 ||
      s.graveyard.filter(i => i.length > 1).length ||
      !equals(s.graveyard.slice().sort(), s.graveyard)) {
      errors.push(`Graveyard: ${pretty(s.graveyard)}`);
    }

    if (s.deck.length > 40) {
      errors.push(`Deck: ${pretty(s.deck)}`);
    } else {
      let pattern = 0; // expect (...)???(...)
      for (const id of s.deck) {
        const known = ID.known(id);
        if (!known && pattern === 0) pattern = 1;
        if (known && pattern === 1) pattern = 2;
        if (!known && pattern === 2) {
          errors.push(`Deck: ${pretty(s.deck)}`);
          break;
        }
      }
    }

    const start = [];
    for (const name in DECK) {
      for (let i = 0; i < DECK[name]; i++) start.push(DATA[name].id);
    }
    start.sort();
    const now = [
      ...s.monsters.map(id => ID.id(id)),
      ...s.spells.map(id => ID.id(id)),
      ...s.hand,
      ...s.banished.map(id => ID.id(id)),
      ...s.graveyard,
      ...s.deck.map(id => ID.id(id)),
    ].sort();
    if (!equals(start, now)) {
      errors.push(`Mismatch: ${start.length} vs. ${now.length}\n`);
    }

    return errors;
  }
}

function equals<T>(a: T[], b: T[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
