import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const outputRoot = path.join(rootDir, 'store-assets');
const iconDir = path.join(outputRoot, 'icons');
const screenshotDir = path.join(outputRoot, 'screenshots');
const promoDir = path.join(outputRoot, 'promo');
const videoDir = path.join(outputRoot, 'video');
const tempDir = path.join(outputRoot, '.tmp');
const chromeProfileDir = path.join(outputRoot, '.chrome-profile');

const templatePath = path.join(__dirname, 'templates', 'store-real-capture.html');
const baseIconPath = path.join(rootDir, 'assets', 'icon.png');

const screenshotScenes = ['home', 'groups', 'leads', 'alerts', 'notifications'];

function run(command, args, stdio = 'inherit') {
  execFileSync(command, args, { stdio });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function chromeCapture({ scene, width, height, outputPng }) {
  const url = `file://${templatePath}?scene=${encodeURIComponent(scene)}`;
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
    '--virtual-time-budget=4000',
    `--user-data-dir=${chromeProfileDir}`,
    `--window-size=${width},${height}`,
    `--screenshot=${outputPng}`,
    url,
  ]);
}

function pngToJpeg24(inputPng, outputJpg, quality = '92') {
  run('convert', [
    inputPng,
    '-alpha',
    'off',
    '-colorspace',
    'sRGB',
    '-quality',
    quality,
    outputJpg,
  ]);
}

