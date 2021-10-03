import './ui.css';
import {State, Random} from '..';
import {createElement, renderState} from './common';

export const HANDLERS: { [name: string]: {} } = {
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

const num = (window.location.hash && +window.location.hash.slice(1)) ||
  (window.location.search && +window.location.search.slice(1)) || 1;
const state = State.create(new Random(Random.seed(num)));
state.summon('L3' as any);

const content = document.getElementById('content')!;
const div = createElement('div');
content.appendChild(div);
content.appendChild(createElement('br'));
content.appendChild(renderState(state, [], []));
