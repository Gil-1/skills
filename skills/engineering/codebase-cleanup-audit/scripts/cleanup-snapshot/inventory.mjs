import fs from "node:fs/promises";
import path from "node:path";
import { contentPattern, ignoredDirs, textExts } from "./config.mjs";
import { groupBy, warning } from "./shared.mjs";

export async function walk(root, options) {
  const files = [];
  const dirs = [];
  let maxFilesReached = false;

  async function visit(dir) {
    if (files.length >= options.maxFiles) {
      maxFilesReached = true;
      return;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= options.maxFiles) {
        maxFilesReached = true;
        return;
      }

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath).replaceAll(path.sep, "/");

      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        dirs.push(relPath);
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const stat = await fs.stat(fullPath);
      files.push({
        path: relPath,
        name: entry.name,
        ext: path.extname(entry.name).toLowerCase() || "[none]",
        size: stat.size,
      });
    }
  }

  await visit(root);
  const warnings = maxFilesReached
    ? [
        warning("max-files-reached", `File scan stopped at --max-files=${options.maxFiles}. Results are truncated.`, {
          maxFiles: options.maxFiles,
          scannedFiles: files.length,
        }),
      ]
    : [];

  return { files, dirs, warnings };
}

export async function scanContentSignals(root, files, options) {
  const hits = [];
  let skippedLarge = 0;
  let hitLimitReached = false;

  for (const file of files) {
    if (!textExts.has(file.ext)) continue;
    if (file.size > options.maxContentBytes) {
      skippedLarge += 1;
      continue;
    }

    const content = await fs.readFile(path.join(root, file.path), "utf8").catch(() => "");
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (contentPattern.test(lines[i])) {
        hits.push({ path: file.path, line: i + 1, text: lines[i].trim().slice(0, 160) });
        break;
      }
    }

    if (hits.length >= 100) {
      hitLimitReached = true;
      break;
    }
  }

  const warnings = [];
  if (skippedLarge > 0) {
    warnings.push(
      warning("max-content-bytes-skipped", `${skippedLarge} text file(s) were skipped by content-signal scan because they exceed --max-content-bytes.`, {
        maxContentBytes: options.maxContentBytes,
        skippedFiles: skippedLarge,
      }),
    );
  }
  if (hitLimitReached) {
    warnings.push(warning("content-signal-hit-limit", "Content-signal scan stopped after 100 hits.", { maxHits: 100 }));
  }

  return { hits, warnings };
}

export function summarizeExtensions(files) {
  return [...groupBy(files, (file) => file.ext).entries()]
    .map(([ext, group]) => ({
      ext,
      count: group.length,
      bytes: group.reduce((total, file) => total + file.size, 0),
    }))
    .sort((a, b) => b.count - a.count || a.ext.localeCompare(b.ext));
}
