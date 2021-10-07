
import * as workerpool from 'workerpool';
import {State, Random, ID, DeckID, Card, DATA, FieldID, Location, Ids} from '../../src';
import {renderState, track} from './common';

import './ui.css';

type Action = 'play' | 'target' | 'search';

const num = (window.location.hash && +window.location.hash.slice(1)) ||
  (window.location.search && +window.location.search.slice(1)) || 1;
const start = State.create(new Random(Random.seed(num)));
const STATE = {
  random: new Random(Random.seed(num)),
  now: start,
  last: start.clone(),
  banished: [] as DeckID[],
  graveyard: [] as ID[],
  action: 'play' as Action,
};

function update(transform?: (location: Location, id: FieldID, i: number) => void) {
  const $content = document.getElementById('content')!;
  if ($content.children[0]) $content.removeChild($content.children[0]);

  const {now: s, banished, graveyard} = STATE;
  const activated = parseLastActivated(STATE.last);
  track(s.banished, banished, activated);
  track(s.graveyard, graveyard, activated);

  $content.appendChild(renderState(s, banished, graveyard, handler, transform));

  STATE.last = s.clone();
}

function parseLastActivated(s: State) {
  if (!s.trace) return undefined;
  let major = '';
  for (let i = s.trace.length; i >= 0; i++) {
    if (!s.trace[i].startsWith('  ')) {
      major = s.trace[i];
      break;
    }
  }
  return !major ? undefined : (major.startsWith('Activate') ? DATA[/"(.*?)"/.exec(major)![1]].id
    : major.startsWith('Set') ? DATA[/then activate "(.*?)"/.exec(major)![1]].id
    : undefined);
}

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
    update();
  };
}

// TODO: support guessing
function ARCHFIEND(s: State, location: 'hand' | 'spells', i: number, card: Card) {
  const play = location === 'hand' || ID.facedown(s[location][i]);
  const prefix = play
    ? `Activate${location === 'spells' ? ' face-down' : ''} "${card.name}" then pay`
    : 'Pay';
  s.major(`${prefix} 500 LP (${s.lifepoints} -> ${s.lifepoints - 500}) to activate effect of "${card.name}"`);
  s.lifepoints -= 500;
  if (s.known()) {
    s.minor(`Declare "${ID.decode(s.deck[s.deck.length - 1]).name}"`);
    s.draw();
  } else {
    s.minor('Declare "Blue-Eyes White Dragon"');
    const reveal = ID.decode(s.deck.pop()!);
    s.minor(`Excavate "${reveal.name}"`);
    s.add('graveyard', reveal.id);
  }
  s.remove(location, i);
  s.add('spells', `${card.id}1` as FieldID);
  if (play) s.inc();

  update();
}

function SANGAN_TARGET(location: Location, id: FieldID) {
  const card = ID.decode(id);
  return location === 'deck' && card.type === 'Monster' && card.atk <= 1500;
}

