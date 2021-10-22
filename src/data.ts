import {Ids, ID, DeckID, FieldID} from './ids';
import {State, IState} from './state';
import WEIGHTS from './weights.json';

// Type/SubType/Attribute are pruned to just the values used by Library FTK
// (also note that all monster cards in the deck are actually Effect Monsters)
export type Type = 'Monster' | 'Spell';
export type SubType = 'Continuous' | 'Equip' | 'Normal' | 'Quick-Play';
export type Attribute = 'Dark' | 'Light';

// The relevant areas of the field in question (the Fusion Deck and Field Spell Zone are unused)
export type Location = 'monsters' | 'spells' | 'hand' | 'banished' | 'graveyard' | 'deck';

// Data contains basic data about each card as well as housing the main handler function which
// determines which additional states can be transitioned to by playing said card. The `play`
// function is passed a reference to the current state, whether the card is being played from the
// hand or whether it is being activated from the Spell & Trap Zone, the index of where the card is
// within its location, the transition map of subsequent states and a reference to the card itself.
// Handlers are expected to add all legal transition states to the map, though may elide states
// which are redundant (eg. due to symmetry) as a performance optimization. The `can` function
// returns true if the card is able to be played from the location given the current state, and the
// `score` function allows cards to have a custom score to inform the heuristic search algorithm
// based on the current state.
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

// The Level 4 and lower Monsters all have the same activation. Note tributing Thunder Dragon or
// setting Cyber Jar face-down/flipping it are handled elsewhere. Only face-up Attack Position and
// face-down Defense Position are supported by the protocol - while Level Limit - Area B changes all
// Monsters to Defense Position this makes no meaningful difference on whether or not we can achieve
// the FTK (though obviously makes a large difference for protection in multi-turn scenarios).
const MONSTER: Data['play'] = (state, location, i, next, card) => {
  const s = state.clone();
  s.remove(location, i);
  s.major(`Summon "${card.name}" in Attack Position`);
  s.summon(card.id);
  State.transition(next, s);
};

