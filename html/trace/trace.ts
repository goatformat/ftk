import * as workerpool from 'workerpool';

import {State, Random, Option, ID, DeckID, DATA, OPTIONS} from '../../src';
import {createElement, track, renderState} from '../common';

const CUTOFF = 1e7;
const TIMEOUT = {nonprescient: 5 * 1000, total: 60 * 1000};
// workerpool cancellation seems to not throw CancellationError's on web...
const CANCELLED = /Worker(?: is)? terminated/;

type Success = ['success', number, number, string[], string[]];
type Fail = ['fail', number, number];
type Exhaust = ['exhaust', number, number];
type Result = Success | Fail | Exhaust;
type Solution = {visited: number} | {visited: number; path: string[]; trace?: string[] };

// Attempts to solve the encoded state s, preferring solutions in order:
//
//    - failure from a prescient search
//    - successful paths from a non-prescient search acheived before the non-prescient timeout
//    - the shortest successful prescient path achevied before the non-prescient timeout
//    - any successful path returned from a search after the non-prescient timeout
//
// The solver is also subject to a global total timeout
const solve = async (encoded: string): Promise<Solution> => {
  let done: Result | undefined = undefined;

  const pool = workerpool.pool(new URL('../worker.ts', import.meta.url).pathname);

  // Whether we are allowed to return prescient successful results (ie. whether we've exceeded the
  // non-prescient timeout)
  let allowed = false;
  // The successful searches and all searches - we only return results from the latter in certain
  // circumstances
  const successes: Success[] = [];
  const searches: workerpool.Promise<Result | undefined>[] = [];

  // When we terminate early we need to cancel the pending sibling searches we might have kicked
  // off. It would seem like pool.terminate(force = true) should do this, but the pool termination
  // causes crashes instead :(
  const cleanup = () => { for (const s of searches) if (s.pending) s.cancel().catch(console.error); };

  // If we haven't found a non-prescient success before the non-prescient timeout, return the
  // shortest prescient success we've seen. Prescient failures would have already caused us to
  // return from solve at this point, so we can only find success
  let timeout: ReturnType<typeof setTimeout> | undefined = undefined;
  const timed = new Promise<void>(resolve => {
    timeout = setTimeout(() => {
      for (const result of successes) {
        if (!done || (done[3] && result[3].length < done[3].length)) done = result;
      }
      if (done) {
        cleanup();
        pool.terminate().catch(console.error);
        return resolve();
      }
      // We didn't find any results before the non-prescient timeout, open the floodgates up to
      // return the next success that happens from this point on
      allowed = true;
    }, TIMEOUT.nonprescient);
  });

  try {
    for (const width of [0.5, 0, 10, 0.25, 5, 0.1, 15]) {
      for (const prescient of [false, true]) {
        // No point in scheduling a search if we are already done
        // TODO: can this even happen?
        if (done) continue;

        const desc = `${prescient ? 'prescient' : 'non-prescient'} ${width === 0 ? 'best-first' : 'BULB'} search${width ? ` (width=${width})` : ''}`;
        const search = pool.exec('solve', [encoded, CUTOFF, prescient, width])
          .timeout(TIMEOUT.total)
          .then((result: Result) => {
            // If we are finished already no point in doing anything at this point
            // TODO: can this even happen?
            if (done) return;

            if (result[0] === 'success') {
              console.log(`Found a path of length ${result[3].length} for in ${result[1]}ms after searching ${result[2]} states using ${desc}`);
              successes.push(result);
              if (allowed || !prescient) {
                done = result;
                cleanup();
              }
            } else if (result[0] === 'fail') {
              console.log(`Searched all ${result[2]} states in ${result[1]}ms with ${desc} and did not find any winning path.`);
              // NOTE: we can only terminate if prescient because non-prescient might report
              // failures due to having a smaller search space
              if (prescient) {
                done = result;
                cleanup();
              }
            } else {
              console.log(`Gave up after searching ${CUTOFF} states in ${result[1]}ms with ${desc} due to exhaustion.`);
            }

            return result;
          }).catch(err => {
            if (err instanceof workerpool.Promise.TimeoutError) {
              console.log(`Timed out after ${TIMEOUT.total}ms of searching using ${desc}.`);
            } else if (err instanceof workerpool.Promise.CancellationError || CANCELLED.test(err.message)) {
              console.log(`Cancelled ${desc}.`);
            } else {
              console.log(`Crashed which searching using ${desc}`, err);
            }

            return undefined;
          });
        searches.push(search);
      }
    }

    // Stop waiting if we get a failed prescient, successful non-prescient, or are past the
    // non-prescient timeout. If we need to wait for all searches, exit with exhaustion
    await Promise.race([timed, Promise.all(searches).then(results => {
      if (done) return done;

      for (const result of results) {
        // timeout / cancel / crash
        if (!result) continue;

        if (!done) {
          done = result;
        } else if (result[3]) {
          // TODO: can this even happen? should have set done if exiting with success
          done = !done[3] ? result : result[3].length < done[3].length ? result : done;
        } else if (result[2]) {
          // This should only cover the exhaust case - if we encountered failure we should have
          // already terminated, otherwise just figure out the result with the most states visited
          // (should all be CUTOFF)
          done = !done[2] ? result : result[2] > done[2] ? result : done;
        }
      }

      return done;
    })]);

    // done can still be undefined here if everything was a timeout / cancel / crash
    return (!done ? {visited: -1} : done[3]
      ? {visited: done[2], path: done[3], trace: done[4]}
      : {visited: done[2]});
  } finally {
    if (timeout) clearTimeout(timeout);
    pool.terminate().catch(console.error);
  }
};

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
  const fallback = OPTIONS.includes(arg[0] as Option)
    ? State.create(State.decklist(arg[0] as Option), new Random(seed(arg.slice(1))), true)
    : State.create(State.decklist('S'), new Random(seed(arg)), true);
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
console.log(`State: ${state.toString()} (${state.encode()})`);

const content = document.getElementById('content')!;
while (content.firstChild) content.removeChild(content.firstChild);

const loader = createElement('div', 'loader');
const spinner = createElement('div', 'spinner');
loader.appendChild(spinner);
content.appendChild(loader);

// Promise.resolve(state.search({cutoff: CUTOFF, prescient: false, width: 0.5})).then(result => {
solve(state.encode()).then(result => {
  if (content.firstChild) content.removeChild(content.firstChild);

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
}).catch(console.error);
