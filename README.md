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
- Repeats a 58-bit frame at selectable 1×, 2× or 4× speed: a fixed synchronisation preamble plus a Hamming(7,4)-protected mix code and CRC-8 integrity check.
- Requires two non-overlapping valid frames with the same code and speed before confirming a mix.
- Listens through the browser microphone and uses Goertzel frequency detection to recover the code.
- Stores mix-code/name mappings only in the current browser's local storage for this prototype.

## Faster transmission experiment

The mix ID, CRC, error correction and two carrier frequencies stay the same. Only the symbol duration changes; this experiment still sends an ID, not the mix name.

| Speed | Symbol duration | Bit rate | Frame duration | Two-frame identification from arbitrary playback position* |
| --- | --- | --- | --- | --- |
| 1× baseline | 250 ms | 4 bits/s | 14.5 s | about 29–44 s |
| 2× experimental | 125 ms | 8 bits/s | 7.25 s | about 15–22 s |
| 4× experimental | 62.5 ms | 16 bits/s | 3.625 s | about 7–11 s |

*Clean-signal timing estimates, not measured phone guarantees. Joining mid-frame can require waiting for the next complete frame before collecting two full frames. Missed frames add time. The former 15–30 s baseline estimate was optimistic for arbitrary playback starts.

1. Refresh both laptop and phone. Use the same original **unmarked** 60-second source, mix code and **Strong** strength for every version. Never layer a faster marker over an already marked file.
2. Select **2×** in Transmission speed, create the WAV, and run **Verify file marker**. The result should report the correct code and 2× speed.
3. Play that file through the same speaker at the same volume and distance used for the successful phone test. Stop and restart the phone microphone for each trial.
4. Repeat with **4×**, then use **1×** as the comparison. Download names include `-1x`, `-2x` or `-4x`.
5. Run three trials per speed, starting playback at different positions. Record the displayed **First identification** time and copy the diagnostic report while playback continues. Allow 60 s before recording a failure.

Synthetic checks cover all speeds at 44.1/48 kHz, arbitrary start phases, different encoder/receiver sample rates, duplicate-frame rejection, direct-file verification and negative signals. Faster-speed acoustic reliability still needs phone tests. The iPhone 13 has successfully identified the baseline code after the diagnostic update; the reason the earlier test failed is unconfirmed.

## Test order

1. Refresh the page and mark a source file at least 60 seconds long at **Strong** strength. Older legacy markers must be re-encoded.
2. Use **Verify file marker** on the downloaded WAV first. If testing an MP4 conversion, verify that separately too.
3. Open the app over HTTPS on the phone, allow microphone access, and play the verified WAV from the Mac or a separate speaker. Keep the phone page open and allow 30–60 seconds for detection.
4. Compare the detected mix code with the code used to mark the file. Mix names are stored only in the browser that created the marker, so a phone showing the correct code without a name is a successful detection.
5. Once local playback works, test a target platform stream through the same speaker. External platform tests have so far failed to preserve the carrier; platform robustness is unproven.
6. Repeat on different Android and iPhone models. Record speaker, phone/browser, platform, distance, mix code, time to detection and result.

If WAV verification passes but microphone detection fails, investigate speaker/microphone frequency response. If WAV passes but MP4 verification fails, investigate AAC conversion. Test audio/video files are excluded from Git and remain local.

The expected failure point is the real-world audio chain: a platform may low-pass or otherwise alter the 17–19 kHz band, and some speakers/microphones may not reproduce it. Do not move on to a hosted database or polished workflow until this works often enough in the intended conditions.

## Live microphone diagnostic

Refresh the page to load the diagnostic panel below **Start microphone**. Play the verified WAV from a separate device, keep the phone page visible, and listen for 30–60 seconds. Tap **Copy diagnostic report** while playback is still running and paste the report with your phone model, browser, speaker and distance. Reports contain readings and browser information, never recorded audio.

- **Audio callbacks** should keep increasing. Zero means the microphone opened but no samples reached the listener; a stalled counter or suspended audio engine indicates an audio capture/processing issue.
- **Microphone level** measures total incoming audio. The **17.2 / 18.4 kHz** meters measure energy at the carrier frequencies over each approximately 62.5 ms window. Less negative dBFS means stronger; these are digital levels, not acoustic sound pressure measurements. Compare playback off and on. Carrier energy alone does not prove a valid beacon.
- **Valid frames** counts distinct decoded frame positions; two matching independent frames are still needed for identification. The latest valid code remains visible after stopping.
- **Sample rates / Mic processing** show settings reported by the browser. “Not reported” does not mean processing is off. A reported rate at or below 36.8 kHz cannot represent both carriers.

The listener and file verifier automatically try all three speeds with four timing offsets per speed. Existing 250 ms current-protocol WAV files still work. Faster files require the updated listener. Multiple offsets reading the same physical frame count only once. This handles initial symbol alignment; it is not full clock-drift recovery.

Run the synthetic signal and diagnostic checks with `node --test tests/diagnostic.test.cjs`.

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
