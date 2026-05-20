import { duplicateFileNames, duplicateFunctionNames, duplicateFunctions, exactDuplicateFiles, collectFileFingerprints } from "./duplicates.mjs";
import { collectFunctions } from "./function-scanner.mjs";
import { scanContentSignals, summarizeExtensions, walk } from "./inventory.mjs";
import { legacyPathPattern } from "./config.mjs";

export async function buildSnapshot(options) {
  const warnings = [];
  const { files, dirs, warnings: walkWarnings } = await walk(options.root, options);
  warnings.push(...walkWarnings);

  const { files: fileFingerprints, warnings: hashWarnings } = await collectFileFingerprints(options.root, files, options);
  warnings.push(...hashWarnings);

  const { functions, warnings: functionWarnings } = await collectFunctions(options.root, files, options);
  warnings.push(...functionWarnings);

  const { hits: contentSignals, warnings: contentWarnings } = await scanContentSignals(options.root, files, options);
  warnings.push(...contentWarnings);

  return {
    root: options.root,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    limits: {
      maxFiles: options.maxFiles,
      maxContentBytes: options.maxContentBytes,
      maxFunctionBytes: options.maxFunctionBytes,
      maxHashBytes: options.maxHashBytes,
      minFunctionChars: options.minFunctionChars,
      minFunctionLines: options.minFunctionLines,
    },
    warnings,
    fileCount: files.length,
    dirCount: dirs.length,
    extensions: summarizeExtensions(files),
    legacyPathSignals: files.map((file) => file.path).filter((filePath) => legacyPathPattern.test(filePath)).sort(),
    duplicateFileNames: duplicateFileNames(fileFingerprints),
    exactDuplicateFiles: exactDuplicateFiles(fileFingerprints),
    duplicateFunctions: duplicateFunctions(functions),
    duplicateFunctionNames: duplicateFunctionNames(functions),
    contentSignals,
    largestFiles: [...files].sort((a, b) => b.size - a.size).slice(0, 25),
  };
}
