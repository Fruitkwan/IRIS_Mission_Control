import { spawn } from 'node:child_process';
import { mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, request } from '@playwright/test';

const user = process.env.IRIS_USER;
const password = process.env.IRIS_PASSWORD;
const origin = (process.env.IRISOPS_URL ?? 'http://localhost:52773').replace(/\/$/, '');
const demoDir = resolve(import.meta.dirname, '../../demo');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const webm = resolve(demoDir, `irisops-full-demo-${stamp}.webm`);
const mp4 = resolve(demoDir, `irisops-full-demo-${stamp}.mp4`);
const voice = resolve(demoDir, 'irisops-voiceover.wav');
const subtitles = resolve(demoDir, 'VIDEO_CAPTIONS.srt');
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

if (!user || !password) throw new Error('Set IRIS_USER and IRIS_PASSWORD in this shell before recording.');

function ffmpeg(input, output) {
  return new Promise((done, fail) => {
    const child = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-n',
      '-i', input, '-i', voice, '-i', subtitles,
      '-map', '0:v:0', '-map', '1:a:0', '-map', '2:s:0',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-c:s', 'mov_text',
      '-t', '240', '-movflags', '+faststart', output,
    ], { stdio: 'inherit' });
    child.on('error', fail);
    child.on('close', (code) => code === 0 ? done() : fail(new Error(`FFmpeg exited with code ${code}`)));
  });
}

async function authorizedApi() {
  const login = await request.newContext({ baseURL: origin, timeout: 15_000 });
  try {
    const response = await login.post('/api/admin/login', { data: { user, password } });
    if (!response.ok()) throw new Error(`IRIS login failed (HTTP ${response.status()}).`);
    const body = await response.json();
    const token = (body.result ?? body).access_token;
    if (!token) throw new Error('IRIS login returned no access token.');
    return request.newContext({
      baseURL: origin, timeout: 15_000,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
  } finally {
    await login.dispose();
  }
}

async function journalSettings(api) {
  const response = await api.get('/api/admin/v2/journal/settings');
  if (!response.ok()) throw new Error(`Journal preflight failed (HTTP ${response.status()}).`);
  return (await response.json()).result;
}

async function setJournalFreeze(api, enabled) {
  const settings = await journalSettings(api);
  if (settings.FreezeOnError === enabled) return;
  const response = await api.put('/api/admin/v2/journal/settings', {
    data: { ...settings, FreezeOnError: enabled },
  });
  if (!response.ok() || (await journalSettings(api)).FreezeOnError !== enabled) {
    throw new Error(`Could not ${enabled ? 'enable' : 'stage'} journal freeze-on-error (HTTP ${response.status()}).`);
  }
}

async function caption(page, title, detail = '') {
  await page.evaluate(({ title, detail }) => {
    let box = document.getElementById('irisops-video-caption');
    if (!box) {
      box = document.createElement('div');
      box.id = 'irisops-video-caption';
      Object.assign(box.style, {
        position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
        zIndex: '99999', width: 'min(840px, calc(100vw - 64px))',
        padding: '14px 20px', borderRadius: '12px', color: '#f8fafc',
        background: 'rgba(8, 18, 28, 0.94)', border: '1px solid rgba(45, 212, 191, 0.45)',
        boxShadow: '0 16px 45px rgba(0, 0, 0, 0.55)',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', pointerEvents: 'none',
      });
      document.body.append(box);
    }
    box.replaceChildren();
    const heading = document.createElement('div');
    heading.textContent = title;
    Object.assign(heading.style, { fontSize: '20px', fontWeight: '700' });
    const sub = document.createElement('div');
    sub.textContent = detail;
    Object.assign(sub.style, { fontSize: '13px', color: '#a8b8c8', marginTop: '3px' });
    box.append(heading, sub);
  }, { title, detail });
}

async function goto(page, path, title) {
  await page.goto(`${origin}/irisops/#/${path}`);
  await page.getByText(title, { exact: true }).first().waitFor({ timeout: 20_000 });
}

async function scene(page, started, index, endSecond, title, detail, action) {
  console.log(`Scene ${index}: ${title}`);
  await caption(page, title, detail);
  await action();
  // A route change replaces the DOM, so put the caption back on the new page.
  await caption(page, title, detail);
  const remaining = endSecond * 1000 - (Date.now() - started);
  if (remaining < -5000) throw new Error(`Scene ${index} overran its narration slot by ${Math.ceil(-remaining / 1000)} seconds.`);
  if (remaining > 0) await wait(remaining);
}

async function mcpHealth() {
  const endpoint = process.env.IRISOPS_MCP_URL ?? 'http://localhost:3333/mcp';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'iris_get_health', arguments: {} } }),
  });
  if (!response.ok) throw new Error(`MCP health call failed (HTTP ${response.status}).`);
  const body = await response.text();
  const data = body.split('\n').find((line) => line.startsWith('data:'));
  const payload = JSON.parse(data ? data.slice(5) : body);
  if (payload.result?.isError) throw new Error('MCP health tool returned an error.');
  return JSON.parse(payload.result.content[0].text);
}

