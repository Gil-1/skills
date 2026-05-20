import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { functionCodeExts, functionControlWords } from "./config.mjs";
import { warning } from "./shared.mjs";

function createLineIndex(content) {
  const lineBreaks = [];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") lineBreaks.push(i);
  }
  return lineBreaks;
}

function lineNumberAt(lineBreaks, index) {
  let low = 0;
  let high = lineBreaks.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (lineBreaks[mid] < index) low = mid + 1;
    else high = mid;
  }
  return low + 1;
}

function indentWidth(line) {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  return indent.replaceAll("\t", "    ").length;
}

function countParens(line) {
  let total = 0;
  for (const char of line) {
    if (char === "(") total += 1;
    else if (char === ")") total -= 1;
  }
  return total;
}

function countMeaningfulLines(source) {
  return source.split(/\r?\n/).filter((line) => line.trim()).length;
}

function isIdentifierChar(char) {
  return Boolean(char) && /[A-Za-z0-9_$]/.test(char);
}

function collapseCodeWhitespace(source) {
  let output = "";
  let previous = "";
  let pendingSpace = false;

  for (const char of source) {
    if (/\s/.test(char)) {
      pendingSpace = true;
      continue;
    }

    if (pendingSpace && isIdentifierChar(previous) && isIdentifierChar(char)) output += " ";
    output += char;
    previous = char;
    pendingSpace = false;
  }

  return output.trim();
}

function stripBraceComments(source) {
  let output = "";
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (char === "\n") {
        output += char;
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      output += char;
      continue;
    }

    output += char;
  }

  return output;
}

function stripPythonComments(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

function normalizeFunctionBody(body, ext) {
  const withoutComments = ext === ".py" ? stripPythonComments(body) : stripBraceComments(body);
  return collapseCodeWhitespace(withoutComments);
}

function getBracePrelude(content, openIndex) {
  const fragment = content.slice(Math.max(0, openIndex - 800), openIndex);
  let boundary = -1;
  for (let i = fragment.length - 1; i >= 0; i -= 1) {
    if (fragment[i] === ";" || fragment[i] === "{" || fragment[i] === "}") {
      boundary = i;
      break;
    }
  }

  return fragment
    .slice(boundary + 1)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function nameFromBracePrelude(prelude) {
  const signature = prelude.replace(/\s+/g, " ").trim();
  if (!signature || signature.length > 500) return "";
  if (/^(if|for|while|switch|catch|with|else|try|finally|do)\b/.test(signature)) return "";
  if (/\b(class|interface|enum|struct|namespace|module)\s+[A-Za-z_$]/.test(signature) && !/\b(function|func|fn)\b/.test(signature)) {
    return "";
  }

  let match = signature.match(/\bfunction\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (match) return match[1];

  match = signature.match(/\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/);
  if (match) return match[1];

  match = signature.match(/\bfn\s+([A-Za-z_]\w*)\s*\(/);
  if (match) return match[1];

  if (/=>\s*$/.test(signature)) {
    match = signature.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (match) return match[1];

    match = signature.match(/(?:^|[,{]\s*)([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?.*=>\s*$/);
    if (match) return match[1];

    match = signature.match(/\b([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?.*=>\s*$/);
    if (match) return match[1];

    return "";
  }

  match = signature.match(/([A-Za-z_$#][\w$#]*)\s*(?:<[^>{}]+>)?\s*\([^()]*\)\s*(?::\s*[^=]+)?(?:\s+throws\s+[\w.,\s]+)?(?:\s+where\s+.+)?$/);
  if (!match) return "";

  const name = match[1].replace(/^#/, "");
  return functionControlWords.has(name) ? "" : match[1];
}

function findMatchingBrace(content, openIndex) {
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let depth = 0;

  for (let i = openIndex; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function extractBraceFunctions(file, content) {
  const lineBreaks = createLineIndex(content);
  const functions = [];
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char !== "{") continue;

    const prelude = getBracePrelude(content, i);
    const name = nameFromBracePrelude(prelude);
    if (!name) continue;

    const closeIndex = findMatchingBrace(content, i);
    if (closeIndex === -1) continue;

    const body = content.slice(i + 1, closeIndex);
    functions.push({
      path: file.path,
      name,
      startLine: lineNumberAt(lineBreaks, Math.max(0, i - prelude.length)),
      endLine: lineNumberAt(lineBreaks, closeIndex),
      lineCount: countMeaningfulLines(body),
      normalized: normalizeFunctionBody(body, file.ext),
    });
  }

  return functions;
}

function extractPythonFunctions(file, content) {
  const lines = content.split(/\r?\n/);
  const functions = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (!match) continue;

    const baseIndent = indentWidth(match[1]);
    let headerEnd = i;
    let parens = countParens(lines[i]);
    while (headerEnd < lines.length - 1 && (parens > 0 || !lines[headerEnd].includes(":"))) {
      headerEnd += 1;
      parens += countParens(lines[headerEnd]);
    }

    const bodyStart = headerEnd + 1;
    let bodyEnd = lines.length - 1;
    for (let j = bodyStart; j < lines.length; j += 1) {
      if (!lines[j].trim()) continue;
      if (indentWidth(lines[j]) <= baseIndent) {
        bodyEnd = j - 1;
        break;
      }
    }

    const body = lines.slice(bodyStart, bodyEnd + 1).join("\n");
    functions.push({
      path: file.path,
      name: match[2],
      startLine: i + 1,
      endLine: bodyEnd + 1,
      lineCount: countMeaningfulLines(body),
      normalized: normalizeFunctionBody(body, file.ext),
    });
  }

  return functions;
}

export async function collectFunctions(root, files, options) {
  const collected = [];
  let skippedLarge = 0;

  for (const file of files) {
    if (!functionCodeExts.has(file.ext)) continue;
    if (file.size > options.maxFunctionBytes) {
      skippedLarge += 1;
      continue;
    }

    const content = await fs.readFile(path.join(root, file.path), "utf8").catch(() => "");
    const functions = file.ext === ".py" ? extractPythonFunctions(file, content) : extractBraceFunctions(file, content);

    for (const fn of functions) {
      if (fn.lineCount < options.minFunctionLines || fn.normalized.length < options.minFunctionChars) continue;

      const bodyHash = createHash("sha256").update(fn.normalized).digest("hex");
      collected.push({
        path: fn.path,
        line: fn.startLine,
        name: fn.name,
        lines: fn.lineCount,
        bodyHash,
      });
    }
  }

  const warnings =
    skippedLarge > 0
      ? [
          warning("max-function-bytes-skipped", `${skippedLarge} code file(s) were skipped by function scan because they exceed --max-function-bytes.`, {
            maxFunctionBytes: options.maxFunctionBytes,
            skippedFiles: skippedLarge,
          }),
        ]
      : [];

  return { functions: collected, warnings };
}
