'use strict';
/* Imperial Rotor Cipher: user interface. Copyright (C) 2026 Antonio. SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  const $ = (id) => document.getElementById(id);
  const { N, ROTOR_COUNT, ALPHABET, ROTORS } = IRC;
  const MAX_BATCH = 1000000;                           // characters per message in paste mode

  const ui = {
    bank: $('bank'), key: $('key'), randomKey: $('randomKey'), resetRotors: $('resetRotors'), sound: $('sound'),
    tabLive: $('tab-live'), tabBatch: $('tab-batch'), panelLive: $('panel-live'), panelBatch: $('panel-batch'),
    dirEnc: $('dirEnc'), dirDec: $('dirDec'), typein: $('typein'), bezel: $('lcdBezel'),
    lcdText: $('lcdText'), lcdMode: $('lcdMode'), lcdLast: $('lcdLast'), lcdCount: $('lcdCount'),
    paper: $('paper'), paperText: $('paperText'), newSheet: $('newSheet'),
    input: $('input'), inCount: $('inCount'), encipher: $('encipher'), decipher: $('decipher'), clearBatch: $('clearBatch'),
    status: $('status'), undo: $('undo'), announce: $('announce'), count: $('countOut'),
    outNote: $('outNote'), copyOut: $('copyOut'), download: $('download'),
    selfTest: $('selfTest'), testOut: $('testOut'), copyKey: $('copyKey'), nowOut: $('nowOut'),
  };

  // ---------------------------------------------------------------- state
  let key = IRC.randomKey();
  let machine = new IRC.Machine(key);
  let keyed = '';                 // machine symbols keyed this message
  let printed = '';                 // machine symbols printed this message
  let lastPath = null;            // signal path of the last key press
  let mode = 'live';
  let lastPair = null;            // [keyed, printed] for the LCD's last-key readout
  let direction = 'enc';          // 'enc': keyed = plain, printed = ciphertext; 'dec': the other way round
  let keyInvalid = false;
  const usedKeys = new Map();     // key text -> message enciphered with it (this session only)

  const sym = (i) => ALPHABET[i];
  const pad = (n, w) => String(n).padStart(w, '0');
  const readable = (s) => s.split('~').join(' ');

  let undoAction = null;
  let undoIsUndo = false;         // the status button is Undo (not Finish now)
  /** Status line, optionally with one action button (Undo by default, or e.g. "Finish now"). */
  function setStatus(msg, kind = '', undo = null, label = 'Undo') {
    ui.status.textContent = msg;
    ui.status.className = `status ${kind}`;
    if (!undo && document.activeElement === ui.undo) ui.paper.focus();   // never strand keyboard focus on a vanishing button
    undoAction = undo;
    undoIsUndo = !!undo && label === 'Undo';
    ui.undo.hidden = !undo;
    if (ui.undo.textContent !== label) ui.undo.textContent = label;
  }
  ui.undo.addEventListener('click', () => { if (undoAction) undoAction(); });

  // ---------------------------------------------------------------- sound (synthesised, no files)
  let audio = null;
  let soundOn = true;
  try { soundOn = localStorage.getItem('irc-sound') !== 'off'; } catch { /* storage blocked */ }

  function click(delay = 0, weight = 1) {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state !== 'running') audio.resume().catch(() => {});
      const t = audio.currentTime + delay;
      const len = Math.floor(audio.sampleRate * 0.03);
      const buf = audio.createBuffer(1, len, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
      const noise = audio.createBufferSource();
      noise.buffer = buf;
      const band = audio.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = 2400; band.Q.value = 1.2;
      const g = audio.createGain();
      g.gain.value = 0.22 * weight;
      noise.connect(band).connect(g).connect(audio.destination);
      noise.start(t);
      const thump = audio.createOscillator();
      const tg = audio.createGain();
      thump.frequency.setValueAtTime(140, t);
      thump.frequency.exponentialRampToValueAtTime(60, t + 0.05);
      tg.gain.setValueAtTime(0.18 * weight, t);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      thump.connect(tg).connect(audio.destination);
      thump.start(t); thump.stop(t + 0.08);
    } catch { /* audio unavailable: stay silent */ }
  }
  // Safari starts audio only inside a user gesture, so wake the sound on the first press or tap.
  const wakeAudio = () => {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state !== 'running') audio.resume().catch(() => {});
    } catch { /* no audio */ }
  };
  document.addEventListener('pointerdown', wakeAudio, { capture: true });
  document.addEventListener('keydown', wakeAudio, { capture: true });
  const renderSound = () => ui.sound.setAttribute('aria-pressed', String(soundOn));
  ui.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem('irc-sound', soundOn ? 'on' : 'off'); } catch { /* ignore */ }
    renderSound();
    if (soundOn) click();
  });

  // ---------------------------------------------------------------- rotor bank
  const BAND_SPAN = 2;                                 // symbols shown either side of the window
  const rotorEls = ROTORS.map((r, i) => {
    const col = document.createElement('div');
    col.className = 'rotor';
    col.innerHTML = `
      <div class="rotor-top"><span>R${i + 1}</span><span class="pawl" title="Stepped on the last key"></span></div>
      <div class="drum" tabindex="0" role="spinbutton" aria-valuemin="0" aria-valuemax="${N - 1}">
        <div class="band"></div><div class="window"></div>
      </div>
      <div class="setting">
        <button type="button" tabindex="-1" data-d="-1" aria-label="Rotor ${i + 1}: key setting down"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8"/></svg></button>
        <span class="num"></span>
        <button type="button" tabindex="-1" data-d="1" aria-label="Rotor ${i + 1}: key setting up"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6 2v8"/></svg></button>
      </div>
      <div class="trace" aria-hidden="true"><span class="fwd">&nbsp;</span><span class="ret">&nbsp;</span></div>`;
    ui.bank.appendChild(col);
    const el = {
      drum: col.querySelector('.drum'), band: col.querySelector('.band'), num: col.querySelector('.num'),
      pawl: col.querySelector('.pawl'), fwd: col.querySelector('.fwd'), ret: col.querySelector('.ret'),
    };
    for (let k = -BAND_SPAN; k <= BAND_SPAN; k++) el.band.appendChild(document.createElement('span'));
    col.querySelectorAll('.setting button').forEach((b) => b.addEventListener('click', () => setRotor(i, key[i] + Number(b.dataset.d))));
    el.drum.addEventListener('keydown', (e) => {
      const to = { ArrowUp: key[i] + 1, ArrowRight: key[i] + 1, ArrowDown: key[i] - 1, ArrowLeft: key[i] - 1,
        PageUp: key[i] + 10, PageDown: key[i] - 10, Home: 0, End: N - 1 }[e.key];
      if (to !== undefined) { e.preventDefault(); e.stopPropagation(); setRotor(i, to); }
    });
    return el;
  });

  function renderBank(turned = null) {
    rotorEls.forEach((el, i) => {
      const p = machine.pos[i];
      const spans = el.band.children;
      for (let k = -BAND_SPAN; k <= BAND_SPAN; k++) {
        const v = (p + k + N) % N;
        spans[k + BAND_SPAN].textContent = sym(v);
        spans[k + BAND_SPAN].classList.toggle('notch', i < ROTOR_COUNT - 1 && v === ROTORS[i].notch);  // rotor 10's notch never acts
      }
      el.num.textContent = pad(key[i], 2);
      el.drum.setAttribute('aria-label', `Rotor ${i + 1} key setting`);
      el.drum.setAttribute('aria-valuenow', String(key[i]));
      el.drum.setAttribute('aria-valuetext', `${pad(key[i], 2)}, symbol ${sym(key[i])}` +
        (p !== key[i] ? `; the window now shows ${pad(p, 2)}` : ''));
      el.pawl.classList.toggle('on', !!(turned && turned[i]));
      if (lastPath) {
        const back = 11 + (ROTOR_COUNT - 1 - i);
        el.fwd.textContent = `${sym(lastPath[i])}→${sym(lastPath[i + 1])}`;
        el.ret.textContent = `${sym(lastPath[back + 1])}←${sym(lastPath[back])}`;
      } else {
        el.fwd.innerHTML = '&nbsp;';
        el.ret.innerHTML = '&nbsp;';
      }
    });
    if (turned) {                                       // restart the turn animation: write, one read, write
      rotorEls.forEach((el, i) => { if (turned[i]) el.band.classList.remove('turn'); });
      void ui.bank.offsetWidth;
      rotorEls.forEach((el, i) => { if (turned[i]) el.band.classList.add('turn'); });
    }
    ui.nowOut.textContent = IRC.formatKey(machine.pos);
    const n = machine.count;
    ui.count.textContent = n < 10000 ? pad(n, 4) : n.toLocaleString('en-US');
  }

  // ---------------------------------------------------------------- messages, keys and undo
  /** Rebuild the machine from the key and replay a keyed message (used by Backspace and Undo). */
  function replay(symbols) {
    stopPrinting();
    machine = new IRC.Machine(key);
    keyed = ''; printed = ''; lastPath = null;
    let last = null;
    const outs = [];
    for (let i = 0; i < symbols.length; i++) {
      last = machine.pressDetailed(symbols.charCodeAt(i) - 33);
      outs.push(sym(last.out));
    }
    keyed = symbols;
    printed = outs.join('');
    if (last) lastPath = last.path;
    lastPair = last ? [symbols[symbols.length - 1], sym(last.out)] : null;
    renderBank(null);
    renderOutput();
  }

  const snapshot = () => ({ key: key.slice(), keyed, direction, input: ui.input.value });
  function restore(s, what) {
    key = s.key.slice();
    direction = s.direction;
    showKey();
    committedKey = ui.key.value;
    ui.input.value = s.input; countChars();
    renderDirection();
    replay(s.keyed);
    setStatus(`${what} undone. The message is back.`, 'ok');
  }

  /** When ciphertext leaves the machine (copied or downloaded), remember its key so reusing it can be warned about. */
  function markKeyUsed() {
    if (direction === 'enc' && keyed) usedKeys.set(IRC.formatKey(key), keyed);
  }

  /**
   * Run a change that starts a new message. If a message was in progress, offer Undo; if an
   * Undo is already on offer (say the button was clicked twice), keep it rather than lose it.
   */
  function newMessage(change, message, kind = 'ok') {
    const before = snapshot();
    const pending = undoIsUndo ? undoAction : null;
    change();
    replay('');
    if (before.keyed) setStatus(`${message} The previous message was cleared.`, 'warn', () => restore(before, 'Change'));
    else setStatus(message, kind, pending);
  }

  function showKey() {
    ui.key.value = IRC.formatKey(key);
    ui.key.removeAttribute('aria-invalid');
    keyInvalid = false;
  }

  function setRotor(i, value) {
    const v = ((value % N) + N) % N;
    if (v === key[i] && machine.count === 0) return;
    newMessage(() => { key[i] = v; showKey(); committedKey = ui.key.value; }, `Rotor ${i + 1} key setting is now ${pad(v, 2)}.`);
    click(0, 0.5);
  }

  let committedKey = '';
  function commitKey() {
    const text = ui.key.value;
    if (text === committedKey) return;
    committedKey = text;
    let next;
    try {
      next = IRC.parseKey(text);
    } catch (err) {
      ui.key.setAttribute('aria-invalid', 'true');
      keyInvalid = true;
      setStatus(`${err.message} The machine is still on the previous key; press Escape to put it back.`, 'err');
      return;
    }
    newMessage(() => { key = next; showKey(); committedKey = ui.key.value; }, 'Key set. The rotors are at the key.');
  }
  ui.key.addEventListener('change', commitKey);
  ui.key.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitKey(); }
    if (e.key === 'Escape' && keyInvalid) { showKey(); committedKey = ui.key.value; setStatus('Key put back.', 'ok'); }
  });
  ui.key.addEventListener('blur', () => {                       // never leave a key on show that the machine is not using
    if (keyInvalid) { showKey(); committedKey = ui.key.value; setStatus('That key was not valid, so the previous key was put back.', 'warn'); }
  });

  ui.randomKey.addEventListener('click', () => newMessage(() => { key = IRC.randomKey(); showKey(); committedKey = ui.key.value; },
    'New random key set. Record it and give it to the other person safely before you send anything.'));
  ui.copyKey.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(IRC.formatKey(key)); setStatus('Key copied. Share it by a separate, safe route.', 'ok'); }
    catch { setStatus('The browser blocked copying. Select the key and copy it by hand.', 'err'); }
  });
  ui.resetRotors.addEventListener('click', () => newMessage(() => {}, 'Rotors reset to the key.'));
  ui.newSheet.addEventListener('click', () => newMessage(() => {}, 'New sheet. The rotors are back at the key for a new message.'));

  // ---------------------------------------------------------------- direction
  function renderDirection() {
    const enc = direction === 'enc';
    ui.dirEnc.setAttribute('aria-checked', String(enc));
    ui.dirDec.setAttribute('aria-checked', String(!enc));
    ui.dirEnc.tabIndex = enc ? 0 : -1;
    ui.dirDec.tabIndex = enc ? -1 : 0;
    ui.outNote.textContent = enc ? 'Ciphertext: send this' : 'Plain text: the message you received';
    ui.copyOut.textContent = enc ? 'Copy ciphertext' : 'Copy plain text';
    renderOutput();
  }
  /** Changing direction mid-message would relabel what is on the paper, so it starts a new message. */
  function setDirection(d, focus) {
    finishPrinting();
    if (d !== direction) {
      const label = d === 'enc' ? 'Enciphering' : 'Deciphering';
      if (keyed) newMessage(() => { direction = d; renderDirection(); }, `Switched to ${label}. The rotors are back at the key.`);
      else { direction = d; renderDirection(); }
    }
    if (focus) (d === 'enc' ? ui.dirEnc : ui.dirDec).focus();
  }
  ui.dirEnc.addEventListener('click', () => setDirection('enc'));
  ui.dirDec.addEventListener('click', () => setDirection('dec'));
  [ui.dirEnc, ui.dirDec].forEach((b) => b.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation(); setDirection(direction === 'enc' ? 'dec' : 'enc', true);
    }
  }));

  // ---------------------------------------------------------------- typing into the LCD
  const MAX_LIVE_PASTE = 100000;  // longer messages belong in paste mode
  let announceTimer = 0;
  let startupHint = true;
  const spoken = (ch) => (ch === '~' ? 'tilde' : ch === ' ' ? 'space' : ch);

  /** Checks and bookkeeping before the first symbol of a run is pressed. False means do not type. */
  function beginTyping() {
    if (keyInvalid) { setStatus('Fix the key, or press Escape in the key box to put the old one back, before typing.', 'err'); return false; }
    stopPrinting(true);
    if (!keyed && direction === 'enc' && usedKeys.has(IRC.formatKey(key))) {
      setStatus('This key was already used for a message you copied or downloaded. Choose a new key before you send this one.', 'warn');
    } else if (startupHint || undoAction) {
      setStatus('');                                     // typing a new message ends the hint and any chance to undo
    }
    startupHint = false;
    return true;
  }

  function afterTyping(lastIn, r, count) {
    lastPath = r.path;
    lastPair = [lastIn, sym(r.out)];
    renderBank(r.stepped);
    renderOutput(true);
    click(0, 1);
    const carries = r.stepped.filter(Boolean).length - 1;
    for (let c = 1; c <= Math.min(carries, 3); c++) click(c * 0.025, 0.6);
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      ui.announce.textContent = count > 1
        ? `${count} symbols typed. ${keyed.length} in this message.`
        : `${spoken(lastIn)} prints ${spoken(sym(r.out))}. ${keyed.length} typed.`;
    }, 450);
  }

  function backspace() {
    if (!keyed) return;
    replay(keyed.slice(0, -1));
    click(0, 0.5);
  }

  /**
   * Type a run of characters (one key, or a whole paste). Enciphering: spaces and line breaks
   * become ~. Deciphering: whitespace is skipped, so received groups can be typed exactly as
   * written. Anything off the keyboard stops the run with a message. A long run is pressed in
   * one go and drawn once, so pasting stays fast.
   */
  const cipherSpace = (ch) => /\s/u.test(ch) || ch === '\u0085';
  function typeText(text) {
    const xs = [];
    let stopped = '';
    for (const ch of text.replace(/\r\n?/g, '\n')) {
      if (direction === 'dec' && cipherSpace(ch)) continue;
      const x = IRC.toIndex(ch);
      if (x < 0) { stopped = ch; break; }
      xs.push(x);
    }
    if (xs.length && beginTyping()) {
      const outs = [];
      let r = null;
      for (const x of xs) { r = machine.pressDetailed(x); outs.push(sym(r.out)); }
      keyed += xs.map(sym).join('');
      printed += outs.join('');
      afterTyping(sym(xs[xs.length - 1]), r, xs.length);
    }
    if (stopped) {
      setStatus(`${IRC.describeChar(stopped)} is not on the machine’s keyboard${xs.length ? `; stopped after ${xs.length} symbols` : ''}.`, 'warn');
    }
  }

  ui.typein.addEventListener('beforeinput', (e) => {
    if (e.isComposing || e.inputType === 'insertCompositionText') return;   // handled at compositionend
    e.preventDefault();
    if (mode !== 'live') return;
    const t = e.inputType;
    if (t === 'deleteContentBackward' || t === 'deleteWordBackward' || t === 'deleteSoftLineBackward') backspace();
    else if (t === 'insertLineBreak' || t === 'insertParagraph') typeText('\n');
    else if ((t === 'insertText' || t === 'insertReplacementText' || t === 'insertFromComposition') && e.data) typeText(e.data);
  });
  // Dead keys and phone keyboards deliver characters through composition: type the result.
  ui.typein.addEventListener('compositionend', (e) => {
    if (mode === 'live' && e.data) typeText(e.data);
    ui.typein.value = '';
  });
  ui.typein.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData ? e.clipboardData.getData('text') : '';
    if (text.length > MAX_LIVE_PASTE) {
      setStatus(`Live typing takes pastes of up to ${MAX_LIVE_PASTE.toLocaleString('en-US')} characters. Use Paste a message for longer text.`, 'err');
      return;
    }
    typeText(text);
  });
  ui.typein.addEventListener('input', (e) => { if (!e.isComposing) ui.typein.value = ''; });
  ui.typein.addEventListener('focus', () => ui.bezel.classList.add('armed'));
  ui.typein.addEventListener('blur', () => ui.bezel.classList.remove('armed'));

  // A mouse click leaves focus on the clicked button; move it off so Space and Enter cannot press it again.
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && e.detail > 0 && !b.closest('.tabs, .switch')) b.blur();
  });

  // ---------------------------------------------------------------- output: LCD and paper
  // Ciphertext groups are laid out to fit the width of the paper (and LCD), so a five-symbol
  // group is never split across lines. Copy and Download use ten groups to a line.
  const charWidth = new Map();
  function groupsThatFit(el) {
    if (!charWidth.has(el)) {
      const probe = document.createElement('span');
      probe.textContent = '0'.repeat(30);
      probe.style.cssText = 'visibility:hidden;position:absolute;white-space:pre';
      el.appendChild(probe);
      charWidth.set(el, probe.getBoundingClientRect().width / 30);
      probe.remove();
    }
    const cw = charWidth.get(el);
    const width = el.clientWidth;
    return cw > 0 && width > 0 ? Math.max(1, Math.floor((width + cw) / (6 * cw))) : 10;
  }
  window.addEventListener('resize', () => { charWidth.clear(); renderOutput(); });

  /** Show text on the paper; the newest strike is a touch darker. */
  function showOnPaper(text, fresh) {
    ui.paperText.classList.toggle('plain', direction === 'dec');
    ui.paperText.textContent = fresh && text ? text.slice(0, -1) : text;
    if (fresh && text) {
      const s = document.createElement('span');
      s.className = 'fresh';
      s.textContent = text.slice(-1);
      ui.paperText.appendChild(s);
    }
    ui.paper.scrollTop = ui.paper.scrollHeight;
  }
  const paperText = (symbols) => (direction === 'enc'
    ? IRC.groupCipher(symbols, 5, groupsThatFit(ui.paperText)) : readable(symbols));

  // The LCD wraps the text and keeps the newest lines in view; only the tail is drawn, so huge pastes stay fast.
  function renderOutput(fresh = false) {
    if (printing) { renderPrinting(); return; }
    const enc = direction === 'enc';
    const tail = keyed.slice(-1500);
    ui.lcdText.textContent = enc ? readable(tail) : IRC.groupCipher(tail, 5, groupsThatFit(ui.lcdText.parentElement));
    ui.lcdMode.textContent = enc ? 'ENCIPHER' : 'DECIPHER';
    // A space is shown as a space (it is enciphered as ~ inside the machine).
    const shown = (ch, plain) => (plain && ch === '~' ? 'SPACE' : ch);
    ui.lcdLast.textContent = lastPair ? `${shown(lastPair[0], enc)} → ${shown(lastPair[1], !enc)}` : 'READY';
    ui.lcdCount.textContent = keyed.length < 10000 ? pad(keyed.length, 4) : keyed.length.toLocaleString('en-US');
    showOnPaper(paperText(printed), fresh);
    for (const b of [ui.copyOut, ui.download]) b.disabled = printed.length === 0;
  }
  const outputText = () => (direction === 'enc' ? IRC.groupCipher(printed) : readable(printed));

  ui.copyOut.addEventListener('click', async () => {
    const what = direction === 'enc' ? 'Ciphertext' : 'Plain text';
    markKeyUsed();
    try {
      await navigator.clipboard.writeText(outputText());
      setStatus(`${what} copied.`, 'ok');
    } catch {
      setStatus('The browser blocked copying. Select the text on the paper and copy it by hand.', 'err');
    }
  });
  ui.download.addEventListener('click', () => {
    const name = direction === 'enc' ? 'ciphertext.txt' : 'message.txt';
    markKeyUsed();
    const blob = new Blob([`${outputText()}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setStatus(`Download started: ${name}`, 'ok');
  });

  // ---------------------------------------------------------------- paste mode
  function countChars() {
    const n = ui.input.value.length;
    ui.inCount.textContent = `${n.toLocaleString('en-US')} character${n === 1 ? '' : 's'}`;
  }
  ui.input.addEventListener('input', countChars);

  // ---------------------------------------------------------------- printing a pasted message
  // Pasted messages print at 12 characters a second, the rated print speed of electronic
  // typewriters sold today (Nakajima WPT-150/160, Brother ML-100, Royal Scriptor), with the
  // drums turning and one strike per character.
  const CHARS_PER_SECOND = 12;
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let printing = null;            // { shownMachine, final, total, start, timer, done, lastClick, warning }

  function renderPrinting() {
    const n = printing.shownMachine.count;
    showOnPaper(paperText(printed.slice(0, n)), n > 0);
    for (const b of [ui.copyOut, ui.download]) b.disabled = true;
  }

  const duration = (seconds) => (seconds < 60 ? `${seconds} s`
    : seconds < 7200 ? `${Math.ceil(seconds / 60)} min` : `${Math.round(seconds / 3600)} h`);

  // A timer rather than requestAnimationFrame, so printing carries on in a background tab.
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function printTick() {
    const p = printing;
    if (!p) return;
    const target = Math.min(p.total, Math.floor(((clock() - p.start) / 1000) * CHARS_PER_SECOND));
    const before = p.shownMachine.pos.slice();
    while (p.shownMachine.count < target) p.shownMachine.pressIndex(keyed.charCodeAt(p.shownMachine.count) - 33);
    machine = p.shownMachine;
    renderBank(machine.pos.map((v, i) => v !== before[i]));
    renderPrinting();
    if (target > p.lastClick) { click(0, 0.6); p.lastClick = target; }   // one strike per character
    // The visual progress updates every tick; the status line is not a live region while printing,
    // so screen readers hear only the start and the end.
    const left = Math.ceil((p.total - target) / CHARS_PER_SECOND);
    setStatus(`${p.warning}Printing ${target.toLocaleString('en-US')} of ${p.total.toLocaleString('en-US')} symbols at ` +
      `${CHARS_PER_SECOND} characters a second, about ${duration(left)} to go…`, p.warning ? 'warn' : '', () => finishPrinting(), 'Finish now');
    if (target >= p.total) finishPrinting();
    else p.timer = setTimeout(printTick, 1000 / CHARS_PER_SECOND / 2);
  }

  /** Stop the printout where it is, without its closing message (used when the message is replaced). */
  function stopPrinting(keepResult = false) {
    const p = printing;
    if (!p) return;
    clearTimeout(p.timer);
    printing = null;
    ui.status.setAttribute('aria-live', 'polite');
    if (keepResult) { machine = p.final; renderBank(null); renderOutput(); }
  }

  /** Complete any printout in progress at once (Finish now, Escape, or any other action). */
  function finishPrinting() {
    const p = printing;
    if (!p) return;
    stopPrinting(true);
    p.done();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && printing) { e.preventDefault(); finishPrinting(); } });

  function startPrinting(final, warning, done) {
    if (reduceMotion.matches || keyed.length === 0) { machine = final; renderBank(null); renderOutput(); done(); return; }
    printing = { shownMachine: new IRC.Machine(key), final, total: keyed.length, start: clock(), timer: 0, done, lastClick: 0, warning };
    machine = printing.shownMachine;
    clearTimeout(announceTimer);
    ui.status.setAttribute('aria-live', 'off');
    ui.announce.textContent = `${warning}Printing ${keyed.length.toLocaleString('en-US')} symbols at ${CHARS_PER_SECOND} characters a second. ` +
      'Press Escape or Finish now to complete it at once.';
    renderBank(null);
    renderPrinting();                                     // a blank sheet before the first strike
    printTick();
  }

  function runBatch(kind) {
    if (printing) { finishPrinting(); return; }          // a second press completes the printout
    const text = ui.input.value;
    if (!text.trim()) {
      setStatus(kind === 'enc' ? 'Type or paste a message to encipher.' : 'Paste the ciphertext you received.', 'warn');
      ui.input.focus();
      return;
    }
    const size = kind === 'enc' ? text.length : text.replace(/\s+/g, '').length;
    if (size > MAX_BATCH) { setStatus(`Paste mode takes up to ${MAX_BATCH.toLocaleString('en-US')} symbols.`, 'err'); return; }
    if (keyInvalid) { setStatus('Fix the key before enciphering or deciphering.', 'err'); return; }
    const before = snapshot();
    const offerBack = before.keyed ? () => restore(before, 'Replacing the message') : null;
    let final, doneMessage, warning = '', notes = '';
    try {
      if (kind === 'enc') {
        const prep = IRC.preparePlaintext(text);
        const r = IRC.encrypt(key, text);
        final = r.machine;
        keyed = prep.symbols;
        printed = r.raw;
        const k = IRC.formatKey(key);
        if (usedKeys.has(k) && usedKeys.get(k) !== keyed) warning = 'This key was already used for a different message; choose a new key before you send. ';
        if (r.lineBreaks) notes += ` ${r.lineBreaks} line break${r.lineBreaks === 1 ? ' was' : 's were'} sent as ~.`;
        if (prep.folded) notes += ` ${prep.folded} typographic character${prep.folded === 1 ? ' was' : 's were'} changed to plain keyboard form.`;
        direction = 'enc';
        doneMessage = `${warning}Enciphered ${printed.length.toLocaleString('en-US')} symbols.${notes} Send the ciphertext on the paper.`;
      } else {
        const r = IRC.decrypt(key, text);
        final = r.machine;
        keyed = IRC.prepareCiphertext(text);
        printed = r.raw;
        direction = 'dec';
        doneMessage = `Deciphered ${printed.length.toLocaleString('en-US')} symbols. If it reads as noise, check the key.`;
      }
    } catch (err) {
      replay('');                                        // never leave an older result on the paper
      setStatus(err.message, 'err', offerBack);
      return;
    }
    startupHint = false;
    lastPath = null;
    lastPair = null;
    renderDirection();
    startPrinting(final, warning, () => setStatus(doneMessage, warning ? 'warn' : 'ok', offerBack));
  }
  ui.encipher.addEventListener('click', () => runBatch('enc'));
  ui.decipher.addEventListener('click', () => runBatch('dec'));
  ui.clearBatch.addEventListener('click', () => {
    const before = snapshot();
    ui.input.value = ''; countChars();
    replay('');
    setStatus('Cleared. The rotors are back at the key.', 'ok',
      before.input || before.keyed ? () => restore(before, 'Clear') : null);
    ui.input.focus();
  });

  // ---------------------------------------------------------------- tabs
  function selectTab(which, focus) {
    finishPrinting();
    if (which !== mode) {
      mode = which;
      const live = which === 'live';
      ui.tabLive.setAttribute('aria-selected', String(live));
      ui.tabBatch.setAttribute('aria-selected', String(!live));
      ui.tabLive.tabIndex = live ? 0 : -1;
      ui.tabBatch.tabIndex = live ? -1 : 0;
      ui.panelLive.hidden = !live;
      ui.panelBatch.hidden = live;
      charWidth.clear();
      renderOutput();
      setStatus(live ? 'Type live: every key you press turns the rotors.' : 'Paste mode: the whole message runs from the key.');
    }
    if (focus) (mode === 'live' ? ui.tabLive : ui.tabBatch).focus();
  }
  ui.tabLive.addEventListener('click', () => selectTab('live'));
  ui.tabBatch.addEventListener('click', () => selectTab('batch'));
  [ui.tabLive, ui.tabBatch].forEach((t) => t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); selectTab(mode === 'live' ? 'batch' : 'live', true); }
  }));

  // ---------------------------------------------------------------- self-test
  ui.selfTest.addEventListener('click', () => {
    const results = IRC.selfTest();
    ui.testOut.textContent = '';
    for (const r of results) {
      const line = document.createElement('span');
      line.className = r.pass ? 'p' : 'f';
      line.textContent = `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` (${r.detail})` : ''}\n`;
      ui.testOut.appendChild(line);
    }
    const failed = results.filter((r) => !r.pass).length;
    setStatus(failed ? `${failed} self-test check(s) failed.` : `All ${results.length} self-test checks passed.`, failed ? 'err' : 'ok');
  });

  // ---------------------------------------------------------------- start
  renderSound();
  showKey();
  committedKey = ui.key.value;
  renderDirection();
  replay('');
  setStatus('A random key is set. Click the display and type, or enter the key you were given.');
})();
