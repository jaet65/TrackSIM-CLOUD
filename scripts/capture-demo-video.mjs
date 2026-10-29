import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const videoOutput = path.resolve(rootDir, process.env.DEMO_VIDEO_OUTPUT || `videos/demo-lanzamiento-${timestamp}.webm`);
const videoDirectory = path.dirname(videoOutput);
const recordingDirectory = await mkdtemp(path.join(os.tmpdir(), 'tracksim-demo-video-'));
const demoUrl = process.env.DEMO_URL;
const serverPort = Number(process.env.DEMO_PORT || 5174);
const localUrl = `http://127.0.0.1:${serverPort}/?demo=1`;
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
let server;

const ensureOutputDoesNotExist = async () => {
  try {
    await access(videoOutput);
    throw new Error(`El video ya existe: ${videoOutput}. Muévelo o define DEMO_VIDEO_OUTPUT para usar otra ruta.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

const waitForServer = async (url) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`Vite terminó antes de iniciar (código ${server.exitCode}).`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await delay(300);
    }
  }
  throw new Error(`No fue posible conectar con la aplicación en ${url}.`);
};

const smoothScrollPage = async (page, distance, duration = 3_000) => {
  await page.evaluate(async ({ scrollDistance, scrollDuration }) => {
    const start = window.scrollY;
    const startTime = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        const progress = Math.min(1, (now - startTime) / scrollDuration);
        const eased = progress * (2 - progress);
        window.scrollTo(0, start + scrollDistance * eased);
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }, { scrollDistance: distance, scrollDuration: duration });
};

const smoothScrollElement = async (locator, distance, duration = 2_500) => {
  await locator.evaluate(async (element, params) => {
    const start = element.scrollTop;
    const startTime = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        const progress = Math.min(1, (now - startTime) / params.scrollDuration);
        const eased = progress * (2 - progress);
        element.scrollTop = start + params.scrollDistance * eased;
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }, { scrollDistance: distance, scrollDuration: duration });
};

const clickNavigation = async (page, label) => {
  await page.locator('nav .nav-item').filter({ hasText: label }).click();
  await delay(1_500);
};

const selectOptionMatching = async (select, text) => {
  const option = select.locator('option').filter({ hasText: text }).first();
  const value = await option.getAttribute('value');
  if (value === null) {
    throw new Error(`No se encontró una opción que coincida con "${text}".`);
  }
  await select.selectOption(value);
};

try {
  await ensureOutputDoesNotExist();
  await mkdir(videoDirectory, { recursive: true });

  if (!demoUrl) {
    server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(serverPort), '--strictPort'], {
      cwd: rootDir,
      stdio: 'ignore',
      windowsHide: true
    });
    await waitForServer(localUrl);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: recordingDirectory,
      size: { width: 1920, height: 1080 }
    }
  });
  const page = await context.newPage();
  const url = demoUrl
    ? new URL(demoUrl)
    : new URL(localUrl);
  url.searchParams.set('demo', '1');

  let completed = false;
  try {
    await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByText('Sesión de demostración').waitFor({ timeout: 30_000 });
    await page.getByText('Reportes Procesados').waitFor({ timeout: 30_000 });
    const themeToggle = page.getByRole('button', { name: /Cambiar a tema claro|Cambiar a tema oscuro/ });
    if (await themeToggle.getAttribute('aria-pressed') !== 'true') {
      await themeToggle.click();
    }
    await delay(2_000);

    await delay(5_000);
    await smoothScrollPage(page, 720, 3_500);
    await delay(3_500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await delay(2_000);

    await clickNavigation(page, 'Evolución');
    const driverSelector = page.locator('select').first();
    await selectOptionMatching(driverSelector, 'Lucía Martínez');
    await delay(1_500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await delay(2_000);
    await delay(5_000);
    await smoothScrollPage(page, 520, 3_000);
    await delay(3_000);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await delay(1_500);

    await page.getByRole('button', { name: /Desglosar Errores/ }).click();
    const radarModal = page.locator('.modal-backdrop').filter({ hasText: 'Análisis Diagnóstico Multidimensional' });
    await radarModal.waitFor({ state: 'visible' });
    await delay(5_000);
    const radarModalContent = radarModal.locator('.glass-card').first();
    await smoothScrollElement(radarModalContent, 420, 2_500);
    await delay(3_000);
    await radarModal.getByRole('button').first().click();
    await delay(1_500);

    await page.getByRole('button', { name: /Flota \/ Empresa/ }).click();
    await delay(1_500);
    const fleetSelector = page.locator('select').first();
    await selectOptionMatching(fleetSelector, 'Transportes Horizonte');
    await delay(2_000);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await delay(5_000);
    await smoothScrollPage(page, 760, 3_500);
    await delay(3_500);

    await clickNavigation(page, 'Métricas');
    const companySelector = page.locator('.metrics-filter-bar select').first();
    await selectOptionMatching(companySelector, 'Transportes Horizonte');
    await delay(2_000);
    await delay(4_000);
    await smoothScrollPage(page, 780, 3_500);
    await delay(3_000);
    await smoothScrollPage(page, 620, 3_000);
    await delay(2_500);

    await clickNavigation(page, 'Evolución');
    const finalDriverSelector = page.locator('select').first();
    await selectOptionMatching(finalDriverSelector, 'Lucía Martínez');
    await delay(1_500);
    const reportButton = page.getByRole('button', { name: /Ver Reporte/ }).last();
    await reportButton.scrollIntoViewIfNeeded();
    await delay(1_500);
    await reportButton.click();
    const reportModal = page.locator('.modal-overlay .modal-dialog');
    await reportModal.waitFor({ state: 'visible' });
    await delay(3_500);
    await smoothScrollElement(reportModal, 450, 1_500);
    await delay(2_000);
    await smoothScrollElement(reportModal, -450, 1_500);
    await delay(4_500);
    completed = true;
  } finally {
    const video = page.video();
    await context.close();
    if (completed) {
      const temporaryVideo = await video.path();
      await copyFile(temporaryVideo, videoOutput);
    }
    await browser.close();
  }

  console.log(`Video de demostración guardado en: ${videoOutput}`);
} finally {
  await rm(recordingDirectory, { recursive: true, force: true });
  if (server && server.exitCode === null) {
    server.kill();
  }
}
