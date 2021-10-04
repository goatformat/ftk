import './trace.css';
import {State, Random, ID, DeckID, DATA} from '../../src';
import {createElement, track, renderState} from './common';

const render = (path: string[], trace: string[]) => {
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
        const s = State.fromString(path[major - 1]);
        const activated =
          last.startsWith('Activate') ? DATA[/"(.*?)"/.exec(last)![1]].id
          : last.startsWith('Set') ? DATA[/then activate "(.*?)"/.exec(last)![1]].id
          : undefined;
        track(s.banished, banished, activated);
        track(s.graveyard, graveyard, activated);

        const rendered = createElement('div', 'state');
        rendered.appendChild(renderState(s, banished, graveyard));

        const wrapper = createElement('div', 'wrapper');
        const details = createElement('details');
        const summary = createElement('summary');

        let code = createElement('code');
        let pre = createElement('pre');
        pre.textContent = path[major - 1];
        code.appendChild(pre);
        summary.appendChild(code);
        details.appendChild(summary);

        code = createElement('code');
        pre = createElement('pre');
        pre.textContent = s.next().map(({key, score}) => `${key} = ${score.toFixed(2)}`).join('\n');
        code.appendChild(pre);
        details.appendChild(code);
        wrapper.appendChild(details);
        rendered.appendChild(wrapper);

        root.appendChild(rendered);
      }
      last = line;
      major++;
    }
    if (minor) {
      const li = createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    } else {
      const span = createElement('span');
      span.innerHTML = line.replace(/"(.*?)"/g, (_, g: string) => `"<b>${g}</b>"`);
      div.appendChild(span);
    }
  }
  root.appendChild(div);

  return root;
};

const num = (window.location.hash && +window.location.hash.slice(1)) ||
  (window.location.search && +window.location.search.slice(1)) || 1;
const state = State.create(new Random(Random.seed(num)));
const result = state.search({cutoff: 1e7, prescient: false, width: 0.5});
if (!('path' in result)) {
  console.error(`Unsuccessfully searched ${result.visited} states`);
} else {
  const content = document.getElementById('content')!;
  const div = createElement('div');
  div.textContent = `Found a path of length ${result.path.length} after searching ${result.visited} states:`;
  content.appendChild(div);
  content.appendChild(createElement('br'));
  content.appendChild(render(result.path, result.trace));
}
