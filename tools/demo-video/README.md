# FleetOps MZ — Product demo video

A Playwright script that records a 2:49 walkthrough of the real FleetOps MZ web app, for transport-company owners and fleet managers in Mozambique. The recording uses Portuguese (Mozambique), 1920×1080 and fictional demo data. This folder has its own `package.json`, so it adds nothing to the app's dependencies or build.

| File | Contents |
|---|---|
| `record-demo.mjs` | Recording script: scenes, interaction helpers and the MP4 encode |
| `RECORDING_SCRIPT.md` | Scene-by-scene script with timestamps |
| `NARRACAO_PT-MZ.md` | Voice-over script in Portuguese (Mozambique), timed to the scenes |
| `make-voiceover.mjs` · `voiceover/narration.json` | Text-to-speech voice-over and music mix |
| `music/` | Background music (public domain) and its licence note |
| `output/fleetops-mz-demo-pt.mp4` | **Final video with Portuguese voice-over and music** (H.264 + AAC) |
| `output/fleetops-mz-demo-1080p.mp4` | Same video without sound |
| `output/fleetops-mz-demo-raw.webm` | Untrimmed Playwright capture |
| `output/timeline.json` | Scene start times measured during the run, plus any browser console errors (none in the last run) |

## Reproducing the recording

Requirements: Node 20.19+ / 22.12+ / 24, Windows, macOS or Linux. Playwright downloads its own Chromium. The `ffmpeg-static` package supplies ffmpeg.

```bash
# 1. In the app root: install and start the dev server on http://localhost:4200
npm install
npm start

# 2. In a second terminal: install the recorder (once) and record
cd tools/demo-video
npm install
npx playwright install chromium
npm run record
```

The run takes about 3 minutes and prints each scene as it starts. It finishes by writing `output/fleetops-mz-demo-1080p.mp4` and `output/timeline.json`. To record against another URL, run `BASE_URL=http://host:port npm run record`; in PowerShell, `$env:BASE_URL='http://host:port'; npm run record`.

If an element is missing or an action fails, the run stops with an error and no MP4 is written. Every step waits for its target and checks the result: the status badge changed, the note appears in the history, the "Ocorrência registada" toast appears and the new incident is listed.

### Determinism

- Each run uses a fresh browser profile with empty localStorage, so it always starts from the generated fixtures. The status change and incident recorded in scene 5 never reach the browser you use day to day.
- The app already pins "today" to 24/10/2026. The recorder also pins the browser clock to 24/10/2026 11:40, Africa/Maputo time, so times, notes and labels such as "há 22 horas" are identical on every run.
- Locale `pt-MZ`, Chromium `--lang=pt-PT` (so the native date picker shows dd/mm/aaaa), light colour scheme, device scale 1.

### Recording-only adjustments (the app code is unchanged)

These are injected into the browser by the script. None of them changes data, figures or features.

1. **Visible cursor and click ripple.** Headless Chromium draws no mouse pointer.
2. **Intro and end brand cards.** These are full-screen overlays that use the app's own logo (`public/favicon.svg`).
3. **Simulated latency removed.** The mock repositories wait 180 ms (`MOCK_LATENCY_MS`) on each read to imitate a network. The script runs that one timer immediately, so navigation never shows loading skeletons. No other app timer uses 180 ms.
4. **Scrollbars hidden.**

## Voice-over and music

`npm run voiceover` takes the silent recording and produces `output/fleetops-mz-demo-pt.mp4`:

- **Voice.** The Microsoft neural voice `pt-PT-RaquelNeural` reads `voiceover/narration.json` at +8 % speed, through the free [`edge-tts`](https://github.com/rany2/edge-tts) tool. This sends the narration text, which contains only fictional demo data, to Microsoft's speech service.
- **Timing.** Each line starts at its scene's time in `output/timeline.json` plus the line's `offset`, so it stays in sync after a re-recording. If a line would run into the next one, it is re-voiced up to +20 % faster. If it still doesn't fit, the run stops and asks you to shorten that text.
- **Music.** Erik Satie, *Gymnopédie No. 1*, piano recording by Robin Alciatore (Musopen), public domain (see `music/LICENSE.md`). It fades in and out and stays about 12 dB under the voice. A side-chain compressor lowers it a little further while the voice speaks.
- **Loudness.** The final mix is normalised to −16 LUFS, the usual level for web and social video.

One-time setup (Python 3.10 or later), in `tools/demo-video`:

```bash
python -m venv .venv
.venv/Scripts/pip install edge-tts      # macOS/Linux: .venv/bin/pip install edge-tts
npm run voiceover
```

To change the voice, set `"voice"` in `narration.json` (`pt-PT-DuarteNeural` is the male option). To change a line, edit its `text`. Then run `npm run voiceover` again; you don't need to re-record the video.

## Missing features and limitations found while planning

| Planned scene | Status | Detail |
|---|---|---|
| 5 · Driver incident alert | **Partly supported** | No alert exists for driver incidents. The notification categories are maintenance, document, trip delay, fuel anomaly, expense approval and system, and registering an incident does not create a notification. The video starts the scene from a real critical **trip-delay** alert instead, whose cause is a breakdown. |
| 5 · Record incident resolution | **Not supported as a workflow** | Driver incidents (`DriverIncident`) have only date, type, severity, description and an optional trip. There is no status (open / resolved), resolution field, resolution date or owner. The video records the resolution with features that do exist: a status change **Atrasada → Em trânsito** with a note, which is written to the trip history, and a new "Entrega atrasada" incident on the driver's record that refers to the original 21/10 breakdown. The narration does not claim an incident-resolution workflow. |
| — Authentication | **Not present** | The app has no login, so the video has no sign-in scene. Users, roles and permissions are demo data, and no access control is enforced. |
| All scenes | Mock data | No backend. All data comes from deterministic fixtures, and edits persist only in the browser's localStorage. Exchange rates are fixed demo values; the UI labels them "Conversão simulada", and the video leaves that label visible. |
| 7 · Profitability | Supported | Revenue, direct costs by category, contribution margin and margin %, cost and revenue per km. Maintenance appears separately as an *estimated* allocation and is not part of the margin. The app states on screen that the margin is not net profit. |

Other observations, not blocking:
- The voice is synthetic, European Portuguese (`pt-PT`). As far as I know, no text-to-speech provider offers a Mozambican Portuguese voice. For a more local sound, record a Mozambican speaker reading `NARRACAO_PT-MZ.md`.
- No live GPS or map view. Trip progress comes from recorded checkpoints in the trip history.
- When a delayed trip goes back to *Em trânsito*, the dialog's hint reads "A partida real é registada agora". The stored actual departure is kept (`mock-trips.service.ts` only sets it when it is empty), so the data is correct, but the copy is misleading for a resumed trip.
- After the trip resumes, the delay indicator still shows the accumulated 111 h. This is expected.
