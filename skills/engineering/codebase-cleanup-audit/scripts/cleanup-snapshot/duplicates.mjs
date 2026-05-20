import { compareByPathAndLine, duplicateNameVariants, groupBy, hashFile, shortHash, warning } from "./shared.mjs";

export async function collectFileFingerprints(root, files, options) {
  const duplicateNamePaths = new Set(
    [...groupBy(files, (file) => file.name.toLowerCase()).values()]
      .filter((group) => group.length > 1)
      .flat()
      .map((file) => file.path),
  );
  const duplicateSizePaths = new Set(
    [...groupBy(files.filter((file) => file.size > 0), (file) => file.size).values()]
      .filter((group) => group.length > 1)
      .flat()
      .map((file) => file.path),
  );
  const fingerprints = [];
  let skippedLarge = 0;

  for (const file of files) {
    const shouldHash = duplicateNamePaths.has(file.path) || duplicateSizePaths.has(file.path);
    if (shouldHash && file.size > options.maxHashBytes) {
      skippedLarge += 1;
    }

    const hash = shouldHash && file.size <= options.maxHashBytes ? await hashFile(root, file.path) : "";
    fingerprints.push({ ...file, hash });
  }

  const warnings =
    skippedLarge > 0
      ? [
          warning("max-hash-bytes-skipped", `${skippedLarge} duplicate-candidate file(s) were not hashed because they exceed --max-hash-bytes.`, {
            maxHashBytes: options.maxHashBytes,
            skippedFiles: skippedLarge,
          }),
        ]
      : [];

  return { files: fingerprints, warnings };
}

export function duplicateFunctions(functions) {
  const byHash = groupBy(functions, (fn) => fn.bodyHash);

  return [...byHash.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([hash, occurrences]) => ({
      hash: shortHash(hash),
      lines: Math.max(...occurrences.map((occurrence) => occurrence.lines)),
      occurrences: occurrences
        .map(({ bodyHash, ...occurrence }) => occurrence)
        .sort(compareByPathAndLine),
    }))
    .sort((a, b) => b.occurrences.length - a.occurrences.length || b.lines - a.lines || a.hash.localeCompare(b.hash))
    .slice(0, 100);
}

export function duplicateFunctionNames(functions) {
  return duplicateNameVariants(functions, {
    differentStatus: "same-name-different-body",
    getName: (fn) => fn.name,
    getVariantHash: (fn) => fn.bodyHash,
    mapOccurrence: (fn) => ({
      path: fn.path,
      line: fn.line,
      name: fn.name,
      lines: fn.lines,
      hash: shortHash(fn.bodyHash),
    }),
  });
}

export function duplicateFileNames(files) {
  return duplicateNameVariants(files, {
    differentStatus: "same-name-different-content",
    getName: (file) => file.name.toLowerCase(),
    getVariantHash: (file) => file.hash,
    mapOccurrence: (file) => ({
      path: file.path,
      size: file.size,
      hash: file.hash ? shortHash(file.hash) : "unhashed",
    }),
  });
}

export function exactDuplicateFiles(files) {
  const bySize = groupBy(files.filter((file) => file.size > 0 && file.hash), (file) => file.size);
  const candidates = [...bySize.values()].filter((group) => group.length > 1).flat();
  const byHash = groupBy(candidates, (file) => file.hash);

  return [...byHash.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      hash: shortHash(group[0].hash),
      paths: group.map((file) => file.path).sort(),
    }))
    .sort((a, b) => b.paths.length - a.paths.length || a.hash.localeCompare(b.hash))
    .slice(0, 50);
}