// Basic Spell activations all follow the same pattern, differing only in their effect fn.
const SPELL: (fn?: (s: State) => void) => Data['play'] = (fn?: (s: State) => void) =>
  (state, location, i, next, card) => {
    // We're avoiding doing `'can' in card` here because this is a hot function and its safe.
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

// Actually activating Archfiend's Oath's *effect* is different than simply playing Archfiend's
// Oath and can happen when you play the card or separately. There are also two difference scenarios
// to cover - we either know the top-card of the deck and thus are paying the cost to be able to
// draw the card, or we don't know the top-card and we are simply paying to help us reach the win
// condition and to deck thin.
// TODO: support probabilisitcally "guessing" the top card.
export const ARCHFIEND: Data['play'] = (state, location, i, next, card) => {
  // We know Archfiend's Oath has a can function so this case is safe.
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

// Reload (and Card Destruction) requires that we have at least one card other than ourselves in our
// hand and the same number we would be reloading for in our deck.
const CAN_RELOAD = (state: State, location: 'hand' | 'spells' | 'monsters') => {
  const h = (location === 'hand' ? 1 : 0);
  return state.hand.length > h && state.deck.length >= state.hand.length - h;
};

// Both Reversal Quiz and tributing Thunder Dragon can potentially proc Sangan's search effect.
const SANGAN = (s: State, next: Map<string, IState>, prescient: boolean) => {
  if (!s.allowed(prescient)) return;
  const targets = new Set<ID>();
  for (let j = 0; j < s.deck.length; j++) {
    const id = ID.id(s.deck[j]);
    if (targets.has(id)) continue;
    const card = ID.decode(id);
    if (card.type === 'Monster' && card.atk <= 1500) {
      const t = s.clone();
      t.minor(`Add "${ID.decode(id).name}" from Deck to hand after "Sangan" was sent to the Graveyard`);
      t.add('hand', ID.id(t.deck.splice(j, 1)[0]));
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
};

// Reload / Card Destruction are handled a little bit unusually here. In Yu-Gi-Oh!, Spell cards may
// be set before being played, but in the context of this simulation setting Spell cards serves only
// to increase the depth and width of our game tree. One optimization is to only allow for setting
// Spell cards if Reload or Card Destruction are Set or in the hand (as the only time it is
// advantageous to have a card Set as opposed to in the hand where it can be more readily used as a
// resource is to avoid them being reloaded/discarded by these two cards), however an even better
// optimization is to simply defer actually setting any cards until one of these two cards are
// activated. This has several benefits - superficially it makes for more realistic traces, but more
// importantly it dramatically cuts down on tree depth and allows a better informed decision to be
// made as all combinations of set cards can be evaluated at the same time to figure out which is
// most optimal. One downside is that generating subsets is expensive and this has the potential to
// create very wide and heterogenous nodes (which can cause the same problems as Different Dimension
// Capsule), though ultimately results in about a 5%+ reduction in exhaustion and increase in overall
// success rate.
const RELOAD: (fn: (s: State, check?: boolean) => void, check?: boolean) => Data['play'] =
  (fn: (s: State) => void, check?: boolean) => (state, location, i, next, card, prescient) => {
    if (!CAN_RELOAD(state, location)) return;
    if (check && !state.allowed(prescient)) return;

    const d = state.clone();
    d.remove(location, i);
    d.add('graveyard', card.id);

    // We can only set at most max cards before reloading, dependent on open zones and hand size
    const hand = d.hand.filter(id => ID.decode(id).type === 'Spell');
    const h = (location === 'hand' ? 1 : 0);
    const max = Math.min(5 - state.spells.length - h, hand.length, d.hand.length - 1);
    for (let n = 1; n <= max; n++) {
      for (const set of isubsets(d.hand, n, id => ID.decode(id).type === 'Spell')) {
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

// Sigh, JS defaults to sorting arrays of numbers alphabetically because logic.
const CMP = (a: number, b: number) => a - b;

export const DATA: { [name: string]: Data } = {
  'A Feather of the Phoenix': {
    id: Ids.AFeatherOfThePhoenix,
    type: 'Spell',
    subType: 'Normal',
    text: 'Discard 1 card, then target 1 card in your Graveyard; return that target to the top of your Deck.',
    can(state, location) {
      return !!(state.graveyard.length && (state.hand.length >= (location === 'hand' ? 2 : 1)));
    },
    play(state, location, i, next) {
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
          // A Feather of the Phoenix gets privileged logic due to lookahead in the win condition
          s.feather(location, i, hid, gid, j, k);
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
      return WEIGHTS['Archfiend\'s Oath'][+(this.can(state, location) && !ID.data(id))];
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
    score: s => WEIGHTS['Convulsion of Nature'][+(s.deck.length && !s.reversed)],
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
    score: (state, location) => WEIGHTS['Cyber Jar'][+!(state.summoned || location === 'hand')],
    // TODO: handle flipping Cyber Jar in multi-turn scenarios
    play: MONSTER,
  },
  'Different Dimension Capsule': {
    id: Ids.DifferentDimensionCapsule,
    type: 'Spell',
    subType: 'Normal',
    text: 'After this card\'s activation, it remains on the field. When this card is activated: Banish 1 card from your Deck, face-down. During your second Standby Phase after this card\'s activation, destroy this card, and if you do, add that card to the hand.',
    can: s => !!s.deck.length,
    // TODO: support having the card actually return by adding counters to it on the field each turn
    play(state, location, i, next, card, prescient) {
      if (!state.allowed(prescient)) return;
      const targets = new Set<DeckID>();
      for (let j = 0; j < state.deck.length; j++) {
        const id = state.deck[j];
        if (targets.has(id)) continue;
        const s = state.clone();
        s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
        s.remove(location, i);
        s.add('spells', `${card.id}${state.turn}` as FieldID);
        s.minor(`Banish ${ID.decode(s.deck[j]).name} from the deck face-down`);
        // In this deck, all banishing is face-down banished, so the (ID) notation merely indicates
        // that the card could possibly return from play if Different Dimension Capsule actually
        // resolves. Reversal Quiz / Heavy Storm / Giant Trunade which prevent Different Dimension
        // Capsule from resolving are responsible for clearing this data, resulting in the card
        // being banished for good.
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
    play: SPELL(s => {
      // NOTE: The active Giant Trunade card has already been removed from hand/field
      for (const id of s.spells) {
        const card = ID.decode(id);
        s.add('hand', card.id);
        if (ID.facedown(id)) continue;
        // We need to revert the effects of any Convulsion of Nature / Different Dimension Capsule
        // cards that may be on the field.
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
    can: (_, loc) => loc !== 'spells',
    play: SPELL(),
  },
  'Pot of Greed': {
    id: Ids.PotOfGreed,
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 2 cards.',
    can: s => s.deck.length >= 2,
    play: SPELL(s => s.draw(2)),
  },
  'Premature Burial': {
    id: Ids.PrematureBurial,
    type: 'Spell',
    subType: 'Equip',
    text: 'Activate this card by paying 800 Life Points, then target 1 monster in your Graveyard; Special Summon that target in Attack Position and equip it with this card. When this card is destroyed, destroy the equipped monster.',
    can(state) {
      if (!state.graveyard.length || state.monsters.length > 4 || state.lifepoints <= 800) return false;
      for (const id of state.graveyard) {
        const target = ID.decode(id);
        if (target.type === 'Monster') return true;
      }
      return false;
    },
    score(state) {
      if (!state.graveyard.length || state.monsters.length > 4 || state.lifepoints <= 800) return WEIGHTS['Premature Burial'][0];
      let max = 0;
      for (const id of state.graveyard) {
        const target = ID.decode(id);
        if (target.type !== 'Monster') continue;
        max = Math.max(max, target.score(state, 'monsters', target.id));
      }
      return WEIGHTS['Premature Burial'][1] + max;
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
    play: SPELL(s => {
      // NOTE: The active Heavy Storm card has already been removed from hand/field
      for (const id of s.spells) {
        const card = ID.decode(id);
        s.add('graveyard', card.id);
        if (ID.facedown(id)) continue;
        // We need to revert the effects of any Convulsion of Nature / Different Dimension Capsule
        // cards that may be on the field, and also deal with destroyed monsters with Premature
        // Burial equipped (and properly fixing up equip indices and pointers after Black Pendant)
        if (card.id === Ids.ConvulsionOfNature) {
          s.reverse(true);
        } else if (card.id === Ids.BlackPendant) {
          s.mclear(ID.data(id));
        } else if (card.id === Ids.PrematureBurial) {
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
    }, true),
  },
  'Reversal Quiz': {
    id: Ids.ReversalQuiz,
    type: 'Spell',
    subType: 'Normal',
    text: 'Send all cards from your hand and your field to the Graveyard, then call Spell, Trap, or Monster; reveal the top card of your Deck. If you called it right, both players exchange Life Points.',
    can: s => !!(s.deck.length && (s.monsters.length || s.spells.length || s.hand.length)),
    // State.end() already checks for using Reversal Quiz as the win condition, but Reversal Quiz
    // also has a niche use that will probably never actually be relevant where it clears the field
    // and procs Sangan. Because this ends up wiping out so many resources it will pretty much
    // always sort to the very end of any transition set that includes it, but for completeness it
    // needs to be supported.
    // NOTE: we are not supporting the case where we actually guess correctly prematurely
    play(state, location, _, next, self, prescient) {
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

      const reveal = s.deck[s.deck.length - 1];
      if (!ID.known(reveal)) s.deck[s.deck.length - 1] = `(${reveal})` as DeckID;
      s.minor(`Call "Trap", reveal "${ID.decode(reveal).name}"`);

      if (sangan) {
        SANGAN(s, next, prescient);
      } else {
        State.transition(next, s);
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
    // It is hard to know how to score this, but it's pretty much always the case that having a
    // Library in the Monster Zone is hugely beneficial and even having it in the hand is useful to
    // then be able to discard it (and bring it back via Premature Burial).
    score: (_, location) => WEIGHTS['Royal Magical Library'][+(location === 'monsters')],
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
    // Should be very low - the score should reflect that ultimately it is incredibly unlikely to
    // proc Sangan and then actually get the Royal Magical Library target onto the field.
    score: (state, location) => WEIGHTS['Sangan'][+!(state.summoned || location === 'hand')],
    // NOTE: graveyard effect is handled in Thunder Dragon/Reversal Quiz
    play: MONSTER,
  },
  'Spell Reproduction': {
    id: Ids.SpellReproduction,
    type: 'Spell',
    subType: 'Normal',
    text: 'Send 2 Spells from your hand to the Graveyard, then target 1 Spell in your Graveyard; add it to your hand.',
    can(state, location) {
      const graveyard = state.graveyard.filter(id => ID.decode(id).type === 'Spell').length;
      const hand = state.hand.filter(id => ID.decode(id).type === 'Spell').length > (location === 'hand' ? 2 : 1);
      return !!(graveyard && hand);
    },
    // FIXME: for some reason using the default +this.can ruins the heuristic
    score(state, location) {
      return WEIGHTS['Spell Reproduction'][+!!(state.graveyard.length && state.hand.length > (location === 'hand' ? 2 : 1))];
    },
    play(state, location, i, next, card) {
      if (!(state.graveyard.length && state.hand.length > (location === 'hand' ? 2 : 1))) return;

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
              s.discard([i, j, k].sort(CMP));
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
    // Thunder Dragon isn't really worth anything on the field (it can indirectly proc Sangan but
    // getting value out of that is even more convoluted than the Reversal Quiz Sangan proc
    // scenario) and thus purely is useful as discard fodder / deck thinning / manipulating the deck
    score: (state, location) => WEIGHTS['Thunder Dragon'][+(state.deck.length && location === 'hand')],
    // NOTE: discard effect handled directly in State#next
    play(state, _, i, next, self, prescient) {
      for (let j = 0; j < state.monsters.length; j++) {
        const s = state.clone();
        const target = ID.decode(state.monsters[j]);
        s.major(`Tribute "${target.name}" to Summon "${self.name}"`);
        // Tributing is incidentally the only thing that makes us keep track of where equip cards
        // are assigned, as otherwise we could always just say they are associated with the monster
        // in the first Zone.
        s.tribute(j, i);
        if (target.id === Ids.Sangan) {
          SANGAN(s, next, prescient);
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
      if (!state.allowed(prescient)) return;
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
        if (state.allowed(prescient, true)) {
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

// Convert the raw card Data into Cards
export const CARDS: Record<ID, Card> = {};
for (const name in DATA) {
  const card = DATA[name];
  const score = 'can' in card
    ? (s: Readonly<State>, loc: 'hand' | 'spells' | 'monsters') => ((WEIGHTS as any)[name])[+card.can(s, loc)]
    : () => 0;
  CARDS[card.id] = {score, ...card, name};
}

// Basic k-subset function required by Graceful Charity and Spell Reproduction to determine
// discard targets (though they use the isubsets method below for further deduping). This is also
// called several times by Reload / Card Destruction to determine possible sets before activation.
// TODO: a more generic subsets function instead of a k-subsets function would probably
// improve performance of Reload / Card Destruction.
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
function isubsets<T>(s: T[], k: number, filter?: (t: T) => boolean): number[][] {
  // NOTE: this still potentially returns redundant subsets
  const unique = new Map<T, number>();
  const is: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (filter && !filter(s[i])) continue;
    const u = unique.get(s[i]);
    if (u && u >= k) continue;
    unique.set(s[i], (u || 0) + 1);
    is.push(i);
  }
  return subsets(is, k);
}
