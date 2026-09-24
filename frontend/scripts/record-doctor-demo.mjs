import { spawn } from 'node:child_process';
import { mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, request } from '@playwright/test';

const user = process.env.IRIS_USER;
const password = process.env.IRIS_PASSWORD;
const origin = (process.env.IRISOPS_URL ?? 'http://localhost:52773').replace(/\/$/, '');
const outputDir = resolve(import.meta.dirname, '../../demo');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const webmPath = resolve(outputDir, `irisops-doctor-${stamp}.webm`);
const mp4Path = resolve(outputDir, `irisops-doctor-${stamp}.mp4`);
const auditParams = { source: '%System', type: '%Login', name: 'Login' };
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

if (!user || !password) {
  throw new Error('Set IRIS_USER and IRIS_PASSWORD before recording.');
}

function convertVideo(input, output) {
  return new Promise((done, fail) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-n', '-i', input,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', output,
    ], { stdio: 'inherit' });
    ffmpeg.on('error', fail);
    ffmpeg.on('close', (code) => code === 0 ? done() : fail(new Error(`FFmpeg exited with code ${code}`)));
  });
}

async function showCaption(page, title, detail) {
  await page.evaluate(({ title, detail }) => {
    let box = document.getElementById('irisops-demo-caption');
    if (!box) {
      box = document.createElement('div');
      box.id = 'irisops-demo-caption';
      Object.assign(box.style, {
        position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
        zIndex: '9999', width: 'min(900px, calc(100vw - 60px))',
        padding: '16px 22px', borderRadius: '14px',
        color: '#f8fafc', background: 'rgba(8, 18, 28, 0.94)',
        border: '1px solid rgba(45, 212, 191, 0.45)',
        boxShadow: '0 18px 45px rgba(0, 0, 0, 0.45)',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        pointerEvents: 'none',
      });
      document.body.append(box);
    }
    box.replaceChildren();
    const heading = document.createElement('div');
    heading.textContent = title;
    Object.assign(heading.style, { fontSize: '20px', fontWeight: '700', lineHeight: '1.3' });
    const sub = document.createElement('div');
    sub.textContent = detail;
    Object.assign(sub.style, { fontSize: '13px', color: '#a8b8c8', marginTop: '4px' });
    box.append(heading, sub);
  }, { title, detail });
}

async function readAudit(api) {
  const [masterResponse, eventResponse] = await Promise.all([
    api.get('/api/admin/v2/security/audit/enabled'),
    api.get('/api/admin/v2/security/audit/event', { params: auditParams }),
  ]);
  if (!masterResponse.ok() || !eventResponse.ok()) {
    throw new Error(`Audit preflight failed: master HTTP ${masterResponse.status()}, event HTTP ${eventResponse.status()}`);
  }
  const master = (await masterResponse.json()).result;
  const event = (await eventResponse.json()).result;
  return { masterEnabled: master?.Enabled === true, eventEnabled: event?.Enabled === true };
}

async function authorizedApi() {
  const loginApi = await request.newContext({ baseURL: origin, timeout: 15_000 });
  try {
    const response = await loginApi.post('/api/admin/login', { data: { user, password } });
    if (!response.ok()) throw new Error(`IRIS login failed (HTTP ${response.status()}).`);
    const body = await response.json();
    const token = (body.result ?? body).access_token;
    if (!token) throw new Error('IRIS login response did not include an access token.');
    return request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
  } finally {
    await loginApi.dispose();
  }
}

