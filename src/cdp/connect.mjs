/**
 * CDP Connection — connects to Edge via remote debugging port
 * Handles WebSocket lifecycle, message routing, and execution context tracking.
 */
import WebSocket from "ws";

const DEFAULT_PORT = 9229;
const DEFAULT_TIMEOUT = 15000;

export class CDPConnection {
  constructor(port = DEFAULT_PORT) {
    this.port = port;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
    this.contexts = [];           // Runtime execution contexts
    this.notesCtx = null;         // Notes iframe context
  }

  /** Connect to Edge and enable Runtime domain */
  async connect() {
    const pages = await this._listPages();
    const page = pages.find(p => p.type === "page" && p.url.includes("icloud.com"));
    if (!page) throw new Error("No iCloud Notes page found. Is Edge running with --remote-debugging-port?");

    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    this.ws.on("message", (data) => this._onMessage(data));
    await new Promise(r => this.ws.on("open", r));

    await this.send("Runtime.enable");
    return page;
  }

  /** Send a CDP command and wait for response */
  send(method, params = {}, timeout = DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve: (msg) => { clearTimeout(timer); resolve(msg); }, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Find the Notes iframe execution context */
  async findNotesContext(maxWait = 60000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await this._sleep(2000);
      const ctx = this.contexts.find(c => c.origin?.includes("icloud.com.cn") && c.id !== 1);
      if (!ctx) continue;

      try {
        const r = await this.send("Runtime.evaluate", {
          expression: `JSON.stringify({has: typeof NotesApp !== 'undefined', folders: [...document.querySelectorAll('.folder-title')].map(e=>e.textContent?.trim()).filter(Boolean)})`,
          returnByValue: true, contextId: ctx.id
        }, 5000);
        const info = JSON.parse(r.result?.result?.value || "{}");
        if (info.has) {
          this.notesCtx = ctx;
          if (info.folders?.length >= 1) {
            console.log(`  Notes iframe ready — folders: ${info.folders.join(", ")}`);
          } else {
            console.log("  Notes iframe ready (folders not in DOM — single-note URL, OK for store access)");
          }
          await this._sleep(3000);
          return ctx;
        }
      } catch (e) { /* context not ready yet */ }
    }
    throw new Error("Notes iframe context not found within timeout");
  }

  /** Evaluate JavaScript in the Notes iframe context */
  async eval(expr, timeout = DEFAULT_TIMEOUT) {
    if (!this.notesCtx) throw new Error("No Notes context. Call findNotesContext() first.");
    return this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      contextId: this.notesCtx.id
    }, timeout);
  }

  /** Evaluate async JavaScript (with awaitPromise) */
  async evalAsync(expr, timeout = 25000) {
    if (!this.notesCtx) throw new Error("No Notes context. Call findNotesContext() first.");
    return this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
      contextId: this.notesCtx.id
    }, timeout);
  }

  /** Close the connection */
  close() {
    if (this.ws) this.ws.close();
  }

  // ── Private ──

  async _listPages() {
    const resp = await fetch(`http://127.0.0.1:${this.port}/json/list`);
    return resp.json();
  }

  _onMessage(data) {
    const msg = JSON.parse(data);
    if (msg.method === "Runtime.executionContextCreated") {
      this.contexts.push(msg.params.context);
    }
    if (msg.method === "Runtime.executionContextDestroyed") {
      const idx = this.contexts.findIndex(c => c.id === msg.params.executionContextId);
      if (idx >= 0) this.contexts.splice(idx, 1);
    }
    if (msg.id && this.pending.has(msg.id)) {
      this.pending.get(msg.id).resolve(msg);
      this.pending.delete(msg.id);
    }
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}
