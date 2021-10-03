import * as util from 'util';

// Type/SubType/Attribute are pruned to just the values used by Library FTK
// (also note that all monster cards in the deck are actually Effect Monsters)
type Type = 'Monster' | 'Spell';
type SubType = 'Continuous' | 'Equip' | 'Normal' | 'Quick-Play';
type Attribute = 'Dark' | 'Light';

// The relevant areas of the field in question (the Fusion Deck and Field Spell Zone are unused)
type Location = 'monsters' | 'spells' | 'hand' | 'banished' | 'graveyard' | 'deck';

// An ID is just a branded single character string chosen to represent each card in question (see
// Ids below). A DeckID is an ID or an ID surrounded by parantheses to indicate that it is either
// known in the deck or facedown a zone. A FieldID further extends the concept of the DeckID,
// optionally allowing for a number to be appended to the ID character in question to indicate
// additional state (eg. whether a card has been activated, which monster an Equip Spell is attached
// to, the number of Spell Counters on a card, etc),
interface As<T> { __brand: T }
export type ID = string & As<'ID'>;
export type DeckID = ID | string & As<'DeckID'>;
export type FieldID = ID | string & As<'FieldID'>;

// Data contains basic data about each card as well as housing the main handler function which
// determines which additional states can be transitioned to by playing said card. The play function
// is passed a reference to the current state, whether the card is being played from the hand or
// whether it is being activated from the Spell & Trap Zone, the index of where the card is within
// its location, the transition map of subsequent states and a reference to the card itself.
// Handlers are expected to add all legal transition states to the map, though may elide states
// which are redundant (eg. due to symmetry) as a performance optimization.
type Data = {
  id: ID;
  type: Type;
  text: string;
  score?(
    state: Readonly<State>,
    location: 'hand' | 'spells' | 'monsters',
    id: FieldID,
  ): number;
  play(
    state: Readonly<State>,
    location: 'hand' | 'spells',
    i: number,
    next: Map<string, IState>,
    card: Card,
    prescient: boolean,
  ): void;
} & ({
  type: 'Spell';
  subType: SubType;
  can(state: Readonly<State>, location: 'hand' | 'spells' | 'monsters'): boolean;
} | {
  type: 'Monster';
  attribute: Attribute;
  level: number;
  atk: number;
  def: number;
});

// A Card is the reified basic data type built from CARDS
export type Card = Data & {
  name: string;
  score(
    state: Readonly<State>,
    location: 'hand' | 'spells' | 'monsters',
    id: FieldID,
  ): number;
};

// By default a 'trace' is built during a search to provide a detailed human-readable representation
// of how to arrive at a solution. This can be disabled (eg. during benchmarking to save time and
// memory) if you are only interested in whether or not a solution is possible.
// NOTE: set PROD to anything, even false and it will be turn off tracing (as its actually 'false')
const TRACE = !process.env.PROD;
// Used to enable state verification sanity checking which has a large impact on performance.
// NOTE: set DEBUG to anything, even false and it will be turn on verification (as its actually 'false')
const DEBUG = !!process.env.DEBUG;

// Utilities for encoding and decoding IDs. Storing state in minimal string representations results
// in mimimal memory and serialization overhead.
export const ID = new class {
  facedown(id?: FieldID | DeckID) {
    return !!id && id.charAt(0) === '(';
  }
  known(id?: DeckID) {
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
    if (!ids.length) throw new RangeError();
    const names = ids.map(id => `"${this.decode(id).name}"`);
    if (names.length === 1) return names[0];
    const last = names.pop()!;
    return `${names.join(', ')} and ${last}`;
  }
};

// Basic k-subset function required by Graceful Charity and Spell Reproduction to determine
// discard targets (though they use the isubsets method below for further deduping). This is also
// called several times by Reload / Card Destruction to determine possible sets before activation -
// in that case a more generic subsets function instead of a k-subsets function would probably
// improve performance.
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