function imageToJpeg24(inputImage, outputJpg, width, height, quality = '92') {
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

function resizeIcon(inputPath, outputPath, size) {
  run('convert', [
    inputPath,
    '-background',
    '#050e0a',
    '-alpha',
    'remove',
    '-alpha',
    'off',
    '-resize',
    `${size}x${size}`,
    '-gravity',
    'center',
    '-extent',
    `${size}x${size}`,
    outputPath,
  ]);
}

function pickMusicTrack() {
  const candidates = [
    path.join(outputRoot, 'audio', 'music-open-source.mp3'),
    path.join(outputRoot, 'audio', 'music-open-source.wav'),
    path.join(rootDir, 'assets', 'music-open-source.mp3'),
    path.join(rootDir, 'assets', 'music-open-source.wav'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function tryDownloadMusicFromInternet(targetPath) {
  const urls = [
    process.env.STORE_ASSETS_MUSIC_URL,
    'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=future-bass-background-music-121353.mp3',
    'https://cdn.pixabay.com/download/audio/2022/10/25/audio_2e1f529d22.mp3?filename=technology-126231.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  ].filter(Boolean);

  for (const url of urls) {
    try {
      run(
        'curl',
        ['-L', '--fail', '--max-time', '45', url, '-o', targetPath],
        'ignore',
      );
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 50_000) {
        return targetPath;
      }
    } catch {
      // Try next URL.
    }
  }

  return null;
}

function createFallbackMusic(outputPath, durationSeconds = 20) {
  run('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `anoisesrc=color=violet:amplitude=0.006:duration=${durationSeconds}`,
    '-f', 'lavfi',
    '-i', `sine=frequency=98:duration=${durationSeconds}`,
    '-f', 'lavfi',
    '-i', `sine=frequency=196:duration=${durationSeconds}`,
    '-filter_complex',
    '[0:a]volume=0.34[n];[1:a]volume=0.025[b1];[2:a]volume=0.018[b2];[n][b1][b2]amix=inputs=3:normalize=0,alimiter=limit=0.95[a]',
    '-map',
    '[a]',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    outputPath,
  ]);
}

function createVideoFromScreenshots() {
  const motionVideo = path.join(tempDir, 'promo-motion.mp4');
  run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=#06110B:s=1280x800:d=20',
    '-loop',
    '1',
    '-i',
    baseIconPath,
    '-filter_complex',
    "[0:v]drawbox=x=0:y=0:width=iw:height=ih:color=0x06110B:t=fill," +
      "drawbox=x=90:y=90:width=1100:height=610:color=0x0B1720DD:t=fill," +
      "drawbox=x=105:y=105:width=1070:height=575:color=0x243647:t=2," +
      "drawbox=x=450:y=710:width=380:height=58:color=0x0A1620:t=fill," +
      "drawbox=x=530:y=731:width=220:height=14:color=0x1E2D3D:t=fill[base];" +
      "[1:v]scale=78:78[icon];" +
      "[base][icon]overlay=140:128:enable='between(t,0,20)'[v0];" +
      "[v0]" +
      "drawtext=text='GrabClientsNow':x=240:y=144:fontsize=42:fontcolor=0xEFFFF8:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:enable='between(t,0,20)'," +
      "drawtext=text='Capture clients before competitors reply':x=240:y=196:fontsize=28:fontcolor=0xA9E9D2:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:enable='between(t,0,5)'," +
      "drawtext=text='Monitor Facebook groups in real time':x=240:y=196:fontsize=28:fontcolor=0xA9E9D2:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:enable='between(t,5,10)'," +
      "drawtext=text='Get instant lead alerts and respond first':x=240:y=196:fontsize=28:fontcolor=0xA9E9D2:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:enable='between(t,10,15)'," +
      "drawtext=text='Fill pipeline faster with high-intent posts':x=240:y=196:fontsize=28:fontcolor=0xA9E9D2:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:enable='between(t,15,20)'," +
      "drawbox=x=145:y=250:width=940:height=84:color=0x07120D:t=fill:enable='between(t,3,20)'," +
      "drawbox=x=145:y=344:width=940:height=84:color=0x07120D:t=fill:enable='between(t,4,20)'," +
      "drawbox=x=145:y=438:width=940:height=84:color=0x07120D:t=fill:enable='between(t,5,20)'," +
      "drawbox=x=145:y=532:width=940:height=84:color=0x07120D:t=fill:enable='between(t,6,20)'," +
      "drawtext=text='Lead signal: Need roofer quote today':x=170:y=300:fontsize=26:fontcolor=0xE8FFF7:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:enable='between(t,3,20)'," +
      "drawtext=text='Lead signal: Looking for accountant this week':x=170:y=394:fontsize=26:fontcolor=0xE8FFF7:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:enable='between(t,4,20)'," +
      "drawtext=text='Lead signal: Need ads specialist ASAP':x=170:y=488:fontsize=26:fontcolor=0xE8FFF7:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:enable='between(t,5,20)'," +
      "drawtext=text='Lead signal: Recommendation request posted':x=170:y=582:fontsize=26:fontcolor=0xE8FFF7:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:enable='between(t,6,20)'," +
      "drawbox=x=835:y=86:width=365:height=72:color=0x08150FEE:t=fill:enable='between(t,6,8.7)'," +
      "drawbox=x=835:y=86:width=365:height=72:color=0x22D4A6:t=2:enable='between(t,6,8.7)'," +
      "drawtext=text='Alert: New client in your niche':x=858:y=130:fontsize=23:fontcolor=0xE7FFF5:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:enable='between(t,6,8.7)'," +
      "drawbox=x=835:y=168:width=365:height=72:color=0x08150FEE:t=fill:enable='between(t,10,12.7)'," +
      "drawbox=x=835:y=168:width=365:height=72:color=0x22D4A6:t=2:enable='between(t,10,12.7)'," +
      "drawtext=text='Telegram: reply before competitors':x=858:y=212:fontsize=23:fontcolor=0xE7FFF5:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:enable='between(t,10,12.7)'," +
      "drawbox=x=835:y=250:width=365:height=72:color=0x08150FEE:t=fill:enable='between(t,14,16.7)'," +
      "drawbox=x=835:y=250:width=365:height=72:color=0x22D4A6:t=2:enable='between(t,14,16.7)'," +
      "drawtext=text='CRM synced: lead assigned instantly':x=858:y=294:fontsize=23:fontcolor=0xE7FFF5:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:enable='between(t,14,16.7)'," +
      "drawbox=x=90:y=86:width=1100:height=610:color=0x1E3344:t=2," +
      "drawbox=x=0:y=708:width=1280:height=92:color=0x04110BDD:t=fill," +
      "drawtext=text='Get clients first. Reply before everyone else.':x=(w-text_w)/2:y=764:fontsize=42:fontcolor=0xEFFFF8:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:enable='between(t,16,20)'[outv]",
    '-map',
    '[outv]',
    '-t',
    '20',
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    motionVideo,
  ]);

  const fallbackMusic = path.join(tempDir, 'fallback-music.m4a');
  const downloadedMusic = tryDownloadMusicFromInternet(
    path.join(outputRoot, 'audio', 'music-downloaded.mp3'),
  );
  const musicTrack = downloadedMusic || pickMusicTrack();
  if (!musicTrack) {
    createFallbackMusic(fallbackMusic, 22);
  }

  const selectedMusicTrack = musicTrack || fallbackMusic;
  run('ffmpeg', [
    '-y',
    '-i',
    motionVideo,
    '-stream_loop',
    '-1',
    '-i',
    selectedMusicTrack,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-filter:a',
    'volume=0.22,afade=t=in:st=0:d=1.2',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    path.join(videoDir, 'promo-demo-1280x800.mp4'),
  ]);
}

function writeMusicGuide() {
  const guide = `# Open-Source / Royalty-Free Music Guide

Place your chosen track at one of these paths before running \`npm run generate:store-assets\`:
- \`store-assets/audio/music-open-source.mp3\`
- \`assets/music-open-source.mp3\`
- Or set env var \`STORE_ASSETS_MUSIC_URL=\"https://...mp3\"\` to auto-download.

If no file is found, the generator creates a synthetic ambient fallback track.

Suggested sources (check each license page before final upload):
- Pixabay music library: https://pixabay.com/music/
- Pixabay license FAQ: https://pixabay.com/service/faq/
- Mixkit free stock music: https://mixkit.co/free-stock-music/
`;
  fs.mkdirSync(path.join(outputRoot, 'audio'), { recursive: true });
  fs.writeFileSync(path.join(outputRoot, 'audio', 'MUSIC_SOURCES.md'), guide, 'utf8');
}

function writeListingCopy() {
  const listing = `# Chrome Web Store Listing Copy (EN)

## Short Description
Monitor Facebook groups and capture leads in real time.

## Detailed Description
GrabClientsNow helps sales teams, agencies, and founders discover buyer intent faster by monitoring Facebook group activity in real time.

Instead of manually checking dozens of groups, you get a live stream of relevant opportunities so you can respond while intent is still high.

What you can do with GrabClientsNow:
- Monitor multiple Facebook groups from one workflow.
- Detect posts that indicate buying intent.
- Prioritize hot opportunities and act quickly.
- Keep prospecting consistent without spreadsheet chaos.

Why users install it:
- Faster speed-to-lead improves conversion potential.
- Real-time visibility reduces missed opportunities.
- Structured lead capture makes outreach more repeatable.
- Simple setup for operators, closers, and small teams.

## Suggested Category
Developer Tools

## Assets Generated
- Store icon: 128x128 PNG
- Screenshots: 5x JPG (1280x800)
- Small promo tile: 440x280 JPG
- Marquee promo tile: 1400x560 JPG
- Promo video: MP4 1280x800 motion-style showcase with captions

## Notes Before Upload
- Screenshots and promo images are generated from the real extension UI (dist/index.html).
- Final files are exported as 24-bit JPG (no alpha) where required.
- The promo video uses motion treatment (intro + animated scene pans + captions).
- Add your own open-source track at store-assets/audio/music-open-source.mp3 for final publish audio.
`;

  fs.writeFileSync(path.join(outputRoot, 'store-listing-en.md'), listing, 'utf8');
}

function main() {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  if (!fs.existsSync(baseIconPath)) {
    throw new Error(`Base icon not found: ${baseIconPath}`);
  }

  if (!fs.existsSync(path.join(rootDir, 'dist', 'index.html'))) {
    throw new Error('dist/index.html not found. Run the build first (npm run build:dev).');
  }

  ensureDir(outputRoot);
  resetDir(iconDir);
  resetDir(screenshotDir);
  resetDir(promoDir);
  resetDir(videoDir);
  resetDir(tempDir);
  resetDir(chromeProfileDir);

  resizeIcon(baseIconPath, path.join(iconDir, 'store-icon-128.png'), 128);
  resizeIcon(baseIconPath, path.join(iconDir, 'icon-16.png'), 16);
  resizeIcon(baseIconPath, path.join(iconDir, 'icon-32.png'), 32);
  resizeIcon(baseIconPath, path.join(iconDir, 'icon-48.png'), 48);
  resizeIcon(baseIconPath, path.join(iconDir, 'icon-128.png'), 128);

  screenshotScenes.forEach((scene, index) => {
    const tempPng = path.join(tempDir, `shot-${scene}.png`);
    const outJpg = path.join(
      screenshotDir,
      `screenshot-${String(index + 1).padStart(2, '0')}-${scene}.jpg`,
    );
    chromeCapture({ scene, width: 1280, height: 800, outputPng: tempPng });
    pngToJpeg24(tempPng, outJpg);
  });

  imageToJpeg24(
    path.join(screenshotDir, 'screenshot-01-home.jpg'),
    path.join(promoDir, 'promo-small-440x280.jpg'),
    440,
    280,
  );
  imageToJpeg24(
    path.join(screenshotDir, 'screenshot-02-groups.jpg'),
    path.join(promoDir, 'promo-marquee-1400x560.jpg'),
    1400,
    560,
  );

  createVideoFromScreenshots();
  writeListingCopy();
  writeMusicGuide();

  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(chromeProfileDir, { recursive: true, force: true });
  console.log(`\nStore assets generated at: ${outputRoot}`);
}

main();
