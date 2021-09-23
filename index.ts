
import * as util from 'util';

type Type = 'Normal Monster' | 'Effect Monster' | 'Ritual Monster' | 'Fusion Monster' | 'Token Monster' | 'Spell' | 'Trap';
type SubType = 'Continuous' | 'Counter' | 'Equip' | 'Field' | 'Normal' | 'Quick-Play' | 'Ritual';
type Attribute = 'Dark' | 'Earth' | 'Fire' | 'Light' | 'Water' | 'Wind';

type Data = {
  type: Type;
  text: string;
  play(state: Readonly<State>, location: Exclude<Location, 'deck'>, i: number, next: Set<string>, card: Card): void;
} & ({
  subType: SubType;
} | {
  attribute: Attribute;
  level: number;
  atk: number;
  def: number;
});

interface As<T> { __brand: T }
type ID = string & As<'ID'>;

type Card = {name: string; id: ID} & Data;
type FieldCard = Card & {facedown: boolean; data: number};

type Location = 'monsters' | 'spells' | 'hand' | 'graveyard' | 'deck';

const subsets = <T>(s: T[], k: number): T[][] => {
  if (k > s.length || k <= 0) return [];
  if (k === s.length) return [s];
  if (k == 1) {
    const ss = [];
    for (let i = 0; i < s.length; i++) {
      ss.push([s[i]]);
    }
    return ss;
  }

  const ss = [];
  for (let i = 0; i < s.length - k + 1; i++) {
    const head = s.slice(i, i + 1);
    const tail = subsets(s.slice(i + 1), k - 1);
    for (let j = 0; j < tail.length; j++) {
      ss.push(head.concat(tail[j]));
    }
  }
  return ss;
}

const isubsets = <T>(s: T[], k: number): number[][] => {
  // NOTE: this still potentially returns redundant subsets
  const unique = new Map<T, number>();
  const is: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const u = unique.get(s[i]);
    if (u && u >= k) continue;
    unique.set(s[i], (u || 0) + 1);
    is.push(i);
  }
  return subsets(is, k);
}

const MONSTER: Data['play'] = (state, location, i, next, card) => {
  const s = state.clone();
  s.remove(location, i);
  s.add('monsters', card.id);
  next.add(s.toString());
};

const SPELL: (cnd?: (s: State, l: Location) => boolean, fn?: (s: State) => void) => Data['play'] =
  (cnd?: (s: State, l: Location) => boolean, fn?: (s: State) => void) =>
    (state, location, i, next, card) => {
      if (cnd && !cnd(state, location)) return;
      const s = state.clone();
      if ('subType' in card && (card.subType === 'Continuous' || card.subType === 'Equip')) {
        // NOTE: cnd should already check a monster exists, and since facedown monsters aren't
        // supported we know we should always be able to equip to the monster in question
        const id = card.subType === 'Equip' ? `${card.id}1` as ID : card.id;
        // Flipping a facedown may require a sort so we always remove + add
        s.remove(location, i);
        s.add('spells', id);
      } else {
        s.remove(location, i);
        s.add('graveyard', card.id)
      }
      if (fn) fn(s);
      s.inc();
      next.add(s.toString());
    };

const ARCHFIEND: Data['play'] = (state, location, i, next, card) => {
  if (state.lifepoints <= 500 || !state.deck.length) return;

  if (state.known()) {
    const known = state.clone();
    known.lifepoints -= 500;
    known.remove(location, i);
    known.add('spells', `${card.id}1` as ID);
    known.draw();
    known.inc();
    next.add(known.toString());
  }

  // If you just want to pay 500 you might simply guess something impossible and mill one
  const unknown = state.clone();
  unknown.lifepoints -= 500;
  unknown.remove(location, i);
  unknown.add('spells', `${card.id}1` as ID);
  unknown.add('graveyard', State.clean(unknown.deck.pop()!));
  unknown.inc();
  next.add(unknown.toString());
};

