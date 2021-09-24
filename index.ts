import * as util from 'util';

type Type = 'Monster' | 'Spell' | 'Trap';
type SubType = 'Continuous' | 'Equip' | 'Normal' | 'Quick-Play';
type Attribute = 'Dark' | 'Light';

type Location = 'monsters' | 'spells' | 'hand' | 'graveyard' | 'deck';

interface As<T> { __brand: T }
type ID = string & As<'ID'>;
type FieldID = ID | string & As<'FieldID'>;
type DeckID = ID | string & As<'DeckID'>;

type Card = { name: string; id: ID } & Data;

type Data = {
  type: Type;
  text: string;
  play(
    state: Readonly<State>,
    location: Exclude<Location, 'deck' | 'monsters'>,
    i: number,
    next: Map<string, State>,
    card: Card
  ): void;
} & ({
  type: 'Spell' | 'Trap';
  subType: SubType;
} | {
  type: 'Monster';
  attribute: Attribute;
  level: number;
  atk: number;
  def: number;
});

const DEBUG = !!process.env.DEBUG;

const ID = new class {
  facedown(id: FieldID | DeckID) {
    return id.charAt(0) === '(';
  }
  known(id: DeckID) {
    return this.facedown(id);
  }
  data(id: FieldID) {
    if (this.facedown(id)) id = id.slice(1, -1) as FieldID;
    return (id.length > 1) ? +id.slice(1) : 0;
  }
  id(id: ID | FieldID | DeckID) {
    return id.charAt(this.facedown(id) ? 1 : 0) as ID;
  }
  decode(id: ID | FieldID | DeckID) {
    return DATA[this.id(id)];
  }
  pretty(id: ID | FieldID | DeckID) {
    const card = this.decode(id);
    const data = this.data(id as FieldID);
    const name = data ? `${card.name}:${data}` : card.name;
    return this.facedown(id) ? `(${name})` : name;
  }
  names(ids: (ID | FieldID | DeckID)[]) {
    const names = ids.map(id => `"${this.decode(id).name}"`);
    if (names.length === 1) return names[0];
    const last = names.pop()!;
    return `${names.join(', ')} and ${last}`;
  }
};

const subsets = <T>(s: T[], k: number): T[][] => {
  if (k > s.length || k <= 0) return [];
  if (k === s.length) return [s];
  if (k === 1) {
    const ss = [];
    for (const e of s) ss.push([e]);
    return ss;
  }

  const ss = [];
  for (let i = 0; i < s.length - k + 1; i++) {
    const head = s.slice(i, i + 1);
    const tail = subsets(s.slice(i + 1), k - 1);
    for (const t of tail) {
      ss.push(head.concat(t));
    }
  }
  return ss;
};

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
};

const MONSTER: Data['play'] = (state, location, i, next, card) => {
  const s = state.clone();
  s.remove(location, i);
  s.major(`Summon "${card.name}" in Attack Position`);
  s.summon(card.id);
  next.set(s.toString(), s);
};

const SPELL: (cnd?: (s: State, l: Location) => boolean, fn?: (s: State) => void) => Data['play'] =
  (cnd?: (s: State, l: Location) => boolean, fn?: (s: State) => void) =>
    (state, location, i, next, card) => {
      if (cnd && !cnd(state, location)) return;
      const s = state.clone();
      s.remove(location, i);
      s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      if (card.type === 'Spell' && card.subType === 'Continuous') {
        // Flipping a face-down may require a sort so we always remove + add
        s.add('spells', card.id);
      } else {
        s.add('graveyard', card.id);
      }
      if (fn) fn(s);
      s.inc();
      next.set(s.toString(), s);
    };

