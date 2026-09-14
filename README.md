# MixBeacon prototype

A no-backend proof of concept for identifying a **DJ mix**, rather than identifying the tracks inside it.

## Run locally

From this folder, run:

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173`. Use HTTPS when testing microphone access away from localhost.

## What it does

- Takes a local 44.1 kHz+ audio file and returns a locally generated WAV.
- Mixes a low-amplitude, continuous FSK watermark through the entire file.
- Uses 17.2 kHz for `0` and 18.4 kHz for `1`.
- Repeats a 58-bit frame every 14.5 seconds: a fixed synchronisation preamble plus a Hamming(7,4)-protected mix code and CRC-8 integrity check.
- Requires two independent valid frames before confirming a mix, which normally takes about 30 seconds of clean listening.
- Listens through the browser microphone and uses Goertzel frequency detection to recover the code.
- Stores mix-code/name mappings only in the current browser's local storage for this prototype.

## Test order

1. Refresh the page and mark a source file at least 60 seconds long at **Strong** strength. Older legacy markers must be re-encoded.
2. Use **Verify file marker** on the downloaded WAV first. If testing an MP4 conversion, verify that separately too.
3. Open the app over HTTPS on the phone, allow microphone access, and play the verified WAV from the Mac or a separate speaker. Keep the phone page open and allow 30–60 seconds for detection.
4. Compare the detected mix code with the code used to mark the file. Mix names are stored only in the browser that created the marker, so a phone showing the correct code without a name is a successful detection.
5. Once local playback works, test a target platform stream through the same speaker. External platform tests have so far failed to preserve the carrier; platform robustness is unproven.
6. Repeat on different Android and iPhone models. Record speaker, phone/browser, platform, distance, mix code, time to detection and result.

If WAV verification passes but microphone detection fails, investigate speaker/microphone frequency response. If WAV passes but MP4 verification fails, investigate AAC conversion. Test audio/video files are excluded from Git and remain local.

The expected failure point is the real-world audio chain: a platform may low-pass or otherwise alter the 17–19 kHz band, and some speakers/microphones may not reproduce it. Do not move on to a hosted database or polished workflow until this works often enough in the intended conditions.

## Before production

This is deliberately not a production watermarking implementation. A usable public service needs a server-side mix-code lookup, authentication/abuse controls, collision-resistant identifiers, error correction, real device testing, and a more robust psychoacoustic watermark if the ultrasonic approach fails.

## Watermarking roadmap

Before treating the beacon as reliable, add:

- synchronisation that tolerates timing drift;
- a signed ID for stronger authenticity than the current CRC check;
- adaptive level control and psychoacoustic masking;
- a real platform/device test matrix.

## Discovery-profile roadmap

Once mix identification proves reliable, add a lightweight public registry:

- optional DJ profiles with image, biography, location and outbound links;
- mix pages with artwork, collaborators, event/venue credits and genre;
- one DJ profile linked to many mixes;
- an optional tracklist, kept separate from the core mix-identification feature;
- privacy controls so a DJ can publish only the fields they choose.

## Creator admin roadmap

Add a private dashboard for DJs and administrators with:

- total successful mix identifications ("checks") per mix and per DJ;
- day/week/month trends and recent activity;
- high-level country, device and platform data only where listeners consent;
- platform/device test results, to understand where beacons survive;
- no storage of raw microphone audio, and no need to identify individual listeners.
