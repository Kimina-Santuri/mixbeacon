# MixBeacon project notes

MixBeacon is a browser-first prototype for identifying an entire DJ mix via a repeating near-ultrasonic audio beacon. It is not a track-recognition tool.

## Run locally

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

Open `http://localhost:4173` on the development machine. A phone on the same Wi-Fi can load `http://<Mac-LAN-IP>:4173`, but browser microphone access on the phone requires HTTPS.

## Current protocol

- FSK carriers: 17.2 kHz for `0`, 18.4 kHz for `1`.
- Symbol durations: 250 ms (1× default), 125 ms (2× experimental), 62.5 ms (4× experimental). Encoder rounds durations to whole samples.
- Frame: 16-bit synchronisation word plus six Hamming(7,4) codewords carrying a 16-bit mix ID and CRC-8.
- Frame durations: 14.5 s / 7.25 s / 3.625 s at 1× / 2× / 4×.
- Listener and file verifier automatically scan all speeds with four symbol timing offsets. Two non-overlapping matching code/speed frames are required. Ideal arbitrary-start identification is approximately 29–44 s / 15–22 s / 7–11 s at 1× / 2× / 4×; losses add time. Earlier 15–30 s baseline estimates were optimistic.
- The beacon is continuous: frames repeat back-to-back through the entire mix.

## Compatibility and testing

- Files created before the stronger protocol used a legacy 31-bit frame and cannot be identified by the live scanner. Re-encode after a hard refresh.
- The in-page `Verify file marker` diagnostic tests WAV/MP4 audio directly without a microphone. Use it before acoustic or platform tests.
- The live microphone diagnostic shows callback activity, digital microphone/carrier levels, distinct valid frames, audio engine state and browser-reported capture settings. `Copy diagnostic report` copies text only; no audio is stored or uploaded. Run `node --test tests/diagnostic.test.cjs` for synthetic diagnostic checks.
- Laptop microphone/direct-file verification and iPhone 13 baseline identification have worked. The iPhone succeeded after the diagnostic update; the cause of its earlier failure remains unconfirmed. Faster acoustic speeds await phone tests.
- For speed comparisons, encode each version from the original unmarked source; do not layer beacons. Diagnostic reports include detected speed and first identification time.
- If WAV verification passes but microphone detection fails, investigate speaker/microphone frequency response. If WAV passes but MP4 fails, AAC conversion is the likely cause.
- External platforms have so far failed to preserve the 17–18 kHz carrier. Do not claim platform robustness.

## Constraints

- Audio must stay client-side; do not add backend audio upload/storage without explicit user direction.
- The current browser registry is local storage only. A public mix/DJ profile system and analytics dashboard are roadmap items.
- Preserve the Kimina-inspired visual language: off-white space, oversized black type, monospaced metadata, thin rules, and restrained orbital-line graphics.
