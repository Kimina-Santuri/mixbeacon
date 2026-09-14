# MixBeacon project notes

MixBeacon is a browser-first prototype for identifying an entire DJ mix via a repeating near-ultrasonic audio beacon. It is not a track-recognition tool.

## Run locally

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

Open `http://localhost:4173` on the development machine. A phone on the same Wi-Fi can load `http://<Mac-LAN-IP>:4173`, but browser microphone access on the phone requires HTTPS.

## Current protocol

- FSK carriers: 17.2 kHz for `0`, 18.4 kHz for `1`.
- Symbol duration: 250 ms.
- Frame: 16-bit synchronisation word plus six Hamming(7,4) codewords carrying a 16-bit mix ID and CRC-8.
- Frame duration: 14.5 seconds.
- The listener requires two independently valid matching frames before confirming a mix, so identification normally takes 15–30 seconds of clean playback.
- The beacon is continuous: frames repeat back-to-back through the entire mix.

## Compatibility and testing

- Files created before the stronger protocol used a legacy 31-bit frame and cannot be identified by the live scanner. Re-encode after a hard refresh.
- The in-page `Verify file marker` diagnostic tests WAV/MP4 audio directly without a microphone. Use it before acoustic or platform tests.
- If WAV verification passes but microphone detection fails, investigate speaker/microphone frequency response. If WAV passes but MP4 fails, AAC conversion is the likely cause.
- External platforms have so far failed to preserve the 17–18 kHz carrier. Do not claim platform robustness.

## Constraints

- Audio must stay client-side; do not add backend audio upload/storage without explicit user direction.
- The current browser registry is local storage only. A public mix/DJ profile system and analytics dashboard are roadmap items.
- Preserve the Kimina-inspired visual language: off-white space, oversized black type, monospaced metadata, thin rules, and restrained orbital-line graphics.
