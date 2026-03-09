import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const outputRoot = path.join(rootDir, 'store-assets');
const iconDir = path.join(outputRoot, 'icons');
const screenshotDir = path.join(outputRoot, 'screenshots');
const promoDir = path.join(outputRoot, 'promo');
const captureTemplatePath = path.join(__dirname, 'templates', 'store-real-capture.html');
const promoTemplatePath = path.join(__dirname, 'templates', 'store-showcase.html');
const promoOnly = process.argv.includes('--promo-only');

const screenshotScenes = [
  {scene: 'hero', filename: 'screenshot-1-hero.png'},
  {scene: 'howto', filename: 'screenshot-2-howto.png'},
  {scene: 'dashboard', filename: 'screenshot-3-dashboard.png'},
  {scene: 'comparison', filename: 'screenshot-4-comparison.png'},
  {scene: 'social', filename: 'screenshot-5-social.png'},
];

function run(command, args, stdio = 'inherit') {
  execFileSync(command, args, {stdio});
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, {recursive: true});
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, {recursive: true, force: true});
  fs.mkdirSync(dirPath, {recursive: true});
}

function chromeCapture({url, width, height, outputPng, chromeProfileDir}) {
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
    '--virtual-time-budget=4500',
    `--user-data-dir=${chromeProfileDir}`,
    `--window-size=${width},${height}`,
    `--screenshot=${outputPng}`,
    url,
  ]);
}

function optimizePng(filePath) {
  const tempPath = `${filePath}.tmp.png`;
  run('convert', [
    filePath,
    '-strip',
    '-define',
    'png:compression-level=9',
    '-define',
    'png:compression-filter=5',
    '-define',
    'png:compression-strategy=1',
    tempPath,
  ]);
  fs.renameSync(tempPath, filePath);
}

function imageToJpeg(inputImage, outputJpg, width, height, quality = '92') {
  run('convert', [
    inputImage,
    '-resize',
    `${width}x${height}^`,
    '-gravity',
    'center',
    '-extent',
    `${width}x${height}`,
    '-alpha',
    'off',
    '-colorspace',
    'sRGB',
    '-quality',
    quality,
    outputJpg,
  ]);
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
    outputPath,
  ]);
}

function writeListingCopy() {
  const listing = `# Chrome Web Store Listing Copy (EN)

## Short Description
Be first. Win the job. Get Facebook group lead alerts in minutes.

## Detailed Description
GrabClientsNow helps local service businesses spot buyer-intent posts inside Facebook groups before competitors flood the comments.

Instead of refreshing groups all day or paying for recycled marketplace leads, you can monitor the communities that matter, filter for the keywords you care about, and reply while the homeowner is still actively looking.

Built for:
- Plumbers
- Electricians
- Painters
- Roofers
- Landscapers
- Handymen
- Remodelers
- Local operators who need speed-to-lead

What GrabClientsNow does:
- Watches your selected Facebook groups from one dashboard.
- Flags urgent buyer language like recommend, quote, need, and near me.
- Filters low-quality noise with include and exclude keywords.
- Pushes new lead alerts to desktop, Telegram, or webhook.
- Helps you open the post fast and reply before the thread gets crowded.

Why users buy it:
- $0 per lead once installed.
- Faster reply windows improve close rate.
- Better than shared marketplace leads.
- Cleaner workflow for owners and office managers.
- No need to babysit dozens of tabs manually.

## Suggested Category
Productivity

## Assets Generated
- Store icons: PNG sizes 16, 48, 128, and icon-store
- Chrome screenshots: 5x PNG at 1280x800
- Gumroad cover generated separately at 1280x720
- Promo marquee: PNG 1400x560 plus JPEG derivatives
- Promo video generated separately via Remotion at 1920x1080
`;

  fs.writeFileSync(path.join(outputRoot, 'store-listing-en.md'), listing, 'utf8');
}

function main() {
  const baseIconSvg = path.join(rootDir, 'assets', 'icon.svg');
  const baseIconMiniSvg = path.join(rootDir, 'assets', 'icon-16.svg');

  if (!fs.existsSync(captureTemplatePath)) {
    throw new Error(`Template not found: ${captureTemplatePath}`);
  }

  if (!fs.existsSync(promoTemplatePath)) {
    throw new Error(`Template not found: ${promoTemplatePath}`);
  }

  if (!promoOnly && (!fs.existsSync(baseIconSvg) || !fs.existsSync(baseIconMiniSvg))) {
    throw new Error('Expected assets/icon.svg and assets/icon-16.svg to exist.');
  }

  if (!promoOnly && !fs.existsSync(path.join(rootDir, 'dist', 'index.html'))) {
    throw new Error('dist/index.html not found. Run npm run build first.');
  }

  ensureDir(outputRoot);
  if (!promoOnly) {
    resetDir(iconDir);
    resetDir(screenshotDir);
    rasterizeSvg(baseIconMiniSvg, path.join(iconDir, 'icon-16.png'), 16);
    rasterizeSvg(baseIconSvg, path.join(iconDir, 'icon-48.png'), 48);
    rasterizeSvg(baseIconSvg, path.join(iconDir, 'icon-128.png'), 128);
    rasterizeSvg(baseIconSvg, path.join(iconDir, 'icon-store.png'), 128);
    rasterizeSvg(baseIconSvg, path.join(iconDir, 'icon-32.png'), 32);
    rasterizeSvg(baseIconSvg, path.join(iconDir, 'store-icon-128.png'), 128);
  }
  resetDir(promoDir);

  const chromeProfileDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'grabclientsnow-store-profile-'),
  );

  try {
    if (!promoOnly) {
      screenshotScenes.forEach(({scene, filename}) => {
        const outputPath = path.join(screenshotDir, filename);
        chromeCapture({
          url: `file://${captureTemplatePath}?scene=${encodeURIComponent(scene)}`,
          width: 1280,
          height: 800,
          outputPng: outputPath,
          chromeProfileDir,
        });
        optimizePng(outputPath);
      });
    }

    const promoPng = path.join(promoDir, 'promo-marquee-1400x560.png');
    const promoRawPng = path.join(promoDir, 'promo-marquee-1400x560.raw.png');
    chromeCapture({
      url: `file://${promoTemplatePath}`,
      width: 1400,
      height: 680,
      outputPng: promoRawPng,
      chromeProfileDir,
    });
    run('convert', [
      promoRawPng,
      '-crop',
      '1400x560+0+0',
      '+repage',
      promoPng,
    ]);
    fs.rmSync(promoRawPng, {force: true});
    optimizePng(promoPng);
  } finally {
    fs.rmSync(chromeProfileDir, {recursive: true, force: true});
  }

  imageToJpeg(
    promoOnly
      ? path.join(promoDir, 'promo-marquee-1400x560.png')
      : path.join(screenshotDir, 'screenshot-1-hero.png'),
    path.join(promoDir, 'promo-small-440x280.jpg'),
    440,
    280,
  );
  imageToJpeg(
    path.join(promoDir, 'promo-marquee-1400x560.png'),
    path.join(promoDir, 'promo-marquee-1400x560.jpg'),
    1400,
    560,
  );

  if (!promoOnly) writeListingCopy();

  console.log(`\nStore assets generated at: ${outputRoot}`);
}

main();
