// Ember Yard — the hand-in program for the threejs-fps-02 entry.
// Node 22, standard library only. It mirrors this folder's game/ and
// screenshots/ into the grader's output folder and writes dossier.json
// there with the kit's vendored dossier builder, so the judge can read the
// game. Run it outside the grader like this:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
// The output folder ends up holding game/, screenshots/ and dossier.json.
// Gate limits the program refuses to exceed: at most four screenshots,
// each no bigger than 256 KiB; game/index.html at most 1 MiB; game/ at
// most 993 entries and 48 MiB in total.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = url.fileURLToPath(new URL('.', import.meta.url));
const outRoot = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 256 * 1024;
const MAX_INDEX_BYTES = 1024 * 1024;
const MAX_GAME_ENTRIES = 993;
const MAX_GAME_BYTES = 48 * 1024 * 1024;
const MAX_DOSSIER_BYTES = 1536 * 1024;

function abort(reason: string): never {
  throw new Error(`Ember Yard hand-in refused: ${reason}`);
}

function walkEntries(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    found.push(full);
    if (entry.isDirectory()) walkEntries(full, found);
  }
  return found;
}

function totalBytes(files: string[]): number {
  let sum = 0;
  for (const file of files) {
    if (fs.statSync(file).isFile()) sum += fs.statSync(file).size;
  }
  return sum;
}

function checkGame(): void {
  const indexFile = path.join(repoRoot, 'game', 'index.html');
  if (!fs.existsSync(indexFile)) abort('game/index.html is missing');
  if (fs.statSync(indexFile).size > MAX_INDEX_BYTES) {
    abort('game/index.html is over 1 MiB');
  }
  const entries = walkEntries(path.join(repoRoot, 'game'));
  if (entries.length > MAX_GAME_ENTRIES) {
    abort(`game/ has ${entries.length} entries, over the 993 limit`);
  }
  const bytes = totalBytes(entries);
  if (bytes > MAX_GAME_BYTES) {
    abort(`game/ is ${bytes} bytes, over the 48 MiB limit`);
  }
}

function checkShots(): string[] {
  const shotsDir = path.join(repoRoot, 'screenshots');
  if (!fs.existsSync(shotsDir)) abort('screenshots/ is missing');
  const shots = fs
    .readdirSync(shotsDir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (shots.length < 3 || shots.length > MAX_SHOTS) {
    abort(`screenshots/ holds ${shots.length} images, need 3 or 4`);
  }
  for (const name of shots) {
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('-')) {
      abort(`bad screenshot name: ${name}`);
    }
    const size = fs.statSync(path.join(shotsDir, name)).size;
    if (size > MAX_SHOT_BYTES) {
      abort(`screenshot ${name} is ${size} bytes, over 256 KiB`);
    }
  }
  return shots;
}

checkGame();
const shots = checkShots();

fs.mkdirSync(outRoot, { recursive: true });
fs.cpSync(path.join(repoRoot, 'game'), path.join(outRoot, 'game'), {
  recursive: true,
});
fs.mkdirSync(path.join(outRoot, 'screenshots'), { recursive: true });
fs.cpSync(path.join(repoRoot, 'screenshots'), path.join(outRoot, 'screenshots'), {
  recursive: true,
});

const dossier = buildDossier(outRoot, {
  text_max_bytes: 163840,
  screenshots: {
    max: 4,
    max_bytes: 262144,
  },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
if (dossier.length > MAX_DOSSIER_BYTES) {
  abort(`dossier.json is ${dossier.length} bytes, over 1.5 MiB`);
}
fs.writeFileSync(path.join(outRoot, 'dossier.json'), dossier);
console.log(
  `Ember Yard handed in: ${shots.length} screenshots, dossier ${dossier.length} bytes -> ${outRoot}`,
);
