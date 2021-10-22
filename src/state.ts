import {ARCHFIEND, DATA, Type, Location} from './data';
import {Ids, ID, DeckID, FieldID} from './ids';
import {Random} from './random';
import {bestFirstSearch, bulbSearch, SearchResult} from './search';
import deckJSON from './deck.json';
import WEIGHTS from './weights.json';

const DECK: {[name: string]: number} = deckJSON;

// Used to enable state verification sanity checking which has a large impact on performance.
// NOTE: set DEBUG to anything, even false and it will be turn on verification (!!'false')
const DEBUG = !!process.env.DEBUG;

// An 'immutable' State. State follows somewhat of a builder pattern, and once it is built it can be
// turned into an IState. Because the `state` is no longer being mutated we can cache the `score`
// and the toString representation in `key` to avoid work during search (ie. Schwartzian transform)
export interface IState {
  key: string;
  state: Readonly<State>;
  score: number;
}

// The core game State. As mentioned above, this class is usually used in a pseudo-builder pattern
// where handlers clone a State object, mutate it, and then 'freeze' it as an immutable IState.
// State contains all the fields required for Library FTK (though note this is obviously not a
// sufficient encapsulation of general-purpose Yu-Gi-Oh! duel state). The most glaring difference
// (besides only tracking data for one player and not supporting phases) is that the hand,
// Graveyard, banished zone, Monster Zones and Spell & Trap Zones are all sorted - in regular
// Yu-Gi-Oh! the exact location of a card in a zone can be relevant, but in the limited subset of
// Yu-Gi-Oh! required to simulate the Library FTK we only care about precise zones with respect to
// the two Equip Spells (and in that case it only actually matters in the case of Tribute Summoning)
// and we handle this with the addition of data on the ID and special cases adding/removing
// monsters.
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

  // Summons the monster id. This is a simple wrapper around madd which handles also updateing the
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
    const bottom = this.deck[0];

    if (this.reversed) {
      if (!quiz) return top;
      if (ID.known(bottom)) return bottom;
    } else {
      if (ID.known(top)) return top;
    }

    const unknown = new Set<ID>();
    const types = new Set<Type>();

    for (const id of this.deck) {
      // Could technically have known cards are the bottom which would still allow us to determine the card
      if (ID.known(id)) continue;

      const card = ID.decode(id);
      unknown.add(card.id);
      types.add(card.type);

      if (!quiz && unknown.size > 1) return undefined;
      if (quiz && (unknown.size > 1 && types.size > 1)) return undefined;
    }

    return (quiz && this.reversed) ? bottom : top;
  }

  // Search for path from this state to the win condition. The cutoff should pretty much always be
  // set to limit the number of states visited as pathological trees would likely result in an OOM.
  // If width > 0 is specified then a BULB search will be performed instead of a best-first search -
  // BULB search usually is slightly slower but produces slightly better paths and increased success
  // rates, though performance is very much dependent on thw width and shape of the given tree.
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
        const trace = state.trace ? `\n${state.trace.join('\n')}\n` : '';
        throw new Error(`INVALID STATE ${key}:\n\n${errors.join('\n')}${trace}`);
      }
    }
  }

  // prescient determines whether or not the search should be allowed to "Fail to find" Thunder
  // Dragon and Toon Table of Contents searches when the top card is not known - no human player
  // would ever do this, but because the search is effectively allowed to 'peek' ahead to evaluate
  // the result of its action it can potentially leverage the searches to get a more favorable draw.
  // Similarly, it removes the possibility of causing a shuffle after stacking the deck, which
  // someone not trying to influence the unknowable RNG would never do.
  // BUG: Technically this still allows for prescience by stacking the deck while the deck is
  // reversed. To avoid this we would need to add additional data to flag whether a card is known
  // from stacking vs. being reversed, but in practice this is not too problematic a loophole.
  allowed(prescient: boolean, fail = false) {
    if (prescient || this.reversed || !this.deck.length) return true;
    return !fail && !ID.known(this.deck[this.deck.length - 1]);
  }

  // Compute all unique and relevant states that can be transitioned to from this state. In addition
  // to removing symmetrical states, next() also eliminates the possibility for states with set
  // Spell cards where it would not be advantageous to do so. This optimization means the
  // pedantically all unique states are not representable, but correctness-wise all states which
  // could lead to a solution are. See the comment on RELOAD in data.ts for more information.
  next(prescient = true) {
    if (this.lifepoints <= 0) return [];
    const next = new Map<string, IState>();

    // The only thing actionable on Monster cards is counters on Royal Magical Library. Note we
    // don't dedupe removing counters from multiple libraries due to Equips potentially making
    // things different (State.transition will dedupe if possible anyway)
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
      // Reversal Quiz can *never* lead to a win in single-turn setups so is a waste to explore
      // TODO: allow for exploring Reversal Quiz in multi-turn
      if (card.id === Ids.ReversalQuiz) continue;
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
      if (id === Ids.ReversalQuiz) {
        // Reversal Quiz can *never* lead to a win in single-turn setups so is a waste to explore
        // TODO: allow for exploring Reversal Quiz in multi-turn
        continue;
      } else if (id === Ids.ThunderDragon && this.deck.length) {
        if (this.allowed(prescient)) {
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
          } else if (this.allowed(prescient, true)) {
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

  // We primarily sort by each State's score, though fallback on lifepoints (getting down to < 500
  // LP is important for our win condition), deck length and whether the top card is known (helps
  // reduce uncertainty about the deck state which is also required for our win condition).
  //
  // Ideally we would be able to incorporate all these tiebreakers directly into score such that we
  // could rank order states regardless of where they appear in the tree (this would then allow us
  // to do informed as opposed to chronological or discrepancy based backtracking), but its very
  // difficult to come up with that type of metric.
  static compare(a: IState, b: IState) {
    return (b.score - a.score ||
    a.state.lifepoints - b.state.lifepoints ||
    a.state.deck.length - b.state.deck.length ||
    (+ID.known(b.state.deck[b.state.deck.length - 1]) -
      +ID.known(a.state.deck[a.state.deck.length - 1])) ||
    +b.state.reversed - +a.state.reversed);
  }

  // Scoring function used to differentiate states among its siblings. At a high level:
  //
  //  - track the number of Royal Magical Library cards increase the score if we have spells that
  //    can add counters to them
  //  - score cards based on their current location and custom scoring functions (which should
  //    usually return 0 if the card cannot be played). Further dock points from facedown spell
  //    cards as they clog zones and can't be used for discards.
  //
  // Ultimately we want to encourage states that get us nearer to our win condition which involves
  // spending lifepoints and drawing cards, so we are roughly trying to use score to capture the
  // idea of 'draw potential'. The main difficulty is trying to capture the 'potential' aspect -
  // calculating immediate draw potential/playability for the next turn is decently straightforward,
  // but we want the score to also capture generic 'value' throughout the game (this is why a
  // summoned/summonable Royal Magical Library is given the highest score - whether or not it can
  // currently have counters added to it is less important than the potential for it to be used as a
  // draw engine throughout the game as a force multiplier to the rest of our cards).
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
      libraries.active * WEIGHTS.libraries[1] + libraries.total * WEIGHTS.libraries[0];
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

  // Determine whether the win condition is acheivable from the current state. Somewhat confusingly
  // this doesn't determine whether the current state is terminal, just whether a terminal state
  // *can* be acheived via a short sequence of actions. This distinction is important as the search
  // would otherwise spend a large amount of time near the leaf nodes trying to stumble upon the
  // correct sequence of plays to win - instead we perform a very limited lookahead/unrolling to
  // guide the search. NOTE: if this function does find a path to victory it will clobber the
  // existing state in order to produce the correct trace. We don't really care about state being
  // preserved at this point as we only care about securing a path to victory, though this means we
  // may "jump" several actions ahead at the end once a path becomes clear.
  //
  // For our win condition we obviously need < 500 LP to ensure once the Reversal Quiz swap occurs
  // the Black Pendant can burn our opponent to end the game, but we also need to at least have one
  // monster (to equip the pendant to) and at least one card in our deck (to be able to reveal with
  // Reversal Quiz) that we also happen to know the type of. We then track whether we have the Black
  // Pendant and Reversal Quiz in our hand or on the field, and that we have sufficient Spell & Trap
  // Zones to play the cards in (if they're not already face-down on the field).
  //
  // In addition to this straightforward win condition we also have logic for using A Feather of the
  // Phoenix to secure a missing piece of the win condition. This is essentially an extra step of
  // lookahead for a scenario that often comes up and which can drastically cut down on path length.
  // The search can already handle using Spell Reproduction to recover a missing piece much more
  // easily as the Spell gets added directly to the hand as opposed to having to stack the deck and
  // then draw it.
  end(lookahead = true) {
    if (this.lifepoints > 500) return false;
    if (!this.monsters.length || !this.deck.length) return false;
    const known = this.known(true);
    if (!known) return false;

    const hand = {pendant: false, quiz: false, feather: -1, upstart: -1};
    let discard = -1;
    for (let i = 0; i < this.hand.length; i++) {
      const id = this.hand[i];
      if (id === Ids.BlackPendant) {
        hand.pendant = true;
      } else if (id === Ids.ReversalQuiz) {
        hand.quiz = true;
      } else if (id === Ids.AFeatherOfThePhoenix) {
        hand.feather = i;
      } else if (id === Ids.UpstartGoblin) {
        hand.upstart = i;
      } else {
        discard = i;
      }
    }
    if (hand.pendant && hand.quiz && this.spells.length <= 3) {
      return this.win(known, true, {pendant: false, quiz: false});
    }

    let equip = true;
    const spells = {pendant: false, quiz: false, feather: -1, upstart: -1};
    for (let i = 0; i < this.spells.length; i++) {
      const id = ID.id(this.spells[i]);
      if (id === Ids.BlackPendant) {
        spells.pendant = true;
        if (!ID.facedown(id)) equip = false;
      } else if (id === Ids.ReversalQuiz) {
        spells.quiz = true;
      } else if (id === Ids.AFeatherOfThePhoenix) {
        spells.feather = i;
      } else if (id === Ids.UpstartGoblin) {
        spells.upstart = i;
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

    if (!lookahead) return false;

    // If we have one piece of the win condition AND A Feather of the Phoenix we can possibly
    // recover the missing piece if its in the Graveyard AND we have zones (0-2 required) AND draw
    // power. This is effectively performing a narrow one-turn "lookahead" - this is somewhat
    // expensive but given we're so close to the win condition its worth doing extra work to try to
    // terminate quicker. NOTE: Archfiend's Oath isn't sufficient as draw power here before we're
    // already under 500 LP, and Graceful Charity/Pot of Greed complicate things because drawing too
    // deep can effect the known card for Reversal Quiz (consider the case where the card was only
    // known because it was previously stacked from another A Feather of the Phoenix).
    if (!(hand.pendant || spells.pendant || hand.quiz || spells.quiz)) return false;
    // Technically we could have multiple A Feather of the Phoenix (including one on hand and
    // field), meaning we are being overly conservative here with the amount of zones we need and
    // having another card for the discard card.
    if (!(discard >= 0 && (hand.feather >= 0 || spells.feather >= 0))) return false;
    if (this.spells.length > 5 - ((+hand.pendant + +hand.quiz) + +(hand.feather >= 0))) return false;

    const hid = this.hand[discard];
    const gid = (hand.pendant || spells.pendant) ? Ids.ReversalQuiz : Ids.BlackPendant;
    const k = this.graveyard.indexOf(gid);
    if (k < 0) return false;

    if ((hand.upstart >= 0 || spells.upstart >= 0)) {
      if (hand.feather >= 0) {
        this.feather('hand', hand.feather, hid, gid, discard, k);
      } else {
        this.feather('spells', spells.feather, hid, gid, discard, k);
      }

      if (hand.upstart >= 0) {
        this.remove('hand', (hand.feather >= 0 && hand.feather < hand.upstart) ? hand.upstart - 1 : hand.upstart);
        this.major('Activate "Upstart Goblin"');
      } else {
        this.remove('spells', (spells.feather >= 0 && spells.feather < spells.upstart) ? spells.upstart - 1 : spells.upstart);
        this.major('Activate face-down "Upstart Goblin"');
      }
      this.add('graveyard', Ids.UpstartGoblin);
      this.draw();
      this.inc();

      return this.win(known, equip, {pendant: spells.pendant, quiz: spells.quiz});
    }

    for (let i = 0; i < this.monsters.length; i++) {
      const id = ID.id(this.monsters[i]);
      // Since we will be playing A Feather of the Phoenix we only need a Library with 2 counters.
      // TODO: we actually only need 1 counter if Black Pendant is face down...
      if (id === Ids.RoyalMagicalLibrary && ID.data(this.monsters[i]) >= 2) {
        if (hand.feather >= 0) {
          this.feather('hand', hand.feather, hid, gid, discard, k);
        } else {
          this.feather('spells', spells.feather, hid, gid, discard, k);
        }
        this.major('Remove 3 Spell Counters from "Royal Magical Library"');
        this.mclear(i);
        this.draw();
        return this.win(known, equip, {pendant: spells.pendant, quiz: spells.quiz});
      }
    }

    return false;
  }

  // Add description of the winning path to the trace without caring about making sure we properly
  // update State (the search is done, it doesn't matter to us what the terminal State looks like)
  win(known: DeckID, equip: boolean, facedown: {pendant: boolean; quiz: boolean}) {
    if (equip) {
      const monster = ID.decode(this.monsters[0]);
      this.major(`${facedown.pendant ? 'Flip face-down "Black Pendant" and equip' : 'Equip "Black Pendant"'}  to "${monster.name}"`);
    }
    this.major(`Activate${facedown.quiz ? ' face-down' : ''} "Reversal Quiz"`);
    // Filter out Reversal Quiz from the messages about what gets sent to the Graveyard
    const fn = (id: ID | FieldID | DeckID) => ID.id(id) !== Ids.ReversalQuiz;
    const hand = this.hand.filter(fn);
    if (hand.length) {
      this.minor(`Send ${ID.names(hand)} from hand to Graveyard`);
    }
    const monsters = this.monsters.filter(fn);
    const spells = this.spells.filter(fn);
    if (monsters.length || spells.length) {
      this.minor(`Send ${ID.names([...monsters, ...spells])} from field to Graveyard`);
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

  // Actually active A Feather of the Phoenix at i from location, discarding the hid at j in the
  // hand to return the gid at k in the graveyard.
  feather(location: 'hand' | 'spells', i: number, hid: ID, gid: ID, j: number, k: number) {
    this.major(`Activate${location === 'spells' ? ' face-down' : ''} "A Feather of the Phoenix"`);
    this.minor(`Discard "${ID.decode(hid).name}"`);
    this.minor(`Return "${ID.decode(gid).name}" in the Graveyard to the top of the Deck`);
    this.remove('graveyard', k);
    if (location === 'hand') {
      this.discard(i < j ? [i, j] : [j, i]);
    } else {
      this.remove(location, i);
      this.add('graveyard', Ids.AFeatherOfThePhoenix);
      this.add('graveyard', this.remove('hand', j));
    }
    this.deck.push(`(${gid})` as DeckID);
    this.inc();
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
    if (this.reversed && this.deck.length && !ID.known(this.deck[this.deck.length - 1])) {
      this.deck[this.deck.length - 1] = `(${this.deck[this.deck.length - 1]})` as DeckID;
    }
    if (initial) {
      this.major(`Opening hand contains ${ID.names(ids.sort())}`);
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
      (this.trace === s.trace ||
        (this.trace && s.trace && equals(this.trace, s.trace))));
  }

  toString() {
    // Using `join` here on an array instead of using a template string or string concatenation
    // is deliberate as it results in V8 creating a flat string instead of a cons-string, the
    // latter of which results in significantly higher memory usage. This is a V8 implementation
    // detail and the approach to forcing a flattened string to be created may change over time.
    // https://gist.github.com/mraleph/3397008
    return [this.random.seed, this.lifepoints, this.turn, +this.summoned,
      this.monsters.join(''), this.spells.join(''), this.hand.join(''),
      this.banished.join(''), this.graveyard.join(''), this.deck.join(''),
      +this.reversed].join('|');
  }

  // Decodes State which was encoded from State.toString (dropping trace)
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
      errors.push(`Mismatch: ${start.length} (${start.join('')}) vs. ${now.length} (${now.join('')})\n`);
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
