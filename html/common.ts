import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';

import {State, ID, DeckID, Card, FieldID, Location} from '../src';

// @ts-ignore
import IMG from './img/**/*';
import './common.css';

// i herd u liek proper sorts
export const CMP = (a: number, b: number) => a - b;

type Handler<T = void> = (location: Location, id: FieldID, i: number) => T;

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K, ...classes: string[]): HTMLElementTagNameMap[K];
export function createElement(tag: string, ...classes: string[]) {
  const element = document.createElement(tag);
  for (const c of classes) element.classList.add(c);
  return element;
}

export function createTextNode(text: string) {
  return document.createTextNode(text);
}

export const tooltip = (card: Card) => {
  const root = createElement('div', 'tooltip');

  let div = createElement('div');
  const strong = createElement('strong');
  strong.textContent = card.name;
  div.appendChild(strong);
  div.appendChild(createTextNode('\u00A0'));
  div.appendChild(createTextNode('\u2014'));
  div.appendChild(createTextNode('\u00A0'));
  const em = createElement('em');
  if (card.type === 'Monster') {
    em.textContent = `${card.attribute}/${card.level}`;
  } else {
    em.textContent = `${card.type}/${card.subType}`;
  }
  div.appendChild(em);

  root.appendChild(div);

  div = createElement('div', 'card-text');
  div.innerHTML = card.text.replace(/<\/?effect.*?>/g, '').replace(/●/g, '<br />●');
  root.appendChild(div);

  if (card.type === 'Monster') {
    div = createElement('div');
    div.textContent = `ATK ${card.atk} / DEF ${card.def}`;
    root.appendChild(div);
  }

  return root;
};

export const pileTooltip = (state: State, pile: 'banished' | 'graveyard' | 'deck') => {
  const root = createElement('div', 'tooltip');

  let total = 0;
  const cards: {[name: string]: number} = {};
  let unknown = false;
  const known: {top: string[]; bottom: string[]} = {top: [], bottom: []};
  for (const id of state[pile].slice().reverse()) {
    const name = ID.decode(id).name;
    if (pile === 'deck' && ID.known(id)) {
      known[unknown ? 'bottom' : 'top'].push(name);
    } else {
      unknown = true;
      cards[name] = (cards[name] || 0) + 1;
      total++;
    }
  }

  const ul = createElement('ul');
  for (const card of known.top) {
    const li = createElement('li');
    li.textContent = card;
    ul.appendChild(li);
  }

  const inferred = Object.keys(cards).length === 1;
  for (const [name, count] of Object.entries(cards).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (pile === 'deck') {
      if (inferred) {
        for (let i = 0; i < count; i++) {
          const li = createElement('li');
          li.textContent = name;
          ul.appendChild(li);
        }
      } else {
        const li = createElement('li');
        const em = createElement('em');
        em.textContent = `${count} × ${name} (${(count / total * 100).toFixed(2)}%)`;
        li.appendChild(em);
        ul.appendChild(li);
      }
    } else {
      const li = createElement('li');
      li.textContent = `${count} × ${name}`;
      ul.appendChild(li);
    }
  }

  for (const card of known.bottom) {
    const li = createElement('li');
    li.textContent = card;
    ul.appendChild(li);
  }

  root.appendChild(ul);

  return root;
};

const compress = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '');

