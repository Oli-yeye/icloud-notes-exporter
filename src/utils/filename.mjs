/**
 * Filename utilities — sanitize titles into Windows-safe filenames.
 * Strips invisible Unicode formatting characters that cause ENOENT errors.
 */

/** Characters that are invisible but cause filesystem issues on Windows */
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD\u034F\u180E]/g;

/** Characters illegal in Windows filenames */
const ILLEGAL_CHARS = /[<>:"/\\|?*\n\r\t\x00-\x1F]/g;

/**
 * Convert a note title into a safe filename.
 * @param {string} title - The note title
 * @param {string} fallback - Fallback if title is empty (e.g., recordName)
 * @param {number} maxLen - Max filename length (default 60)
 * @returns {string} Safe filename
 */
export function safeFilename(title, fallback = "note", maxLen = 60) {
  let name = (title || fallback)
    .replace(INVISIBLE_CHARS, "")
    .replace(ILLEGAL_CHARS, "_")
    .replace(/\s+/g, " ")
    .substring(0, maxLen)
    .trim();
  return name || fallback;
}

/**
 * Build a full export filename with sequence number and tags.
 * @param {number} index - 0-based index (for sequence number)
 * @param {string} title - Note title
 * @param {object} opts - { locked: bool, pinned: bool, formerLocked: bool }
 * @returns {string} e.g., "0001_[置顶]_我的笔记.md"
 */
export function buildFilename(index, title, opts = {}) {
  const seq = String(index + 1).padStart(4, "0");
  let tags = "";
  if (opts.formerLocked) tags += "[原锁定]";
  else if (opts.locked) tags += "[锁定]";
  if (opts.pinned) tags += "[置顶]";
  if (tags) tags = "_" + tags;
  const safe = safeFilename(title);
  return `${seq}${tags}_${safe}.md`;
}