// Instead of subsets of an array we actually want (a) the unique subsets and (b) the *indices* of
// such unique subsets. This function doesn't quite accomplish the former: 2-subsets of [A, A, B, B]
// will still return [0, 1], [0, 2], [1, 2], [2, 3] instead of [0, 1], [1, 2], [2, 3], though these
// redundant subsets can be deduped by the higher level symmetry detection mechanisms.
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
  State.transition(next, s);
};

const SPELL: (fn?: (s: State) => void) => Data['play'] = (fn?: (s: State) => void) =>
  (state, location, i, next, card) => {
    if (!(card as any).can(state, location)) return;
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
    State.transition(next, s);
  };

const ARCHFIEND: Data['play'] = (state, location, i, next, card) => {
  if (!(card as any).can(state, location)) return;

  const play = location === 'hand' || ID.facedown(state[location][i]);
  const prefix = play
    ? `Activate${location === 'spells' ? ' face-down' : ''} "${card.name}" then pay`
    : 'Pay';

  if (state.known()) {
    const known = state.clone();
    known.major(`${prefix} 500 LP (${known.lifepoints} -> ${known.lifepoints - 500}) to activate effect of "${card.name}"`);
    known.minor(`Declare "${ID.decode(known.deck[known.deck.length - 1]).name}"`);
    known.lifepoints -= 500;
    known.remove(location, i);
    known.add('spells', `${card.id}1` as FieldID);
    known.draw();
    if (play) known.inc();
    State.transition(next, known);
  }

  // If you just want to pay 500 you might simply guess something impossible and mill one
  const unknown = state.clone();
  unknown.major(`${prefix} 500 LP (${unknown.lifepoints} -> ${unknown.lifepoints - 500}) to activate effect of "${card.name}"`);
  unknown.minor('Declare "Blue-Eyes White Dragon"');
  unknown.lifepoints -= 500;
  unknown.remove(location, i);
  unknown.add('spells', `${card.id}1` as FieldID);
  const reveal = ID.decode(unknown.deck.pop()!);
  unknown.minor(`Excavate "${reveal.name}"`);
  unknown.add('graveyard', reveal.id);
  if (play) unknown.inc();
  State.transition(next, unknown);
};

const CAN_RELOAD = (state: State, location: 'hand' | 'spells' | 'monsters') => {
  const h = (location === 'hand' ? 1 : 0);
  return state.hand.length > h && state.deck.length >= state.hand.length - h;
};

