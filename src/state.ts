import {ARCHFIEND, DATA, Type, Location} from './data';
import {Ids, ID, DeckID, FieldID} from './ids';
import {Random} from './random';
import {bestFirstSearch, bulbSearch, SearchResult} from './search';
import * as deckJSON from './deck.json';
import * as WEIGHTS from './weights.json';

const DECK: {[name: string]: number} = deckJSON;

// Used to enable state verification sanity checking which has a large impact on performance.
// NOTE: set DEBUG to anything, even false and it will be turn on verification (!!'false')
const DEBUG = !!process.env.DEBUG;

// An 'immutable' State. State follows somewhat of a builder pattern, and once it is built it can be
// turned into an IState. Because the `state` is no longer being mutated we can cache the `score`
// and the toString representation in `key` to avoid redundant work during search
export interface IState {
  key: string;
  state: Readonly<State>;
  score: number;
}

// The core game State. As mentioned above, this class is usually used in a pseudo-builder pattern
// where handlers clone a State object, mutate it, and then 'freeze' it as an immutable IState.
// State contains all the fields required for Library FTK (though note this is not a sufficient
// encapsulation of general-purpose Yu-Gi-Oh! duel state). The most glaring difference (besides only
// tracking data for one player and not supporting phases) is that the hand, Graveyard, banished
// zone, Monster Zones and Spell & Trap Zones are all sorted - in regular Yu-Gi-Oh! the exact
// location of a card in a zone can be relevant, but in the limited subset of Yu-Gi-Oh! required to
// simulate the Library FTK we only care about precise zones with respect to the two Equip Spells
// (and in that case it only actually matters in the case of Tribute Summoning) and we handle this
// with the addition of data on the ID and special cases adding/removing monsters.
//
// In addition to the core required fields for simulating the game there is also an optional `trace`
// field that tracks the human-readable description of all of the state transitions that occur. Note
// that this information is preserved through cloning but does *not* round trip through
// toString/fromString.
export class State {
  random: Random;
  lifepoints: number;
  turn: number;
  summoned: boolean;
  monsters: FieldID[];
  spells: FieldID[];
  hand: ID[];
  banished: DeckID[];
  graveyard: ID[];
  deck: DeckID[];
  reversed: boolean;

  trace?: string[];

  static create(random: Random, trace?: boolean) {
    const deck: ID[] = [];
    for (const name in DECK) {
      for (let i = 0; i < DECK[name]; i++) deck.push(DATA[name].id);
    }
    random.shuffle(deck);

    const state = new State(
      random, 8000, 1, false, [], [], [], [], [], deck, false, trace ? [] : undefined
    );
    state.draw(6, true);
    return state;
  }