export const makeCard = (
  card?: Card,
  handler?: () => void,
  options: {
    facedown?: boolean;
    notip?: boolean;
    label?: number;
    counter?: number;
    equip?: string;
    hold?: boolean;
    className?: string;
  } = {},
) => {
  const root = createElement('div', 'card');
  if (!card) {
    root.classList.add('blank');
    return root;
  }
  if (options.equip) root.classList.add(options.equip);
  if (options.className) root.classList.add(options.className);

  const type = card.type.toLowerCase();
  const cardType = card.type === 'Monster' ? (card.id ? 'effectMonster' : 'normalMonster') : card.type;

  root.style.backgroundImage = options.facedown
    ? `url(${IMG.sleeves['Default.png'] as string})`
    : `url(${IMG.cards.bgs[`${cardType}.jpg`] as string})`;

  if (!options.facedown) {
    const art = createElement('div', 'art');
    art.style.backgroundImage = `url(${IMG.cards.art[`${compress(card.name)}.jpg`] as string})`;
    root.appendChild(art);

    const lowerHalf = createElement('div', 'lower-half');
    const icon = createElement('div', 'icon', type);

    if (card.type === 'Monster') {
      for (let i = 0; i < card.level; i++) {
        const img = createElement('img', 'star');
        img.src = IMG.cards.svgs.subtypes['star.svg'];
        icon.appendChild(img);
      }
    } else if (card.subType !== 'Normal') {
      const img = createElement('img', 'subtype');
      img.src = IMG.cards.svgs.subtypes[`${card.subType}.svg`];
      icon.appendChild(img);
    }

    const img = createElement('img', 'attribute');
    img.src = IMG.cards.svgs.attributes[`${card.type === 'Monster' ? card.attribute : card.type}.svg`];
    icon.appendChild(img);
    lowerHalf.appendChild(icon);

    if (card.type === 'Monster') {
      const stats = createElement('div', 'stats');

      const atk = createElement('div', 'stat-box', 'atk');
      atk.textContent = `${card.atk}`;
      stats.appendChild(atk);

      const def = createElement('div', 'stat-box', 'def');
      def.textContent = `${card.def}`;
      stats.appendChild(def);

      lowerHalf.appendChild(stats);
    }

    root.appendChild(lowerHalf);
  }

  if (options.counter || options.label) {
    const div = createElement('div', options.counter ? 'counter' : 'label');
    if (options.counter) {
      const img = createElement('img');
      img.src = IMG.battle['Counter.svg'];
      div.appendChild(img);
    }
    const text = createElement('div', 'label-text');
    text.textContent = `${options.counter || options.label!}`;
    div.append(text);
    root.appendChild(div);
  }

  if (!options.notip) tippy(root, {content: tooltip(card), touch: options.hold ? ['hold', 500] : true});
  if (handler) root.addEventListener('click', () => handler());
  return root;
};

const wrap = <T>(a: T[], n = 5) => {
  let back = true;
  const b: ([T, number] | [undefined, undefined])[] = a.map((e, i) => [e, i]);
  while (b.length < n) {
    if (back) {
      b.push([undefined, undefined]);
    } else {
      b.unshift([undefined, undefined]);
    }
    back = !back;
  }
  return b;
};