function RELOAD(fn: (s: State) => void) {
  return (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    const spells = s.spells.length;
    s.remove(location, i);
    s.add('graveyard', card.id);

    const hand = s.hand.filter(id => ID.decode(id).type === 'Spell');
    const h = (location === 'hand' ? 1 : 0);
    const max = Math.min(5 - spells - h, hand.length, s.hand.length - 1);

    const before = s.hand.slice();
    target({location, i}, (loc, id) => loc === 'hand' && ID.decode(id).type === 'Spell', (_, ...set) => {
      const ids = [];
      for (const [offset, j] of set.entries()) {
        const id = before[j];
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
      update();
    }, -max);
  }
};

const SPELLS: { [name: string]: any } = {
  'A Feather of the Phoenix': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    target({location, i}, loc => loc === 'hand', (_, j) => {
      search({location, i}, loc => loc === 'graveyard', (_, k) => {
        s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
        s.minor(`Discard "${ID.decode(s.hand[j]).name}"`);
        const gid = s.remove('graveyard', k);
        s.minor(`Return "${ID.decode(gid).name}" in the Graveyard to the top of the Deck`);
        if (location === 'hand') {
          s.discard(i < j ? [i, j] : [j, i]);
        } else {
          s.remove(location, i);
          s.add('graveyard', card.id);
          s.add('graveyard', s.remove('hand', j));
        }
        s.deck.push(`(${gid})` as DeckID);
        s.inc();
        update();
      });
    });
  },
  'Archfiend\'s Oath': SPELL(),
  'Black Pendant': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    target({location, i}, loc => loc === 'monsters', (_, j) => {
      s.remove(location, i);
      s.major(`${location === 'spells' ? `Flip face-down "${card.name}" and equip` : `Equip "${card.name}"`} to "${ID.decode(s.monsters[j]).name}"`);
      s.add('spells', `${card.id}${j}` as FieldID);
      s.inc();
      update();
    });
  },
  'Card Destruction': RELOAD(s => {
    for (const id of s.hand) {
      s.add('graveyard', id);
    }
    s.minor(`Discard ${ID.names(s.hand)}`);
  }),
  'Convulsion of Nature': SPELL(s => s.reverse()),
  'Different Dimension Capsule': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    search({location, i}, loc => loc === 'deck', (_, j) => {
      s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      s.remove(location, i);
      s.add('spells', `${card.id}${s.turn}` as FieldID);
      s.minor(`Banish ${ID.decode(s.deck[j]).name} from the deck face-down`);
      s.add('banished', `(${ID.id(s.deck.splice(j, 1)[0])})` as DeckID);
      s.shuffle();
      s.inc();
      update();
    });
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
  'Graceful Charity': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
    s.remove(location, i);
    i = s.add('graveyard', card.id);
    s.draw(3);
    s.inc();
    target({location: 'graveyard', i}, loc => loc === 'hand', (_, j, k) => {
      s.minor(`Discard "${ID.decode(s.hand[j]).name}" and "${ID.decode(s.hand[k]).name}"`);
      s.discard([j, k]); // PRECONDITION: j < k
      update();
    }, 2);
  },
  'Level Limit - Area B': SPELL(),
  'Pot of Greed': SPELL(s => s.draw(2)),
  'Premature Burial': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    search({location, i}, (loc, id) => loc === 'graveyard' && ID.decode(id).type === 'Monster', (_, j) => {
      s.major(`Pay 800 LP (${s.lifepoints} -> ${s.lifepoints - 800}) to activate effect of "${card.name}"`);
      s.minor(`Special Summon "${ID.decode(s.graveyard[j]).name}" in Attack Position from Graveyard`);
      s.lifepoints -= 800;
      const gid = s.remove('graveyard', j);
      const zone = s.summon(gid, true);
      s.remove(location, i);
      s.add('spells', `${card.id}${zone}` as FieldID);
      s.inc(zone);
      update();
    });
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
  'Reload': RELOAD(s => {
    s.deck.push(...s.hand);
    s.minor(`Return ${ID.names(s.hand)} to Deck`);
    s.shuffle();
  }),
  'Reversal Quiz': (s: State, location: 'hand' | 'spells', i: number, self: Card) => {
    let sangan = false;
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
    if (!sangan) return update();

    search({location, i}, SANGAN_TARGET, (_, j) => {
      if (j < 0) {
        s.minor('Fail to find "Sangan" target in Deck');
      } else {
        const id = ID.id(s.deck.splice(j, 1)[0]);
        s.minor(`Add "${ID.decode(id).name}" from Deck to hand after "Sangan" was sent to the Graveyard`);
        s.add('hand', id);
      }
      s.shuffle();
      update();
    });
  },
  'Spell Reproduction': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    target({location, i}, (loc, id) => loc === 'hand' && ID.decode(id).type === 'Spell', (_, j, k) => {
      search({location, i}, (loc, id) => loc === 'graveyard' && ID.decode(id).type === 'Spell', (_, g) => {
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
        update();
      });
    }, 2);
  },
  'Toon Table of Contents': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    search({location, i}, (loc, id) => loc === 'deck' && ID.decode(id).name.startsWith('Toon'), (_, j) => {
      s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      s.remove(location, i);
      s.add('graveyard', card.id);
      if (j < 0) {
        s.minor('Fail to find "Toon" card in Deck');
      } else {
        s.minor(`Add "${ID.decode(s.deck[j]).name}" from Deck to hand`);
        s.add('hand', ID.id(s.deck.splice(j, 1)[0]));
      }
      s.shuffle();
      s.inc();
      update();
    });
  },
  'Toon World': SPELL(s => {
    s.minor(`Pay 1000 LP (${s.lifepoints} -> ${s.lifepoints - 1000})`);
    s.lifepoints -= 1000;
  }),
  'Upstart Goblin': SPELL(s => s.draw()),
};

function handler(location: Location, id: FieldID, i: number) {
  console.log(STATE.action, location, id, i); // DEBUG
  switch (STATE.action) {
    case 'play': return onPlay(location, id, i);
    case 'target': return onTarget(location, id, i);
    case 'search': return onSearch(location, id, i);
    default: throw new Error(`Unknown action: ${STATE.action}`);
  }
}

