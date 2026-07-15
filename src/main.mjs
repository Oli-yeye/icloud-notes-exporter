/**
 * iCloud Notes Exporter — Main Entry Point
 *
 * Uses _cwStore.__CW__allNotes to get ALL notes at once (bypasses view hierarchy).
 * Groups by folder, loads content per note, writes Markdown files.
 *
 * Usage:
 *   1. Start Edge: npm run start-edge (or scripts/start.bat)
 *   2. Log in to iCloud in the browser
 *   3. Run: npm start
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CDPConnection } from "./cdp/connect.mjs";
import {
  CLICK_FOLDER_JS,
  CHECK_ARRAY_STABLE_JS,
  GRAB_STORE_JS,
  GET_ALL_NOTES_JS,
  loadNoteContentJS
} from "./cdp/store.mjs";
import { buildFilename, safeFilename } from "./utils/filename.mjs";
import { buildMarkdown, writeNote } from "./export/writer.mjs";
import { Manifest, hashText } from "./utils/manifest.mjs";
import { Progress } from "./utils/progress.mjs";

// ── Config ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_DIR = path.resolve(PROJECT_ROOT, "..", "导出的备忘录");
const OUTPUT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTPUT_DIR;
const RATE_LIMIT_THRESHOLD = 5;  // consecutive timeouts before stopping
const POLL_INTERVAL = 2000;      // ms between array stability checks
const TARGET_STABLE_READS = 3;   // target folder count must match this many reads
const TARGET_STABLE_POLLS = 60;  // max target-folder stability polls
const CONTENT_LOAD_ATTEMPTS = 3; // retry transient per-note load timeouts
const CONTENT_RETRY_BASE_DELAY = 10000;  // base delay, doubles each retry

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function readAllNotesSnapshot(cdp) {
  const allResult = await cdp.eval(GET_ALL_NOTES_JS, 30000);
  const allData = JSON.parse(allResult.result?.result?.value || "{}");
  if (allData.error) throw new Error(allData.error);
  return allData;
}

function groupSnapshot(allData) {
  const byFolder = {};
  const folderMap = {};
  for (const n of allData.notes || []) {
    const fk = n.folderRN || "Unknown";
    if (!byFolder[fk]) byFolder[fk] = [];
    byFolder[fk].push(n);
    folderMap[fk] = n.folderName || allData.folders?.[fk] || (fk === "DefaultFolder-CloudKit" ? "备忘录" : fk);
  }
  return { byFolder, folderMap, folderKeys: Object.keys(byFolder) };
}

function matchTargetFolders(folderKeys, folderMap, targetArg) {
  const target = targetArg.toLocaleLowerCase();
  return folderKeys.filter(fk => {
    const label = folderMap[fk] || "";
    return fk.toLocaleLowerCase().includes(target) || label.toLocaleLowerCase().includes(target);
  });
}

function logFolderDistribution(byFolder, folderMap) {
  console.log("\n  Folder distribution:");
  for (const [fk, notes] of Object.entries(byFolder)) {
    console.log(`    ${folderMap[fk]} (${fk}): ${notes.length} notes`);
  }
}

async function waitForTargetFolders(cdp, targetArg) {
  console.log(`\nStep 7: Waiting for target folder "${targetArg}" to stabilize...`);
  let lastSignature = "";
  let stableReads = 0;
  let lastSeen = null;

  for (let i = 0; i < TARGET_STABLE_POLLS; i++) {
    const allData = await readAllNotesSnapshot(cdp);
    const grouped = groupSnapshot(allData);
    const targetFolders = matchTargetFolders(grouped.folderKeys, grouped.folderMap, targetArg);
    const signature = targetFolders
      .map(fk => `${fk}:${(grouped.byFolder[fk] || []).length}`)
      .sort()
      .join("|");

    if (targetFolders.length > 0) {
      lastSeen = { allData, ...grouped, targetFolders };
      if (signature === lastSignature) stableReads++;
      else stableReads = 1;

      const labels = targetFolders
        .map(fk => `${grouped.folderMap[fk]}=${(grouped.byFolder[fk] || []).length}`)
        .join(", ");
      console.log(`  [${(i + 1) * 2}s] ${labels} (stable ${stableReads}/${TARGET_STABLE_READS}; trash ignored)`);

      if (stableReads >= TARGET_STABLE_READS) return lastSeen;
    } else {
      const available = grouped.folderKeys.map(fk => `${grouped.folderMap[fk]} (${fk})`).join(", ");
      console.log(`  [${(i + 1) * 2}s] target not visible yet. Available: ${available || "none"}`);
      stableReads = 0;
    }

    lastSignature = signature;
    await sleep(POLL_INTERVAL);
  }

  if (lastSeen) return lastSeen;
  throw new Error(`Folder "${targetArg}" not found after waiting`);
}

async function waitForExportableSnapshot(cdp) {
  console.log("\nStep 7: Waiting for exportable folders to stabilize (trash ignored)...");
  let lastSignature = "";
  let stableReads = 0;
  let lastSeen = null;

  for (let i = 0; i < TARGET_STABLE_POLLS; i++) {
    const allData = await readAllNotesSnapshot(cdp);
    const grouped = groupSnapshot(allData);
    const signature = grouped.folderKeys
      .map(fk => `${fk}:${(grouped.byFolder[fk] || []).length}`)
      .sort()
      .join("|");
    lastSeen = { allData, ...grouped, targetFolders: grouped.folderKeys };
    stableReads = signature === lastSignature ? stableReads + 1 : 1;
    console.log(`  [${(i + 1) * 2}s] exportable=${allData.notes.length} folders=${grouped.folderKeys.length} (stable ${stableReads}/${TARGET_STABLE_READS}; trash ignored)`);
    if (stableReads >= TARGET_STABLE_READS) return lastSeen;
    lastSignature = signature;
    await sleep(POLL_INTERVAL);
  }

  return lastSeen;
}

async function loadNoteWithRetries(cdp, note, noteLabel) {
  let lastError = null;
  for (let attempt = 1; attempt <= CONTENT_LOAD_ATTEMPTS; attempt++) {
    try {
      const r = await cdp.evalAsync(loadNoteContentJS(note.i), 50000);
      const data = JSON.parse(r.result?.result?.value || "{}");
      if (!data.error) return data;
      lastError = new Error(data.error);
      lastError.data = data;
      if (!data.error.includes("timeout") || attempt === CONTENT_LOAD_ATTEMPTS) {
        return data;
      }
    } catch (e) {
      lastError = e;
      if (!e.message.includes("timeout") || attempt === CONTENT_LOAD_ATTEMPTS) {
        throw e;
      }
    }

    const delay = CONTENT_RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
    console.log(`    retry ${attempt}/${CONTENT_LOAD_ATTEMPTS - 1} for "${noteLabel}" after timeout (wait ${delay / 1000}s)`);
    await sleep(delay);
  }
  if (lastError?.data) return lastError.data;
  throw lastError || new Error("unknown load failure");
}

async function main() {
  console.log("=== iCloud Notes Exporter (allNotes engine) ===\n");
  console.log(`Output: ${OUTPUT_DIR}\n`);

  // ── Step 1: Connect to Edge ──
  console.log("Step 1: Connecting to Edge...");
  const cdp = new CDPConnection();
  try {
    await cdp.connect();
    console.log("  Connected to Edge CDP");
  } catch (e) {
    console.log(`❌ ${e.message}`);
    console.log('  Run "npm run start-edge" or scripts/start.bat first.');
    process.exit(1);
  }

  // ── Step 2: Find Notes iframe ──
  console.log("\nStep 2: Finding Notes iframe...");
  try {
    await cdp.findNotesContext();
  } catch (e) {
    console.log(`❌ ${e.message}`);
    cdp.close();
    process.exit(1);
  }

  // ── Step 3: Seed the store from any visible note list ──
  console.log("\nStep 3: Loading a seed note list to expose _cwStore...");
  const clickResult = await cdp.eval(CLICK_FOLDER_JS);
  const clickVal = clickResult.result?.result?.value || "unknown";
  if (clickVal === "NOT_FOUND") {
    console.log("  Default seed folder not in DOM; data may already be loading via auto-route");
  } else {
    console.log("  " + clickVal);
  }

  // ── Step 4/5: Grab the store reference from any loaded note ──
  console.log("\nStep 4: Waiting for any note object to expose _cwStore...");
  let viewCount = 0;
  let storeInfo = {};
  for (let i = 0; i < 90; i++) {
    await sleep(POLL_INTERVAL);
    try {
      const r = await cdp.eval(CHECK_ARRAY_STABLE_JS, 30000);
      const count = r.result?.result?.value || 0;
      if (count > 0) viewCount = count;
    } catch (e) { /* retry */ }

    try {
      const storeResult = await cdp.eval(GRAB_STORE_JS);
      storeInfo = JSON.parse(storeResult.result?.result?.value || "{}");
    } catch (e) {
      storeInfo = { error: e.message };
    }

    if (!storeInfo.error) break;
    if (i % 5 === 0) {
      const countLabel = viewCount ? `${viewCount} visible notes` : "no visible note list yet";
      console.log(`  [${(i + 1) * 2}s] ${countLabel}; store not ready: ${storeInfo.error}`);
    }
  }

  if (storeInfo.error) {
    console.log(`❌ ${storeInfo.error}`);
    cdp.close();
    process.exit(1);
  }
  console.log(`  Store ready from seed list (${viewCount || "unknown"} visible notes).`);
  console.log(`  __CW__allNotes: ${storeInfo.allNotesCount} notes`);
  console.log(`  __CW__allFolders: ${storeInfo.allFoldersCount} folders`);
  // ── Step 6: Get all notes grouped by folder ──
  console.log("\nStep 6: Reading initial notes snapshot...");
  let allData;
  try {
    allData = await readAllNotesSnapshot(cdp);
  } catch (e) {
    console.log(`❌ ${e.message}`);
    cdp.close();
    process.exit(1);
  }
  console.log(`  Total currently visible in store: ${allData.total} notes (${allData.trashCount} in trash, ignored)`);
  console.log(`  Exportable currently visible: ${allData.notes.length} notes`);

  let { byFolder, folderMap, folderKeys } = groupSnapshot(allData);
  logFolderDistribution(byFolder, folderMap);

  let targetFolders = folderKeys;
  if (process.argv[3]) {
    try {
      const stable = await waitForTargetFolders(cdp, process.argv[3]);
      allData = stable.allData;
      byFolder = stable.byFolder;
      folderMap = stable.folderMap;
      folderKeys = stable.folderKeys;
      targetFolders = stable.targetFolders;
    } catch (e) {
      console.log(`\n❌ ${e.message}`);
      cdp.close();
      process.exit(1);
    }
    console.log(`\n  Targeting folder: ${targetFolders.map(fk => `${folderMap[fk]} (${fk})`).join(", ")}`);
  } else {
    const stable = await waitForExportableSnapshot(cdp);
    allData = stable.allData;
    byFolder = stable.byFolder;
    folderMap = stable.folderMap;
    folderKeys = stable.folderKeys;
    targetFolders = stable.targetFolders;
  }
  // ── Step 8: Export notes ──
  console.log("\nStep 8: Exporting...\n");
  let totalExported = 0;
  let totalSkipped = 0;
  let consecutiveTimeouts = 0;

  for (const folderRN of targetFolders) {
    const notes = byFolder[folderRN];
    const folderName = folderMap[folderRN] || (folderRN === "DefaultFolder-CloudKit" ? "备忘录" : folderRN);
    const outputFolder = path.join(OUTPUT_DIR, safeFilename(folderName, folderRN, 80));
    const progress = new Progress(outputFolder);
    progress.total = notes.length;
    const manifest = new Manifest(outputFolder, {
      folderName,
      folderRecordName: folderRN,
      expected: notes.length,
      source: {
        totalNotes: allData.total,
        exportableNotes: allData.notes.length,
        trashCount: allData.trashCount
      }
    });
    manifest.setExpected(notes.map((note, index) => ({
      recordName: note.rn,
      index,
      sourceIndex: note.i,
      title: note.title,
      folderRecordName: folderRN,
      locked: note.locked,
      pinned: note.pinned
    })));

    console.log(`\n── ${folderName} (${notes.length} notes) ──`);
    console.log(`  Output: ${outputFolder}`);
    console.log(`  Already exported: ${progress.count}`);

    let folderExported = 0;
    for (let ni = 0; ni < notes.length; ni++) {
      const note = notes[ni];

      // Skip already exported
      if (progress.isDone(note.rn)) {
        manifest.recordSkipped({
          recordName: note.rn,
          index: ni,
          sourceIndex: note.i,
          title: note.title,
          folderRecordName: folderRN,
          locked: note.locked,
          pinned: note.pinned
        });
        totalSkipped++;
        continue;
      }

      // Rate limit check
      if (consecutiveTimeouts >= RATE_LIMIT_THRESHOLD) {
        console.log(`\n⚠️ Rate limit detected (${consecutiveTimeouts} consecutive timeouts). Stopping.`);
        console.log("  Wait 6+ hours, then re-run to resume.");
        cdp.close();
        process.exit(0);
      }

      // Load content
      try {
        const data = await loadNoteWithRetries(cdp, note, note.title);

        if (data.error) {
          console.log(`  ⚠️ [${ni + 1}/${notes.length}] "${note.title}" — ${data.error}`);
          manifest.recordFailure({
            recordName: note.rn,
            index: ni,
            sourceIndex: note.i,
            title: data.title || note.title,
            folderRecordName: folderRN,
            locked: note.locked || data.locked,
            pinned: note.pinned,
            error: data.error
          });
          if (data.error.includes("timeout")) {
            consecutiveTimeouts++;
          }
          continue;
        } else {
          consecutiveTimeouts = 0;
        }

        // Build and write file
        const filename = buildFilename(ni, data.title || note.title, {
          locked: note.locked,
          pinned: note.pinned
        });
        const md = buildMarkdown({
          title: data.title || note.title,
          content: data.content || "",
          created: data.created,
          locked: note.locked,
          pinned: note.pinned
        });
        const written = writeNote(outputFolder, filename, md);
        manifest.recordExport({
          recordName: note.rn,
          index: ni,
          sourceIndex: note.i,
          title: data.title || note.title,
          folderRecordName: folderRN,
          filename: written.filename,
          created: data.created,
          locked: note.locked,
          pinned: note.pinned,
          contentLength: data.cl || 0,
          sha256: hashText(data.content || ""),
          empty: !data.content || data.content.length === 0
        });

        progress.markDone(note.rn);
        folderExported++;
        totalExported++;

        const sizeStr = data.cl ? `${data.cl}c` : (note.locked ? "LOCKED" : "EMPTY");
        const reusedStr = written.reusedExisting ? ", existing identical file reused" : "";
        process.stdout.write(`  ✅ [${ni + 1}/${notes.length}] ${written.filename} (${sizeStr}${reusedStr})\n`);

      } catch (e) {
        if (e.message.includes("timeout")) {
          consecutiveTimeouts++;
          console.log(`  ⏱️ Timeout loading note #${note.i} (${consecutiveTimeouts}/${RATE_LIMIT_THRESHOLD})`);
        } else {
          console.log(`  ❌ Error: ${e.message}`);
        }
        manifest.recordFailure({
          recordName: note.rn,
          index: ni,
          sourceIndex: note.i,
          title: note.title,
          folderRecordName: folderRN,
          locked: note.locked,
          pinned: note.pinned,
          error: e.message
        });
      }
    }

    console.log(`  ${folderName}: ${folderExported} exported, ${progress.count} total done`);
  }

  // ── Summary ──
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Done! ${totalExported} newly exported, ${totalSkipped} skipped (already done)`);
  console.log(`Output: ${OUTPUT_DIR}`);

  cdp.close();
  process.exit(0);
}

main().catch(e => {
  console.error(`\n❌ Fatal error: ${e.message}`);
  process.exit(1);
});