  constructor(
    random: Random,
    lifepoints: number,
    turn: number,
    summoned: boolean,
    monsters: FieldID[],
    spells: FieldID[],
    hand: ID[],
    banished: DeckID[],
    graveyard: ID[],
    deck: DeckID[],
    reversed: boolean,
    trace?: string[],
  ) {
    this.random = random;
    this.lifepoints = lifepoints;
    this.turn = turn;
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

  // Adds id to location and returns the index of id within the new location
  // NOTE: you still must handle removing the id from the previous location
  add(location: 'spells', id: FieldID): number;
  add(location: 'banished', id: DeckID): number;
  add(location: 'hand' | 'graveyard', id: ID): number;
  add(location: Exclude<Location, 'deck' | 'monsters'>, id: ID /* | DeckID | FieldID */) {
    let i = 0;
    // We need to keep things sorted, but doing a linear scan of the already sorted array is faster
    // than doing a binary search to find the new location because the length of the arrays in
    // question is always < 40
    for (; i < this[location].length; i++) {
      if (this[location][i] >= id) {
        this[location].splice(i, 0, id);
        return i;
      }
    }
    this[location].push(id);
    return i;
  }

  // Removes the id from location at index i and returns the removed id
  // NOTE: you still must handle adding the id to a new location
  remove(location: 'spells', i: number): FieldID;
  remove(location: 'banished', id: number): DeckID;
  remove(location: 'hand' | 'graveyard', i: number): ID;
  remove(location: Exclude<Location, 'deck' | 'monsters'>, i: number): ID | DeckID | FieldID;
  remove(location: Exclude<Location, 'deck' | 'monsters'>, i: number) {
    return this[location].splice(i, 1)[0];
  }

  // add, but for monsters. This needs to be special cased as reorganizing the monsters might
  // require also rewriting the data of any Equip Spells if the monsters they were pointing to ended
  // up at a new index after the sort.
  // NOTE: you still must handle removing the id from the previous location
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

  // remove, but for monsters. This also needs to be special cased for Equip Spells - instead of
  // simply returning the id of the removed monster at index i we also return any equips that may
  // have been equipped to it (to either reequip or to remove).
  // NOTE: you still must handle adding the id (and equips) to a new location
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

  // Wipe the data of the monster at index i. This may affect the sort order of the monster in
  // question which might also affect the data of any Equip Cards that may be equipped to it.
  mclear(i: number) {
    const {id, equips} = this.mremove(i);
    const zone = this.madd(ID.id(id));
    for (const equip of equips) {
      this.add('spells', `${equip}${zone}` as FieldID);
    }
  }

  // Summons the monster id. This is a simple wrapper around madd which handles also updated the
  // summoned bit. NOTE: You must ensure there is room in the Monster zones and that you have not
  // already performed a Normal Summon this turn. You must also still must handle removing the id
  // from the previous location
  summon(id: ID | FieldID, special = false) {
    this.summoned = this.summoned || !special;
    return this.madd(id);
  }

  // Tribute a monster at index fi in the monster zone to summon a single-tribute monster at index
  // hi from the hand. This method *does* handle moving the tributed monster to the graveyard and
  // removing the summoned monster from the hand. NOTE: You must ensure the Tribute Summon is legal
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

  // Mark any cards which were temporarily banished by Different Dimension Capsule's effect as
  // permanently banished.
  banish() {
    // There is at most one temporarily banished card at a time and since '(' always sorts before
    // any ID we simply need to check the first element
    if (this.banished[0] && ID.facedown(this.banished[0])) {
      const id = this.remove('banished', 0);
      this.add('banished', ID.id(id));
    }
  }

  // Add a 'major' trace action to the log. Major actions are used for primary player choices.
  major(s: string) {
    if (this.trace) this.trace.push(s);
  }

  // Add a 'minor' trace action to the log. Minor actions occur as a result of major actions.
  minor(s: string) {
    if (this.trace) this.trace.push(`  ${s}`);
  }

  // Discard the cards located at the sorted indices to the graveyard.
  discard(indices: number[]) {
    // PRECONDITION: sorted indices
    let removed = 0;
    for (const i of indices) {
      const id = this.hand.splice(i - removed++, 1)[0];
      this.add('graveyard', id);
    }
  }

  // Add a Spell Counter to all face up Royal Magical Library cards that have less than 3 Spell
  // Counters unless the card is at index ignore (this is necessary to avoid adding a counter to a
  // Royal Magical Library on the turn it gets Special Summoned by Premature Burial).
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

  // Shuffle the deck, wiping out any knowledge of where cards were in the deck.
  shuffle() {
    this.deck = this.deck.map(id => ID.id(id));
    this.random.shuffle(this.deck);
    this.minor('Shuffle Deck');
  }

  // Reverse the deck (or return it to its original position if revert is true) if it is not already
  // reversed.
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

  // Return the top card of the deck if it is known (because the deck is face-up, the deck was
  // stacked by A Feather of the Phoenix, or via process of elimination) for Archfiend's Oath. If
  // quiz is true this method will instead determine if the *type* of the card that *will* be on
  // top of the deck *after* Reversal Quiz resolves (ie. the current bottom of the deck) is known
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

  // Search for path from this state to the win condition. The cutoff should pretty much always be
  // set to limit the number of states visited as pathological trees would likely result in an OOM.
  // If width (must be > 0) is specified then a BULB search will be performed instead of a
  // best-first search - BULB search usually is slightly slower but produces slightly better paths
  // and increased success rates, though performance is very much dependent on thw width and shape
  // of the tree.
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

  // Add fully-built-and-never-to-be-mutated-again state to the transition map
  static transition(next: Map<string, IState>, state: Readonly<State>) {
    const key = state.toString();
    next.set(key, {key, state, score: state.score()});
    if (DEBUG) {
      const errors = State.verify(state);
      if (errors.length) {
        console.error(`INVALID STATE ${key}:\n\n${errors.join('\n')}`);
        if (state.trace) console.error(state.trace.join('\n'));
        process.exit(1);
      }
    }
  }

  // Compute all unique and relevant states that can be transitioned to from this state.
  // prescient determines whether or not the search should be allowed to "Fail to find" Thunder
  // Dragon and Toon Table of Contents searches when the top card is not known - no human player
  // would ever do this, but because the search is effectively allowed to 'peek' ahead to evaluate
  // the result of its action it can potentially leverage the searches to get a more favorable draw.
  // In addition to removing symmetrical states, next() also eliminates the possibility for states
  // with set Spell cards where it would not be advantageous to do so. This optimization means the
  // pedantically all unique states are not representable, but correctness-wise all states which
  // could lead to a solution are. See the comment on RELOAD in data.ts for more information.
  next(prescient = true) {
    if (this.lifepoints <= 0) return [];
    const next = new Map<string, IState>();

    // The only thing actionable on Monster cards is counters on Royal Magical Library
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
        // Thunder Dragon can also possibly be Tribute Summoned
        if (this.monsters.length && this.monsters.length < 5 && !this.summoned) {
          card.play(this, 'hand', i, next, card, prescient);
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

    const library =
      libraries.active * WEIGHTS.activeLibraries + libraries.total * WEIGHTS.totalLibraries;
    for (const id of this.spells) {
      const card = ID.decode(id);
      const n = card.score(this, 'spells', id);
      if (!n) continue;
      if (ID.facedown(id)) {
        score += n * WEIGHTS.facedown;
        score += library;
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
      if (card.type === 'Spell') score += library;
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

  // Draw cards (or the opening hand if initial = true)
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

  clone() {
    return new State(
      new Random(this.random.seed),
      this.lifepoints,
      this.turn,
      this.summoned,
      this.monsters.slice(),
      this.spells.slice(),
      this.hand.slice(),
      this.banished.slice(),
      this.graveyard.slice(),
      this.deck.slice(),
      this.reversed,
      this.trace?.slice(),
    );
  }

  equals(s: State) {
    return (this.random.seed === s.random.seed &&
      this.lifepoints === s.lifepoints &&
      this.turn === s.turn &&
      this.summoned === s.summoned &&
      this.reversed === s.reversed &&
      equals(this.monsters, s.monsters) &&
      equals(this.spells, s.spells) &&
      equals(this.hand, s.hand) &&
      equals(this.banished, s.banished) &&
      equals(this.graveyard, s.graveyard) &&
      equals(this.deck, s.deck) &&
      (this.trace === s.trace || equals(this.trace!, s.trace!)));
  }

  toString() {
    // Using `join` here on an array instead of using a template string or string concatenation
    // is deliberate as it reuslts in V8 creating a flat string instead of a cons-string, the
    // latter of which results in significantly higher memory usage. This is a V8 implementation
    // detail and the approach to forcing a flattened string to be created may change over time.
    // https://gist.github.com/mraleph/3397008
    return [this.random.seed, this.lifepoints, this.turn, +this.summoned,
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
    j = s.indexOf('|', i);
    const turn = +s.slice(i, j);

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
      random, lifepoints, turn, summoned, monsters, spells, hand, banished, graveyard, deck, reversed
    );
  }

  // Stitch together a path of encoded States and a trace
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

  // Parse string s string into an array of ids (really Field[] | DeckID[])
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

  // Perform basic (slow) sanity checks on State
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

// Fucking JS really doesn't have an Array.equals? smfh
function equals<T>(a: T[], b: T[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