const RELOAD: (fn: (s: State) => void) => Data['play'] =
  (fn: (s: State) => void) => (state, location, i, next, card) => {
    if (!CAN_RELOAD(state, location)) return;

    const d = state.clone();
    d.remove(location, i);
    d.add('graveyard', card.id);

    // We can only set at most max cards before reloading, dependent on open zones and hand size
    const hand = d.hand.filter(id => ID.decode(id).type === 'Spell');
    const h = (location === 'hand' ? 1 : 0);
    const max = Math.min(5 - state.spells.length - h, hand.length, d.hand.length - 1);
    for (let n = 1; n <= max; n++) {
      for (const set of isubsets(d.hand, n)) {
        if (set.some(j => ID.decode(d.hand[j]).type === 'Monster')) continue;
        const s = d.clone();
        const ids = [];
        for (const [offset, j] of set.entries()) {
          const id = d.hand[j];
          ids.push(id);
          s.add('spells', `(${id})` as FieldID);
          s.remove('hand', j - offset);
        }
        s.major(`Set ${ID.names(ids)} face-down then activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
        const len = s.hand.length;
        fn(s);
        s.hand = [];
        s.draw(len);
        s.inc();
        State.transition(next, s);
      }
    }
    // The case where we don't set any cards beforehand
    d.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
    const len = d.hand.length;
    fn(d);
    d.hand = [];
    d.draw(len);
    d.inc();
    State.transition(next, d);
  };

const Ids = {
  LevelLimitAreaB: 'A' as ID,
  BlackPendant: 'B' as ID,
  CardDestruction: 'C' as ID,
  DifferentDimensionCapsule: 'D' as ID,
  AFeatherOfThePhoenix: 'F' as ID,
  GracefulCharity: 'G' as ID,
  HeavyStorm: 'H' as ID,
  CyberJar: 'J' as ID,
  PrematureBurial: 'K' as ID,
  RoyalMagicalLibrary: 'L' as ID,
  ArchfiendsOath: 'O' as ID,
  PotOfGreed: 'P' as ID,
  ReversalQuiz: 'Q' as ID,
  Reload: 'R' as ID,
  Sangan: 'S' as ID,
  GiantTrunade: 'T' as ID,
  UpstartGoblin: 'U' as ID,
  ConvulsionOfNature: 'V' as ID,
  ToonWorld: 'W' as ID,
  ToonTableOfContents: 'X' as ID,
  ThunderDragon: 'Y' as ID,
  SpellReproduction: 'Z' as ID,
};

export const CARDS: { [name: string]: Data } = {
  'A Feather of the Phoenix': {
    id: Ids.AFeatherOfThePhoenix,
    type: 'Spell',
    subType: 'Normal',
    text: 'Discard 1 card, then target 1 card in your Graveyard; return that target to the top of your Deck.',
    can(state, location) {
      return !!(state.graveyard.length && (state.hand.length >= (location === 'hand' ? 2 : 1)));
    },
    play(state, location, i, next, card) {
      if (!this.can(state, location)) return;
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
          s.remove('graveyard', k);
          if (location === 'hand') {
            s.discard(i < j ? [i, j] : [j, i]);
          } else {
            s.remove(location, i);
            s.add('graveyard', card.id);
            s.add('graveyard', s.remove('hand', j));
          }
          s.deck.push(`(${gid})` as DeckID);
          s.inc();
          State.transition(next, s);
        }
      }
    },
  },
  'Archfiend\'s Oath': {
    id: Ids.ArchfiendsOath,
    type: 'Spell',
    subType: 'Continuous',
    text: 'Once per turn: You can pay 500 Life Points, then declare 1 card name; excavate the top card of your Deck, and if it is the declared card, add it to your hand. Otherwise, send it to the Graveyard.',
    can: s => !!(s.lifepoints > 500 && s.deck.length),
    score(state, location, id) {
      return (this.can(state, location) && !ID.data(id)) ? 1 : 0;
    },
    play(state, location, i, next, card, prescient) {
      ARCHFIEND(state, location, i, next, card, prescient);

      const unactivated = state.clone();
      unactivated.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      unactivated.remove(location, i);
      unactivated.add('spells', card.id);
      unactivated.inc();
      State.transition(next, unactivated);
    },
  },
  'Black Pendant': {
    id: Ids.BlackPendant,
    type: 'Spell',
    subType: 'Equip',
    text: 'The equipped monster gains 500 ATK. If this card is sent from the field to the Graveyard: Inflict 500 damage to your opponent.',
    can: s => !!s.monsters.length,
    score: () => 1,
    play(state, location, i, next, card) {
      for (let j = 0; j < state.monsters.length; j++) {
        const s = state.clone();
        s.remove(location, i);
        s.major(`${location === 'spells' ? `Flip face-down "${card.name}" and equip` : `Equip "${card.name}"`} to "${ID.decode(s.monsters[j]).name}"`);
        s.add('spells', `${card.id}${j}` as FieldID);
        s.inc();
        State.transition(next, s);
      }
    },
  },
  'Card Destruction': {
    id: Ids.CardDestruction,
    type: 'Spell',
    subType: 'Normal',
    text: 'Both players discard as many cards as possible from their hands, then each player draws the same number of cards they discarded.',
    can: CAN_RELOAD,
    play: RELOAD(s => {
      for (const id of s.hand) {
        s.add('graveyard', id);
      }
      s.minor(`Discard ${ID.names(s.hand)}`);
    }),
  },
  'Convulsion of Nature': {
    id: Ids.ConvulsionOfNature,
    type: 'Spell',
    subType: 'Continuous',
    text: 'Both players must turn their Decks upside down.',
    can: s => !!s.deck.length,
    score: s => +(s.deck.length && !s.reversed),
    play: SPELL(s => s.reverse()),
  },
  'Cyber Jar': {
    id: Ids.CyberJar,
    type: 'Monster',
    attribute: 'Dark',
    level: 3,
    atk: 900,
    def: 900,
    text: 'Rock/Flip/Effect – FLIP: Destroy all monsters on the field, then both players reveal the top 5 cards from their Decks, then Special Summon all revealed Level 4 or lower monsters in face-up Attack Position or face-down Defense Position, also add any remaining cards to their hand. (If either player has less than 5 cards in their Deck, reveal as many as possible).',
    score: (state, location) => (state.summoned || location === 'hand') ? 0 : 1 / 3,
    play: MONSTER,
  },
  'Different Dimension Capsule': {
    id: Ids.DifferentDimensionCapsule,
    type: 'Spell',
    subType: 'Normal',
    text: 'After this card\'s activation, it remains on the field. When this card is activated: Banish 1 card from your Deck, face-down. During your second Standby Phase after this card\'s activation, destroy this card, and if you do, add that card to the hand.',
    can: s => !!s.deck.length,
    // TODO: support having the card actually return by adding counters to it on the field each turn
    play(state, location, i, next, card) {
      const targets = new Set<DeckID>();
      for (let j = 0; j < state.deck.length; j++) {
        const id = state.deck[j];
        if (targets.has(id)) continue;
        const s = state.clone();
        s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
        s.remove(location, i);
        s.add('spells', `${card.id}0` as FieldID);
        s.minor(`Banish ${ID.decode(s.deck[j]).name} from the deck face-down`);
        s.add('banished', `(${ID.id(s.deck.splice(j, 1)[0])})` as DeckID);
        s.shuffle();
        s.inc();
        State.transition(next, s);
      }
    },
  },
  'Giant Trunade': {
    id: Ids.GiantTrunade,
    type: 'Spell',
    subType: 'Normal',
    text: 'Return all Spells/Traps on the field to the hand.',
    can: (s, loc) => s.spells.length > (loc === 'hand' ? 0 : 1),
    score(state, location) {
      return this.can(state, location) ? 1.5 : 1;
    },
    play: SPELL(s => {
      // NOTE: The active Giant Trunade card has already been removed from hand/field
      for (const id of s.spells) {
        const card = ID.decode(id);
        s.add('hand', card.id);
        if (ID.facedown(id)) continue;
        if (card.id === Ids.ConvulsionOfNature) {
          s.reverse(true);
        } else if (card.id === Ids.DifferentDimensionCapsule) {
          s.banish();
        }
      }
      s.minor(`Return ${ID.names(s.spells)} to hand`);
      s.spells = [];
    }),
  },
  'Graceful Charity': {
    id: Ids.GracefulCharity,
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 3 cards, then discard 2 cards.',
    can: s => s.deck.length >= 3,
    score(state, location) {
      return this.can(state, location) ? 1.5 : 0;
    },
    play(state, location, i, next, card) {
      if (!this.can(state, location)) return;
      const draw = state.clone();
      draw.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      draw.remove(location, i);
      draw.add('graveyard', card.id);
      draw.draw(3);
      // isubsets might still return redundant subsets but we count on state deduping to handle it
      for (const [j, k] of isubsets(draw.hand, 2)) {
        const s = draw.clone();
        s.minor(`Discard "${ID.decode(draw.hand[j]).name}" and "${ID.decode(draw.hand[k]).name}"`);
        s.discard([j, k]); // PRECONDITION: j < k
        s.inc();
        State.transition(next, s);
      }
    },
  },
  'Level Limit - Area B': {
    id: Ids.LevelLimitAreaB,
    type: 'Spell',
    subType: 'Continuous',
    text: 'Change all face-up Level 4 or higher monsters to Defense Position.',
    can: () => true,
    score: (_, location) => location === 'spells' ? 0 : 1 / 3,
    play: SPELL(),
  },
  'Pot of Greed': {
    id: Ids.PotOfGreed,
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 2 cards.',
    can: s => s.deck.length >= 2,
    score(state, location) {
      return this.can(state, location) ? 1.5 : 0;
    },
    play: SPELL(s => s.draw(2)),
  },
  'Premature Burial': {
    id: Ids.PrematureBurial,
    type: 'Spell',
    subType: 'Equip',
    text: 'Activate this card by paying 800 Life Points, then target 1 monster in your Graveyard; Special Summon that target in Attack Position and equip it with this card. When this card is destroyed, destroy the equipped monster.',
    can(state) {
      return (this as any).score(state) > 0;
    },
    score(state) {
      if (!state.graveyard.length || state.monsters.length > 4 && state.lifepoints <= 800) return 0;
      let max = 0;
      for (const id of state.graveyard) {
        const target = ID.decode(id);
        if (target.type !== 'Monster') continue;
        max = Math.max(max, target.score(state, 'monsters', target.id));
      }
      return 1 + max;
    },
    play(state, location, i, next, card) {
      if (!state.graveyard.length || state.monsters.length > 4 && state.lifepoints <= 800) return;
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
          s.inc(zone);
          State.transition(next, s);
        }
      }
    },
  },
  'Heavy Storm': {
    id: Ids.HeavyStorm,
    type: 'Spell',
    subType: 'Normal',
    text: 'Destroy all Spells/Traps on the field.',
    can: (s, loc) => s.spells.length > (loc === 'hand' ? 0 : 1),
    score: () => 0,
    play: SPELL(s => {
      // NOTE: The active Heavy Storm card has already been removed from hand/field
      for (const id of s.spells) {
        const card = ID.decode(id);
        s.add('graveyard', card.id);
        if (ID.facedown(id)) continue;
        if (card.id === Ids.ConvulsionOfNature) {
          s.reverse(true);
        } else if (card.id === Ids.BlackPendant) {
          const removed = s.mremove(ID.data(id));
          s.add('graveyard', removed.id);
          s.minor(`Sending "${ID.decode(removed.id).name}" to the Graveyard after its equipped "${ID.decode(id).name}" was destroyed`);
        } else if (card.id === Ids.DifferentDimensionCapsule) {
          s.banish();
        }
      }
      s.minor(`Send ${ID.names(s.spells)} to Graveyard`);
      s.spells = [];
    }),
  },
  'Reload': {
    id: Ids.Reload,
    type: 'Spell',
    subType: 'Quick-Play',
    text: 'Send all cards from your hand to the Deck, then shuffle. Then, draw the same number of cards you added to the Deck.',
    can: CAN_RELOAD,
    play: RELOAD(s => {
      s.deck.push(...s.hand);
      s.minor(`Return ${ID.names(s.hand)} to Deck`);
      s.shuffle();
    }),
  },
  'Reversal Quiz': {
    id: Ids.ReversalQuiz,
    type: 'Spell',
    subType: 'Normal',
    text: 'Send all cards from your hand and your field to the Graveyard, then call Spell, Trap, or Monster; reveal the top card of your Deck. If you called it right, both players exchange Life Points.',
    can: s => !!s.deck.length,
    score: () => 1,
    // NOTE: we are not supporting the case where we actually guess correctly prematurely
    play(state, location, _, next, self) {
      if (!this.can(state, location)) return;
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
      s.hand = [];
      for (const id of s.monsters) {
        const card = ID.decode(id);
        if (card.id === Ids.Sangan) sangan = true;
        s.graveyard.push(card.id);
      }
      s.monsters = [];
      for (const id of s.spells) {
        const card = ID.decode(id);
        if (!ID.facedown(id)) {
          if (card.id === Ids.ConvulsionOfNature) {
            s.reverse(true);
          } else if (card.id === Ids.DifferentDimensionCapsule) {
            s.banish();
          }
        }
        s.graveyard.push(card.id);
      }
      s.spells = [];
      s.graveyard.sort();

      if (!sangan) {
        const reveal = s.deck[s.deck.length - 1];
        if (!ID.known(reveal)) s.deck[s.deck.length - 1] = `(${reveal})` as DeckID;
        s.minor(`Call "Trap", reveal "${ID.decode(reveal).name}"`);
        State.transition(next, s);
        return;
      }

      const targets = new Set<ID>();
      for (let j = 0; j < state.deck.length; j++) {
        const id = ID.id(state.deck[j]);
        if (targets.has(id)) continue;
        const card = ID.decode(id);
        if ('attribute' in card && card.attribute === 'Dark' && card.atk <= 1500) {
          const t = s.clone();
          t.minor(`Add "${ID.decode(id).name}" from Deck to hand after "Sangan" was sent to the Graveyard`);
          t.add('hand', ID.id(s.deck.splice(j, 1)[0]));
          t.shuffle();
          const reveal = t.deck[t.deck.length - 1];
          if (!ID.known(reveal)) t.deck[t.deck.length - 1] = `(${reveal})` as DeckID;
          t.minor(`Call "Trap", reveal "${ID.decode(reveal).name}"`);
          State.transition(next, t);
        }
      }
      // Failure to find (mandatory effect)
      if (!targets.size) {
        const t = s.clone();
        t.minor('Fail to find "Sangan" target in Deck');
        t.shuffle();
        const reveal = t.deck[t.deck.length - 1];
        if (!ID.known(reveal)) t.deck[t.deck.length - 1] = `(${reveal})` as DeckID;
        t.minor(`Call "Trap", reveal "${ID.decode(reveal).name}"`);
        State.transition(next, t);
      }
    },
  },
  'Royal Magical Library': {
    id: Ids.RoyalMagicalLibrary,
    type: 'Monster',
    attribute: 'Light',
    level: 4,
    atk: 0,
    def: 2000,
    text: 'Spellcaster/Effect – Each time a Spell is activated, place 1 Spell Counter on this card when that Spell resolves (max. 3). You can remove 3 Spell Counters from this card; draw 1 card.',
    score(_, location) {
      return location === 'monsters' ? 4 : 1.3; // FIXME
    },
    // NOTE: draw effect handled directly in State#next, and all spells use Stat#inc to update counters
    play: MONSTER,
  },
  'Sangan': {
    id: Ids.Sangan,
    type: 'Monster',
    attribute: 'Dark',
    level: 3,
    atk: 1000,
    def: 600,
    text: 'Fiend/Effect – If this card is sent from the field to the Graveyard: Add 1 monster with 1500 or less ATK from your Deck to your hand.',
    score: (state, location) => (state.summoned || location === 'hand') ? 0 : 1 / 3,
    // NOTE: graveyard effect is handled in Thunder Dragon/Reversal Quiz
    play: MONSTER,
  },
  'Spell Reproduction': {
    id: Ids.SpellReproduction,
    type: 'Spell',
    subType: 'Normal',
    text: 'Send 2 Spells from your hand to the Graveyard, then target 1 Spell in your Graveyard; add it to your hand.',
    can(state, location) {
      const h = (location === 'hand' ? 2 : 1);
      return !!(state.graveyard.length && state.hand.length > h && state.deck.length >= state.hand.length - h);
    },
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
            State.transition(next, s);
          }
        }
      }
    },
  },
  'Thunder Dragon': {
    id: Ids.ThunderDragon,
    type: 'Monster',
    attribute: 'Light',
    level: 5,
    atk: 1600,
    def: 1500,
    text: 'Thunder/Effect – You can discard this card; add up to 2 "Thunder Dragon" from your Deck to your hand.',
    score: (state, location) => +(state.deck.length && location === 'hand'),
    // NOTE: discard effect handled directly in State#next
    play(state, _, i, next, self) {
      for (let j = 0; j < state.monsters.length; j++) {
        const s = state.clone();
        const target = ID.decode(state.monsters[j]);
        s.major(`Tribute "${target.name}" to Summon "${self.name}"`);
        s.tribute(j, i);
        if (target.id === Ids.Sangan) {
          const targets = new Set<ID>();
          for (let k = 0; k < state.deck.length; k++) {
            const id = ID.id(state.deck[k]);
            if (targets.has(id)) continue;
            const card = ID.decode(id);
            if ('attribute' in card && card.attribute === 'Dark' && card.atk <= 1500) {
              const t = s.clone();
              t.minor(`Add "${ID.decode(id).name}" from Deck to hand after "Sangan" was sent to the Graveyard`);
              t.add('hand', ID.id(s.deck.splice(k, 1)[0]));
              t.shuffle();
              State.transition(next, t);
            }
          }
          // Failure to find (mandatory effect)
          if (!targets.size) {
            const t = s.clone();
            t.minor('Fail to find "Sangan" target in Deck');
            t.shuffle();
            State.transition(next, t);
          }
        } else {
          State.transition(next, s);
        }
      }
    },
  },
  'Toon Table of Contents': {
    id: Ids.ToonTableOfContents,
    type: 'Spell',
    subType: 'Normal',
    text: 'Add 1 "Toon" card from your Deck to your hand.',
    can: s => !!s.deck.length,
    play(state, location, i, next, card, prescient) {
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
          s.add('graveyard', card.id);
          s.add('hand', ID.id(s.deck.splice(j, 1)[0]));
          s.shuffle();
          s.inc();
          State.transition(next, s);
        }
      }
      // Failure to find
      if (!targets.size) {
        if (prescient || state.reversed) {
          const s = state.clone();
          s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
          s.minor('Fail to find "Toon" card in Deck');
          s.remove(location, i);
          s.add('graveyard', card.id);
          s.shuffle();
          s.inc();
          State.transition(next, s);
        }
      }
    },
  },
  'Toon World': {
    id: Ids.ToonWorld,
    type: 'Spell',
    subType: 'Continuous',
    text: 'Activate this card by paying 1000 Life Points.',
    can: s => s.lifepoints > 1000,
    play: SPELL(s => {
      s.minor(`Pay 1000 LP (${s.lifepoints} -> ${s.lifepoints - 1000})`);
      s.lifepoints -= 1000;
    }),
  },
  'Upstart Goblin': {
    id: Ids.UpstartGoblin,
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 1 card, then your opponent gains 1000 Life Points.',
    can: s => !!s.deck.length,
    // NOTE: we don't care about our opponent's life points
    play: SPELL(s => s.draw()),
  },
};

const DECK: { [name: string]: number } = {
  'A Feather of the Phoenix': 3,
  'Archfiend\'s Oath': 3,
  'Black Pendant': 1,
  'Card Destruction': 1,
  'Convulsion of Nature': 3,
  // 'Cyber Jar': 1,
  // 'Different Dimension Capsule': 1,
  'Giant Trunade': 3,
  'Graceful Charity': 1,
  // 'Heavy Storm': 1,
  'Level Limit - Area B': 2,
  'Pot of Greed': 1,
  'Premature Burial': 1,
  'Reload': 3,
  'Reversal Quiz': 1,
  'Royal Magical Library': 3,
  'Sangan': 1,
  'Spell Reproduction': 3,
  'Thunder Dragon': 3,
  'Toon Table of Contents': 3,
  'Toon World': 2,
  'Upstart Goblin': 2,
};

export class Random {
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

export const DATA: Record<ID, Card> = {};
for (const name in CARDS) {
  const card = CARDS[name];
  const score = 'can' in card
    ? (s: Readonly<State>, loc: 'hand' | 'spells' | 'monsters') => +card.can(s, loc)
    : () => 0;
  DATA[card.id] = {score, ...card, name};
}

const equals = <T>(a: T[], b: T[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

interface IState {
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
      for (let i = 0; i < DECK[name]; i++) deck.push(CARDS[name].id);
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

  search(cutoff?: number, prescient?: boolean) {
    return search({key: this.toString(), state: this, score: this.score()}, cutoff, prescient);
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

  // BUG: this should really be on one line to avoid paying for the string concatenations, but
  // this causes workers to OOM for whatever reason...
  toString() {
    return `${this.random.seed}|${this.lifepoints}|${+this.summoned}|` +
      `${this.monsters.join('')}|${this.spells.join('')}|${this.hand.join('')}|` +
      `${this.banished.join('')}|${this.graveyard.join('')}|${this.deck.join('')}|` +
      `${+this.reversed}`;
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
      for (let i = 0; i < DECK[name]; i++) start.push(CARDS[name].id);
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

  [util.inspect.custom]() {
    const pretty = (id: ID | FieldID | DeckID) => ID.pretty(id);
    return util.inspect({
      random: this.random.seed,
      lifepoints: this.lifepoints,
      summoned: this.summoned,
      monsters: this.monsters.map(pretty),
      spells: this.spells.map(pretty),
      hand: this.hand.map(pretty),
      banished: this.banished.map(pretty),
      graveyard: this.graveyard.map(pretty),
      deck: this.deck.map(pretty),
      reversed: this.reversed,
    }, {colors: true, breakLength: 200, maxStringLength: Infinity});
  }
}

interface SearchResult {
  path: string[];
  trace: string[];
}

interface Hash<K, V> {
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

export function search(
  self: IState, cutoff?: number, prescient?: boolean
): {visited: number} | SearchResult & {visited: number} {
  const hash: Hash<string, number> = cutoff && cutoff > LIMIT ? new BigMap() : new Map();
  const result = bestfirst(self, hash, [], cutoff, prescient);
  return {visited: hash.size, ...result};
}

function bestfirst(
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
      const result = bestfirst(child, visited, path.slice(), cutoff, prescient);
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

export function bulb(node: IState, B = 5, cutoff?: number, prescient?: boolean) {
  const visited: Hash<string, Status> = cutoff && cutoff > LIMIT ? new BigMap() : new Map();
  for (let discrepancies = 0; visited.get(node.key) !== Status.COMPLETE; discrepancies++) {
    const result = probe(node, B, discrepancies, visited, [], cutoff, prescient);
    if (result) return {visited: visited.size, ...result};
  }
  return {visited: visited.size};
}

function probe(
  node: IState,
  B: number,
  discrepancies: number,
  visited: Hash<string, Status>,
  path: string[],
  cutoff?: number,
  prescient?: boolean
): SearchResult | undefined {
  path.push(node.key);

  // No matter what, we will at least be visiting all of the first slice, thus we can mark this node
  // as partially visited
  visited.set(node.key, Status.PARTIAL);

  let children = node.state.next(prescient);
  const num = children.length;
  if (!discrepancies) {
    // If we don't have any discrepancies we visit just the first slice (though this could be all of
    // the children)
    if (num > B) children = children.slice(0, B);

    let complete = 0;
    for (const child of children) {
      const v = visited.get(child.key);
      // Track how many of our children our actually COMPLETE, as if they all are and we're visiting
      // all of our children than we can mark this node as COMPLETE
      if (v === Status.COMPLETE) complete++;
      // If this node was visited at all we can skip visiting it further, as we will only ever be
      // looking in the first slice anyway since we have no discrepancies
      if (!v) {
        const result = probe(child, B, 0, visited, path.slice(), cutoff, prescient);
        if (result) return result;
      }
    }
    // If the slice actually encompassed all children and they were all COMPLETE we can mark this
    // node as COMPLETE
    if (complete === num) {
      visited.set(node.key, Status.COMPLETE);
    }
  } else {
    // Pull out the best slice from children
    const best = children.splice(0, B);
    // Use up a discrepancy by investigating the other slices
    let complete = 0;
    for (const child of children) {
      const v = visited.get(child.key);
      if (v === Status.COMPLETE) {
        complete++;
      } else {
        // If we only have one discrepancy we don't need to bother recursing into children that have
        // already been partially searched as we would only be expanding their first slice anyway
        // which has all already been searched
        if (discrepancies === 1 && v) continue;
        const result = probe(child, B, discrepancies - 1, visited, path.slice(), cutoff, prescient);
        if (result) return result;
      }
    }
    // Preserve our discrepancy by choosing the best slice
    for (const child of best) {
      const v = visited.get(child.key);
      // Track how many of our children our actually COMPLETE, as if they all are and we're visiting
      // all of our children than we can mark this node as COMPLETE
      if (v === Status.COMPLETE) {
        complete++;
      } else {
        // In this case, we need to explore the child even if it is PARTIAL visited as we now have
        // discrepancies to spare which would cause us to explore into the other slices
        const result = probe(child, B, discrepancies, visited, path.slice(), cutoff, prescient);
        if (result) return result;
      }
    }
    // If the slice actually encompassed all children and they were all COMPLETE we can mark
    // this node as COMPLETE
    if (complete === num) {
      visited.set(node.key, Status.COMPLETE);
    }
  }

  return undefined;
}