function onPlay(location: Location, id: FieldID, i: number) {
  const state = STATE.now;

  const card = ID.decode(id);
  switch (location) {
    case 'monsters': {
      if (card.id === Ids.RoyalMagicalLibrary) {
        if (ID.facedown(id) || ID.data(id) !== 3 || !state.deck.length) return;
        state.major(`Remove 3 Spell Counters from "${card.name}"`);
        state.mclear(i);
        state.draw();
        return update();
      }
      return;
    }
    case 'spells': {
      if (card.type !== 'Spell' || !card.can(state, location)) return;
      if (ID.facedown(id)) {
        const spell = SPELLS[card.name];
        if (spell) spell(STATE, location, i, card);
      } else if (card.id === Ids.ArchfiendsOath && !ID.data(id)) {
        ARCHFIEND(state, location, i, card);
      }
      return;
    }
    case 'hand': {
      if (card.id === Ids.ThunderDragon) {
        const find = (s: State) => {
          search({location, i}, (loc, id) => loc === 'deck' && ID.id(id) === Ids.ThunderDragon, (_, ...targets) => {
            s.major(`Discard "${card.name}"`);
            s.remove('hand', i);
            s.add('graveyard', card.id);
            if (targets.length === 2) {
              s.minor(`Add 2 "${card.name}" from Deck to hand`);
              // PRECONDITION: targets[0] < targets[1]
              s.add('hand', ID.id(s.deck.splice(targets[0], 1)[0]));
              s.add('hand', ID.id(s.deck.splice(targets[1] - 1, 1)[0]));
            } else if (targets.length === 1) {
              s.minor(`Add "${card.name}" from Deck to hand`);
              s.add('hand', ID.id(s.deck.splice(targets[0], 1)[0]));
            } else {
              s.minor(`Fail to find "${card.name}" in Deck`);
            }
            s.shuffle();
            update();
          })
        };

        if (state.monsters.length && state.monsters.length < 5 && !state.summoned) {
          target({location, i}, loc => loc === 'deck' || loc === 'monsters', (loc, j) => {
            if (loc === 'deck') {
              find(state);
            } else {
              const target = ID.decode(state.monsters[j]);
              state.major(`Tribute "${target.name}" to Summon "${self.name}"`);
              state.tribute(j, i);
              if (target.id === Ids.Sangan) {
                search({location, i}, SANGAN_TARGET, (_, j) => {
                  if (j < 0) {
                    state.minor('Fail to find "Sangan" target in Deck');
                  } else {
                    const id = ID.id(state.deck.splice(j, 1)[0]);
                    state.minor(`Add "${ID.decode(id).name}" from Deck to hand after "Sangan" was sent to the Graveyard`);
                    state.add('hand', id);
                  }
                  state.shuffle();
                  update();
                });
              } else {
                update();
              }
            }
          });
        } else {
          find(state);
        }
      } else if (card.type === 'Monster') {
        if (state.monsters.length >= 5 || state.summoned) return;
        state.remove(location, i);
        state.major(`Summon "${card.name}" in Attack Position`);
        state.summon(card.id);
        return update();
      } else {
        if (state.spells.length >= 5 || !card.can(state, location)) return;
        const spell = SPELLS[card.name];
        if (spell) spell(state, location, i, card);
      }
    }
  }
}

function target(
  origin: {location: Location, i: number},
  filter: (location: Location, id: FieldID) => boolean,
  fn: (location: Location, ...j: number[]) => void,
  num = 1) { // FIXME if negative = optional, if reclick reload then
    // change border of origin
    // highlight valid discards / grey out invalid
    // if only num then cool
    // if reselect origin then cancel
    // make sure each target is distinct and not the original
}

function onTarget(location: Location, id: FieldID, i: number) {
  switch (location) {
    case 'monsters': {
      return; // TODO tribute, equip
    }
    case 'hand': {
      return; // TODO discard
    }
    case 'deck': {
      return; // TODO
    }
  }
}

function search(
  origin: {location: Location, i: number},
  filter: (location: Location, id: FieldID) => boolean,
  fn: (location: Location, ...j: number[]) => void,
  num = 1) { // FIXME: can be 1 OR 2 for thunder dragon...
    // change border of origin
    // highlight valid discards / grey out invalid
    // if only num then cool
    // if reselect origin then cancel
    // make sure each target is distinct and not the original
}

function onSearch(location: Location, id: FieldID, i: number) {
  switch (location) {
    case 'graveyard': {
      return; // TODO
    }
    case 'deck': {
      return; // TODO
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
