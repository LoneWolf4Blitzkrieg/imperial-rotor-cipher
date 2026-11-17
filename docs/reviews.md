# Review record

Each part was checked by an independent reviewer as it was built: first the cipher core, then the console. A five-reviewer panel then examined the finished app before release, each reviewer from a different angle. Every finding was checked before it was acted on.

## Cipher core

- **Distinct keys.** The double step makes about 8% of window settings duplicates, so there are about 2^65.4 distinct keys, not 2^65.55. The docs now say so, and a test recomputes the exact count.
- **Honest limits.** The statement of the odometer weakness was sharpened.
- **Input handling.** Key parsing is now strict, so a typo can't silently become another key. Machine input is validated. Unicode spaces count as spaces, and invisible refused characters are named.
- **Stepping.** It was checked against the real Enigma M3 rules in all 94³ states of three rotors, and against a separately written reference machine.

## Console (first build)

The first console had seven blockers, all fixed:
- the mouse wheel changed the key;
- Enter and Space re-pressed buttons;
- copying "as text" corrupted ciphertext;
- re-clicking a tab wiped the message;
- the + buttons hit the wrong rotor at tablet widths;
- buttons had no focus ring;
- Space was captured from focused controls.

The layout was also redesigned so the whole working console fits on one desktop screen.

The owner then replaced the 94-key lampboard with an LCD and a printed paper sheet, like a modern electric typewriter.

## Pre-production panel (five reviewers)

The lenses were cipher correctness, portability, visual quality and accessibility, state robustness, and public-release readiness.

**Cipher correctness.** An independent reimplementation reproduced the known-answer vector and 300 random messages.

**Fixed:**
- **Live paste speed.** Pasting into the LCD was slow: it redrew per character, so 4,000 characters took about 15 s. It now takes about 10 ms.
- **Paper layout.** Ciphertext groups now fit the paper width and are never split.
- **Direction switch.** Switching Enciphering/Deciphering mid-message now starts a new message, with Undo.
- **Undo.**
  - It survives double clicks.
  - Clear offers it for a typed message.
  - Replacing a typed message with a pasted one offers it.
- **Typing input.**
  - Dead keys and phone keyboards (IME composition) are handled.
  - Deciphering skips U+0085, the same as paste mode.
- **Paste limits.** The decipher limit counts symbols, not whitespace. Live paste is limited to 100,000 characters.
- **Key-reuse warnings.** They fire only after ciphertext has been copied or downloaded.
- **Accessibility.**
  - While printing, the status line is not a live region; screen readers hear only the start and the end.
  - Focus is never stranded on a vanishing button.
  - Outlined buttons have a full focus ring.
  - Notch markers are larger, with an outline.
  - The Encipher button meets contrast requirements.
  - Forced-colours mode fixes.
- **Phones and Safari.**
  - iOS no longer zooms on focus: text fields are at least 16 px.
  - Autocorrect and auto-capitalisation are off in the message box.
  - Audio resumes on Safari.
  - On Apple systems the font fallback no longer turns all text bold.
- **Text handling.** Curly quotes, dashes and the ellipsis are folded to plain keyboard characters.
- **Docs.** The honest-limits wording was corrected. The README now explains that a missing symbol garbles everything after it. The design record states the exact machine.
- **Code quality.** Names left from the old tape design were cleaned up. A build check confirms `index.html` matches `src/`. Every source file has a license header, and the unused variable was removed.

**Kept by decision:**
- the odometer stepping and its documented weakness;
- the 12 characters per second print speed;
- phones as a secondary target.
