# Dopamine Land

An interactive feast for the senses, built with three.js. Four glowing worlds, a generative soundtrack, and a reward for every click.

- **Candy Cosmos** — 1,600 glossy sweets orbiting a beating jelly heart
- **Liquid Dream** — molten colour that bends around the pointer, with bubbles to pop
- **Hyper Tunnel** — neon rings pulsing on the beat
- **Stardust** — 110,000 particles morphing between a galaxy, a heart, a knot and a bloom

## Run it

No build step. Serve the folder with any static server and open it:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

(It must be served over http — ES modules don't load from `file://`.)

## Controls

| Input | Action |
| --- | --- |
| Click / tap | Burst: confetti, shockwave, a note, points |
| Hold | Hyperdrive |
| Space / → / ← / 1–4 / dots | Switch world (it also auto-tours every 16 bars) |
| M | Mute |
| F | Fullscreen |

Chain clicks to build a combo and fill the dopamine meter. Fill it for **Euphoria**.

## Notes

- three.js r180 is vendored in `vendor/three` (MIT), so the site works offline. Fonts load from Google Fonts with system fallbacks.
- All audio is synthesised live with WebAudio — there are no audio files.
- Resolution drops automatically on slow GPUs; `?low` forces the lighter mode and `?world=3` starts on a given world.
- `prefers-reduced-motion` tones down the screen-space effects.
