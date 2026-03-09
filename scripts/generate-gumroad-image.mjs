import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const outputDir = path.join(rootDir, 'store-assets', 'gumroad');
const templatePath = path.join(__dirname, 'templates', 'gumroad-cover.html');
const baseIconSvg = path.join(rootDir, 'assets', 'icon.svg');
const width = 1280;
const height = 720;
const captureHeight = 800;
const outputPng = path.join(outputDir, 'gumroad-cover.png');
const rawOutputPng = path.join(outputDir, 'gumroad-cover.raw.png');
const optimizedPng = path.join(outputDir, 'gumroad-cover.optimized.png');
const iconOutputPng = path.join(outputDir, 'gumroad-icon-600x600.png');
const iconOptimizedPng = path.join(outputDir, 'gumroad-icon-600x600.optimized.png');

function run(command, args, stdio = 'inherit') {
  execFileSync(command, args, {stdio});
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, {recursive: true});
}

function optimizePng(inputPath, outputPath) {
  run('convert', [
    inputPath,
    '-strip',
    '-define',
    'png:compression-level=9',
    '-define',
    'png:compression-filter=5',
    outputPath,
  ]);
  fs.renameSync(outputPath, inputPath);
}

function rasterizeSvg(inputPath, outputPath, size, background = 'none') {
  run('convert', [
    inputPath,
    '-background',
    background,
    '-resize',
    `${size}x${size}`,
    '-gravity',
    'center',
    '-extent',
    `${size}x${size}`,
    '-transparent',
    'white',
    outputPath,
  ]);
}

ensureDir(outputDir);

if (!fs.existsSync(baseIconSvg)) {
  throw new Error(`Expected icon SVG at ${baseIconSvg}`);
}

rasterizeSvg(baseIconSvg, iconOutputPng, 600);
optimizePng(iconOutputPng, iconOptimizedPng);

const chromeProfileDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'grabclientsnow-gumroad-profile-'),
);

try {
  run('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--disable-web-security',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--virtual-time-budget=3000',
    `--user-data-dir=${chromeProfileDir}`,
    `--window-size=${width},${captureHeight}`,
    `--screenshot=${rawOutputPng}`,
    `file://${templatePath}`,
  ]);

  run('convert', [
    rawOutputPng,
    '-crop',
    `${width}x${height}+0+0`,
    '+repage',
    outputPng,
  ]);
  fs.rmSync(rawOutputPng, {force: true});

  optimizePng(outputPng, optimizedPng);
} finally {
  fs.rmSync(chromeProfileDir, {recursive: true, force: true});
}

console.log(`Generated ${outputPng}`);
console.log(`Generated ${iconOutputPng}`);
