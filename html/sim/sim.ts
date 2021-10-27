import * as workerpool from 'workerpool';

import {State, Random, ID, Formatter, DeckID, Card, DATA, FieldID, Location, Ids, Option, OPTIONS} from '../../src';
import {createElement, renderState, track, makeCard, CMP} from '../common';

import './swipe';

type Action = {
  type: 'play' | 'win' | 'lose';
} | ActionState & ({
  type: 'target';
} | {
  type: 'search';
  options: [Location, number][];
  fallback?: Card;
});

interface ActionState {
  origin: {location: Location; i: number};
  filter: (location: Location, id: DeckID | FieldID, i: number) => boolean;
  fn: (location: Location, ...j: number[]) => void;
  num: number;
  targets: [Location, number][];
}

interface Context {
  state: State;
  banished: DeckID[];
  graveyard: ID[];
  action: Action;
}

let STATE!: {
  option: Option;
  num: number;
  start: State;
  stack: Context[];
  index: number;
};

const BLUE_EYES = {
  name: 'Blue-Eyes White Dragon',
  type: 'Monster',
  attribute: 'Light',
  level: 8,
  atk: 3000,
  def: 2500,
  text: '<i>Dragon – This legendary dragon is a powerful engine of destruction. Virtually invincible, very few have faced this awesome creature and lived to tell the tale.</i>',
};
function update(mutate = true) {
  const $content = document.getElementById('content')!;
  while ($content.firstChild) $content.removeChild($content.firstChild);

  const {state: s, banished, graveyard, action} = STATE.stack[STATE.index];
  const trace = renderTrace(s, banished, graveyard, mutate);

  const wrapper = createElement('div', 'wrapper');
  wrapper.appendChild(renderState(s, banished, graveyard, handler, transform, true, `${STATE.option}${STATE.num}`));

  if (action.type === 'win' || (action.type === 'play' && !s.clone().next().length)) {
    const modal = createElement('div', 'modal', 'end', action.type === 'win' ? 'win' : 'lose');
    const a = createElement('a');
    a.href = `../trace?${encodeURIComponent(STATE.start.encode())}`;
    const end = createElement('h1');
    end.textContent = `You ${action.type === 'win' ? 'Win' : 'Lose'}`;
    a.appendChild(end);
    modal.appendChild(a);
    wrapper.appendChild(modal);
    const overlay = createElement('div', 'modal-overlay');
    wrapper.appendChild(overlay);

    // TODO: add restart
  } else if (action.type === 'search') {
    const modal = createElement('div', 'modal');
    const zone = createElement('div', 'zone', 'search');

    if (action.fallback) {
      zone.appendChild(makeCard(action.fallback, () => {
        STATE.stack[STATE.index].action = {type: 'play'};
        action.fn('deck', -1);
        update();
      }, {hold: true}));
    }
    for (const [location, i] of action.options) {
      const id = s[location][i] as FieldID;
      const card = ID.decode(id);
      zone.appendChild(makeCard(card, () => handler(location, id, i), {
        hold: true,
        className: transform(location, id, i, true),
      }));
    }

    modal.appendChild(zone);
    wrapper.appendChild(modal);

    const overlay = createElement('div', 'modal-overlay');

    overlay.addEventListener('click', () => {
      if (action.num < 0) {
        const {unique, remaining} = uniqueness();
        console.log(unique, remaining);
        if (unique.size === 1) {
          STATE.stack[STATE.index].action = {type: 'play'};
          // PRECONDITION: all targets have the same location
          const loc = (action.targets.length ? action.targets : remaining)[0][0];
          return action.fn(loc, ...[...action.targets.map(t => t[1]), ...remaining.map(t => t[1])]);
        }
        return;
      }
      STATE.stack[STATE.index].action = {type: 'play'};
      if (action.num > 1 && action.targets.length) {
        return action.fn(action.targets[0][0], action.targets[0][1]);
      } else {
        update();
      }
    }, {once: true});

    wrapper.appendChild(overlay);
  }

  $content.appendChild(wrapper);
  if (trace) {
    $content.appendChild(trace);
    trace.scrollTop = trace.scrollHeight;
  }
}

