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
  },
  'Thunder Dragon': {

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

const content = document.getElementById('content')!;
const div = createElement('div');
content.appendChild(div);
content.appendChild(createElement('br'));
content.appendChild(renderState(state, [], []));