export const renderState = (
  state: State,
  banished: DeckID[],
  graveyard: ID[],
  handler?: Handler,
  transform?: Handler<string | undefined>,
  hold = false,
  seed?: string
) => {
  let equip = false;
  const equips: {[i: number]: string} = {};
  for (const id of state.spells) {
    const card = ID.decode(id);
    if (!ID.facedown(id) && card.type === 'Spell' && card.subType === 'Equip') {
      const i = ID.data(id);
      if (!equips[i]) equips[i] = equip ? 'equip-2' : 'equip-1';
      equip = true;
    }
  }
  const table = createElement('table');
  let tr = createElement('tr');
  let td = createElement('td');
  td.colSpan = 2;
  let div = createElement('div', 'lifepoints');
  if (seed !== undefined) tippy(div, {content: `Seed: ${seed}`});
  const overlay = createElement('div', 'lifepoints-overlay');
  overlay.style.width = `${(1 - (state.lifepoints / 8000)) * 100}%`;
  div.appendChild(overlay);
  const text = createElement('div', 'text');
  text.textContent = `${state.lifepoints}`;
  div.appendChild(text);
  td.appendChild(div);
  tr.appendChild(td);
  table.appendChild(tr);

  tr = createElement('tr');
  td = createElement('td', 'monsters');
  div = createElement('div', 'zone');
  for (const [id, i] of wrap(state.monsters)) {
    if (!id) {
      div.appendChild(makeCard());
    } else {
      div.appendChild(makeCard(ID.decode(id), handler && (() => handler('monsters', id, i!)), {
        hold,
        facedown: ID.facedown(id),
        counter: ID.data(id),
        equip: equips[i!],
        className: transform?.('monsters', id, i!),
      }));
    }
  }
  td.appendChild(div);
  tr.appendChild(td);
  td = createElement('td');
  div = createElement('div', 'zone', 'banished');
  if (banished.length) {
    const id = banished[banished.length - 1] as FieldID;
    const top = makeCard(ID.decode(id), undefined, {
      notip: true,
      label: banished.length,
      className: transform?.('banished', id, -1),
    });
    tippy(top, {content: pileTooltip(state, 'banished')});
    div.appendChild(top);
  } else {
    div.appendChild(makeCard());
  }
  td.appendChild(div);
  tr.appendChild(td);
  table.appendChild(tr);

  tr = createElement('tr');
  td = createElement('td');
  div = createElement('div', 'zone', 'spells');
  for (const [id, i] of wrap(state.spells)) {
    if (!id) {
      div.appendChild(makeCard());
    } else {
      const card = ID.decode(id);
      const facedown = ID.facedown(id);
      const counter = ID.data(id);
      const fn = handler && (() => handler('spells', id, i!));
      const className = transform?.('spells', id, i!);
      if (!facedown && card.type === 'Spell' && card.subType === 'Equip') {
        div.appendChild(makeCard(card, fn, {hold, facedown, equip: equips[counter], className}));
      } else {
        div.appendChild(makeCard(card, fn, {hold, facedown, counter, className}));
      }
    }
  }
  td.appendChild(div);
  tr.appendChild(td);
  td = createElement('td');
  div = createElement('div', 'zone', 'graveyard');
  if (graveyard.length) {
    const id = graveyard[graveyard.length - 1];
    const top = makeCard(ID.decode(id), undefined, {
      notip: true,
      label: graveyard.length,
      className: transform?.('graveyard', id, -1),
    });
    tippy(top, {content: pileTooltip(state, 'graveyard')});
    div.appendChild(top);
  } else {
    div.appendChild(makeCard());
  }
  td.appendChild(div);
  tr.appendChild(td);
  table.appendChild(tr);

  tr = createElement('tr');
  td = createElement('td');
  div = createElement('div', 'zone', 'hand');
  for (const [i, id] of state.hand.entries()) {
    div.appendChild(makeCard(ID.decode(id), handler && (() => handler('hand', id, i)), {
      hold,
      className: transform?.('hand', id, i),
    }));
  }
  td.appendChild(div);
  tr.appendChild(td);
  td = createElement('td');
  div = createElement('div', 'zone', 'deck');
  if (state.deck.length) {
    const id = state.deck[state.deck.length - 1] as FieldID;
    const top = makeCard(ID.decode(id), handler && (() => handler('deck', id, state.deck.length - 1)), {
      facedown: !state.reversed,
      notip: true,
      label: state.deck.length,
      className: transform?.('deck', id, -1),
    });
    tippy(top, {content: pileTooltip(state, 'deck')});
    div.appendChild(top);
  } else {
    div.appendChild(makeCard());
  }
  td.appendChild(div);
  tr.appendChild(td);
  table.appendChild(tr);

  return table;
};

export const track = <T extends string>(input: T[], output: T[], activated?: T) => {
  const sorted = output.slice().sort();

  const added: T[] = [];
  let j = 0;
  for (let i = 0; i < input.length; i++, j++) {
    if (j >= sorted.length) {
      added.push(input[i]);
    } else if (input[i] < sorted[j]) {
      added.push(input[i]);
      j--;
    } else if (input[i] > sorted[j]) {
      const removed = sorted.splice(j, 1)[0];
      for (let k = output.length; k >= 0; k--) {
        if (output[k] === removed) {
          output.splice(k, 1);
          break;
        }
      }
      i--;
      j--;
    }
  }

  if (added.length > 1 && activated) {
    for (let i = added.length; i >= 0; i--) {
      if (added[i] === activated) {
        added.splice(i, 1);
        added.push(activated);
        break;
      }
    }
  }
  for (const add of added) {
    output.push(add);
  }

  return output;
};

function setTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme);
}

const pref = window.matchMedia('(prefers-color-scheme: dark)');
const listener = (e: MediaQueryListEvent) => {
  setTheme(e.matches ? 'dark' : 'light');
};
try {
  pref.addEventListener('change', listener);
} catch (err) {
  pref.addListener(listener);
}
setTheme(pref.matches ? 'dark' : 'light');