function transform(location: Location, id: FieldID, i: number, isSearch = false) {
  const {state, action} = STATE.stack[STATE.index];
  const pile = (['banished', 'graveyard', 'deck'].includes(location));
  if (action.type === 'play') {
    if (pile) return undefined;
    const card = ID.decode(id);
    if (card.id === Ids.ReversalQuiz && !CAN_QUIZ(state)) return 'disabled';
    const can = card.type === 'Monster'
      ? (location === 'hand'
        ? ((!state.summoned && state.monsters.length < 5) ||
          (card.id === Ids.ThunderDragon && state.deck.length))
        : (ID.get(id) === 3 && state.deck.length))
      : (location === 'hand'
        ? state.spells.length < 5 && card.can(state, location)
        : ID.facedown(id)
          ? card.can(state, location as 'spells')
          : (card.id === Ids.ArchfiendsOath && !ID.get(id) && state.deck.length));
    return can ? undefined : 'disabled';
  } else if (action.type === 'target' || action.type === 'search') {
    if (location === action.origin.location && i === action.origin.i) return 'selected';
    if (!action.filter(location, id, i)) return pile ? undefined : 'disabled';
    if (action.targets.find(([loc, j]) => loc === location && j === i)) {
      if (!isSearch && action.type === 'search' && location === action.options[0][0]) {
        return undefined;
      }
      return 'option';
    }
    return undefined;
  }
  return undefined;
}

