#!/usr/bin/env node --no-warnings --experimental-specifier-resolution=node
import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';
import {execFileSync} from 'child_process';
import {Parcel} from '@parcel/core';
import showdown from 'showdown';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const build = process.argv[2] === 'build';
const worker = path.join(__dirname, 'worker.ts');
if (build) {
  const status = execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'});
  if (status) {
    console.error(`Uncommited changes:\n${status}`);
    process.exit(1);
  }
  // Parcel Workaround: https://github.com/parcel-bundler/parcel/issues/7157
  const prepare = dir => {
    try {
      fs.rmdirSync(dir, {recursive: true});
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    try {
      fs.mkdirSync(dir);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  };

  const _parcel = path.join(__dirname, '..', '.parcel');
  prepare(_parcel);

  const workerpool = path.join(_parcel, 'workerpool');
  prepare(workerpool);
  fs.copyFileSync(
    path.resolve(__dirname, '..', 'node_modules', 'workerpool', 'dist', 'workerpool.js'),
    path.join(workerpool, 'index.js')
  );

  const src = path.join(_parcel, 'src');
  prepare(src);
  for (const file of fs.readdirSync(path.resolve(__dirname, '..', 'src'))) {
    fs.copyFileSync(
      path.resolve(__dirname, '..', 'src', file),
      path.join(src, file)
    );
  }

  const file = fs.readFileSync(worker, 'utf-8');
  fs.writeFileSync(worker,
    file.replace("from 'workerpool'", "from '~/.parcel/workerpool'")
      .replace("from '../src'", "from '~/.parcel/src'"));
}

const README = path.join(__dirname, '..', 'README.md');
const converter = new showdown.Converter({
  ghCompatibleHeaderId: true,
  ghCodeBlocks: true,
  tables: true,
});
const body = converter.makeHtml(fs.readFileSync(README, 'utf8'));

const html = `<!doctype html>
<html lang=en>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#FFF" />
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="Library FTK">
  <meta name="description" content="Library FTK">
  <link rel="apple-touch-icon" sizes="180x180" href="./img/icon/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="./img/icon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="./img/icon/favicon-16x16.png">
  <link rel="manifest" href="./manifest.webmanifest" />
  <title>Library FTK - Simulator</title>
  <style>
    :root {
      --bg-color: #FFF;
      --fg-color: #000;
      --link-color: #00E;
      --link-active-color: #F00;
      --link-visited-color: #551A8B;
    }
    [data-theme="dark"] {
      --bg-color: #000;
      --fg-color: #DDD;
      --link-color: #9E9EFF;
      --link-active-color: #FF9E9E;
      --link-visited-color: #D0ADF0;
    }
    body {
      font-family: 'Roboto', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
      margin: 4em auto;
      max-width: 690px;
      line-height: 1.4em;
      overflow-x: hidden;
      background-color: var(--bg-color);
      color: var(--fg-color);
    }
    var, code {
      font-family: "Roboto Mono", "Monaco", monospace;
      font-style: normal;
    }
    a { color: var(--link-color); }
    a:active { color: var(--link-active-color); }
    a:visited { color: var(--link-visited-color); }
    h1 {
      margin-bottom: 0.8em;
      text-align: center;
      font-size: 3em;
    }
    h1 a, h2 a {
      color: inherit;
      text-decoration: inherit;
    }
    img {
      max-width: 80vw;
      margin-left: 50%;
      transform: translateX(-50%);
    }
    @media(max-width: 768px) {
      body {
        font-size: 0.85em;
        max-width: 95%;
        margin: 2em auto;
      }
      img {
        margin-left: auto;
        transform: none;
      }
    }
  </style>
<body>
${body}
<a href='./sim/index.html'></a><a href='./trace/index.html'></a>
<script type="module">
  const scope = process.env.NODE_ENV === 'production' ? '/ftk/' : undefined;
  navigator.serviceWorker.register(new URL('service-worker.js', import.meta.url), {type: 'module', scope});

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }
  function listener(e) {
    setTheme(e.matches ? 'dark' : 'light');
  }
  const pref = window.matchMedia('(prefers-color-scheme: dark)');
  try {
    pref.addEventListener('change', listener);
  } catch (err) {
    pref.addListener(listener);
  }
  setTheme(pref.matches ? 'dark' : 'light');
</script>
</body>
</html>
`;

(async () => {
  try {
    const entries = path.join(__dirname, 'index.html');
    fs.writeFileSync(entries, html);

    const config = path.join(__dirname, '..', '.parcelrc');
    // Really we should be able to handle the development server case here two, but getting
    // Parcel.watch() to work (or spawning `parcel serve`) ended up being difficult
    if (build) {
      await new Parcel({entries, config, mode: 'production', defaultTargetOptions: {
        shouldOptimize: true,
        sourceMaps: true,
        shouldScopeHoist: true,
        publicUrl: '/ftk',
        distDir: path.join(__dirname, '..', 'dist'),
      }}).run();
    }
  } finally {
    if (build) execFileSync('git', ['restore', worker]);
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