const MAIN: { [name: string]: Data } = {
  'A Feather of the Phoenix': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Discard 1 card, then target 1 card in your Graveyard; return that target to the top of your Deck.',
    play(state, location, i, next, card) {
      if (!state.graveyard.length || (state.hand.length < 2 && location === 'hand')) return;
      const targets = {discard: new Set<ID>(), graveyard: new Set<ID>() };
      for (let j = 0; j < state.hand.length; j++) {
        const hid = state.hand[j];
        if (targets.discard.has(hid)) continue;
        if (location === 'hand' && i === j) continue;

        for (let k = 0; k < state.graveyard.length; k++) {
          const gid = state.graveyard[k];
          if (targets.graveyard.has(gid)) continue;
          targets.graveyard.add(gid);
          const s = state.clone();
          if (location === 'hand') {
            s.discard(i < j ? [i, j] : [j, i]);
          } else {
            s.remove(location, i);
            s.add('graveyard', card.id);
            s.add('graveyard', s.remove('hand', j));
          }
          s.remove('graveyard', k);
          s.deck.push(`(${gid})` as ID);
          s.inc();
          next.add(s.toString());
        }
      }
    },
  },
  'Archfiend\'s Oath': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Once per turn: You can pay 500 Life Points, then declare 1 card name; excavate the top card of your Deck, and if it is the declared card, add it to your hand. Otherwise, send it to the Graveyard.',
    play(state, location, i, next, card) {
      const unactivated = state.clone();
      unactivated.remove(location, i);
      unactivated.add('spells', card.id);
      unactivated.inc();
      next.add(unactivated.toString());

      ARCHFIEND(state, location, i, next, card);
    },
  },
  'Black Pendant': {
    type: 'Spell',
    subType: 'Equip',
    text: 'The equipped monster gains 500 ATK. If this card is sent from the field to the Graveyard: Inflict 500 damage to your opponent.',
    play: SPELL(s => !!s.monsters.length),
  },
  'Card Destruction': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Both players discard as many cards as possible from their hands, then each player draws the same number of cards they discarded.',
    play: SPELL((s, loc) => {
      const h = (loc === 'hand' ? 1 : 0);
      return s.hand.length > h && s.deck.length >= s.hand.length - h;
    }, s => {
      // NOTE: Card Destruction has already been removed from the hand/field at this point
      const len = s.hand.length;
      for (const id of s.hand) {
        s.add('graveyard', id);
      }
      s.hand = [];
      s.draw(len);
    }),
  },
  'Convulsion of Nature': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Both players must turn their Decks upside down.',
    play: SPELL(undefined, (s) => s.reverse()),
  },
  'Cyber Jar': {
    type: 'Effect Monster',
    attribute: 'Dark',
    level: 3,
    atk: 900,
    def: 900,
    text: 'Rock/Flip/Effect – FLIP: Destroy all monsters on the field, then both players reveal the top 5 cards from their Decks, then Special Summon all revealed Level 4 or lower monsters in face-up Attack Position or face-down Defense Position, also add any remaining cards to their hand. (If either player has less than 5 cards in their Deck, reveal as many as possible).',
    play: MONSTER,
  },
  'Giant Trunade': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Return all Spells/Traps on the field to the hand.',
    play: SPELL(undefined, s => {
      // NOTE: The active Giant Trunade card has already been removed from hand/field
      let convulsion = false;
      for (const spell of s.spells) {
        s.add('hand', spell);
        if (!convulsion && State.decode(spell).name === 'Convulsion of Nature') {
          s.reverse(true);
          convulsion = true;
        }
      }
      s.spells = [];
    }),
  },
  'Graceful Charity': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 3 cards, then discard 2 cards.',
    play(state, location, i, next, card) {
      if (state.deck.length < 3) return;
      // isubsets might still return redundant subsets but we count on state deduping to handle it
      for (const [j, k] of isubsets(state.hand, 2)) {
        if (location === 'hand' && (i === j || i === k)) continue;
        const s = state.clone();
        if (location === 'hand') {
          s.discard([i, j, k].sort());
        } else {
          s.remove(location, i);
          s.add('graveyard', card.id);
          s.discard([j, k]); // PRECONDITION: j < k
        }
        s.inc();
        next.add(s.toString());
      }
    }
  },
  'Level Limit - Area B': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Change all face-up Level 4 or higher monsters to Defense Position.',
    play: SPELL(),
  },
  'Pot of Greed': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 2 cards.',
    play: SPELL(s => s.deck.length >= 2, s => s.draw(2)),
  },
  'Premature Burial': {
    type: 'Spell',
    subType: 'Equip',
    text: 'Activate this card by paying 800 Life Points, then target 1 monster in your Graveyard; Special Summon that target in Attack Position and equip it with this card. When this card is destroyed, destroy the equipped monster.',
    play(state, location, i, next, card) {
      if (state.monsters.length === 5 || state.lifepoints <= 800) return;
      const targets = new Set<ID>();
      for (let j = 0; j < state.graveyard.length; j++) {
        const id = state.graveyard[j];
        if (targets.has(id)) continue;
        const target = State.decode(id);
        if (target.type.endsWith('Monster')) {
          targets.add(id);
          const s = state.clone();
          s.lifepoints -= 800;
          s.remove('graveyard', j);
          const zone = s.add('monsters', id);
          s.remove(location, i);
          s.add('spells', `${card.id}${zone}` as ID);
          s.inc();
          next.add(s.toString());
        }
      }
    },
  },
  'Reload': {
    type: 'Spell',
    subType: 'Quick-Play',
    text: 'Send all cards from your hand to the Deck, then shuffle. Then, draw the same number of cards you added to the Deck.',
    play: SPELL((s, loc) => {
      const h = (loc === 'hand' ? 1 : 0);
      return s.hand.length > h && s.deck.length >= s.hand.length - h;
    }, s => {
      // NOTE: Reload has already been removed from the hand/field at this point
      const len = s.hand.length;
      s.deck.push(...s.hand);
      s.shuffle();
      s.hand = [];
      s.draw(len);
    }),
  },
  'Reversal Quiz': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Send all cards from your hand and your field to the Graveyard, then call Spell, Trap, or Monster; reveal the top card of your Deck. If you called it right, both players exchange Life Points.',
    // NOTE: we are not supporting the case where we actually guess correctly prematurely
    play(state, location, i, next) {
      const s = state.clone();
      s.graveyard.push(...s.hand);
      for (const id of s.monsters) {
        const card = State.decode(id);
        if (card.name === 'Sangan') {
          // FIXME could spawn multiple states... pain
        }
        s.graveyard.push(card.id);
      }
      s.monsters = [];
      for (const id of s.spells) {
        const card = State.decode(id);
        if (card.name === 'Convulsion of Nature') s.reverse(true);
        s.graveyard.push(card.id);
      }
      s.monsters = [];
      s.graveyard.sort();
      next.add(s.toString());
    },
  },
  'Royal Magical Library': {
    type: 'Effect Monster',
    attribute: 'Light',
    level: 4,
    atk: 0,
    def: 2000,
    text: 'Spellcaster/Effect – Each time a Spell is activated, place 1 Spell Counter on this card when that Spell resolves (max. 3). You can remove 3 Spell Counters from this card; draw 1 card.',
    // NOTE: draw effect handled directly in State#next, and all spells use Stat#inc to update counters
    play: MONSTER,
  },
  'Sangan': {
    type: 'Effect Monster',
    attribute: 'Dark',
    level: 3,
    atk: 1000,
    def: 600,
    text: 'Fiend/Effect – If this card is sent from the field to the Graveyard: Add 1 monster with 1500 or less ATK from your Deck to your hand.',
    // NOTE: graveyard effect is handled in Thunder Dragon/Reversal Quiz
    play: MONSTER,
  },
  'Spell Reproduction': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Send 2 Spells from your hand to the Graveyard, then target 1 Spell in your Graveyard; add it to your hand.',
    play(state, location, i, next, card) {
      const h = (location === 'hand' ? 1 : 0);
      if (!(state.hand.length > h && state.deck.length >= state.hand.length - h)) return;

      let spells!: Set<[number, number]>;
      const targets = new Set<ID>();
      for (let j = 0; j < state.graveyard.length; j++) {
        const id = state.graveyard[j];
        if (targets.has(id)) continue;
        const target = State.decode(id);
        if (target.type === 'Spell') {
          targets.add(id);
          if (!spells) {
            spells = new Set();
            for (const [j, k] of isubsets(state.hand, 2)) {
              if (location === 'hand' && (i === j || i === k)) continue;
              if (State.decode(state.hand[j]).type !== 'Spell') continue;
              if (State.decode(state.hand[k]).type !== 'Spell') continue;
              spells.add([j, k])
            }
            if (!spells.size) return;
          }
          // There might still return redundant subsets but we count on state deduping to handle it
          for (const [j, k] of spells) {
            const s = state.clone();
            if (location === 'hand') {
              s.discard([i, j, k].sort());
            } else {
              s.remove(location, i);
              s.add('graveyard', card.id);
              s.discard([j, k]); // PRECONDITION: j < k
            }
            s.inc();
            next.add(s.toString());
          }
        }
      }
    },
  },
  'Thunder Dragon': {
    type: 'Effect Monster',
    attribute: 'Light',
    level: 5,
    atk: 1600,
    def: 1500,
    text: 'Thunder/Effect – You can discard this card; add up to 2 "Thunder Dragon" from your Deck to your hand.',
    // NOTE: discard effect handled directly in State#next
    play(state, location, i, next) {
      if (!state.monsters.length) return;
      // XXX special summon behavior only
      const targets = new Set<ID>();
      for (let j = 0; j < state.monsters.length; j++) {
        const id = state.monsters[j];
        if (targets.has(id)) continue;
        const target = State.decode(id);
        targets.add(id);

        // NOTE: might destroy black pendant and/or premature burial
        /// TODO handle sangan

      }
    },
  },
  'Toon Table of Contents': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Add 1 "Toon" card from your Deck to your hand.',
    play(state, location, i, next, card) {
      const targets = new Set<ID>();
      for (let j = 0; j < state.deck.length; j++) {
        const id = state.deck[j];
        if (targets.has(id)) continue;
        if (State.decode(id).name.startsWith('Toon')) {
          targets.add(id);
          const s = state.clone();
          s.remove(location, i);
          s.add('graveyard', card.id);
          s.add('hand', State.clean(s.deck.splice(j, 1)[0]));
          s.shuffle();
          s.inc();
          next.add(s.toString());
        }
      }
      // Failure to find
      if (!targets.size) {
        const s = state.clone();
        s.remove(location, i);
        s.add('graveyard', card.id);
        s.random.shuffle(s.deck);
        s.inc();
        next.add(s.toString());
      }
    },
  },
  'Toon World': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Activate this card by paying 1000 Life Points.',
    play: SPELL(s => s.lifepoints > 1000, s => { s.lifepoints -= 1000; }),
  },
  'Upstart Goblin': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 1 card, then your opponent gains 1000 Life Points.',
    // NOTE: we don't care about our opponent's life points
    play: SPELL(s => !!s.deck.length, s => s.draw()),
  },
};

