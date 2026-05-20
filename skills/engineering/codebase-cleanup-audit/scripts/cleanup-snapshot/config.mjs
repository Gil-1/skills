export const defaultOptions = {
  root: process.cwd(),
  format: "html",
  out: "",
  maxFiles: 50000,
  maxContentBytes: 256 * 1024,
  maxFunctionBytes: 256 * 1024,
  maxHashBytes: 1024 * 1024,
  minFunctionChars: 120,
  minFunctionLines: 5,
};

export const scratchDirName = ".scratch";
export const defaultHtmlReportFileName = "cleanup-snapshot.html";
export const defaultHtmlReportPathPattern = `${scratchDirName}/<datetime>-${defaultHtmlReportFileName}`;

export const ignoredDirs = new Set([
  ".git",
  ".hg",
  ".svn",
  ".scratch",
  "node_modules",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
  ".pytest_cache",
  "__pycache__",
  ".venv",
  "venv",
]);

export const textExts = new Set([
  ".c",
  ".cc",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".kt",
  ".md",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

export const functionCodeExts = new Set([
  ".c",
  ".cc",
  ".cs",
  ".go",
  ".h",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".ts",
  ".tsx",
]);

export const legacyPathPattern = /(^|[._\-/\\])(archive|bak|backup|copy|dead|deprecated|legacy|old|obsolete|tmp|unused|wip)([._\-/\\]|$)/i;
export const contentPattern = /\b(TODO|FIXME|HACK|deprecated|legacy|unused|obsolete|dead code)\b/i;
export const functionControlWords = new Set(["if", "for", "while", "switch", "catch", "with", "else", "try", "finally", "do"]);