let api;
let browser;
let videoContext;
let recording;
let captureError;
try {
  api = await authorizedApi();
  const initial = await readAudit(api);
  if (!initial.masterEnabled || initial.eventEnabled) {
    throw new Error('Demo preflight requires audit master enabled and %System/%Login/Login disabled. No setting was changed.');
  }

  await mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
  });
  const prepContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const loginPage = await prepContext.newPage();
  await loginPage.goto(`${origin}/irisops/#/login`);
  await loginPage.locator('input').first().fill(user);
  await loginPage.locator('input[type="password"]').fill(password);
  await loginPage.getByRole('button', { name: 'Sign in' }).click();
  await loginPage.getByRole('navigation').getByRole('link', { name: 'IRIS Doctor', exact: true }).waitFor({ timeout: 20_000 });
  const storageState = await prepContext.storageState();
  await prepContext.close();

  videoContext = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: outputDir, size: { width: 1600, height: 900 } },
    storageState,
    colorScheme: 'dark',
  });
  const page = await videoContext.newPage();
  recording = page.video();
  await page.goto(`${origin}/irisops/#/operations`);
  await page.getByText('Operations Center', { exact: true }).waitFor();
  await showCaption(page, 'IRIS Mission Control', 'A live, evidence-backed operations assessment.');
  await pause(3500);

  await page.getByRole('navigation').getByRole('link', { name: 'IRIS Doctor', exact: true }).click();
  await page.getByRole('button', { name: 'Diagnose IRIS' }).waitFor();
  await showCaption(page, 'Diagnose the instance', 'IRIS Doctor collects live telemetry and evaluates deterministic rules.');
  await pause(2200);
  await page.getByRole('button', { name: 'Diagnose IRIS' }).click();
  await page.getByRole('button', { name: 'Run again' }).waitFor({ timeout: 60_000 });
  await pause(2500);

  await page.getByRole('textbox', { name: 'Search findings' }).fill('Login auditing');
  await page.getByText('Login auditing is disabled', { exact: true }).waitFor();
  await showCaption(page, 'A finding with evidence', 'Successful logins are not being recorded.');
  await pause(2800);
  await page.getByRole('button', { name: 'View evidence' }).click();
  await pause(2500);

  await page.getByRole('button', { name: 'Preview change' }).click();
  await page.getByText('Login event: disabled → enabled').waitFor();
  await showCaption(page, 'Review the exact change', 'Only the login audit event will be enabled.');
  await pause(3200);
  await page.getByRole('button', { name: 'Confirm and enable login auditing' }).click();
  await page.getByRole('status').getByText('IRIS confirmed login auditing is enabled.', { exact: false }).waitFor({ timeout: 20_000 });
  await showCaption(page, 'IRIS confirms the change', 'The portal reads the event back before reporting success.');
  await pause(3200);

  await page.getByRole('button', { name: 'Run diagnostics and compare' }).click();
  await page.getByText('Previous assessment:', { exact: false }).waitFor({ timeout: 60_000 });
  await page.getByText('No findings match this search and filter.').waitFor();
  await showCaption(page, 'Verified resolution', 'The login audit finding is gone and the assessment is updated.');
  await pause(4500);

  await videoContext.close();
  videoContext = undefined;
  await rename(await recording.path(), webmPath);
  console.log(`Recorded WebM: ${webmPath}`);
  await convertVideo(webmPath, mp4Path);
  console.log(`Recorded MP4: ${mp4Path}`);
} catch (error) {
  captureError = error;
  console.error('Demo recording failed:', error);
} finally {
  await videoContext?.close().catch((error) => console.error('Could not close video context:', error));
  await browser?.close().catch((error) => console.error('Could not close browser:', error));
  if (api) {
    try {
      await api.dispose();
      api = await authorizedApi();
      const current = await readAudit(api);
      if (current.eventEnabled) {
        const restored = await api.put('/api/admin/v2/security/audit/event', { params: auditParams, data: { Enabled: false } });
        if (!restored.ok() || (await readAudit(api)).eventEnabled) {
          throw new Error(`Could not restore the demo audit event (HTTP ${restored.status()}).`);
        }
        console.log('Restored %System/%Login/Login to disabled.');
      }
    } catch (error) {
      captureError = error;
      console.error('Audit restoration failed:', error);
    }
    await api.dispose();
  }
  if (captureError) process.exitCode = 1;
}
