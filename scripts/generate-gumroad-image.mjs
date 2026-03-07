import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const outputDir = path.join(rootDir, 'store-assets', 'gumroad');
const tempDir = path.join(outputDir, '.tmp');
const chromeProfileDir = path.join(outputDir, '.chrome-profile');
const templatePath = path.join(__dirname, 'templates', 'gumroad-cover.html');

const width = 1600;
const height = 900;
const tempPng = path.join(tempDir, 'gumroad-cover.png');
const outputJpg = path.join(outputDir, 'gumroad-cover-1600x900.jpg');

function run(command, args, stdio = 'inherit') {
  execFileSync(command, args, { stdio });
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

resetDir(tempDir);
fs.mkdirSync(chromeProfileDir, { recursive: true });

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
  '--virtual-time-budget=2500',
  `--user-data-dir=${chromeProfileDir}`,
  `--window-size=${width},${height}`,
  `--screenshot=${tempPng}`,
  `file://${templatePath}`,
]);

run('convert', [
  tempPng,
  '-alpha',
  'off',
  '-units',
  'PixelsPerInch',
  '-density',
  '72',
  '-colorspace',
  'sRGB',
  '-quality',
  '92',
  outputJpg,
]);

console.log(`Generated ${outputJpg}`);
