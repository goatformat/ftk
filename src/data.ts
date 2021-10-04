import {Ids, ID, DeckID, FieldID} from './ids';
import {State, IState} from './state';

// Type/SubType/Attribute are pruned to just the values used by Library FTK
// (also note that all monster cards in the deck are actually Effect Monsters)
export type Type = 'Monster' | 'Spell';
export type SubType = 'Continuous' | 'Equip' | 'Normal' | 'Quick-Play';
export type Attribute = 'Dark' | 'Light';

// The relevant areas of the field in question (the Fusion Deck and Field Spell Zone are unused)
export type Location = 'monsters' | 'spells' | 'hand' | 'banished' | 'graveyard' | 'deck';

// Data contains basic data about each card as well as housing the main handler function which
// determines which additional states can be transitioned to by playing said card. The play function
// is passed a reference to the current state, whether the card is being played from the hand or
// whether it is being activated from the Spell & Trap Zone, the index of where the card is within
// its location, the transition map of subsequent states and a reference to the card itself.
// Handlers are expected to add all legal transition states to the map, though may elide states
// which are redundant (eg. due to symmetry) as a performance optimization.
export type Data = {
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

export const ARCHFIEND: Data['play'] = (state, location, i, next, card) => {
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
      if (!state.graveyard.length || state.monsters.length > 4 || state.lifepoints <= 800) return 0;
      let max = 0;
      for (const id of state.graveyard) {
        const target = ID.decode(id);
        if (target.type !== 'Monster') continue;
        max = Math.max(max, target.score(state, 'monsters', target.id));
      }
      return 1 + max;
    },
    play(state, location, i, next, card) {
      if (!state.graveyard.length || state.monsters.length > 4 || state.lifepoints <= 800) return;
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

export const DATA: Record<ID, Card> = {};
for (const name in CARDS) {
  const card = CARDS[name];
  const score = 'can' in card
    ? (s: Readonly<State>, loc: 'hand' | 'spells' | 'monsters') => +card.can(s, loc)
    : () => 0;
  DATA[card.id] = {score, ...card, name};
}

// Basic k-subset function required by Graceful Charity and Spell Reproduction to determine
// discard targets (though they use the isubsets method below for further deduping). This is also
// called several times by Reload / Card Destruction to determine possible sets before activation -
// in that case a more generic subsets function instead of a k-subsets function would probably
// improve performance.
function subsets<T>(s: T[], k: number): T[][] {
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
}

// Instead of subsets of an array we actually want (a) the unique subsets and (b) the *indices* of
// such unique subsets. This function doesn't quite accomplish the former: 2-subsets of [A, A, B, B]
// will still return [0, 1], [0, 2], [1, 2], [2, 3] instead of [0, 1], [1, 2], [2, 3], though these
// redundant subsets can be deduped by the higher level symmetry detection mechanisms.
function isubsets<T>(s: T[], k: number): number[][] {
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
