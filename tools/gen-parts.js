#!/usr/bin/env node
// Imperial Rotor Cipher. Copyright (C) 2026 Antonio. SPDX-License-Identifier: GPL-3.0-or-later
// Regenerates the published rotor wirings, notches and reflector from a fixed public seed.
// Anyone can run this and check that the constants in index.html match:
//   node tools/gen-parts.js
// Method: SHA-256 in counter mode over the label below gives a byte stream; Fisher–Yates
// with rejection sampling shuffles 0..93 for each rotor; the notch is one more draw; the
// reflector shuffles 0..93 and pairs neighbours (so it is an involution with no fixed point).
'use strict';
const crypto = require('crypto');

const SEED = 'IMPERIAL-ROTOR-CIPHER/parts/v1';
const N = 94;
const ALPHABET = Array.from({ length: N }, (_, i) => String.fromCharCode(33 + i)).join('');

function stream(label) {
  let counter = 0, buf = Buffer.alloc(0), off = 0;
  return () => {
    if (off >= buf.length) {
      buf = crypto.createHash('sha256').update(`${SEED}/${label}/${counter++}`).digest();
      off = 0;
    }
    return buf[off++];
  };
}

function randInt(next, n) {          // unbiased 0..n-1 from bytes (n <= 256)
  const limit = 256 - (256 % n);
  for (;;) { const b = next(); if (b < limit) return b % n; }
}

function shuffle(next) {
  const p = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) { const j = randInt(next, i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

const rotors = [];
for (let r = 0; r < 10; r++) {
  const next = stream(`rotor/${r}`);
  const w = shuffle(next);
  rotors.push({ wiring: w.map((i) => ALPHABET[i]).join(''), notch: ALPHABET[randInt(next, N)] });
}
const order = shuffle(stream('reflector'));
const refl = new Array(N);
for (let i = 0; i < N; i += 2) { refl[order[i]] = order[i + 1]; refl[order[i + 1]] = order[i]; }

const out = { seed: SEED, alphabet: ALPHABET, rotors, reflector: refl.map((i) => ALPHABET[i]).join('') };
console.log(JSON.stringify(out, null, 2));
