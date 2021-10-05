import './ui.css';

import * as workerpool from 'workerpool';
import assert from 'assert';
import {State, Random, ID, DeckID, Card, FieldID, Location, Ids} from '../../src';
import {renderState} from './common';

const num = (window.location.hash && +window.location.hash.slice(1)) ||
  (window.location.search && +window.location.search.slice(1)) || 1;
const RANDOM = new Random(Random.seed(num));
const STATE = State.create(new Random(Random.seed(num)));
// STATE.madd('L3' as FieldID); // DEBUG
// STATE.madd('S' as FieldID); // DEBUG
const BANISHED: DeckID[] = [];
const GRAVEYARD: ID[] = [];

function SPELL(fn?: (s: State) => void) {
  return (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    s.remove(location, i);
    s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
    if (card.type === 'Spell' && card.subType === 'Continuous') {
      s.add('spells', card.id);
    } else {
      s.add('graveyard', card.id);
    }
    if (fn) fn(s);
    s.inc();
  };
}

export const HANDLERS: { [name: string]: any } = {
  'A Feather of the Phoenix': {
  },
  'Archfiend\'s Oath': {
  },
  'Black Pendant': {
  },
  'Card Destruction': {
  },
  'Convulsion of Nature': SPELL(s => s.reverse()),
  'Different Dimension Capsule': {
  },
  'Giant Trunade': SPELL(s => {
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
  'Graceful Charity': {
  },
  'Level Limit - Area B': SPELL(),
  'Pot of Greed': SPELL(s => s.draw(2)),
  'Premature Burial': {
  },
  'Heavy Storm': SPELL(s => {
    for (const id of s.spells) {
      const card = ID.decode(id);
      s.add('graveyard', card.id);
      if (ID.facedown(id)) continue;
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
  'Reload': {
  },
  'Reversal Quiz': {
    // TODO call, sangan search
  },
  'Spell Reproduction': {
    // does nothing unless condition is passed (2+ in hand, 1+ in grave)
    // if only one option does that one option, otherwise fades out invalid options and lets choose
    // progress to state with choice = want to restruction index.ts to pass in choices instead!
  },
  'Toon Table of Contents': {
  },
  'Toon World': SPELL(s => {
    s.minor(`Pay 1000 LP (${s.lifepoints} -> ${s.lifepoints - 1000})`);
    s.lifepoints -= 1000;
  }),
  'Upstart Goblin': SPELL(s => s.draw()),
};

// target = highlight valid targets
// discard = highlight valid discards / grey out invalid


// on click, change border
//


type Action = 'play' | 'discard' | 'target' | 'search';

const CONTROL: {
  action: Action,
  origin?: {e: HTMLElement, location: Location, id: FieldID, i: number},
} = {
  action: 'play',
  origin: undefined,
};

function update(transform?: (e: HTMLElement, location: Location, id: FieldID, i: number) => void) {
  const $content = document.getElementById('content')!;
  if ($content.children[0]) $content.removeChild($content.children[0]);
  $content.appendChild(renderState(STATE, BANISHED, GRAVEYARD, handler, transform));
}

function handler(e: HTMLElement, location: Location, id: FieldID, i: number) {
  const action = CONTROL.action;
  console.log(action, e, location, id, i); // DEBUG

  switch (location) {
  case 'banished': return;
  case 'graveyard': {
    if (action !== 'search') return;
    return; // TODO
  }
  case 'deck': {
    if (!(action === 'search' || action === 'target')) return;
    return; // TODO
  }
  case 'monsters': {
    const card = ID.decode(id);
    if (action === 'target') {
      return; // TODO
    } else if (card.id === Ids.RoyalMagicalLibrary) {
      assert(action === 'play');
      if (ID.facedown(id) || ID.data(id) !== 3 || !STATE.deck.length) return;
      STATE.major(`Remove 3 Spell Counters from "${card.name}"`);
      STATE.mclear(i);
      STATE.draw();
      return update();
    }

    return; // TODO
  }
  case 'spells': {
    const card = ID.decode(id);
    assert(card.type === 'Spell');
    if (!card.can(STATE, location)) return;
    // FIXME play

    return; // TODO
  }
  case 'hand': {
    if (action === 'play') {
      const card = ID.decode(id);
      if (card.id === Ids.ThunderDragon) {
        if (STATE.monsters.length && STATE.monsters.length < 5 && !STATE.summoned) {
          CONTROL.action = 'target';
          CONTROL.origin = {e, location, id, i};
          update((e, loc, __, j) => {
            if (loc === 'spells' ) {
              e.classList.add('disabled');
            } else if (loc === 'hand') {
              e.classList.add(i === j ? 'selected' : 'disabled');
            }
          });




          // TODO handle Sangan
          if (STATE.monsters.length === 1) {

          } else {
            // FIXME select tribute
          }
        } else {
          // cant summon, must discard
        }
      } else if (card.type === 'Monster') {
        if (STATE.monsters.length >= 5 || STATE.summoned) return;
        STATE.remove(location, i);
        STATE.major(`Summon "${card.name}" in Attack Position`);
        STATE.summon(card.id);
        return update();
      } else {
        if (STATE.spells.length >= 5 || !card.can(STATE, location)) return;

        // TODO
        const handler = HANDLERS[card.name];
        if (handler) {
          handler(STATE, location, i, card);
          return update();
        }

      }
    } else if (action === 'discard') {
      // FIXME
    }
  }
  }
}

update();

// @ts-ignore
// const pool = workerpool.pool(new URL('./worker.ts', import.meta.url).pathname);
// pool.exec('search', [STATE.toString(), RANDOM.seed, 1e6, 0.5]).then(r => {
//   console.log(r);
// }).catch(e => {
//   console.error(e);
// }).then(() => {
//   pool.terminate();
// });
