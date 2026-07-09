# Quake II N64 Passcode Generator & Decrypter

Password generator and decrypter for Quake II on the Nintendo 64.

This project was built with a lot of assistance from **Gemini**.

## What Gemini thinks we did:

1. **Decompilation Analysis**: We dug into the raw processing loops of the game source code via Ghidra, identifying how player state variables (health, level, difficulty, armor, weapons, and ammunition) are compressed and packed into an 80-bit buffer.
2. **Reverse Engineering the Codec**: We cracked the custom byte-scrambling pattern, alphabet indexes, and MSB-first bitwise formatting rules used by the N64 game cartridge to encode the 16-character password structure.
3. **Refining the Limits**: Through iterative testing, we mapped and clamped variables to their actual N64 hardware limits (such as health limits, armor type caps, and backpack-dependent ammo capacities).
4. **Creating the Web Interface**: We packaged the logic into a command-line script and built a retro-themed, responsive web application (`www/`) where users can customize their mission loadouts and dynamically generate or decrypt passcodes in real-time.

## What I actually did:

I loaded the Quake2.z64 rom to Ghidra and wasted a boatload of time trying to figure out how to sync Ares emulator with it and track the execution to the password generation function. That didn't work out, so I just dumped the full decompilation and fed it to Gemini, asking it to find the logic, which it did.

I also did a lot of black box testing by generating valid codes for specific scenarios by playing the game, which could then be used to both validate the Gemini-generated decryption code and to align it with the game's actual behavior.

## Credits

This project uses the following fonts:
- Inter: Designed by Rasmus Andersson. Licensed under the SIL Open Font License, Version 1.1.
- Orbitron: Designed by Matt McInerney. Licensed under the SIL Open Font License, Version 1.1.

Cool stuff:
- Ghidra https://github.com/nationalsecurityagency/ghidra
- Ares https://ares-emu.net/

This project is licenced under the MIT license.
