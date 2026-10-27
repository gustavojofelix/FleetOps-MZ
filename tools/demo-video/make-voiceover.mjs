// Adds a Portuguese text-to-speech voice-over and a soft classical music bed to the recorded demo.
// Usage (after `npm run record`): npm run voiceover. See README.md → "Voice-over and music".
import ffmpegPath from 'ffmpeg-static';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'output');
const CLIPS = join(OUT, 'voice-clips');
const VIDEO = join(OUT, 'fleetops-mz-demo-1080p.mp4');
const FINAL = join(OUT, 'fleetops-mz-demo-pt.mp4');
const MUSIC = join(HERE, 'music', 'satie-gymnopedie-1-alciatore.ogg');
const EDGE_TTS = join(HERE, '.venv', process.platform === 'win32' ? 'Scripts/edge-tts.exe' : 'bin/edge-tts');

const narration = JSON.parse(readFileSync(join(HERE, 'voiceover', 'narration.json'), 'utf8'));
const timeline = JSON.parse(readFileSync(join(OUT, 'timeline.json'), 'utf8'));
const sceneStart = Object.fromEntries(timeline.scenes.map((s) => [s.id, s.at]));
const VIDEO_DURATION = timeline.duration;
const GAP = 0.35; // minimum silence between consecutive clips
const MAX_SPEEDUP = 20; // percent; beyond this a cue's text must be shortened instead

if (!existsSync(EDGE_TTS)) throw new Error('edge-tts not found. Run: python -m venv .venv && .venv/Scripts/pip install edge-tts');
mkdirSync(CLIPS, { recursive: true });

const duration = (file) => {
  const { stderr } = spawnSync(ffmpegPath, ['-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  if (!m) throw new Error(`Cannot read duration of ${file}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
};

const synthesize = (cue, rate) => {
  const file = join(CLIPS, `${cue.id}.mp3`);
  execFileSync(EDGE_TTS, ['--voice', narration.voice, `--rate=${rate}`, '--text', cue.text, '--write-media', file], { stdio: 'pipe' });
  return { file, length: duration(file) };
};

// 1. Generate each clip and place it at its cue. If it would run into the next cue, re-voice it
//    slightly faster (natural-sounding up to about +20 %); fail if that is still not enough.
const cues = narration.cues.map((cue) => {
  if (!(cue.scene in sceneStart)) throw new Error(`Unknown scene "${cue.scene}" in ${cue.id}`);
  return { ...cue, at: sceneStart[cue.scene] + cue.offset };
});
const placed = [];
let previousEnd = 0;
for (const [i, cue] of cues.entries()) {
  const start = Math.max(cue.at, previousEnd + GAP);
  const limit = i + 1 < cues.length ? cues[i + 1].at + 1.0 : VIDEO_DURATION - 0.3;
  let speed = parseInt(narration.rate, 10) || 0;
  let clip = synthesize(cue, narration.rate);
  while (start + clip.length > limit && speed < MAX_SPEEDUP) {
    speed += 5;
    clip = synthesize(cue, `+${speed}%`);
  }
  if (start + clip.length > limit) {
    throw new Error(`${cue.id}: ${clip.length.toFixed(1)} s does not fit before ${limit.toFixed(1)} s even at +${speed}% — shorten its text.`);
  }
  previousEnd = start + clip.length;
  placed.push({ ...cue, ...clip, start, speed });
  console.log(`${cue.id.padEnd(18)} ${start.toFixed(1).padStart(6)} s → ${previousEnd.toFixed(1).padStart(6)} s  (limit ${limit.toFixed(1)} s, rate +${speed}%)`);
}

// 2. Mix: voice clips at their start times; the music bed fades in and out and dips further
//    (side-chain compression) whenever the voice speaks; the whole mix is normalised to -16 LUFS.
const D = VIDEO_DURATION.toFixed(2);
const voiceInputs = placed.map((_, i) => `[${i + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(placed[i].start * 1000)}:all=1[v${i}]`);
const filter = [
  ...voiceInputs,
  `${placed.map((_, i) => `[v${i}]`).join('')}amix=inputs=${placed.length}:normalize=0:duration=longest,apad=whole_dur=${D},atrim=0:${D},asplit=2[voice][key]`,
  `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${D},asetpts=PTS-STARTPTS,volume=0.55,` +
    `afade=t=in:st=0:d=2.5,afade=t=out:st=${(VIDEO_DURATION - 4).toFixed(2)}:d=4[music]`,
  `[music][key]sidechaincompress=threshold=0.02:ratio=5:attack=80:release=900[bed]`,
  `[voice][bed]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[mix]`,
].join(';');

execFileSync(
  ffmpegPath,
  ['-y', '-loglevel', 'error', '-i', VIDEO, '-i', MUSIC, ...placed.flatMap((c) => ['-i', c.file]),
    '-filter_complex', filter, '-map', '0:v', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', D, '-movflags', '+faststart', FINAL],
  { stdio: 'inherit' },
);
console.log(`\nVideo with voice-over: ${FINAL}`);
