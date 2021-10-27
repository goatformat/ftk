// https://github.com/parcel-bundler/parcel/issues/7157

import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const workerpool = path.join(__dirname, 'workerpool');
prepare(workerpool);
fs.copyFileSync(
  path.resolve(__dirname, '..', 'node_modules', 'workerpool', 'dist', 'workerpool.js'),
  path.join(workerpool, 'index.js')
);

const src = path.join(__dirname, 'src');
prepare(src);
for (const file of fs.readdirSync(path.resolve(__dirname, '..', 'src'))) {
  fs.copyFileSync(
    path.resolve(__dirname, '..', 'src', file),
    path.join(src, file)
  );
}

const worker = path.join(__dirname, '..', 'html', 'sim', 'worker.ts');
const file = fs.readFileSync(worker, 'utf-8');
fs.writeFileSync(worker,
  file.replace("from 'workerpool'", "from '~/.parcel/workerpool'")
      .replace("from '../../src'", "from '~/.parcel/src'")
);
