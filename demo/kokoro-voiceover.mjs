import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const demoDir = import.meta.dirname;
const endpoint = process.env.KOKORO_URL ?? 'http://localhost:8880/v1/audio/speech';
const voice = process.env.KOKORO_VOICE ?? 'af_heart';
const slots = [20, 25, 25, 30, 40, 30, 30, 25, 15];
const transcript = await readFile(join(demoDir, 'VIDEO_TRANSCRIPT.md'), 'utf8');
const scenes = transcript.split(/^## \d+:\d+–\d+:\d+ —[^\n]*\n/gm).slice(1)
  .map((section) => section.replace(/\s+/g, ' ').replace(/[`*]/g, '').trim());
if (scenes.length !== slots.length) throw new Error(`Expected ${slots.length} narration scenes; found ${scenes.length}.`);

const suppliedVideo = process.argv[2];
const video = suppliedVideo
  ? resolve(suppliedVideo)
  : resolve(demoDir, (await readdir(demoDir)).filter((name) => /^irisops-full-demo-.*\.mp4$/.test(name) && !name.endsWith('-kokoro.mp4')).sort().at(-1) ?? 'missing.mp4');
const audioOutput = join(demoDir, 'irisops-kokoro-voiceover.wav');
const videoOutput = join(demoDir, `${basename(video, '.mp4')}-kokoro.mp4`);

function run(command, args) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', fail);
    child.on('close', (code) => code === 0 ? done() : fail(new Error(`${command} exited with code ${code}`)));
  });
}

function wavDuration(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Kokoro did not return a WAV file.');
  }
  const data = buffer.indexOf(Buffer.from('data'), 36);
  if (data < 0) throw new Error('Kokoro WAV has no data chunk.');
  const bytesPerSecond = buffer.readUInt32LE(28);
  return (buffer.length - data - 8) / bytesPerSecond;
}

const temp = await mkdtemp(join(tmpdir(), 'irisops-kokoro-'));
try {
  const files = [];
  const rates = [];
  for (let i = 0; i < scenes.length; i++) {
    console.log(`Generating Kokoro scene ${i + 1}/${scenes.length}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'kokoro', voice, input: scenes[i], response_format: 'wav', stream: false, speed: 1 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Kokoro scene ${i + 1} failed (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`);
    const path = join(temp, `scene-${String(i + 1).padStart(2, '0')}.wav`);
    const wav = Buffer.from(await response.arrayBuffer());
    await writeFile(path, wav);
    files.push(path);
    const seconds = wavDuration(wav);
    // Leave a little silence at the end of each scene. Speed up only if a
    // generated scene would otherwise be cut at the next narration boundary.
    const rate = Math.max(1, seconds / (slots[i] - 1));
    rates.push(rate);
    console.log(`  ${seconds.toFixed(1)}s audio in ${slots[i]}s slot${rate > 1 ? ` (tempo ${rate.toFixed(2)}x)` : ''}`);
  }

  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const file of files) args.push('-i', file);
  const filters = files.map((_, i) => `[${i}:a]atempo=${rates[i].toFixed(4)},apad,atrim=duration=${slots[i]},asetpts=PTS-STARTPTS[a${i}]`);
  filters.push(`${files.map((_, i) => `[a${i}]`).join('')}concat=n=${files.length}:v=0:a=1[out]`);
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-c:a', 'pcm_s16le', audioOutput);
  await run('ffmpeg', args);

  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-i', audioOutput,
    '-map', '0:v:0', '-map', '1:a:0', '-map', '0:s?',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-c:s', 'copy',
    '-t', '240', '-movflags', '+faststart', videoOutput,
  ]);
  console.log(`Kokoro voiceover: ${audioOutput}`);
  console.log(`Narrated video: ${videoOutput}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
