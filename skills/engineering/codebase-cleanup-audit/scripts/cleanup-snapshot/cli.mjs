import path from "node:path";
import { defaultHtmlReportFileName, defaultHtmlReportPathPattern, defaultOptions, scratchDirName } from "./config.mjs";

function datetimeForFileName(isoString) {
  return isoString.replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function hasDatetimePrefix(fileName) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-/.test(fileName);
}

function isInsideScratch(filePath) {
  return path
    .resolve(filePath)
    .split(path.sep)
    .some((part) => part.toLowerCase() === scratchDirName);
}

function timestampHtmlReportPath(filePath, generatedAt) {
  if (path.extname(filePath).toLowerCase() !== ".html" || !isInsideScratch(filePath)) return filePath;

  const fileName = path.basename(filePath);
  if (hasDatetimePrefix(fileName)) return filePath;

  return path.join(path.dirname(filePath), `${datetimeForFileName(generatedAt)}-${fileName}`);
}

export function parseArgs(argv) {
  const options = { ...defaultOptions };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") options.root = argv[++i];
    else if (arg === "--format") options.format = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--max-files") options.maxFiles = Number(argv[++i]);
    else if (arg === "--max-content-bytes") options.maxContentBytes = Number(argv[++i]);
    else if (arg === "--max-function-bytes") options.maxFunctionBytes = Number(argv[++i]);
    else if (arg === "--max-hash-bytes") options.maxHashBytes = Number(argv[++i]);
    else if (arg === "--min-function-chars") options.minFunctionChars = Number(argv[++i]);
    else if (arg === "--min-function-lines") options.minFunctionLines = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!["html", "json", "markdown"].includes(options.format)) {
    throw new Error("--format must be html, json, or markdown");
  }

  options.root = path.resolve(options.root);
  options.generatedAt = new Date().toISOString();
  if (!options.out && options.format === "html") {
    options.out = path.join(options.root, scratchDirName, defaultHtmlReportFileName);
  }
  if (options.out && options.out !== "-" && options.format === "html") {
    options.out = timestampHtmlReportPath(options.out, options.generatedAt);
  }

  return options;
}

export function usage() {
  return [
    "Usage: node cleanup-snapshot.mjs --root /repo-or-subdir [--format html|json|markdown] [--out file|-]",
    "",
    `Default HTML report path: ${defaultHtmlReportPathPattern}`,
    "Pass any package, app, docs, tests, or feature directory to --root for a scoped scan.",
    "",
    "Options:",
    "  --max-files N",
    "  --max-content-bytes N",
    "  --max-function-bytes N",
    "  --max-hash-bytes N",
    "  --min-function-chars N",
    "  --min-function-lines N",
  ].join("\n");
}