const DECK: {[name: string]: number} = {
  'A Feather of the Phoenix': 3,
  'Archfiend\'s Oath': 3,
  'Black Pendant': 1,
  'Card Destruction': 1,
  'Convulsion of Nature': 3,
  // 'Cyber Jar': 1,
  'Giant Trunade': 3,
  'Graceful Charity': 1,
  'Level Limit - Area B': 2,
  'Pot of Greed': 1,
  'Premature Burial': 1,
  'Reload': 3,
  'Reversal Quiz': 1,
  'Royal Magical Library': 3,
  'Spell Reproduction': 3,
  'Sangan': 1,
  'Thunder Dragon': 3,
  'Toon Table of Contents': 3,
  'Toon World': 2,
  'Upstart Goblin': 2,
};

class Random {
  seed: number;

  static seed(n = 4 /* https://xkcd.com/221/ */) {
    // Hash: https://burtleburtle.net/bob/hash/integer.html
    n = n ^ 61 ^ (n >>> 16);
    n = n + (n << 3);
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return n >>> 0;
  }

  constructor(seed = Random.seed()) {
    this.seed = seed;
  }

  // Mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
  next(min?: number, max?: number) {
    if (min) min = Math.floor(min);
    if (max) max = Math.floor(max);

    let z = (this.seed += 0x6d2b79f5 | 0);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z = z ^ (z + Math.imul(z ^ (z >>> 7), z | 61));
    z = (z ^ (z >>> 14)) >>> 0;
    const n = z / 2 ** 32;

    if (min === undefined) return n;
    if (!max) return Math.floor(n * min);
    return Math.floor(n * (max - min)) + min;
  }

