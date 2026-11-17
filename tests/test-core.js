#!/usr/bin/env node
// Imperial Rotor Cipher. Copyright (C) 2026 Antonio. SPDX-License-Identifier: GPL-3.0-or-later
// Cipher-core tests for the Imperial Rotor Cipher. No dependencies; needs Node 18+.
//
//   node tests/test-core.js            # tests the core inside index.html
//   node tests/test-core.js src/core.js
//
// Runs the built-in self-test, then compares the core with a separately written
// reference machine, and checks key handling, text handling and speed.
'use strict';

const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
globalThis.crypto ??= nodeCrypto.webcrypto;

const root = path.join(__dirname, '..');
const target = path.resolve(process.argv[2] || path.join(root, 'index.html'));

function loadCore(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) {
    const m = src.match(/<script id="irc-core">([\s\S]*?)<\/script>/);
    if (!m) throw new Error(`No <script id="irc-core"> block in ${file}`);
    src = m[1];
  }
  const mod = { exports: {} };
  new Function('module', src)(mod);
  return mod.exports;
}

const IRC = loadCore(target);
const PARTS = JSON.parse(require('child_process').execFileSync(process.execPath,
  [path.join(root, 'tools', 'gen-parts.js')]).toString());
let failures = 0;
const check = (name, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};
const throwsCode = (fn, code) => { try { fn(); return false; } catch (e) { return code ? e.code === code : true; } };

// ---------------------------------------------------------------- reference machine
// Written independently of the core: string lookups, explicit Enigma pawl rules.
function referenceEncipher(key, symbols) {
  const A = IRC.ALPHABET, n = A.length;
  const parts = PARTS;
  const pos = key.slice();
  let out = '';
  for (const ch of symbols) {
    // pawls: pawl 0 always pushes rotor 0; pawl i (1..9) engages when rotor i-1 shows its notch
    // and then pushes rotor i-1 and rotor i together.
    const atNotch = pos.map((p, i) => A[p] === parts.rotors[i].notch);
    const move = pos.map((_, i) => i === 0 || atNotch[i - 1] || (i < 9 && atNotch[i]));
    move.forEach((m, i) => { if (m) pos[i] = (pos[i] + 1) % n; });
    let c = A.indexOf(ch);
    for (let i = 0; i < 10; i++) {
      const w = parts.rotors[i].wiring;
      c = (A.indexOf(w[(c + pos[i]) % n]) - pos[i] + n) % n;
    }
    c = A.indexOf(parts.reflector[c]);
    for (let i = 9; i >= 0; i--) {
      const w = parts.rotors[i].wiring;
      c = (w.indexOf(A[(c + pos[i]) % n]) - pos[i] + n) % n;
    }
    out += A[c];
  }
  return out;
}

// ---------------------------------------------------------------- run
console.log(`Testing ${path.relative(root, target)}\n`);
for (const r of IRC.selfTest()) check(`[self-test] ${r.name}`, r.pass, r.detail);

const gen = PARTS;
check('embedded rotors, notches and reflector match tools/gen-parts.js',
  gen.rotors.every((r, i) => r.wiring === IRC.ROTORS[i].wiring && IRC.ALPHABET[IRC.ROTORS[i].notch] === r.notch) &&
  gen.reflector === Array.from(IRC.REFLECTOR, (i) => IRC.ALPHABET[i]).join('') && gen.seed === IRC.PARTS_SEED);

// Same output as the reference for random keys, including keys parked near notches so carries cascade.
let agree = true;
for (let t = 0; t < 40; t++) {
  const key = IRC.randomKey();
  if (t % 2) for (let i = 0; i < 6; i++) key[i] = (IRC.ROTORS[i].notch - (t % 3) + IRC.N) % IRC.N;
  const len = 300 + t * 37;
  let msg = '';
  for (let i = 0; i < len; i++) msg += IRC.ALPHABET[nodeCrypto.randomInt(IRC.N)];
  if (IRC.encrypt(key, msg).raw !== referenceEncipher(key, msg)) { agree = false; break; }
}
check('core agrees with an independent reference machine (40 keys, carries cascading)', agree);

