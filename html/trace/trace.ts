import {State, Random, ID, DeckID, DATA, OPTIONS, Ids} from '../../src';
import {createElement, track, renderState} from '../common';

const render = (s: State, rendered: HTMLElement, banished: DeckID[] = [], graveyard: ID[] = []) => {
  rendered.appendChild(renderState(s, banished, graveyard));

  const wrapper = createElement('div', 'wrapper');
  const details = createElement('details');
  const summary = createElement('summary');

  let code = createElement('code');
  let pre = createElement('pre');
  pre.textContent = s.toString();
  code.appendChild(pre);
  summary.appendChild(code);
  details.appendChild(summary);

  code = createElement('code');
  pre = createElement('pre');
  pre.textContent = s.next().map(({key, score}) =>
    `${State.decode(key).toString()} = ${score.toFixed(2)}`).join('\n');
  code.appendChild(pre);
  details.appendChild(code);
  wrapper.appendChild(details);
  rendered.appendChild(wrapper);

  return rendered;
};

const win = (path: string[], trace: string[]) => {
  const banished: DeckID[] = [];
  const graveyard: ID[] = [];

  const root = createElement('div');

  let div = createElement('div', 'trace');
  let last = '';
  let major = 0;
  let ul = createElement('ul');
  for (const line of trace) {
    const minor = line.startsWith('  ');
    if (!minor) {
      if (major) {
        div.appendChild(ul);
        ul = createElement('ul');
        root.appendChild(div);
        div = createElement('div', 'trace');
      }

      if (path[major - 1]) {
        const s = State.decode(path[major - 1], true);
        const activated = last.startsWith('Activate')
          ? DATA[/"(.*?)"/.exec(last)![1]].id
          : (last.startsWith('Set') && !last.endsWith('face-down'))
            ? DATA[/then activate(?: face-down)? "(.*?)"/.exec(last)![1]].id
            : undefined;
        track(s.banished, banished, activated);
        track(s.graveyard, graveyard, activated);

        const rendered = createElement('div', 'state');
        root.appendChild(render(s, rendered, banished, graveyard));
      }
      last = line;
      major++;

      const span = createElement('span');
      span.innerHTML = line.replace(/"(.*?)"/g, (_, g: string) => `"<b>${g}</b>"`);
      div.appendChild(span);
    } else {
      const li = createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
  }
  root.appendChild(div);

  return root;
};

const lose = (s: State) => {
  const rendered = createElement('div', 'state');

  const div = createElement('div', 'trace');
  const span = createElement('span');
  span.innerHTML = s.trace![0].replace(/"(.*?)"/g, (_, g: string) => `"<b>${g}</b>"`);
  div.appendChild(span);
  rendered.appendChild(div);
  return render(s, rendered);
};

const state = (() => {
  const arg = (window.location.hash || window.location.search).slice(1);
  const seed = (n: string) => Random.seed(n && !isNaN(+n) ? +n : ~~(Math.random() * (2 ** 31 - 1)));
  const fallback = OPTIONS.includes(arg.charCodeAt(0) as ID)
    ? State.create(arg.charCodeAt(0) as ID, new Random(seed(arg.slice(1))), true)
    : State.create(Ids.Sangan, new Random(seed(arg)), true);
  if (arg) {
    try {
      const s = State.decode(decodeURIComponent(arg), true);
      if (!State.verify(s).length) return s;
    } catch {
      return fallback;
    }
  }
  return fallback;
})();

const result = state.search({cutoff: 1e7, prescient: false, width: 0.5});

const content = document.getElementById('content')!;
while (content.firstChild) content.removeChild(content.firstChild);

if (!('path' in result)) {
  const div = createElement('div');
  div.textContent = `Unsuccessfully searched ${result.visited} states.`;
  content.appendChild(div);
  content.appendChild(createElement('br'));
  content.appendChild(lose(state));
} else {
  const div = createElement('div');
  div.textContent = `Found a path of length ${result.path.length} after searching ${result.visited} states:`;
  content.appendChild(div);
  content.appendChild(createElement('br'));
  content.appendChild(win(result.path, result.trace!));
}