const ARCHFIEND: Data['play'] = (state, location, i, next, card) => {
  if (state.lifepoints <= 500 || !state.deck.length) return;

  if (state.known()) {
    const known = state.clone();
    known.major(`Pay 500 LP (${known.lifepoints} -> ${known.lifepoints - 500}) to activate effect of "${card.name}"`);
    known.minor(`Declare "${ID.decode(known.deck[known.deck.length - 1]).name}"`);
    known.lifepoints -= 500;
    known.add('spells', `${card.id}1` as FieldID);
    known.draw();
    known.inc();
    next.set(known.toString(), known);
  }

  // If you just want to pay 500 you might simply guess something impossible and mill one
  const unknown = state.clone();
  unknown.major(`Pay 500 LP (${unknown.lifepoints} -> ${unknown.lifepoints - 500}) to activate effect of "${card.name}"`);
  unknown.minor('Declare "Blue-Eyes White Dragon"');
  unknown.lifepoints -= 500;
  unknown.add('spells', `${card.id}1` as FieldID);
  const reveal = ID.decode(unknown.deck.pop()!);
  unknown.minor(`Excavate "${reveal.name}"`);
  unknown.add('graveyard', reveal.id);
  unknown.inc();
  next.set(unknown.toString(), unknown);
};

const MAIN: { [name: string]: Data } = {
  'A Feather of the Phoenix': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Discard 1 card, then target 1 card in your Graveyard; return that target to the top of your Deck.',
    play(state, location, i, next, card) {
      if (!state.graveyard.length || (state.hand.length < (location === 'hand' ? 2 : 1))) return;
      const targets = {discard: new Set<ID>(), graveyard: new Set<ID>()};
      for (let j = 0; j < state.hand.length; j++) {
        const hid = state.hand[j];
        if (targets.discard.has(hid)) continue;
        if (location === 'hand' && i === j) continue;

        for (let k = 0; k < state.graveyard.length; k++) {
          const gid = state.graveyard[k];
          if (targets.graveyard.has(gid)) continue;
          targets.graveyard.add(gid);
          const s = state.clone();
          s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
          s.minor(`Discard "${ID.decode(hid).name}"`);
          s.minor(`Return "${ID.decode(gid).name}" in the Graveyard to the top of the Deck`);
          if (location === 'hand') {
            s.discard(i < j ? [i, j] : [j, i]);
          } else {
            s.remove(location, i);
            s.add('graveyard', card.id);
            s.add('graveyard', s.remove('hand', j));
          }
          s.remove('graveyard', k);
          s.deck.push(`(${gid})` as DeckID);
          s.inc();
          next.set(s.toString(), s);
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
      unactivated.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      unactivated.remove(location, i);
      unactivated.add('spells', card.id);
      unactivated.inc();
      next.set(unactivated.toString(), unactivated);

      ARCHFIEND(state, location, i, next, card);
    },
  },
  'Black Pendant': {
    type: 'Spell',
    subType: 'Equip',
    text: 'The equipped monster gains 500 ATK. If this card is sent from the field to the Graveyard: Inflict 500 damage to your opponent.',
    play(state, location, i, next, card) {
      for (let j = 0; j < state.monsters.length; j++) {
        const s = state.clone();
        s.remove(location, i);
        s.major(`${location === 'spells' ? `Flip face-down "${card.name}" and equip` : `Equip "${card.name}"`} to "${ID.decode(s.monsters[j]).name}"`);
        s.add('spells', `${card.id}${j}` as FieldID);
        s.inc();
        next.set(s.toString(), s);
      }
    },
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
      s.minor(`Discard ${ID.names(s.hand)}`);
      s.hand = [];
      s.draw(len);
    }),
  },
  'Convulsion of Nature': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Both players must turn their Decks upside down.',
    play: SPELL(s => !!s.deck.length, s => s.reverse()),
  },
  'Cyber Jar': {
    type: 'Monster',
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
    play: SPELL((s, loc) => s.spells.length > (loc === 'hand' ? 0 : 1), s => {
      // NOTE: The active Giant Trunade card has already been removed from hand/field
      for (const id of s.spells) {
        const card = ID.decode(id);
        s.add('hand', card.id);
        if (card.name === 'Convulsion of Nature') s.reverse(true);
      }
      s.minor(`Return ${ID.names(s.spells)} to hand`);
      s.spells = [];
    }),
  },
  'Graceful Charity': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 3 cards, then discard 2 cards.',
    play(state, location, i, next, card) {
      if (state.deck.length < 3) return;
      const draw = state.clone();
      draw.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      draw.draw(3);
      // isubsets might still return redundant subsets but we count on state deduping to handle it
      for (const [j, k] of isubsets(draw.hand, 2)) {
        if (location === 'hand' && (i === j || i === k)) continue;
        const s = draw.clone();
        s.minor(`Discard "${ID.decode(draw.hand[j]).name}" and "${ID.decode(draw.hand[k]).name}"`);
        if (location === 'hand') {
          s.discard([i, j, k].sort());
        } else {
          s.remove(location, i);
          s.add('graveyard', card.id);
          s.discard([j, k]); // PRECONDITION: j < k
        }
        s.inc();
        next.set(s.toString(), s);
      }
    },
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
      if (state.monsters.length > 4 || state.lifepoints <= 800) return;
      const targets = new Set<ID>();
      for (let j = 0; j < state.graveyard.length; j++) {
        const id = state.graveyard[j];
        if (targets.has(id)) continue;
        const target = ID.decode(id);
        if (target.type === 'Monster') {
          targets.add(id);
          const s = state.clone();
          s.major(`Pay 800 LP (${s.lifepoints} -> ${s.lifepoints - 800}) to activate effect of "${card.name}"`);
          s.minor(`Special Summon "${target.name}" in Attack Position from Graveyard`);
          s.lifepoints -= 800;
          s.remove('graveyard', j);
          const zone = s.summon(id, true);
          s.remove(location, i);
          s.add('spells', `${card.id}${zone}` as FieldID);
          s.inc();
          next.set(s.toString(), s);
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
      s.minor(`Return ${ID.names(s.hand)} to Deck`);
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
    play(state, location, i, next, self) {
      if (!state.deck.length) return;
      let sangan = false;
      const s = state.clone();
      s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${self.name}"`);
      if (s.hand.length) {
        s.minor(`Send ${ID.names(s.hand)} from hand to Graveyard`);
      }
      if (s.monsters.length || s.spells.length) {
        s.minor(`Send ${ID.names([...s.monsters, ...s.spells])} from field to Graveyard`);
      }

      s.graveyard.push(...s.hand);

      for (const id of s.monsters) {
        const card = ID.decode(id);
        if (card.name === 'Sangan') sangan = true;
        s.graveyard.push(card.id);
      }

      s.monsters = [];
      for (const id of s.spells) {
        const card = ID.decode(id);
        if (card.name === 'Convulsion of Nature') s.reverse(true);
        s.graveyard.push(card.id);
      }

      s.monsters = [];
      s.graveyard.sort();
      if (!sangan) {
        const reveal = s.deck[s.deck.length - 1];
        if (!ID.known(reveal)) s.deck[s.deck.length - 1] = `(${reveal})` as DeckID;
        s.minor(`Call "Trap", reveal "${ID.decode(reveal).name}"`);
        next.set(s.toString(), s);
        return;
      }

      const targets = new Set<ID>();
      for (let j = 0; j < state.deck.length; j++) {
        const id = ID.id(state.deck[j]);
        if (targets.has(id)) continue;
        const card = ID.decode(id);
        if ('attribute' in card && card.attribute === 'Dark' && card.atk <= 1500) {
          const t = s.clone();
          s.minor(`Add "${ID.decode(id).name}" from Deck to hand after "Sangan" was sent to the Graveyard`);
          t.add('hand', ID.id(s.deck.splice(j, 1)[0]));
          t.shuffle();
          const reveal = t.deck[t.deck.length - 1];
          if (!ID.known(reveal)) t.deck[t.deck.length - 1] = `(${reveal})` as DeckID;
          t.minor(`Call "Trap", reveal "${ID.decode(reveal).name}"`);
          next.set(t.toString(), t);
        }
      }
      // Failure to find
      if (!targets.size) {
        const t = s.clone();
        t.minor('Fail to find "Sangan" target in Deck');
        t.shuffle();
        const reveal = t.deck[t.deck.length - 1];
        if (!ID.known(reveal)) t.deck[t.deck.length - 1] = `(${reveal})` as DeckID;
        t.minor(`Call "Trap", reveal "${ID.decode(reveal).name}"`);
        next.set(t.toString(), t);
      }
    },
  },
  'Royal Magical Library': {
    type: 'Monster',
    attribute: 'Light',
    level: 4,
    atk: 0,
    def: 2000,
    text: 'Spellcaster/Effect – Each time a Spell is activated, place 1 Spell Counter on this card when that Spell resolves (max. 3). You can remove 3 Spell Counters from this card; draw 1 card.',
    // NOTE: draw effect handled directly in State#next, and all spells use Stat#inc to update counters
    play: MONSTER,
  },
  'Sangan': {
    type: 'Monster',
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
      const h = (location === 'hand' ? 2 : 1);
      if (!(state.graveyard.length && state.hand.length > h && state.deck.length >= state.hand.length - h)) return;

      let spells!: Set<[number, number]>;
      const targets = new Set<ID>();
      for (let g = 0; g < state.graveyard.length; g++) {
        const id = state.graveyard[g];
        if (targets.has(id)) continue;
        if (ID.decode(id).type === 'Spell') {
          targets.add(id);
          if (!spells) {
            spells = new Set();
            for (const [j, k] of isubsets(state.hand, 2)) {
              if (location === 'hand' && (i === j || i === k)) continue;
              if (ID.decode(state.hand[j]).type !== 'Spell') continue;
              if (ID.decode(state.hand[k]).type !== 'Spell') continue;
              spells.add([j, k]);
            }
            if (!spells.size) return;
          }
          // There might still return redundant subsets but we count on state deduping to handle it
          for (const [j, k] of spells) {
            const s = state.clone();
            s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
            s.minor(`Discard "${ID.decode(s.hand[j]).name}" and "${ID.decode(s.hand[k]).name}"`);
            const gid = s.remove('graveyard', g);
            if (location === 'hand') {
              s.discard([i, j, k].sort());
            } else {
              s.remove(location, i);
              s.add('graveyard', card.id);
              s.discard([j, k]); // PRECONDITION: j < k
            }
            s.minor(`Add "${ID.decode(gid).name}" in the Graveyard to hand`);
            s.add('hand', gid);
            s.inc();
            next.set(s.toString(), s);
          }
        }
      }
    },
  },
  'Thunder Dragon': {
    type: 'Monster',
    attribute: 'Light',
    level: 5,
    atk: 1600,
    def: 1500,
    text: 'Thunder/Effect – You can discard this card; add up to 2 "Thunder Dragon" from your Deck to your hand.',
    // NOTE: discard effect handled directly in State#next
    play(state, location, i, next, self) {
      for (let j = 0; j < state.monsters.length; j++) {
        const s = state.clone();
        const target = ID.decode(state.monsters[j]);
        s.major(`Tribute "${target.name}" to Summon "${self.name}"`);
        s.tribute(j, i);
        if (target.name === 'Sangan') {
          const targets = new Set<ID>();
          for (let k = 0; k < state.deck.length; k++) {
            const id = ID.id(state.deck[k]);
            if (targets.has(id)) continue;
            const card = ID.decode(id);
            if ('attribute' in card && card.attribute === 'Dark' && card.atk <= 1500) {
              const t = s.clone();
              s.minor(`Add "${ID.decode(id).name}" from Deck to hand after "Sangan" was sent to the Graveyard`);
              t.add('hand', ID.id(s.deck.splice(k, 1)[0]));
              t.shuffle();
              next.set(t.toString(), t);
            }
          }
          // Failure to find
          if (!targets.size) {
            const t = s.clone();
            t.minor('Fail to find "Sangan" target in Deck');
            t.shuffle();
            next.set(t.toString(), t);
          }
        } else {
          next.set(s.toString(), s);
        }
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
        const target = ID.decode(state.deck[j]);
        if (targets.has(target.id)) continue;
        if (target.name.startsWith('Toon')) {
          targets.add(target.id);
          const s = state.clone();
          s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
          s.minor(`Add "${target.name}" from Deck to hand`);
          s.remove(location, i);
          s.add('graveyard', target.id);
          s.add('hand', ID.id(s.deck.splice(j, 1)[0]));
          s.shuffle();
          s.inc();
          next.set(s.toString(), s);
        }
      }
      // Failure to find
      if (!targets.size) {
        const s = state.clone();
        s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
        s.minor('Fail to find "Toon" card in Deck');
        s.remove(location, i);
        s.add('graveyard', card.id);
        s.shuffle();
        s.inc();
        next.set(s.toString(), s);
      }
    },
  },
  'Toon World': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Activate this card by paying 1000 Life Points.',
    play: SPELL(s => s.lifepoints > 1000, s => {
      s.minor(`Pay 1000 LP (${s.lifepoints} -> ${s.lifepoints - 1000})`);
      s.lifepoints -= 1000;
    }),
  },
  'Upstart Goblin': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 1 card, then your opponent gains 1000 Life Points.',
    // NOTE: we don't care about our opponent's life points
    play: SPELL(s => !!s.deck.length, s => s.draw()),
  },
};

