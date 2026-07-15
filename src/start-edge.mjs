/**
 * Start Edge — launches Edge with remote debugging port for iCloud Notes.
 * If Edge is already running on port 9229, reports status instead.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const PORT = 9229;
const PROFILE_DIR = path.join(process.cwd(), "edge-debug-profile");
const NOTES_URL = "https://www.icloud.com.cn/notes/";

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
];

async function isPortOpen() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/list`);
    return true;
  } catch { return false; }
}

async function main() {
  console.log("=== Edge Launcher for iCloud Notes ===\n");

  // Check if already running
  if (await isPortOpen()) {
    console.log(`✅ Edge already running on debug port ${PORT}`);
    const resp = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const pages = await resp.json();
    const notes = pages.find(p => p.url?.includes("icloud.com"));
    if (notes) console.log(`  iCloud Notes tab: ${notes.title}`);
    else console.log("  ⚠️ No iCloud Notes tab open. Please navigate to https://www.icloud.com.cn/notes/");
    return;
  }

  // Find browser
  let browser = null;
  for (const p of EDGE_PATHS) {
    if (fs.existsSync(p)) { browser = p; break; }
  }
  if (!browser) {
    console.log("❌ Edge or Chrome not found. Please install Microsoft Edge.");
    process.exit(1);
  }

  // Create profile directory
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  console.log(`Starting: ${browser}`);
  console.log(`  Debug port: ${PORT}`);
  console.log(`  Profile: ${PROFILE_DIR}`);
  console.log(`  URL: ${NOTES_URL}\n`);

  const child = spawn(browser, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    NOTES_URL
  ], { detached: true, stdio: "ignore" });
  child.unref();

  // Wait for port to become available
  console.log("Waiting for Edge to start...");
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (await isPortOpen()) {
      console.log(`✅ Edge started successfully on port ${PORT}`);
      console.log("  Please log in to iCloud if prompted, then run: npm start");
      return;
    }
    process.stdout.write(".");
  }
  console.log("\n❌ Edge did not start within 30 seconds.");
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