  shuffle<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

const IDS: Record<string, ID> = {};
const DATA: Record<ID, Card> = {};
let nextid = 65;
for (const name in MAIN) {
  const id = String.fromCharCode(nextid++) as ID;
  IDS[name] = id;
  DATA[id] = {...MAIN[name], name, id};
}

const LIBRARY = IDS['Royal Magical Library'];
const THUNDER_DRAGON = IDS['Thunder Dragon'];

const equals = <T>(a: T[], b: T[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

// FIXME: terminal states, win conditions, traces
class State {
  random: Random;
  lifepoints: number;
  summoned: boolean;
  monsters: ID[];
  spells: ID[];
  hand: ID[];
  graveyard: ID[];
  deck: ID[];
  reversed: boolean;

  static create(random: Random) {
    const deck: ID[] = [];
    for (const name in DECK) {
      for (let i = 0; i < DECK[name]; i++) deck.push(IDS[name]);
    }
    random.shuffle(deck);

    const state = new State(random, 8000, false, [], [], [], [], deck, false);
    state.draw(6);
    return state;
  }

  constructor(
    random: Random,
    lifepoints: number,
    summoned: boolean,
    monsters: ID[],
    spells: ID[],
    hand: ID[],
    graveyard: ID[],
    deck: ID[],
    reversed: boolean,
  ) {
    this.random = random;
    this.lifepoints = lifepoints;
    this.summoned = summoned;
    this.monsters = monsters;
    this.spells = spells;
    this.hand = hand;
    this.graveyard = graveyard;
    this.deck = deck;
    this.reversed = reversed;
  }

  add(location: Exclude<Location, 'deck'>, id: ID) {
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

  remove(location: Exclude<Location, 'deck'>, i: number) {
    return this[location].splice(i, 1)[0];
  }

  discard(indices: number[]) {
    // PRECONDITION: sorted indices
    let removed = 0;
    for (const i of indices) {
      const id = this.hand.splice(i - removed++, 1)[0];
      this.add('graveyard', id);
    }
  }

  inc() {
    for (let i = 0; i < this.monsters.length; i++) {
      const id = this.monsters[i];
      if (id !== LIBRARY) continue;
      const card = State.decode(id);
      // NOTE: since we are incrementing *all* Library counter cards we don't alter the ordering
      if (card.data < 3) this.monsters[i] = `${id}${card.data + 1}` as ID;
    }
  }

  shuffle() {
    this.deck = this.deck.map(State.clean);
    this.random.shuffle(this.deck);
  }

  reverse(revert = false) {
    if (revert) {
      if (!this.reversed) return;
      this.reversed = false;
      this.deck.reverse();
      if (!this.deck[0].startsWith('(')) this.deck[0] = `(${this.deck[0]})` as ID;
    } else {
      if (this.reversed) return;
      this.reversed = true;
      this.deck.reverse();
    }
  }

  known(exact = true) {
    if (!this.deck.length) return false;
    if (this.reversed || this.deck[this.deck.length - 1].startsWith('(')) return true;

    const unknown = new Set<ID>();
    const types = new Set<'Monster' | 'Spell'>();

    for (const id of this.deck) {
      const card = State.decode(id);
      // Could technically have known cards are the bottom which would still allow us to determine the card
      if (!id.startsWith('(')) continue;

      unknown.add(card.id);
      types.add(card.type === 'Spell' ? 'Spell' : 'Monster');

      if (exact && unknown.size > 1) return false;
      if (!exact && (unknown.size > 1 || types.size > 1)) return false;
    }
    return true;
  }

  next() {
    const next = new Set<string>();

    for (let i = 0; i < this.monsters.length; i++) {
      const id = this.monsters[i];
      if (id !== LIBRARY) continue;
      const card = State.decode(id);
      // NOTE: Library is never facedown so no need to check
      if (card.data === 3 && this.deck.length) {
        const s = this.clone();
        s.monsters[i] = card.id;
        s.monsters.sort(); // Could have A2 A3 A3 -> A A2 A3
        s.draw();
        next.add(s.toString());
        break; // don't care about others due to symmetry
      }
    }
    const spells = new Set<ID>();
    for (let i = 0; i < this.spells.length; i++) {
      const id = this.spells[i];
      if (spells.has(id)) continue;
      spells.add(id);
      const card = State.decode(id);
      if (card.facedown) {
        card.play(this, 'spells', i, next, card);
      } else if (card.name === 'Archfiend\'s Oath' && !card.data) {
        ARCHFIEND(this, 'spells', i, next, card);
      }
    }
    const hand = new Set<ID>();
    for (let i = 0; i < this.hand.length; i++) {
      const id = this.hand[i];
      if (hand.has(id)) continue;
      hand.add(id);
      const card = DATA[id];
      if (card.type === 'Spell' && this.spells.length < 5) {
        const set = this.clone();
        set.add('spells', `(${id})` as ID);
        set.remove('hand', i);
        next.add(set.toString());

        card.play(this, 'hand', i, next, card);
      } else if (card.type.endsWith('Monster') && this.monsters.length < 5 && !this.summoned) {
        // TODO: add support for setting Cyber Jar in multi-turn scenarios
        // if (card.name === 'Cyber Jar') {
        //   const set = this.clone();
        //   set.add('monsters', `(${id})` as ID);
        //   set.remove('hand', i);
        //   set.summoned = true;
        //   next.add(set.toString());
        // }
        card.play(this, 'hand', i, next, card);
      } else if (id === THUNDER_DRAGON) {
        // XXX discard effect
      }
    }

    return next;
  }

  clone() {
    return new State(
      new Random(this.random.seed),
      this.lifepoints,
      this.summoned,
      this.monsters.slice(0),
      this.spells.slice(0),
      this.hand.slice(0),
      this.graveyard.slice(0),
      this.deck.slice(0),
      this.reversed,
    );
  }

  draw(n = 1) {
    if (n > this.deck.length) throw new Error('Deck out');
    for (let i = 0; i < n; i++) {
      this.add('hand', State.clean(this.deck.pop()!));
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
        equals(this.graveyard, s.graveyard) &&
        equals(this.deck, s.deck))
  }

  static clean(id: ID) {
    return id.startsWith('(') ? id.charAt(1) as ID : id;
  }

  static decode(id: ID): FieldCard {
    // NOTE: if the id in question is in the deck, "(<id>)" means known, not facedown
    let facedown = false;
    if (id.startsWith('(')) {
      facedown = true;
      id = id.slice(1, -1) as ID;
    }
    let data = 0;
    if (id.length > 1) {
      data = +id.slice(1);
      id = id.charAt(0) as ID;
    }
    return {...DATA[id], facedown, data};
  }

  toString() {
    return `${this.random.seed}|${this.lifepoints}|${+this.summoned}|` +
      `${this.monsters.join('')}|${this.spells.join('')}|${this.hand.join('')}|` +
      `${this.graveyard.join('')}|${this.deck.join('')}|${+this.reversed}`;
  }

  static fromString(s: string) {
    let i = 0;
    let j = s.indexOf('|');
    const random = new Random(+s.slice(0, j));
    i = j + 1;
    j = j + 2;
    const summoned = s.slice(i, j) === '1';

    i = j + 1;
    j = s.indexOf('|', i);
    const lifepoints = +s.slice(i, j);

    i = j + 1;
    j = s.indexOf('|', i);
    const monsters = this.parse(s.slice(i, j));

    i = j + 1;
    j = s.indexOf('|', i);
    const spells = this.parse(s.slice(i, j));

    i = j + 1;
    j = s.indexOf('|', i);
    const hand = s.slice(i, j).split('') as ID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const graveyard = s.slice(i, j).split('') as ID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const deck = this.parse(s.slice(i, j));

    i = j + 1;
    const reversed = s.slice(i) === '1';

    return new State(random, lifepoints, summoned, monsters, spells, hand, graveyard, deck, reversed);
  }

  static parse(s: string) {
    const ids: ID[] = [];
    let id = '';
    let ok = true;
    for (let i = 0; i < s.length; i++) {
      if (ok && id) {
        ids.push(id as ID);
        id = '';
      }
      id += s[i];
      ok = i < s.length - 1 && s[i + 1] === '(' ||
        (id[0] === '(' ? id[id.length - 1] === ')' : (s[i + 1] >= 'A' && s[i + 1] <= 'Z'));
    }
    if (id) ids.push(id as ID);
    return ids;
  }

  [util.inspect.custom]() {
    const names = (ids: ID[]) => ids.map(id => State.decode(id).name);
    return util.inspect({
      random: this.random.seed,
      lifepoints: this.lifepoints,
      summoned: this.summoned,
      monsters: names(this.monsters),
      spells: names(this.spells),
      hand: names(this.hand),
      graveyard: names(this.graveyard),
      deck: names(this.deck),
      reversed: this.reversed,
    }, {colors: true, breakLength: 200, maxStringLength: Infinity});
  }
}


// const s = State.create(new Random(4));
// console.log(s.toString());
// console.log(State.fromString(s.toString()).toString());
// console.log(s.equals(State.fromString(s.toString())));
