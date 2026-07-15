/**
 * Progress tracking — supports resume via recordName-based progress files.
 * Compatible with both old format (exportedRecordNames) and new format (exported).
 */
import fs from "fs";
import path from "path";

const PROGRESS_FILE = "_export_progress.json";

export class Progress {
  constructor(outputDir) {
    this.dir = outputDir;
    this.file = path.join(outputDir, PROGRESS_FILE);
    this.exported = new Set();
    this.total = 0;
    this._load();
  }

  /** Check if a recordName has already been exported */
  isDone(recordName) {
    return this.exported.has(recordName);
  }

  /** Mark a recordName as exported and persist */
  markDone(recordName) {
    this.exported.add(recordName);
    this._save();
  }

  /** Get count of exported notes */
  get count() {
    return this.exported.size;
  }

  // ── Private ──

  _load() {
    if (!fs.existsSync(this.file)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf-8"));
      // Support old format (exportedRecordNames) and new format (exported)
      const list = raw.exported || raw.exportedRecordNames || [];
      for (const rn of list) this.exported.add(rn);
      this.total = raw.total || this.exported.size;
      console.log(`  Progress: ${this.exported.size} already exported`);
    } catch (e) {
      console.log(`  Warning: could not read progress file: ${e.message}`);
    }
  }

  _save() {
    const data = {
      exported: [...this.exported],
      total: this.total,
      ts: new Date().toISOString()
    };
    fs.writeFileSync(this.file, JSON.stringify(data), "utf-8");
  }
}
