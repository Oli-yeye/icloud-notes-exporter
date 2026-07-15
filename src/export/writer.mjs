/**
 * Markdown Writer — converts note data into Markdown and writes to disk.
 */
import fs from "fs";
import path from "path";

/**
 * Build Markdown content from note data.
 * @param {object} note - { title, content, created, locked, pinned, formerLocked }
 * @returns {string} Markdown text
 */
export function buildMarkdown(note) {
  const tags = [];
  if (note.formerLocked) tags.push("原锁定");
  else if (note.locked) tags.push("锁定");
  if (note.pinned) tags.push("置顶");

  const tagPrefix = tags.length > 0 ? "[" + tags.join("][") + "] " : "";
  let md = `# ${tagPrefix}${note.title}\n\n`;
  if (note.created) md += `> 创建: ${note.created}\n\n`;

  if (note.locked && !note.content) {
    md += `> ⚠️ 此备忘录已锁定，内容无法导出。请在 iPhone 上解锁后重新导出。\n\n`;
  } else if (!note.content || note.content.length === 0) {
    md += `> ⚠️ 内容为空。\n\n`;
  } else {
    md += note.content;
  }

  return md;
}

/**
 * Write a note to a Markdown file.
 * @param {string} dir - Output directory
 * @param {string} filename - Safe filename (from buildFilename)
 * @param {string} markdown - Markdown content
 * @returns {object} { filepath, filename, reusedExisting }
 */
export function writeNote(dir, filename, markdown) {
  fs.mkdirSync(dir, { recursive: true });
  const { filepath, actualFilename, reusedExisting } = chooseSafePath(dir, filename, markdown);
  if (!reusedExisting) {
    const tmp = filepath + ".tmp";
    fs.writeFileSync(tmp, markdown, "utf-8");
    fs.renameSync(tmp, filepath);
  }
  return { filepath, filename: actualFilename, reusedExisting };
}

function chooseSafePath(dir, filename, markdown) {
  const parsed = path.parse(filename);
  for (let i = 0; i < 1000; i++) {
    const actualFilename = i === 0
      ? filename
      : `${parsed.name} (${i + 1})${parsed.ext}`;
    const filepath = path.join(dir, actualFilename);
    if (!fs.existsSync(filepath)) {
      return { filepath, actualFilename, reusedExisting: false };
    }
    const existing = fs.readFileSync(filepath, "utf-8");
    if (existing === markdown) {
      return { filepath, actualFilename, reusedExisting: true };
    }
  }
  throw new Error(`Could not find a safe filename for ${filename}`);
}
