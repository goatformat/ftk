import './ui.css';
import assert from 'assert';
import {State, Random, ID, DeckID, FieldID, Location, Ids} from '../../src';
import {renderState} from './common';

const num = (window.location.hash && +window.location.hash.slice(1)) ||
  (window.location.search && +window.location.search.slice(1)) || 1;
const STATE = State.create(new Random(Random.seed(num)));
STATE.madd('L3' as FieldID); // DEBUG
STATE.madd('S' as FieldID); // DEBUG
const BANISHED: DeckID[] = [];
const GRAVEYARD: ID[] = [];

export const HANDLERS: { [name: string]: any } = {
  'A Feather of the Phoenix': {
  },
  'Archfiend\'s Oath': {
  },
  'Black Pendant': {
  },
  'Card Destruction': {
  },
  'Convulsion of Nature': {
  },
  'Cyber Jar': {
  },
  'Different Dimension Capsule': {
  },
  'Giant Trunade': {
  },
  'Graceful Charity': {
  },
  'Level Limit - Area B': {
  },
  'Pot of Greed': {
  },
  'Premature Burial': {
  },
  'Heavy Storm': {
  },
  'Reload': {
  },
  'Reversal Quiz': {
  },
  'Royal Magical Library': {
  },
  'Sangan': {
  },
  'Spell Reproduction': {
    // does nothing unless condition is passed (2+ in hand, 1+ in grave)
    // if only one option does that one option, otherwise fades out invalid options and lets choose
    // progress to state with choice = want to restruction index.ts to pass in choices instead!
  },
  'Thunder Dragon': {
    // if choice, pass in instead of generate
  },
  'Toon Table of Contents': {
  },
  'Toon World': {
  },
  'Upstart Goblin': {
  },
};

// target = highlight valid targets
// discard = highlight valid discards / grey out invalid


// on click, change border
//


type Action = 'play' | 'discard' | 'target' |'search';
const action: Action = 'play';

function update() {
  const $content = document.getElementById('content')!;
  if ($content.children[0]) $content.removeChild($content.children[0]);
  $content.appendChild(renderState(STATE, BANISHED, GRAVEYARD, handler));
}

function handler(e: HTMLElement, location: Location, id: FieldID, i: number) {
  console.log(e, location, id, i);

  e.classList.add('selected');

  switch (location) {
  case 'banished': return;
  case 'graveyard': {
    if (action !== 'search') return;
    return; // TODO
  }
  case 'deck': {
    if (action !== 'search') return;
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
    const card = ID.decode(id);
    if (card.id === Ids.ThunderDragon) {
      // FIXME need to choose... -> can also discard OR summon!!!
    } else if (card.type === 'Monster') {
      if (STATE.monsters.length >= 5 || STATE.summoned) return;
      STATE.remove(location, i);
      STATE.major(`Summon "${card.name}" in Attack Position`);
      STATE.summon(card.id);
      return update();
    } else {
      if (STATE.spells.length >= 5 || !card.can(STATE, location)) return;

      // FIXME play
    }
  }
  }
}

update();
