// Checks the three channel clips and their posters against what the page needs.
// Run: node scripts/media/check-media.mjs
// Exits non-zero if anything is missing or out of range.

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mediaDir = join(root, 'public', 'media');

const CLIPS = ['studio', 'worth', 'pathwise'];
const MIN_SECONDS = 6.5;
const MAX_SECONDS = 7.5;
const MAX_CLIP_BYTES = 1.5 * 1024 * 1024;
const MAX_POSTER_BYTES = 200 * 1024;
const WIDTH = 1280;

function probe(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { encoding: 'utf8' },
  );
  return JSON.parse(out);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

const failures = [];
const fail = (name, message) => failures.push(`${name}: ${message}`);

for (const name of CLIPS) {
  const clip = join(mediaDir, `${name}.mp4`);
  const poster = join(mediaDir, `${name}.jpg`);

  if (!existsSync(clip)) {
    fail(`${name}.mp4`, 'missing');
  } else {
    let info;
    try {
      info = probe(clip);
    } catch (error) {
      fail(`${name}.mp4`, `ffprobe could not read it (${error.message.split('\n')[0]})`);
    }
    if (info) {
      const video = info.streams.filter((s) => s.codec_type === 'video');
      const audio = info.streams.filter((s) => s.codec_type === 'audio');
      const duration = Number(info.format.duration);
      const size = statSync(clip).size;

      if (video.length !== 1) fail(`${name}.mp4`, `expected 1 video stream, found ${video.length}`);
      if (audio.length !== 0) fail(`${name}.mp4`, `has ${audio.length} audio stream(s), expected none`);
      if (!(duration >= MIN_SECONDS && duration <= MAX_SECONDS)) {
        fail(`${name}.mp4`, `duration ${duration.toFixed(2)}s, expected ${MIN_SECONDS} to ${MAX_SECONDS}s`);
      }
      if (size >= MAX_CLIP_BYTES) fail(`${name}.mp4`, `${kb(size)}, expected under ${kb(MAX_CLIP_BYTES)}`);

      const v = video[0];
      if (v) {
        if (v.codec_name !== 'h264') fail(`${name}.mp4`, `codec ${v.codec_name}, expected h264`);
        if (v.pix_fmt !== 'yuv420p') fail(`${name}.mp4`, `pixel format ${v.pix_fmt}, expected yuv420p`);
        if (v.width !== WIDTH) fail(`${name}.mp4`, `width ${v.width}, expected ${WIDTH}`);
        console.log(
          `  ${name}.mp4  ${duration.toFixed(2)}s  ${v.codec_name}  ${v.pix_fmt}  ${v.width}x${v.height}  ${v.r_frame_rate} fps  audio:${audio.length}  ${kb(size)}`,
        );
      }
    }
  }

  if (!existsSync(poster)) {
    fail(`${name}.jpg`, 'missing');
  } else {
    const size = statSync(poster).size;
    if (size === 0) fail(`${name}.jpg`, 'empty file');
    if (size >= MAX_POSTER_BYTES) fail(`${name}.jpg`, `${kb(size)}, expected under ${kb(MAX_POSTER_BYTES)}`);
    console.log(`  ${name}.jpg  ${kb(size)}`);
  }
}

if (failures.length > 0) {
  console.error(`\nFAIL (${failures.length})`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}

console.log('\nPASS: 3 clips and 3 posters meet the requirements');