let api;
let browser;
let videoContext;
let recording;
let captureError;
let staged = false;
try {
  api = await authorizedApi();
  const initial = await journalSettings(api);
  if (initial.FreezeOnError === true) {
    if (process.env.IRISOPS_STAGE_JOURNAL !== '1') {
      throw new Error('Journal freeze-on-error is enabled. Recording the fix needs temporary staging. Set IRISOPS_STAGE_JOURNAL=1 only after authorizing that safety-setting change.');
    }
    await setJournalFreeze(api, false);
    staged = true;
    console.log('Temporarily staged journal freeze-on-error as disabled; it will be restored.');
  }

  await mkdir(demoDir, { recursive: true });
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}) });
  const prep = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const loginPage = await prep.newPage();
  await loginPage.goto(`${origin}/irisops/#/login`);
  await loginPage.locator('input').first().fill(user);
  await loginPage.locator('input[type="password"]').fill(password);
  await loginPage.getByRole('button', { name: 'Sign in' }).click();
  await loginPage.getByRole('navigation').getByRole('link', { name: 'IRIS Doctor', exact: true }).waitFor({ timeout: 20_000 });
  const storageState = await prep.storageState();
  await prep.close();

  videoContext = await browser.newContext({
    viewport: { width: 1600, height: 900 }, colorScheme: 'dark', storageState,
    recordVideo: { dir: demoDir, size: { width: 1600, height: 900 } },
  });
  const page = await videoContext.newPage();
  recording = page.video();
  await goto(page, '', 'Dashboard');
  const started = Date.now();

  await scene(page, started, 1, 20, 'IRIS Mission Control', 'Diagnose · fix safely · prove it', async () => {});
  await scene(page, started, 2, 45, 'Operations Center', 'Live telemetry · deterministic health rules', async () => {
    await goto(page, 'operations', 'Operations Center');
  });
  await scene(page, started, 3, 70, 'One-click diagnosis', 'Databases · journals · security · tasks · more', async () => {
    await goto(page, 'doctor', 'IRIS Doctor');
    await page.getByRole('button', { name: 'Diagnose IRIS' }).click();
    await page.getByRole('button', { name: 'Run again' }).waitFor({ timeout: 60_000 });
    await page.getByRole('textbox', { name: 'Search findings' }).fill('Freeze-on-error');
    await page.getByText('Freeze-on-error is disabled', { exact: true }).waitFor();
  });
  await scene(page, started, 4, 100, 'Evidence, not guesses', 'Live IRIS journal setting: FreezeOnError = false', async () => {
    await page.getByRole('button', { name: 'View evidence' }).click();
    await page.getByText('FreezeOnError', { exact: true }).waitFor();
  });
  await scene(page, started, 5, 140, 'Preview → confirm → verify → audit', 'One field changes; the live configuration is read back', async () => {
    await page.getByRole('button', { name: 'Preview change' }).click();
    await page.getByText('FreezeOnError: false → true').first().waitFor();
    await wait(5500);
    await page.getByRole('button', { name: 'Confirm and enable journal freeze-on-error' }).click();
    await page.getByRole('status').getByText('IRIS confirmed journal freeze-on-error is enabled.', { exact: false }).waitFor({ timeout: 20_000 });
    await page.getByText('Recorded in the IRIS audit log', { exact: false }).waitFor();
  });
  await scene(page, started, 6, 170, 'Verified resolution', 'The finding disappears; Time Machine compares before and after', async () => {
    await page.getByRole('button', { name: 'Run diagnostics and compare' }).click();
    await page.getByText('Previous assessment:', { exact: false }).waitFor({ timeout: 60_000 });
    await page.getByText('No findings match this search and filter.').waitFor();
    await wait(3500);
    await page.getByRole('link', { name: 'View before/after in Time Machine →' }).click();
    await page.getByText('What changed?', { exact: false }).waitFor({ timeout: 20_000 });
  });
  await scene(page, started, 7, 200, 'Same engine for humans and AI agents', 'MCP health findings · audited calls', async () => {
    const health = await mcpHealth();
    if (health.findings.some((finding) => finding.ruleId === 'journal-no-freeze')) throw new Error('MCP still reports the journal finding after the fix.');
    await goto(page, 'mcp', 'MCP Server');
    await page.getByText('Tool call audit', { exact: true }).waitFor();
    await page.getByText('iris_get_health', { exact: true }).first().waitFor({ timeout: 15_000 });
  });
  await scene(page, started, 8, 225, 'A complete modern portal', 'Command palette · config drift · security · FHIR · cloud', async () => {
    await goto(page, 'operations/drift', 'Config Drift');
    await wait(4500);
    await goto(page, 'security/audit', 'Audit');
    await wait(4500);
    await goto(page, 'doctor', 'IRIS Doctor');
  });
  await scene(page, started, 9, 240, 'IRIS Mission Control', 'github.com/Fruitkwan/IRIS_Mission_Control', async () => {
    await page.evaluate(() => {
      const cover = document.createElement('div');
      Object.assign(cover.style, {
        position: 'fixed', inset: '0', zIndex: '99998', background: '#080f18',
        display: 'grid', placeItems: 'center', color: '#f8fafc', textAlign: 'center',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      });
      cover.innerHTML = '<div><h1 style="font-size:56px;margin:0 0 18px">IRIS Mission Control</h1><p style="font-size:24px;color:#2dd4bf">Diagnose. Fix safely. Prove it.</p><p style="font-size:18px;color:#94a3b8">docker compose up -d --build</p></div>';
      document.body.append(cover);
    });
  });

  await videoContext.close();
  videoContext = undefined;
  await rename(await recording.path(), webm);
  console.log(`Saved raw video: ${webm}`);
  await ffmpeg(webm, mp4);
  console.log(`Saved narrated MP4: ${mp4}`);
} catch (error) {
  captureError = error;
  console.error('Recording failed:', error.message);
} finally {
  await videoContext?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (api) {
    try {
      // A staged safety setting must be restored even if the recording fails midway.
      await api.dispose();
      if (staged) {
        api = await authorizedApi();
        await setJournalFreeze(api, true);
        console.log('Journal freeze-on-error restored and verified as enabled.');
        await api.dispose();
      }
    } catch (error) {
      captureError = error;
      console.error('Could not restore journal freeze-on-error:', error.message);
    }
  }
  if (captureError) process.exitCode = 1;
}
