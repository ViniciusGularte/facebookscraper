import { build as esbuild } from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

const SHOULD_OBFUSCATE = process.env.NO_OBFUSCATE !== "1";
const SHOULD_ZIP = process.env.BUILD_ZIP === "1";

const staticFiles = ["manifest.json", "index.html", "groups.html"];
const staticDirs = ["assets"];

const jsEntries = [
  { input: "src/background/index.js", output: "background.js", format: "iife" },
  { input: "content_script.js", output: "content_script.js", format: "iife" },
  { input: "src/panel/index.js", output: "panel.js", format: "esm" },
  { input: "groups.js", output: "groups.js", format: "esm" },
];

// Files that are safe to obfuscate.
// Important: background/content scripts may use inline functions passed to
// chrome.scripting.executeScript; aggressive obfuscation can break injection.
const obfuscateAllowList = new Set([
  "background.js",
  "panel.js",
  "groups.js",
]);

function log(msg) {
  process.stdout.write(`[build] ${msg}\n`);
}

async function copyStatic() {
  for (const file of staticFiles) {
    await cp(path.join(ROOT_DIR, file), path.join(DIST_DIR, file));
  }

  for (const dir of staticDirs) {
    const srcDir = path.join(ROOT_DIR, dir);
    const destDir = path.join(DIST_DIR, dir);
    if (existsSync(srcDir)) {
      await cp(srcDir, destDir, { recursive: true });
    }
  }
}

async function buildJs() {
  for (const entry of jsEntries) {
    await esbuild({
      entryPoints: [path.join(ROOT_DIR, entry.input)],
      outfile: path.join(DIST_DIR, entry.output),
      bundle: true,
      minify: true,
      sourcemap: false,
      legalComments: "none",
      target: ["chrome114"],
      charset: "utf8",
      format: entry.format,
    });
  }
}

function getObfuscationOptions() {
  return {
    compact: true,
    target: "browser",
    identifierNamesGenerator: "hexadecimal",
    controlFlowFlattening: false,
    deadCodeInjection: false,
    renameGlobals: false,
    renameProperties: false,
    selfDefending: false,
    stringArray: true,
    stringArrayThreshold: 0.75,
    splitStrings: true,
    splitStringsChunkLength: 8,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
  };
}

function getObfuscationOptionsForFile(outputFile) {
  if (outputFile === "background.js") {
    // Keep background obfuscation conservative to avoid breaking
    // inline functions used by chrome.scripting.executeScript.
    return {
      compact: true,
      target: "browser",
      identifierNamesGenerator: "hexadecimal",
      controlFlowFlattening: false,
      deadCodeInjection: false,
      renameGlobals: false,
      renameProperties: false,
      selfDefending: false,
      stringArray: false,
      splitStrings: false,
      transformObjectKeys: false,
      unicodeEscapeSequence: false,
    };
  }
  return getObfuscationOptions();
}

async function obfuscateJs() {
  for (const entry of jsEntries) {
    if (!obfuscateAllowList.has(entry.output)) {
      continue;
    }
    const options = getObfuscationOptionsForFile(entry.output);
    const distPath = path.join(DIST_DIR, entry.output);
    const code = await readFile(distPath, "utf8");
    const result = JavaScriptObfuscator.obfuscate(code, options).getObfuscatedCode();
    await writeFile(distPath, result, "utf8");
  }
}

function zipDist() {
  const zipPath = path.join(ROOT_DIR, "grabclientsnow-extension.zip");
  try {
    const check = spawnSync("zip", ["-v"], { stdio: "ignore" });
    if (check.status !== 0) {
      log("zip command not found. Skipping zip package.");
      return;
    }

    const result = spawnSync("zip", ["-r", zipPath, "."], {
      cwd: DIST_DIR,
      stdio: "inherit",
    });

    if (result.status === 0) {
      log(`zip package created: ${zipPath}`);
    } else {
      log("failed to create zip package.");
    }
  } catch {
    log("zip packaging skipped due to environment error.");
  }
}

async function main() {
  log("cleaning dist...");
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  log("copying static files...");
  await copyStatic();

  log("building JavaScript...");
  await buildJs();

  if (SHOULD_OBFUSCATE) {
    log("obfuscating JavaScript...");
    await obfuscateJs();
  } else {
    log("skipping obfuscation (NO_OBFUSCATE=1)");
  }

  if (SHOULD_ZIP) {
    log("packaging zip...");
    zipDist();
  }

  log("done. Load dist/ as unpacked extension.");
}

main().catch((err) => {
  console.error("[build] failed:", err);
  process.exit(1);
});
