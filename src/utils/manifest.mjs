/**
 * Manifest tracking — records expected, exported, skipped, and failed notes.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

const MANIFEST_FILE = "_manifest.json";

export function hashText(text) {
  return crypto.createHash("sha256").update(text || "", "utf8").digest("hex");
}

export class Manifest {
  constructor(outputDir, info = {}) {
    this.dir = outputDir;
    this.file = path.join(outputDir, MANIFEST_FILE);
    this.data = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      folderName: info.folderName || "",
      folderRecordName: info.folderRecordName || "",
      expected: info.expected || 0,
      source: info.source || {},
      summary: {},
      entries: []
    };
    this._load();
  }

  setExpected(notes) {
    this.data.expected = notes.length;
    for (const note of notes) {
      const existing = this._find(note.recordName);
      if (existing) continue;
      this.data.entries.push({
        recordName: note.recordName,
        index: note.index,
        sourceIndex: note.sourceIndex,
        title: note.title || "",
        folderRecordName: note.folderRecordName || this.data.folderRecordName,
        locked: !!note.locked,
        pinned: !!note.pinned,
        status: "pending"
      });
    }
    this.save();
  }

  recordSkipped(note, reason = "already_done") {
    this._upsert(note.recordName, {
      recordName: note.recordName,
      index: note.index,
      sourceIndex: note.sourceIndex,
      title: note.title || "",
      folderRecordName: note.folderRecordName || this.data.folderRecordName,
      locked: !!note.locked,
      pinned: !!note.pinned,
      status: "skipped",
      reason,
      updatedAt: new Date().toISOString()
    }, { preserveExported: true });
    this.save();
  }

  recordExport(note) {
    this._upsert(note.recordName, {
      recordName: note.recordName,
      index: note.index,
      sourceIndex: note.sourceIndex,
      title: note.title || "",
      folderRecordName: note.folderRecordName || this.data.folderRecordName,
      filename: note.filename,
      created: note.created || null,
      locked: !!note.locked,
      pinned: !!note.pinned,
      status: note.empty ? "empty" : "exported",
      contentLength: note.contentLength || 0,
      sha256: note.sha256 || "",
      updatedAt: new Date().toISOString()
    });
    this.save();
  }

  recordFailure(note) {
    this._upsert(note.recordName, {
      recordName: note.recordName,
      index: note.index,
      sourceIndex: note.sourceIndex,
      title: note.title || "",
      folderRecordName: note.folderRecordName || this.data.folderRecordName,
      locked: !!note.locked,
      pinned: !!note.pinned,
      status: "failed",
      error: note.error || "unknown error",
      updatedAt: new Date().toISOString()
    });
    this.save();
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    this.data.updatedAt = new Date().toISOString();
    this.data.summary = this._summary();
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }

  _summary() {
    const counts = {
      expected: this.data.expected,
      totalEntries: this.data.entries.length,
      exported: 0,
      empty: 0,
      skipped: 0,
      failed: 0,
      pending: 0,
      locked: 0
    };
    for (const entry of this.data.entries) {
      if (entry.locked) counts.locked++;
      if (entry.status === "exported") counts.exported++;
      else if (entry.status === "empty") counts.empty++;
      else if (entry.status === "skipped") counts.skipped++;
      else if (entry.status === "failed") counts.failed++;
      else counts.pending++;
    }
    return counts;
  }

  _load() {
    if (!fs.existsSync(this.file)) return;
    try {
      const existing = JSON.parse(fs.readFileSync(this.file, "utf8"));
      this.data = {
        ...this.data,
        ...existing,
        entries: Array.isArray(existing.entries) ? existing.entries : []
      };
    } catch (e) {
      this.data.entries.push({
        recordName: "__manifest_read_error__",
        title: "Manifest read error",
        status: "failed",
        error: e.message
      });
    }
  }

  _find(recordName) {
    return this.data.entries.find(entry => entry.recordName === recordName);
  }

  _upsert(recordName, patch, opts = {}) {
    const existing = this._find(recordName);
    if (!existing) {
      this.data.entries.push(patch);
      return;
    }
    if (opts.preserveExported && ["exported", "empty"].includes(existing.status)) {
      return;
    }
    Object.assign(existing, patch);
    if (["exported", "empty"].includes(existing.status)) {
      delete existing.error;
      delete existing.reason;
    }
  }
}
