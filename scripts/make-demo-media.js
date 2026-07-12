// One-off encoder: turns scripts/ui-preview/frames/*.png into media/demo.gif + media/demo.mp4.
// Not shipped in the VSIX. Requires: npm i --no-save ffmpeg-static (already installed).
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ffmpeg = require('ffmpeg-static');

const framesDir = path.join(__dirname, 'ui-preview', 'frames');
const mediaDir = path.join(__dirname, '..', 'media');
const tmp = path.join(framesDir, '_concat.txt');

const HOLD = 2.4; // seconds for hold-* frames
const STEP = 0.12; // seconds for scroll frames

const files = fs.readdirSync(framesDir).filter((f) => f.endsWith('.png')).sort();
if (!files.length) throw new Error('no frames found');

let concat = 'ffconcat version 1.0\n';
for (const f of files) {
  const dur = /hold/.test(f) ? HOLD : STEP;
  concat += `file '${f.replace(/'/g, "'\\''")}'\nduration ${dur}\n`;
}
// concat demuxer needs the last file repeated
concat += `file '${files[files.length - 1]}'\n`;
fs.writeFileSync(tmp, concat);

const run = (args) => execFileSync(ffmpeg, args, { cwd: framesDir, stdio: 'inherit' });

// GIF (960px wide, high-quality palette)
run(['-y', '-f', 'concat', '-safe', '0', '-i', tmp,
  '-vf', 'fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=200[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
  path.join(mediaDir, 'demo.gif')]);

// MP4 for LinkedIn (even dimensions required)
run(['-y', '-f', 'concat', '-safe', '0', '-i', tmp,
  '-vf', 'fps=30,scale=1028:-2:flags=lanczos,format=yuv420p',
  '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart',
  path.join(mediaDir, 'demo.mp4')]);

fs.rmSync(tmp);
for (const out of ['demo.gif', 'demo.mp4']) {
  const s = fs.statSync(path.join(mediaDir, out));
  console.log(`${out}: ${(s.size / 1024 / 1024).toFixed(2)} MB`);
}