const DECK: { [name: string]: number } = {
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

const BLACK_PENDANT = IDS['Black Pendant'];
const LIBRARY = IDS['Royal Magical Library'];
const REVERSAL_QUIZ = IDS['Reversal Quiz'];
const THUNDER_DRAGON = IDS['Thunder Dragon'];

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
  monsters: FieldID[];
  spells: FieldID[];
  hand: ID[];
  graveyard: ID[];
  deck: DeckID[];
  reversed: boolean;

  trace: string[];

  static create(random: Random) {
    const deck: ID[] = [];
    for (const name in DECK) {
      for (let i = 0; i < DECK[name]; i++) deck.push(IDS[name]);
    }
    random.shuffle(deck);

    const state = new State(random, 8000, false, [], [], [], [], deck, false, []);
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
    this.graveyard = graveyard;
    this.deck = deck;
    this.reversed = reversed;

    this.trace = trace;
  }

  add(location: 'spells', id: FieldID): number;
  add(location: 'hand' | 'graveyard', id: ID): number;
  add(location: Exclude<Location, 'deck' | 'monsters'>, id: ID /* | FieldID */) {
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
  remove(location: 'hand' | 'graveyard', i: number): ID;
  remove(location: Exclude<Location, 'deck' | 'monsters'>, i: number): ID | FieldID;
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
      this.minor(`Sending ${ID.names(equips)} equipped to "${ID.decode(id).name}" to the graveyard`);
    }
    const h = this.remove('hand', hi);
    return this.summon(h);
  }

  major(s: string) {
    this.trace.push(s);
  }

  minor(s: string) {
    this.trace.push(`  ${s}`);
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
      this.deck.reverse();
      if (!ID.known(this.deck[0])) this.deck[0] = `(${this.deck[0]})` as DeckID;
      this.minor(`Turn Deck back face-down ("${ID.decode(this.deck[0]).name}" now on bottom)`);
    } else {
      if (this.reversed) return;
      this.reversed = true;
      this.deck.reverse();
      this.minor(`Turn Deck face-up ("${ID.decode(this.deck[this.deck.length - 1]).name}" now on top)`);
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

  search(visited = new Set<string>(), path: string[] = []): { visited: number } | { state: State; path: string[]; visited: number } {
    visited.add(this.toString());
    if (DEBUG) {
      const errors = State.verify(this);
      if (errors.length) {
        console.error(`INVALID STATE ${visited.size}:\n\n${errors.join('\n')}`);
        process.exit(1);
      }
    }
    for (const [s, state] of this.next().entries()) {
      if (state.end()) return {state, path, visited: visited.size};
      if (!visited.has(s)) return state.search(visited, [...path, s]);
    }
    return {visited: visited.size};
  }

  next() {
    const next = new Map<string, State>();

    for (let i = 0; i < this.monsters.length; i++) {
      const id = this.monsters[i];
      if (id !== LIBRARY) continue;
      const card = ID.decode(id);
      if (!ID.facedown(id) && ID.data(id) === 3 && this.deck.length) {
        const s = this.clone();
        s.major(`Remove 3 Spell Counters from "${card.name}"`);
        s.mclear(i);
        s.draw();
        next.set(s.toString(), s);
      }
    }

    const spells = new Set<FieldID>();
    for (let i = 0; i < this.spells.length; i++) {
      const id = this.spells[i];
      if (spells.has(id)) continue;
      spells.add(id);
      const card = ID.decode(id);
      if (ID.facedown(id)) {
        card.play(this, 'spells', i, next, card);
      } else if (card.name === 'Archfiend\'s Oath' && !ID.data(id)) {
        ARCHFIEND(this, 'spells', i, next, card);
      }
    }

    const hand = new Set<ID>();
    for (let i = 0; i < this.hand.length; i++) {
      const id = this.hand[i];
      if (hand.has(id)) continue;
      hand.add(id);
      const card = ID.decode(id);
      if (card.type === 'Spell' && this.spells.length < 5) {
        const set = this.clone();
        set.major(`Set "${card.name}" face-down`);
        set.add('spells', `(${id})` as FieldID);
        set.remove('hand', i);
        next.set(set.toString(), set);

        card.play(this, 'hand', i, next, card);
      } else if (card.type === 'Monster' && this.monsters.length < 5 && !this.summoned) {
        // TODO: add support for setting Cyber Jar in multi-turn scenarios
        // if (card.name === 'Cyber Jar') {
        //   const set = this.clone();
        //   set.major(`Set "${card.name}" face-down in Defense Position`);
        //   set.summon(`(${id})` as FieldID);
        //   set.remove('hand', i);
        //   next.set(set.toString(), set);
        // }
        card.play(this, 'hand', i, next, card);
      } else if (id === THUNDER_DRAGON) {
        const targets: number[] = [];
        for (let j = 0; j < this.deck.length && targets.length < 2; j++) {
          if (ID.id(this.deck[j]) === THUNDER_DRAGON) targets.push(j);
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
          next.set(s.toString(), s);
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
          next.set(s.toString(), s);
        } else {
          // Failure to find
          const s = this.clone();
          s.major(`Discard "${card.name}"`);
          s.minor(`Fail to find "${card.name}" in Deck`);
          s.remove('hand', i);
          s.add('graveyard', card.id);
          s.shuffle();
          next.set(s.toString(), s);
        }
      }
    }

    return next;
  }

  end() {
    if (this.lifepoints > 500) return false;
    if (!this.monsters.length || !this.deck.length) return false;
    const known = this.known(true);
    if (!known) return false;
    const hand = {pendant: false, quiz: false};
    for (const id of this.hand) {
      if (id === BLACK_PENDANT) {
        hand.pendant = true;
      } else if (id === REVERSAL_QUIZ) {
        hand.quiz = true;
      }
    }
    if (hand.pendant && hand.quiz && this.spells.length <= 3) {
      return this.win(known, {pendant: false, quiz: false});
    }
    const spells = {pendant: false, quiz: false};
    for (const fid of this.spells) {
      const id = ID.id(fid);
      if (id === BLACK_PENDANT) {
        spells.pendant = true;
      } else if (id === REVERSAL_QUIZ) {
        spells.quiz = true;
      }
    }
    if (spells.quiz && spells.pendant) {
      return this.win(known, {pendant: true, quiz: true});
    }
    if (hand.pendant && this.spells.length <= 4 && spells.quiz) {
      return this.win(known, {pendant: false, quiz: true});
    }
    if (hand.quiz && this.spells.length <= 4 && spells.pendant) {
      return this.win(known, {pendant: true, quiz: false});
    }
    return false;
  }

  win(known: DeckID, facedown: {pendant: boolean; quiz: boolean}) {
    const monster = ID.decode(this.monsters[0]);
    this.major(`${facedown.pendant ? 'Flip face-down "Black Pendant" and equip' : 'Equip "Black Pendant"'}  to "${monster.name}"`);
    this.major(`Activate${facedown.quiz ? ' face-down' : ''} "Reversal Quiz"`);
    if (this.hand.length) {
      this.minor(`Send ${ID.names(this.hand)} from hand to Graveyard`);
    }
    if (this.monsters.length || this.spells.length) {
      this.minor(`Send ${ID.names([...this.monsters, ...this.spells])} from field to Graveyard`);
    }
    for (const id of this.spells) {
      const card = ID.decode(id);
      if (card.name === 'Convulsion of Nature') {
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
      equals(this.graveyard, s.graveyard) &&
      equals(this.deck, s.deck));
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
    const monsters = this.parse(s.slice(i, j)) as FieldID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const spells = this.parse(s.slice(i, j)) as FieldID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const hand = s.slice(i, j).split('') as ID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const graveyard = s.slice(i, j).split('') as ID[];

    i = j + 1;
    j = s.indexOf('|', i);
    const deck = this.parse(s.slice(i, j)) as DeckID[];

    i = j + 1;
    const reversed = s.slice(i) === '1';

    return new State(
      random, lifepoints, summoned, monsters, spells, hand, graveyard, deck, reversed, []
    );
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
        if (((ID.facedown(id) || card.id !== LIBRARY) && ID.data(id)) || ID.data(id) > 3) {
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
        if ((facedown && data) ||
          (card.name === 'Archfiend\'s Oath' && data > 1) ||
          (!facedown && card.type === 'Spell' &&
            !['Continuous', 'Equip'].includes(card.subType))) {
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

    if (s.graveyard.length > 40 ||
      s.graveyard.filter(i => i.length > 1).length ||
      !equals(s.graveyard.slice().sort(), s.graveyard)) {
      errors.push(`Graveyard: ${pretty(s.graveyard)}`);
    }

    if (s.deck.length > 40 || s.graveyard.filter(i => i.length > 1).length) {
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

    // NOTE: start doesn't need to be sorted because its already alphabetized
    const start = [];
    for (const name in DECK) {
      for (let i = 0; i < DECK[name]; i++) start.push(IDS[name]);
    }
    const now = [
      ...s.monsters.map(id => ID.id(id)),
      ...s.spells.map(id => ID.id(id)),
      ...s.hand,
      ...s.graveyard,
      ...s.deck.map(id => ID.id(id)),
    ].sort();
    if (!equals(start, now)) {
      errors.push(`Mismatch: ${start.length} vs. ${now.length}`);
    }

    return errors;
  }

  [util.inspect.custom]() {
    const pretty = (id: ID | FieldID | DeckID) => ID.pretty(id);
    return util.inspect({
      random: this.random.seed,
      lifepoints: this.lifepoints,
      summoned: this.summoned,
      monsters: this.monsters.map(pretty),
      spells: this.spells.map(pretty),
      hand: this.hand.map(pretty),
      graveyard: this.graveyard.map(pretty),
      deck: this.deck.map(pretty),
      reversed: this.reversed,
    }, {colors: true, breakLength: 200, maxStringLength: Infinity});
  }
}

const STATE = State.create(process.argv[2] ? new Random(Random.seed(+process.argv[2])) : new Random());
const RESULT = STATE.search();
if (!('state' in RESULT)) {
  console.error(`Unsuccessfully searched ${RESULT.visited} states`);
  process.exit(1);
} else {
  console.log(`Found a path after searching ${RESULT.visited} states:\n\n${RESULT.state.trace.join('\n')}`);
}