function renderTrace(s: State, banished: DeckID[], graveyard: ID[], mutate = true) {
  if (!s.trace?.length) return undefined;

  const trace = createElement('div', 'trace');
  let p = createElement('p');
  let ul = createElement('ul');

  let last = '';
  let major = 0;
  for (const line of s.trace) {
    const minor = line.startsWith('  ');
    if (!minor) {
      if (major) {
        p.appendChild(ul);
        ul = createElement('ul');
        trace.appendChild(p);
        p = createElement('p');
      }
      last = line;
      major++;

      const span = createElement('span');
      span.innerHTML = line.replace(/"(.*?)"/g, (_, g: string) => `"<b>${g}</b>"`);
      p.appendChild(span);
    } else {
      const li = createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
  }

  p.appendChild(ul);
  ul = createElement('ul');
  trace.appendChild(p);

  if (last && mutate) {
    const activated = last.startsWith('Activate')
      ? DATA[/"(.*?)"/.exec(last)![1]].id
      : (last.startsWith('Set') && !last.endsWith('face-down'))
        ? DATA[/then activate(?: face-down)? "(.*?)"/.exec(last)![1]].id
        : undefined;
    track(s.banished, banished, activated);
    track(s.graveyard, graveyard, activated);
  }

  return trace;
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

function ARCHFIEND(s: State, location: 'hand' | 'spells', i: number, card: Card) {
  const play = location === 'hand' || ID.facedown(s[location][i]);
  const prefix = play
    ? `Activate${location === 'spells' ? ' face-down' : ''} "${card.name}" then pay`
    : 'Pay';
  const major = `${prefix} 500 LP (${s.lifepoints} -> ${s.lifepoints - 500}) to activate effect of "${card.name}"`;
  if (s.known()) {
    s.major(major);
    s.lifepoints -= 500;

    s.minor(`Declare "${ID.decode(s.deck[s.deck.length - 1]).name}"`);
    s.draw();

    s.remove(location, i);
    s.add('spells', ID.set(card.id, 1));
    if (play) s.inc();
    update();
  } else {
    search({location, i}, loc => loc === 'deck', (_, j) => {
      s.major(major);
      s.lifepoints -= 500;

      const top = ID.decode(s.deck[s.deck.length - 1]);
      if (top.id === s.deck[j]) {
        s.minor(`Declare "${ID.decode(s.deck[s.deck.length - 1]).name}"`);
        s.draw();
      } else {
        s.minor(`Declare "${j < 0 ? 'Blue-Eyes White Dragon' : ID.decode(s.deck[j]).name}"`);
        const reveal = ID.decode(s.deck.pop()!);
        s.minor(`Excavate "${reveal.name}"`);
        s.add('graveyard', reveal.id);
      }

      s.remove(location, i);
      s.add('spells', ID.set(card.id, 1));
      if (play) s.inc();
      update();
    }, 1, BLUE_EYES as Card);
  }
}

function SANGAN_TARGET(location: Location, id: DeckID | FieldID) {
  const card = ID.decode(id);
  return location === 'deck' && card.type === 'Monster' && card.atk <= 1500;
}

function RELOAD(fn: (s: State) => void) {
  return (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    const spells = s.spells.length;
    let max: number;
    if (location === 'hand') {
      const hand = s.hand.filter((id, j) => i !== j && ID.decode(id).type !== 'Monster');
      max = Math.min(5 - spells - 1, hand.length, s.hand.length - 2);
    } else {
      const hand = s.hand.filter(id => ID.decode(id).type !== 'Monster');
      max = Math.min(5 - spells, hand.length, s.hand.length - 1);
    }

    const before = s.hand.slice();
    target({location, i}, (loc, id) => loc === 'hand' && ID.decode(id).type !== 'Monster', (_, ...set) => {
      // NOTE: if location === 'hand' we need to adjust the offsets of any cards we set!
      s.remove(location, i);
      s.add('graveyard', card.id);

      const ids = [];
      for (const [offset, j] of set.entries()) {
        const id = before[j];
        ids.push(id);
        s.add('spells', ID.toggle(id) as FieldID);
        s.remove('hand', j - offset - (location === 'hand' && i < j ? 1 : 0));
      }
      if (ids.length) {
        s.major(`Set ${Formatter.names(ids)} face-down then activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      } else {
        s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      }
      const len = s.hand.length;
      fn(s);
      s.hand = [];
      s.draw(len);
      s.inc();
      update();
    }, -max);
  };
}

// TODO: allow playing if multi-turn is supported
function CAN_QUIZ(s: State) {
  // NOTE: we have to clone for the termination check because it mutates the final state
  if (!s.clone().end(false)) return false;
  // The lookahead parameter only covers the A Feather of the Phoenix, end() will still return true
  // if Black Pendant isn't actually equipped yet (but is equippable).
  return s.spells.some(id => ID.id(id) === Ids.BlackPendant && !ID.facedown(id));
}

// TODO: allow playing if multi-turn is supported
function QUIZ(s: State, location: 'hand' | 'spells') {
  if (!CAN_QUIZ(s)) return;

  const known = s.known(true)!;
  // NOTE: We already checked that Black Pendant is equipped
  s.major(`Activate${location === 'spells' ? ' face-down' : ''} "Reversal Quiz"`);
  // Filter out Reversal Quiz from the messages about what gets sent to the Graveyard
  const hand = s.hand.filter(id => ID.id(id) !== Ids.ReversalQuiz);
  if (hand.length) s.minor(`Send ${Formatter.names(hand)} from hand to Graveyard`);
  s.graveyard.push(...hand);
  s.hand = [];

  const ids = s.monsters.map(id => ID.id(id));
  s.graveyard.push(...ids);
  s.monsters = [];

  for (const id of s.spells) {
    const card = ID.decode(id);
    if (card.id !== Ids.ReversalQuiz) {
      continue;
    } else if (!ID.facedown(id)) {
      if (card.id === Ids.ConvulsionOfNature) {
        s.reverse(true);
      } else if (card.id === Ids.DifferentDimensionCapsule) {
        s.banish();
      }
    }
    s.graveyard.push(card.id);
    ids.push(card.id);
  }
  s.spells = [];
  s.graveyard.sort(CMP);
  if (ids.length) s.minor(`Send ${Formatter.names(ids)} from field to Graveyard`);

  // Reversal Quiz isn't actually in the Graveyard at the point when the game is won
  s.add('spells', Ids.ReversalQuiz);
  // TODO: consider visually displaying the revealed card?
  s.minor(`Call "${ID.decode(known).type}", reveal "${ID.decode(s.deck[s.deck.length - 1]).name}"`);
  s.major(`After exchanging Life Points, opponent has ${s.lifepoints} LP and then takes 500 damage from "Black Pendant" being sent from the field to the Graveyard`);

  STATE.stack[STATE.index].action = {type: 'win'};
  update();
}

const SPELLS: { [name: string]: any } = {
  'A Feather of the Phoenix': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    target({location, i}, loc => loc === 'hand', (_, j) => {
      search({location, i}, loc => loc === 'graveyard', (__, k) => {
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
        s.deck.push(ID.toggle(gid) as DeckID);
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
      s.add('spells', ID.set(card.id, j));
      s.inc();
      update();
    });
  },
  'Card Destruction': RELOAD(s => {
    for (const id of s.hand) {
      s.add('graveyard', id);
    }
    s.minor(`Discard ${Formatter.names(s.hand)}`);
  }),
  'Card Shuffle': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    const reuse = location === 'spells' && !ID.facedown(s[location][i]);
    if (reuse) {
      s.major(`Activate effect of "${card.name}"`);
    } else {
      s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
    }

    s.remove(location, i);
    s.add('spells', ID.set(card.id, 1));
    s.minor(`Pay 300 LP (${s.lifepoints} -> ${s.lifepoints - 300})`);
    s.lifepoints -= 300;
    s.shuffle();

    if (!reuse) s.inc();
    update();
  },
  'Convulsion of Nature': SPELL(s => s.reverse()),
  'Different Dimension Capsule': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    search({location, i}, loc => loc === 'deck', (_, j) => {
      s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      s.remove(location, i);
      s.add('spells', card.id);
      s.minor(`Banish ${ID.decode(s.deck[j]).name} from the deck face-down`);
      s.add('banished', ID.toggle(ID.id(s.deck.splice(j, 1)[0])) as DeckID);
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
    s.minor(`Return ${Formatter.names(s.spells)} to hand`);
    s.spells = [];
  }),
  'Graceful Charity': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
    s.remove(location, i);
    i = s.add('spells', card.id);
    s.draw(3);
    update(); // FIXME bad partial state
    // NOTE: we deliberately set the wrong index for the card so that it can't be cancelled
    target({location: 'spells', i: -1}, loc => loc === 'hand', (_, j, k) => {
      s.minor(`Discard "${ID.decode(s.hand[j]).name}" and "${ID.decode(s.hand[k]).name}"`);
      s.discard([j, k]); // PRECONDITION: j < k
      s.remove('spells', i);
      s.add('graveyard', card.id);
      s.inc();
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
      s.add('spells', ID.set(card.id, zone));
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
        s.mset(ID.get(id));
      } else if (card.id === Ids.PrematureBurial) {
        const removed = s.mremove(ID.get(id));
        s.add('graveyard', removed.id);
        s.minor(`Sending "${ID.decode(removed.id).name}" to the Graveyard after its equipped "${ID.decode(id).name}" was destroyed`);
      } else if (card.id === Ids.DifferentDimensionCapsule) {
        s.banish();
      }
    }
    s.minor(`Send ${Formatter.names(s.spells)} to Graveyard`);
    s.spells = [];
  }),
  'Reload': RELOAD(s => {
    s.deck.push(...s.hand);
    s.minor(`Return ${Formatter.names(s.hand)} to Deck`);
    s.shuffle();
  }),
  'Reversal Quiz': (s: State, location: 'hand' | 'spells', i: number, self: Card) => {
    let sangan = false;
    s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${self.name}"`);
    if (s.hand.length) {
      s.minor(`Send ${Formatter.names(s.hand)} from hand to Graveyard`);
    }
    if (s.monsters.length || s.spells.length) {
      s.minor(`Send ${Formatter.names([...s.monsters, ...s.spells])} from field to Graveyard`);
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
    s.graveyard.sort(CMP);

    const reveal = s.deck[s.deck.length - 1];
    if (!ID.known(reveal)) s.deck[s.deck.length - 1] = ID.toggle(reveal) as DeckID;
    // BUG: we are deliberately peeking here to ensure we call it wrong!
    const card = ID.decode(reveal);
    s.minor(`Call "${card.type === 'Trap' ? 'Monster' : 'Trap'}", reveal "${card.name}"`);
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
  // TODO: handle flipping Royal Decree in multi-turn scenarios
  'Royal Decree': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    s.remove(location, i);
    if (location === 'hand') {
      s.major(`Set "${card.name}" face-down`);
      s.add('spells', ID.toggle(card.id) as FieldID);
    } // else {
    //   s.major(`Activate face-down' "${card.name}"`);
    //   s.add('spells', card.id);
    // }
    update();
  },
  'Spell Reproduction': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    target({location, i}, (loc, id) => loc === 'hand' && ID.decode(id).type === 'Spell', (_, j, k) => {
      search({location, i}, (loc, id) => loc === 'graveyard' && ID.decode(id).type === 'Spell', (__, g) => {
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
        update();
      });
    }, 2);
  },
  'Spellbook Organization': (s: State, location: 'hand' | 'spells', i: number, card: Card) => {
    search({location, i: -1}, (loc, _, j) => loc === 'deck' && j >= s.deck.length - 3, (_, j, k, l) => {
      s.major(`Activate${location === 'spells' ? ' face-down' : ''} "${card.name}"`);
      s.remove(location, i);
      s.add('graveyard', card.id);
      s.minor(`Reveal ${Formatter.names(s.deck.slice(s.deck.length - 3).reverse())}`);

      const ordered = [s.deck[j], s.deck[k], s.deck[l]];
      s.minor(`Return ${Formatter.names(ordered)} to the Deck`);
      for (let m = 0; m < ordered.length; m++) {
        s.deck[s.deck.length - 1 - m] =
          ID.facedown(ordered[m]) ? ordered[m] : ID.toggle(ordered[m]) as DeckID;
      }

      s.inc();
      update();
    }, -3);
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
  const action = STATE.stack[STATE.index].action;
  console.log(action, location, id, i); // Formatter
  switch (action.type) {
  case 'play': return onPlay(location, id, i);
  case 'target': return onTarget(location, id, i);
  case 'search': return onSearch(location, id, i);
  }
}

function onPlay(location: Location, id: FieldID, i: number) {
  const state = STATE.stack[STATE.index].state;

  const card = ID.decode(id);
  switch (location) {
  case 'monsters': {
    if (card.id === Ids.RoyalMagicalLibrary) {
      if (ID.facedown(id) || ID.get(id) !== 3 || !state.deck.length) return;
      state.major(`Remove 3 Spell Counters from "${card.name}"`);
      state.mset(i);
      state.draw();
      return update();
    }
    return;
  }
  case 'spells': {
    if (card.type === 'Monster' || !card.can(state, location)) return;
    if (card.id === Ids.ReversalQuiz) {
      QUIZ(state, location);
    } else if (ID.facedown(id)) {
      const spell = SPELLS[card.name];
      if (spell) spell(state, location, i, card);
    } else if (card.id === Ids.ArchfiendsOath && !ID.get(id)) {
      ARCHFIEND(state, location, i, card);
    } else if (card.id === Ids.CardShuffle && !ID.get(id)) {
      SPELLS[card.name]!(state, location, i, card);
    }
    return;
  }
  case 'hand': {
    if (card.id === Ids.ReversalQuiz) {
      QUIZ(state, location);
    } else if (card.id === Ids.ThunderDragon) {
      const find = (s: State) => {
        search({location, i}, (loc, sid) => loc === 'deck' && ID.id(sid) === Ids.ThunderDragon, (_, ...targets) => {
          s.major(`Discard "${card.name}"`);
          s.remove('hand', i);
          s.add('graveyard', card.id);
          if (targets.length === 2) {
            s.minor(`Add 2 "${card.name}" from Deck to hand`);
            // PRECONDITION: targets[0] < targets[1]
            s.add('hand', ID.id(s.deck.splice(targets[0], 1)[0]));
            s.add('hand', ID.id(s.deck.splice(targets[1] - 1, 1)[0]));
          } else if (targets[0] >= 0) {
            s.minor(`Add "${card.name}" from Deck to hand`);
            s.add('hand', ID.id(s.deck.splice(targets[0], 1)[0]));
          } else {
            s.minor(`Fail to find "${card.name}" in Deck`);
          }
          s.shuffle();
          update();
        }, 2);
      };

      if (state.monsters.length && state.monsters.length < 5 && !state.summoned) {
        target({location, i}, loc => loc === 'deck' || loc === 'monsters', (loc, j) => {
          if (loc === 'deck') {
            find(state);
          } else {
            const t = ID.decode(state.monsters[j]);
            state.major(`Tribute "${t.name}" to Summon "${self.name}"`);
            state.tribute(j, i);
            if (t.id === Ids.Sangan) {
              search({location: 'graveyard', i: -1}, SANGAN_TARGET, (_, k) => {
                if (k < 0) {
                  state.minor('Fail to find "Sangan" target in Deck');
                } else {
                  const did = ID.id(state.deck.splice(k, 1)[0]);
                  state.minor(`Add "${ID.decode(did).name}" from Deck to hand after "Sangan" was sent to the Graveyard`);
                  state.add('hand', did);
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
  origin: {location: Location; i: number},
  filter: (location: Location, id: DeckID | FieldID) => boolean,
  fn: (location: Location, ...j: number[]) => void,
  num = 1
) {
  if (num === 0) return fn(origin.location);
  const state = STATE.stack[STATE.index].state;

  const targets: ['hand' | 'spells' | 'monsters' | 'deck', number][] = [];
  for (const location of ['hand', 'spells', 'monsters'] as const) {
    for (const [i, id] of state[location].entries()) {
      if (location === origin.location && i === origin.i) continue;
      if (filter(location, id)) targets.push([location, i]);
    }
  }
  if (state.deck.length && filter('deck', state.deck[state.deck.length - 1] as FieldID)) {
    targets.push(['deck', state.deck.length - 1]);
  }

  if (num > 0 && targets.length === num) {
    // PRECONDITION: new Set(targets.map(t => t[0])).size === 1
    return fn(targets[0][0], ...targets.map(t => t[1]).sort(CMP));
  } else {
    STATE.stack[STATE.index].action = {
      type: 'target',
      origin,
      filter,
      fn,
      num,
      targets: [],
    };
    update();
  }
}

function onTarget(location: Location, id: FieldID, i: number) {
  const action = STATE.stack[STATE.index].action;
  if (action.type !== 'target') throw new Error(`Invalid action type ${action.type}`);

  if (location === action.origin.location && i === action.origin.i) {
    STATE.stack[STATE.index].action = {type: 'play'};
    if (action.num < 0) {
      if (action.targets.length) {
        // PRECONDITION: all targets have the same location
        return action.fn(action.targets[0][0], ...action.targets.map(t => t[1]).sort(CMP));
      } else {
        return action.fn(location);
      }
    } else {
      update();
    }
  } else if (action.filter(location, id, i)) {
    const remove = action.targets.findIndex(([loc, j]) => loc === location && j === i);
    if (remove >= 0) {
      action.targets.splice(remove, 1);
    } else {
      action.targets.push([location, i]);
    }

    if (action.targets.length === Math.abs(action.num)) {
      STATE.stack[STATE.index].action = {type: 'play'};
      // PRECONDITION: all targets have the same location
      return action.fn(action.targets[0][0], ...action.targets.map(t => t[1]).sort(CMP));
    } else {
      update();
    }
  }
}

function search(
  origin: {location: Location; i: number},
  filter: (location: Location, id: DeckID | FieldID, i: number) => boolean,
  fn: (location: Location, ...j: number[]) => void,
  num = 1,
  fallback?: Card,
) {
  const state = STATE.stack[STATE.index].state;

  const targets: ['graveyard' | 'deck', number][] = [];
  const ids = new Set<ID>();
  for (const location of ['graveyard', 'deck'] as const) {
    for (const [i, did] of state[location].entries()) {
      const id = ID.id(did);
      if (location === origin.location && i === origin.i || ids.has(id)) continue;
      if (filter(location, id, i)) {
        if (num === 1) ids.add(id);
        targets.push([location, i]);
      }
    }
  }

  if (targets.length === 0) {
    fn('hand', -1); // NOTE: we don't actually have a valid location...
  } else if (targets.length === 1) {
    return fn(targets[0][0], targets[0][1]);
  } else {
    STATE.stack[STATE.index].action = {
      type: 'search',
      origin,
      filter,
      fn,
      num,
      targets: [],
      options: num < 0 ? targets.reverse() : targets.sort((a, b) =>
        ID.decode(state[a[0]][a[1]]).name.localeCompare(ID.decode(state[b[0]][b[1]]).name)),
      fallback,
    };
    update();
  }
}

function onSearch(location: Location, id: FieldID, i: number) {
  const action = STATE.stack[STATE.index].action;
  if (action.type !== 'search') throw new Error(`Invalid action type ${action.type}`);

  if (location === action.origin.location && i === action.origin.i) {
    STATE.stack[STATE.index].action = {type: 'play'};
    if (action.num > 1 && action.targets.length) {
      return action.fn(action.targets[0][0], action.targets[0][1]);
    } else {
      update();
    }
  } else if (action.filter(location, id, i)) {
    const remove = action.targets.findIndex(([loc, j]) => loc === location && j === i);
    if (remove >= 0) {
      action.targets.splice(remove, 1);
    } else {
      action.targets.push([location, i]);
    }

    if (action.targets.length === Math.abs(action.num)) {
      STATE.stack[STATE.index].action = {type: 'play'};
      // PRECONDITION: all targets have the same location
      const targets = action.targets.map(t => t[1]);
      return action.fn(action.targets[0][0], ...(action.num > 0 ? targets.sort(CMP) : targets));
    } else if (action.num < 0) {
      const {unique, remaining} = uniqueness();
      if (unique.size === 1) {
        STATE.stack[STATE.index].action = {type: 'play'};
        // PRECONDITION: all targets have the same location
        const loc = (action.targets.length ? action.targets : remaining)[0][0];
        return action.fn(loc, ...[...action.targets.map(t => t[1]), ...remaining.map(t => t[1])]);
      } else {
        update();
      }
    } else {
      update();
    }
  }
}

function uniqueness() {
  const {state, action} = STATE.stack[STATE.index];
  if (action.type !== 'search') throw new Error(`Bad action type: ${action.type}`);
  const remaining = action.options.slice();
  for (const [loc, j] of action.targets) {
    remaining.splice(remaining.findIndex(([l, k]) => l === loc && k === j), 1);
  }
  const unique = new Set(remaining.map(([loc, j]) => ID.id(state[loc][j])));
  return {remaining, unique};
}

function initialize(option: Option, num: number) {
  console.log('Seed:', num);

  const state = State.create(State.decklist(option), new Random(Random.seed(num)), true);

  STATE = {
    option,
    num,
    start: state.clone(),
    stack: [{
      state,
      banished: [],
      graveyard: [],
      action: {type: 'play'},
    } as Context],
    index: 0,
  };

  const undo = () => {
    // if (STATE.index) {
    //   STATE.index--;
    //   update(false);
    // }
  };

  const redo = () => {
    // if (STATE.index < STATE.stack.length - 1) {
    //   STATE.index++;
    //   update(false);
    // }
  };

  const cancel = () => {
    const action = STATE.stack[STATE.index].action;
    if (action.type === 'target' || action.type === 'search') {
      if (action.origin.i >= 0) {
        STATE.stack[STATE.index].action = {type: 'play'};
      } else {
        (STATE.stack[STATE.index].action as ActionState).targets = [];
      }
      update();
    }
  };

  const CLICKABLE = ['modal', 'modal-overlay', 'card'];
  document.addEventListener('click', e => {
    if (e.target instanceof Element) {
      for (let p: Element | null = e.target; p; p = p.parentElement) {
        if (CLICKABLE.some(c => p!.classList.contains(c))) {
          return true;
        }
      }
    }
    cancel();
    e.preventDefault();
    e.stopPropagation();
    return false;
  });
  document.addEventListener('swiped-left', undo);
  document.addEventListener('swiped-right', redo);
  document.addEventListener('keydown', e => {
    const key = e.which || e.keyCode;
    switch (key) {
    case 27:
      cancel();
      break;
    case 37:
      undo();
      break;
    case 39:
      redo();
      break;
    default:
      return true;
    }

    e.preventDefault();
    e.stopPropagation();
    return false;
  });

  /* eslint-disable @typescript-eslint/no-floating-promises */
  const pool = workerpool.pool(new URL('./worker.ts', import.meta.url).pathname);
  pool.exec('search', [STATE.start.encode(), 42, 1e6, false, 0.5]).then(r => {
    console.log('Path:', r);
  }).catch(e => {
    console.error(e);
  }).then(() => {
    pool.terminate();
  });

  update();
}

function start() {
  const arg = (window.location.hash || window.location.search).slice(1);
  if (OPTIONS.includes(arg[0] as Option)) {
    const n = arg.slice(1);
    if (n && !isNaN(+n)) return initialize(arg[0] as Option, +n);
  }
  const num = arg && !isNaN(+arg) ? +arg : ~~(Math.random() * (2 ** 31 - 1));

  const $content = document.getElementById('content')!;
  while ($content.firstChild) $content.removeChild($content.firstChild);
  const zone = createElement('div', 'zone', 'start');
  for (const id of OPTIONS) {
    const card = ID.decode(Formatter.unhuman(id));
    zone.appendChild(makeCard(card, () => {
      initialize(id, num);
    }, {hold: true}));
  }
  $content.appendChild(zone);
}

const scope = process.env.NODE_ENV === 'production' ? '/ftk/' : undefined;
navigator.serviceWorker.register(new URL('service-worker.js', import.meta.url), {type: 'module', scope});

start();
