/**
 * Verify environment — checks Node.js, Edge, and workspace prerequisites.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
];

let ok = true;

function check(label, pass, detail = "") {
  const icon = pass ? "✅" : "❌";
  console.log(`${icon} ${label}${detail ? " — " + detail : ""}`);
  if (!pass) ok = false;
}

console.log("=== iCloud Notes Exporter — Environment Check ===\n");

// 1. Node.js version
try {
  const ver = process.version;
  const major = parseInt(ver.slice(1).split(".")[0]);
  check("Node.js version", major >= 18, `${ver} (need >= 18)`);
} catch (e) {
  check("Node.js version", false, "could not detect");
}

// 2. Edge/Chrome binary
let browserPath = null;
for (const p of EDGE_PATHS) {
  if (fs.existsSync(p)) { browserPath = p; break; }
}
check("Browser (Edge/Chrome)", !!browserPath, browserPath || "not found");

// 3. ws module
try {
  await import("ws");
  check("ws module", true);
} catch (e) {
  check("ws module", false, 'run: npm install');
}

// 4. Debug port check
try {
  const resp = await fetch("http://127.0.0.1:9229/json/list");
  const pages = await resp.json();
  const notesPage = pages.find(p => p.url?.includes("icloud.com"));
  check("Edge debug port (9229)", true, `${pages.length} tabs`);
  check("iCloud Notes tab", !!notesPage, notesPage ? notesPage.title : "not open");
} catch (e) {
  check("Edge debug port (9229)", false, "Edge not running with --remote-debugging-port");
  if (browserPath) {
    console.log(`\n  To start Edge with debug port, run:`);
    console.log(`  "${browserPath}" --remote-debugging-port=9229 --user-data-dir="${path.join(process.cwd(), "edge-debug-profile")}" "https://www.icloud.com.cn/notes/"`);
  }
}

// 5. Output directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultOutputDir = path.resolve(projectRoot, "..", "导出的备忘录");
const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultOutputDir;
check("Output directory writable", (() => {
  try { fs.mkdirSync(outputDir, { recursive: true }); fs.accessSync(outputDir, fs.constants.W_OK); return true; }
  catch { return false; }
})(), outputDir);

console.log(`\n${ok ? "✅ All checks passed!" : "❌ Some checks failed — fix issues above before exporting."}`);
process.exit(ok ? 0 : 1);