// The generalized rule against the real three-rotor Enigma M3 rules, over every state of three rotors:
// right always steps; middle steps if right is at its notch or middle is at its notch (double step);
// left steps if middle is at its notch.
let m3same = true;
const nt = [0, 1, 2].map((i) => IRC.ROTORS[i].notch);
for (let a = 0; a < IRC.N && m3same; a++) for (let b = 0; b < IRC.N && m3same; b++) for (let c = 0; c < IRC.N; c++) {
  const key = [a, b, c, 0, 0, 0, 0, 0, 0, 0];
  const mm = new IRC.Machine(key);
  mm.step();
  const right = (a + 1) % IRC.N;
  const middle = (a === nt[0] || b === nt[1]) ? (b + 1) % IRC.N : b;
  const left = b === nt[1] ? (c + 1) % IRC.N : c;
  if (mm.pos[0] !== right || mm.pos[1] !== middle || (mm.pos[2] !== left && !(c === nt[2] && mm.pos[2] === (c + 1) % IRC.N))) {
    m3same = false; break;
  }
}
check('first three rotors follow the Enigma M3 stepping rules in all 94³ states', m3same);

// Exact number of distinct keys: count every state that step() can produce (two settings whose
// first step lands on the same state encipher identically). Dynamic programming over the rotors,
// tracking which "rotor i-1 was at its notch" values are still possible.
{
  const n = IRC.ROTORS.map((r) => r.notch);
  const N = IRC.N;
  let dist = new Map();                                   // bitmask of feasible a[i-1] values -> count
  for (let s = 0; s < N; s++) {                           // rotor 1 always steps
    const a0 = ((s - 1 + N) % N) === n[0] ? 1 : 0;
    const mask = 1 << a0;
    dist.set(mask, (dist.get(mask) || 0n) + 1n);
  }
  for (let i = 1; i <= 8; i++) {
    const next = new Map();
    for (const [mask, count] of dist) {
      for (let s = 0; s < N; s++) {
        let out = 0;
        for (let prev = 0; prev <= 1; prev++) {
          if (!(mask & (1 << prev))) continue;
          for (let m = 0; m <= 1; m++) {
            const a = ((s - m + N) % N) === n[i] ? 1 : 0;
            if (m === ((prev || a) ? 1 : 0)) out |= 1 << a;
          }
        }
        if (out) next.set(out, (next.get(out) || 0n) + count);
      }
    }
    dist = next;
  }
  let total = 0n;
  for (const count of dist.values()) total += count * BigInt(N);   // rotor 10: any value is reachable
  const bits = Math.log2(Number(total));
  check('exact count of distinct keys ≈ 2^65.42 (so the 2^65.4 headline is right and above 64 bits)',
    Math.abs(bits - IRC.DISTINCT_KEY_BITS) < 0.01 && bits > 64, `${total} ≈ 2^${bits.toFixed(4)}`);
}

// index.html must be the build of the current sources.
check('index.html is up to date with src/ (tools/build.js --check)', (() => {
  try { require('child_process').execFileSync(process.execPath, [path.join(root, 'tools', 'build.js'), '--check'], { stdio: 'pipe' }); return true; }
  catch { return false; }
})());

// Odometer behaviour over a full turn of rotor 1.
const m = new IRC.Machine(new Array(10).fill(0));
const moves = new Array(10).fill(0);
for (let i = 0; i < IRC.N * 3; i++) m.step().stepped.forEach((s, r) => { if (s) moves[r]++; });
check('over 3 turns of rotor 1: rotor 1 steps every press, rotor 2 about 3 times, rotors 4–10 not at all',
  moves[0] === IRC.N * 3 && moves[1] >= 3 && moves[1] <= 4 && moves.slice(3).every((x) => x === 0), moves.join(','));

// Key handling.
check('parseKey accepts any separators', IRC.parseKey('7 42,88/13:0 93 61-30;54 19').join() === '7,42,88,13,0,93,61,30,54,19');
check('parseKey accepts 20 bare digits (phone keypads have no separators)', IRC.parseKey('07428813009361305419').join() === '7,42,88,13,0,93,61,30,54,19');
check('parseKey rejects 9 numbers', throwsCode(() => IRC.parseKey('1-2-3-4-5-6-7-8-9')));
check('parseKey rejects a setting of 94', throwsCode(() => IRC.parseKey('0-0-0-0-0-0-0-0-0-94')));
check('parseKey refuses letters and decimal points instead of guessing',
  throwsCode(() => IRC.parseKey('1O-42-1-1-1-1-1-1-1-1')) && throwsCode(() => IRC.parseKey('1.5 2 3 4 5 6 7 8 9')) &&
  throwsCode(() => IRC.parseKey('１ 2 3 4 5 6 7 8 9 10')) && throwsCode(() => IRC.parseKey('1 2 3 4 5 6 7 8 9 10 extra')));
