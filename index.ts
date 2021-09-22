// TODO: include "probabalistic" Reversal Quiz in win % (do breakdown of with and without guessing)
import * as util from 'util';

type Type = 'Normal Monster' | 'Effect Monster' | 'Ritual Monster' | 'Fusion Monster' | 'Token Monster' | 'Spell' | 'Trap';
type SubType = 'Continuous' | 'Counter' | 'Equip' | 'Field' | 'Normal' | 'Quick-Play' | 'Ritual';
type Attribute = 'Dark' | 'Earth' | 'Fire' | 'Light' | 'Water' | 'Wind';

type Data = {
  type: Type;
  text: string;
  play(state: Readonly<State>, location: Location, i: number, next: Set<string>, card: Card): void;
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

const MONSTER: Data['play'] = (state, location, i, next, card) => {
  const s = state.clone();
  s.remove(location, i);
  s.add('monsters', card.id);
  next.add(s.toString());
};

const SPELL: (cnd?: (s: State) => boolean, fn?: (s: State, c: Card) => void) => Data['play'] =
  (cnd?: (s: State) => boolean, fn?: (s: State, c: Card) => void) =>
    (state, location, i, next, card) => {
      if (cnd && !cnd(state)) return;
      const s = state.clone();
      if ('subType' in card && card.subType === 'Continuous') {
        if (location === 'hand') {
          s.remove(location, i);
          s.add('spells', card.id);
        } else {
          s.spells[i] = card.id;
        }
      } else {
        s.remove(location, i);
      }
      if (fn) fn(s, card);
      s.inc();
      next.add(s.toString());
    };

const MAIN: { [name: string]: Data } = {
  'A Feather of the Phoenix': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Discard 1 card, then target 1 card in your Graveyard; return that target to the top of your Deck.',
    play(state, location, i, next) {
    },
  },
  // TODO data = 1 if activated none otherwise
  'Archfiend\'s Oath': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Once per turn: You can pay 500 Life Points, then declare 1 card name; excavate the top card of your Deck, and if it is the declared card, add it to your hand. Otherwise, send it to the Graveyard.',
    play(state, location, i, next) {
    },
  },
  // TODO data = zone of who is attached to = activated
  'Black Pendant': {
    type: 'Spell',
    subType: 'Equip',
    text: 'The equipped monster gains 500 ATK. If this card is sent from the field to the Graveyard: Inflict 500 damage to your opponent.',
    play(state, location, i, next) {
    },
  },
  'Card Destruction': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Both players discard as many cards as possible from their hands, then each player draws the same number of cards they discarded.',
    play(state, location, i, next) {
    },
  },
  'Convulsion of Nature': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Both players must turn their Decks upside down.',
    play: SPELL(undefined, (s, card) => !s.spells.includes(card.id) && s.deck.reverse()),
  },
  'Cyber Jar': {
    type: 'Effect Monster',
    attribute: 'Dark',
    level: 3,
    atk: 900,
    def: 900,
    text: 'Rock/Flip/Effect – FLIP: Destroy all monsters on the field, then both players reveal the top 5 cards from their Decks, then Special Summon all revealed Level 4 or lower monsters in face-up Attack Position or face-down Defense Position, also add any remaining cards to their hand. (If either player has less than 5 cards in their Deck, reveal as many as possible).',
    play: MONSTER, // TODO: support actually setting and flipping when multi turns are implemented
  },
  'Giant Trunade': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Return all Spells/Traps on the field to the hand.',
    play(state, location, i, next) {
      // FIXME need to flip convulsion back
    },
  },
  'Graceful Charity': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 3 cards, then discard 2 cards.',
    play: SPELL(s => s.deck.length >= 3, s => {
      s.draw(3);
      // TODO discard 2 - need unique subsets...
    }),
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
          s.remove(location, i);
          s.remove('graveyard', j);
          const zone = s.add('monsters', id);
          s.add('spells', `${card.id}${zone}` as ID);
          s.inc();
          next.add(state.toString());
        }
      }
    },
  },
  'Reload': {
    type: 'Spell',
    subType: 'Quick-Play',
    text: 'Send all cards from your hand to the Deck, then shuffle. Then, draw the same number of cards you added to the Deck.',
    play(state, location, i, next) {
      // XXX: Can you reload with 0 cards in hand?
    },
  },
  'Reversal Quiz': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Send all cards from your hand and your field to the Graveyard, then call Spell, Trap, or Monster; reveal the top card of your Deck. If you called it right, both players exchange Life Points.',
    play(state, location, i, next) {
      // FIXME need to flip convulsion back
    },
  },
  // TODO data = spell counters
  'Royal Magical Library': {
    type: 'Effect Monster',
    attribute: 'Light',
    level: 4,
    atk: 0,
    def: 2000,
    text: 'Spellcaster/Effect – Each time a Spell is activated, place 1 Spell Counter on this card when that Spell resolves (max. 3). You can remove 3 Spell Counters from this card; draw 1 card.',
    play: MONSTER,
  },
  'Sangan': {
    type: 'Effect Monster',
    attribute: 'Dark',
    level: 3,
    atk: 1000,
    def: 600,
    text: 'Fiend/Effect – If this card is sent from the field to the Graveyard: Add 1 monster with 1500 or less ATK from your Deck to your hand.',
    play: MONSTER, // TODO: support searching when multiple turns are implemented
  },
  'Spell Reproduction': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Send 2 Spells from your hand to the Graveyard, then target 1 Spell in your Graveyard; add it to your hand.',
    play(state, location, i, next) {
    },
  },
  'Thunder Dragon': {
    type: 'Effect Monster',
    attribute: 'Light',
    level: 5,
    atk: 1600,
    def: 1500,
    text: 'Thunder/Effect – You can discard this card; add up to 2 "Thunder Dragon" from your Deck to your hand.',
    play(state, location, i, next) {
    },
  },
  'Toon Table of Contents': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Add 1 "Toon" card from your Deck to your hand.',
    play(state, location, i, next) {
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
  'A Feather of the Phoenix': 3, // 2
  'Archfiend\'s Oath': 3,
  'Black Pendant': 1,
  'Card Destruction': 1,
  'Convulsion of Nature': 3,
  'Cyber Jar': 1,
  'Giant Trunade': 3,
  'Graceful Charity': 1,
  'Level Limit - Area B': 2,
  'Pot of Greed': 1,
  'Premature Burial': 1,
  'Reload': 3,
  'Reversal Quiz': 1,
  'Royal Magical Library': 3,
  'Spell Reproduction': 3,
  // 'Sangan': 1,
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

const equals = <T>(a: T[], b: T[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

class State {
  random: Random;
  lifepoints: number;
  summoned: boolean;
  monsters: ID[];
  spells: ID[];
  hand: ID[];
  graveyard: ID[];
  deck: ID[];

  static create(random: Random) {
    const deck: ID[] = [];
    for (const name in DECK) {
      for (let i = 0; i < DECK[name]; i++) deck.push(IDS[name]);
    }
    random.shuffle(deck);

    const state = new State(random, 8000, false, [], [], [], [], deck);
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
    deck: ID[]
  ) {
    this.random = random;
    this.lifepoints = lifepoints;
    this.summoned = summoned;
    this.monsters = monsters;
    this.spells = spells;
    this.hand = hand;
    this.graveyard = graveyard;
    this.deck = deck;
  }

  add(location: Location, id: ID) {
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

  remove(location: Location, i: number) {
    return this[location].splice(i, 1);
  }

  inc() {
    for (let i = 0; i < this.monsters.length; i++) {
      const id = this.monsters[i];
      if (id !== LIBRARY) continue;
      const card = State.decode(id);
      if (card.data < 3) this.monsters[i] = `${id}${card.data + 1}` as ID;
    }
  }

  next() {
    const states = new Set<string>();

    for (let i = 0; i < this.monsters.length; i++) {
      const id = this.monsters[i];
      if (id !== LIBRARY) continue;
      const card = State.decode(id);
      // NOTE: Library is never facedown so no need to check
      if (card.data === 3 && this.deck.length) {
        const next = this.clone();
        next.monsters[i] = card.id; // reset counters
        next.draw();
        states.add(next.toString());
        break; // don't care about others due to symmetry
      }
    }
    for (let i = 0; i < this.spells.length; i++) {
      // TODO uniqueness?
      const id = this.spells[i];
      const card = State.decode(id);
      if (card.facedown) {
        card.play(this, 'spells', i, states, card);
      }
      // FIXME archfiends oath?
    }
    const unique = new Set<ID>();
    for (let i = 0; i < this.hand.length; i++) {
      const id = this.hand[i];
      if (unique.has(id)) continue;
      unique.add(id);
      const card = DATA[id];
      if (card.type === 'Spell' && this.spells.length < 5) {
        const set = this.clone();
        set.add('spells', `(${id})` as ID);
        set.remove('hand', i);
        states.add(set.toString());

        card.play(this, 'hand', i, states, card);
      } else if (card.type.endsWith('Monster') && this.monsters.length < 5 && !this.summoned) {
        // TODO: add support for setting Cyber Jar in multi-turn scenarios
        // if (card.name === 'Cyber Jar') {
        //   const set = this.clone();
        //   set.add('monsters', `(${id})` as ID);
        //   set.remove('hand', i);
        //   set.summoned = true;
        //   states.add(set.toString());
        // }
        card.play(this, 'hand', i, states, card);
      }
    }

    return states;
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
      this.deck.slice(0)
    );
  }

  draw(n = 1) {
    if (n > this.deck.length) throw new Error('Deck out');
    for (let i = 0; i < n; i++) {
      this.add('hand', this.deck.pop()!);
    }
  }

  equals(s: State) {
    return (this.random.seed === s.random.seed &&
        this.lifepoints === s.lifepoints &&
        this.summoned === s.summoned &&
        equals(this.monsters, s.monsters) &&
        equals(this.spells, s.spells) &&
        equals(this.hand, s.hand) &&
        equals(this.graveyard, s.graveyard) &&
        equals(this.deck, s.deck));
  }

  static decode(id: ID): FieldCard {
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
      `${this.graveyard.join('')}|${this.deck.join('')}`;
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
    const deck = s.slice(i).split('') as ID[];

    return new State(random, lifepoints, summoned, monsters, spells, hand, graveyard, deck);
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
    }, {colors: true, breakLength: 200, maxStringLength: Infinity});
  }
}


const s = State.create(new Random(4));
console.log(s.toString());
console.log(State.fromString(s.toString()).toString());
console.log(s.equals(State.fromString(s.toString())));
