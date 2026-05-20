import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

export function shortHash(hash) {
  return hash.slice(0, 12);
}

export async function hashFile(root, filePath) {
  const buffer = await fs.readFile(path.join(root, filePath));
  return createHash("sha256").update(buffer).digest("hex");
}

export function compareByPathAndLine(a, b) {
  return a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0);
}

export function warning(code, message, detail = {}) {
  return { code, message, detail };
}

export function duplicateNameVariants(items, options) {
  const {
    differentStatus,
    getName,
    getVariantHash,
    mapOccurrence,
    sortOccurrences = compareByPathAndLine,
  } = options;

  return [...groupBy(items, getName).entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([name, occurrences]) => {
      const hashableOccurrences = occurrences.filter((occurrence) => getVariantHash(occurrence));
      const byVariant = groupBy(hashableOccurrences, getVariantHash);
      const variants = [...byVariant.entries()]
        .map(([hash, variantOccurrences]) => ({
          hash: shortHash(hash),
          count: variantOccurrences.length,
        }))
        .sort((a, b) => b.count - a.count || a.hash.localeCompare(b.hash));

      const status =
        hashableOccurrences.length !== occurrences.length
          ? hashableOccurrences.length === 0
            ? "unhashed"
            : "partially-unhashed"
          : variants.length === 1
            ? "full-duplicate"
            : variants.some((variant) => variant.count > 1)
              ? "mixed"
              : differentStatus;

      return {
        name,
        status,
        variants: variants.length,
        hashes: variants,
        occurrences: occurrences.map(mapOccurrence).sort(sortOccurrences),
      };
    })
    .sort((a, b) => {
      const statusOrder = {
        "same-name-different-content": 0,
        "same-name-different-body": 0,
        mixed: 1,
        "partially-unhashed": 2,
        unhashed: 3,
        "full-duplicate": 4,
      };
      return (
        statusOrder[a.status] - statusOrder[b.status] ||
        b.occurrences.length - a.occurrences.length ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 100);
}
