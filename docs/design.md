# Imperial Rotor Cipher: design record

## Purpose

A free, public, offline rotor cipher machine in the Enigma family, built as one HTML file. It is a digital model of an electromechanical machine, brought up to date with an imperial science-fiction console look. It is for learning, puzzles and personal use, not for protecting real secrets.

The number of rotors was chosen so that the key, meaning the rotor window settings, is worth at least 64 bits.

## Decisions

### The alphabet

- **94 symbols:** the visible keyboard characters `!` (33) to `~` (126). A symbol's index is its character code minus 33.
- **Spaces:** a space is enciphered as `~`. Line breaks also become `~`, because the alphabet has no line break. When deciphering, every `~` reads back as a space, so a typed `~` also comes back as a space.
- **Typographic characters:** curly quotes, dashes and the ellipsis, as substituted by word processors and phones, are folded to their plain keyboard forms. Anything else outside the alphabet (tabs, accented letters, emoji) is refused, naming the character and its position.
- **Why 94:** a reflector must pair symbols with none left over, so the count must be even.

### The key

- **The key is the ten window settings,** each 0–93, written rotor 1 first, e.g. `07-42-88-13-00-93-61-30-54-19`. Twenty digits with no separators are also accepted.
- **Settings:** 94¹⁰ ≈ 5.4 × 10¹⁹ ≈ 2^65.55.
- **Distinct keys:** the double step makes about 8% of settings behave exactly like another one. The exact count of distinct keys is 49,490,336,166,897,450,358 ≈ 2^65.42, above 64 bits. A test recomputes it.
- **Nine rotors would not be enough:** about 2^59.
- **No plugboard, ring settings or rotor order** are part of the key, so the 64-bit figure is exactly the window settings.

### Published parts (Kerckhoffs's principle)

- Ten rotor wirings, ten turnover notches and one reflector are fixed and public.
- `tools/gen-parts.js` derives them from the seed `IMPERIAL-ROTOR-CIPHER/parts/v1`:
  - SHA-256 in counter mode produces a byte stream;
  - an unbiased Fisher–Yates shuffle builds each rotor;
  - one more draw sets each notch;
  - the reflector is a shuffle with neighbours paired, so it pairs every symbol and maps none to itself.
- Rotor 10's notch is published but has no effect, because no pawl sits beyond rotor 10.

### The exact machine

Rotors are numbered 1–10, with rotor 1 at the entry side. pᵢ is rotor i's window position, Wᵢ its wiring, nᵢ its notch, and all arithmetic is mod 94.

**1. Step, before every symbol.** Decisions use the positions from before the step.
- Rotor 1 always steps.
- For i = 1..9: if pᵢ = nᵢ, the pawl between rotors i and i+1 engages and pushes both of them.
- This is Enigma's pawl mechanism, with its double step, generalized to ten rotors.

**2. Signal path.** Starting from the symbol index x:
- forward through each rotor i = 1..10: x ← Wᵢ[x + pᵢ] − pᵢ;
- then the reflector;
- then back through rotors i = 10..1: x ← Wᵢ⁻¹[x + pᵢ] − pᵢ.

**3. Self-inverse.** The same key and the same operation encipher and decipher, and no symbol ever enciphers to itself.

**Known answers.** The known-answer vector in `src/core.js` (`KAT`) pins all of this.

### Ciphertext

- **Output:** visible symbols only. Copy and Download give ten five-symbol groups to a line.
- **On screen:** the groups are laid out to fit the width of the paper, so a group is never split.
- **Deciphering:** all whitespace is ignored.
- **Errors:** a wrong symbol spoils only that symbol. A missing or extra symbol garbles everything after it, so ciphertext should travel as a file, an email or a code block. Chat apps may treat `*`, `_`, `~` and backticks as formatting.

### The console

- **Layout:** desktop first. At 1200 px and wider the console sits in bays:
  - the rotor bank, beside the key;
  - the operator, beside the printed output;
  - then "About the machine".
- **Phones:** work, but are secondary.
- **Rotor bank:** ten drums show their symbol bands, turnover notch markers and a pawl light for each rotor that stepped. Below each drum are its key setting (− / +; a focused drum also takes the arrow keys, Page Up/Down, Home and End) and the last signal's path through it.
- **Typing:** typing goes into an amber backlit LCD, like a modern electric typewriter. A hidden text field underneath takes the keyboard, pastes, composition (dead keys) and phone keyboards.
  - The LCD shows four lines (five on phones), newest at the bottom.
  - Enciphering: a typed space shows as a space.
  - Deciphering: typed whitespace is skipped, so received groups can be typed exactly as written.
  - Backspace takes back the last key by replaying the message from the key.
  - A live paste is typed in one go, up to 100,000 characters.
- **Printed output:** prints on a sheet of paper over a platen roller. Ciphertext prints in groups; deciphered text prints with real spaces.
- **Direction:** an Enciphering/Deciphering switch sets how input and output are shown. Changing it mid-message starts a new message.
- **Paste a message:** a whole message, up to 1,000,000 symbols, runs from the key and prints at 12 characters a second. That is the rated print speed of electronic typewriters sold today, such as the Nakajima WPT-150/160, the Brother ML-100 and the Royal Scriptor. The drums turn as it prints, *Finish now* or Escape completes it at once, and with reduced motion it prints instantly.
- **Undo:** anything that would discard a message offers Undo: Random key, key changes, Reset rotors, New sheet, switching direction, Clear, and replacing a typed message with a pasted one.
- **Key reuse:** once ciphertext has been copied or downloaded, using the same key for a different message in the same session brings a warning.
- **Sound:** a synthesized mechanical click on each strike. It can be muted, and the choice is remembered.
- **Look:** an original imperial console. It uses no Star Wars names, logos, crest, Aurebesh, images or sounds.
- **Fonts:** system fonts only, so it works offline.

## Honest limits

- **Keys are not strength.** 2^65.4 counts the keys; it is not the work needed to break a message.
  - Rotor 2 turns once every 94 symbols and rotor 3 roughly once every 8,800. So in a short message the slow rotors usually stand still, or turn only once or twice.
  - Between those moments, rotors 3–10 and the reflector act as one fixed scrambler. Someone who knows or guesses part of a message tries about 94² ≈ 8,800 settings, not 2^64.
  - This is the kind of weakness that brought down Enigma.
- **Key reuse:** two messages under the same key can be read against each other.

## Non-goals

- Unicode text.
- File encryption.
- Passphrase keys.
- Message indicators.
- Claims of modern-grade security.