check('formatKey refuses an invalid key', throwsCode(() => IRC.formatKey([1.5, -1, 100])));
check('pressIndex and press refuse bad input without moving the rotors', (() => {
  const mm = new IRC.Machine(new Array(10).fill(0));
  const ok = throwsCode(() => mm.pressIndex(NaN)) && throwsCode(() => mm.pressIndex(94)) &&
    throwsCode(() => mm.press(undefined)) && throwsCode(() => mm.press('é'));
  return ok && mm.count === 0 && mm.pos.every((p) => p === 0);
})());
check('press treats space as ~ (same rule as pasted text)', (() => {
  const a = new IRC.Machine(new Array(10).fill(5)), b = new IRC.Machine(new Array(10).fill(5));
  return a.press(' ') === b.press('~');
})());
const counts = new Array(IRC.N).fill(0);
for (let i = 0; i < 5000; i++) IRC.randomKey().forEach((v) => counts[v]++);
check('randomKey covers every setting 00–93 roughly evenly', counts.every((c) => c > 380 && c < 700),
  `min ${Math.min(...counts)}, max ${Math.max(...counts)}`);

// Text handling.
const k = IRC.randomKey();
const p = IRC.preparePlaintext('line one\r\nline two\rthree\nfour');
check('non-breaking and other Unicode spaces count as spaces; Unicode line separators as line breaks',
  IRC.preparePlaintext('a\u00a0b\u3000c\u2028d').symbols === 'a~b~c~d');
check('invisible refused characters are named, not shown as blank quotes',
  (() => { try { IRC.preparePlaintext('x\u200by'); return false; } catch (e) { return /zero-width space/.test(e.message); } })());
check('curly quotes, dashes and the ellipsis are folded to plain keyboard characters',
  (() => { const r = IRC.preparePlaintext('“Don’t” — wait…'); return r.symbols === '"Don\'t"~-~wait...' && r.folded === 5; })());
check('spaces and every kind of line break become ~', p.symbols === 'line~one~line~two~three~four' &&
  p.spaces === 2 && p.lineBreaks === 3);
check('a typed ~ comes back as a space (documented)', IRC.decrypt(k, IRC.encrypt(k, 'a~b').grouped).text === 'a b');
check('emoji and accented letters are refused with code BAD_CHAR', throwsCode(() => IRC.encrypt(k, 'café'), 'BAD_CHAR') &&
  throwsCode(() => IRC.encrypt(k, 'ok 👍'), 'BAD_CHAR'));
check('decrypt ignores spaces and line breaks in the groups', IRC.decrypt(k, IRC.encrypt(k, 'Hello there').grouped.replace(/ /g, '\n  ')).text === 'Hello there');
check('decrypt refuses characters the machine never writes', throwsCode(() => IRC.decrypt(k, 'abc é'), 'BAD_CHAR'));
check('empty message gives empty ciphertext', IRC.encrypt(k, '').raw === '' && IRC.decrypt(k, '').text === '');
const wrong = k.slice(); wrong[9] = (wrong[9] + 1) % IRC.N;
check('a key that differs only in the slowest rotor gives different ciphertext',
  IRC.encrypt(k, 'The quick brown fox').raw !== IRC.encrypt(wrong, 'The quick brown fox').raw);
const garbled = IRC.encrypt(k, 'Garble just one symbol please').raw.split('');
garbled[5] = garbled[5] === '!' ? '"' : '!';
const back = IRC.decrypt(k, garbled.join('')).text;
check('a corrupted cipher symbol garbles only that symbol', back.length === 29 &&
  [...back].filter((c, i) => c !== 'Garble just one symbol please'[i]).length === 1);

// Speed.
let big = '';
for (let i = 0; i < 200000; i++) big += IRC.ALPHABET[i % IRC.N];
const t0 = Date.now();
const e = IRC.encrypt(k, big);
const d = IRC.decrypt(k, e.grouped);
check('200,000-symbol round trip', d.raw === big, `${Date.now() - t0} ms`);

console.log(`\n${failures ? `${failures} FAILED` : 'All checks passed.'}`);
process.exit(failures ? 1 : 0);
