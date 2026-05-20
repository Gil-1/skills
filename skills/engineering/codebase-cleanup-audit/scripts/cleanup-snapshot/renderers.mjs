function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeScriptJson(value) {
  return JSON.stringify(value, null, 2).replaceAll("</", "<\\/");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderEmpty(items, text = "none found") {
  return items.length === 0 ? `<p class="empty">${escapeHtml(text)}</p>` : "";
}

function renderWarningList(warnings) {
  if (warnings.length === 0) return `<p class="empty">No limits were reached.</p>`;
  return `<ul class="warnings">${warnings
    .map((item) => `<li><code>${escapeHtml(item.code)}</code> ${escapeHtml(item.message)}</li>`)
    .join("")}</ul>`;
}

function renderPathList(paths) {
  return `<ul class="path-list">${paths.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ul>`;
}

function renderDuplicateNameTable(items, occurrenceRenderer) {
  if (items.length === 0) return renderEmpty(items);
  return `<table>
    <thead><tr><th>Name</th><th>Status</th><th>Variants</th><th>Occurrences</th></tr></thead>
    <tbody>${items
      .map(
        (item) => `<tr>
          <td><code>${escapeHtml(item.name)}</code></td>
          <td><span class="status">${escapeHtml(item.status)}</span></td>
          <td>${item.variants}</td>
          <td><ul class="path-list">${item.occurrences.map(occurrenceRenderer).join("")}</ul></td>
        </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

export function toMarkdown(snapshot) {
  const lines = [];
  lines.push(`# Cleanup Snapshot`);
  lines.push("");
  lines.push(`Root: ${snapshot.root}`);
  lines.push(`Generated: ${snapshot.generatedAt}`);
  lines.push(`Files: ${snapshot.fileCount}`);
  lines.push(`Directories: ${snapshot.dirCount}`);
  lines.push("");
  lines.push("## Warnings");
  for (const item of snapshot.warnings) lines.push(`- ${item.code}: ${item.message}`);
  if (snapshot.warnings.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Extensions");
  for (const ext of snapshot.extensions.slice(0, 25)) {
    lines.push(`- ${ext.ext}: ${ext.count} files, ${ext.bytes} bytes`);
  }
  lines.push("");
  lines.push("## Legacy Path Signals");
  for (const item of snapshot.legacyPathSignals.slice(0, 50)) lines.push(`- ${item}`);
  if (snapshot.legacyPathSignals.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Duplicate File Names");
  for (const item of snapshot.duplicateFileNames.slice(0, 30)) {
    const occurrences = item.occurrences.map((occurrence) => `${occurrence.path} (${occurrence.size} bytes) [${occurrence.hash}]`);
    lines.push(`- ${item.status}, ${item.variants} variant(s), ${item.name}: ${occurrences.join(", ")}`);
  }
  if (snapshot.duplicateFileNames.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Exact Duplicate Files");
  for (const item of snapshot.exactDuplicateFiles.slice(0, 30)) lines.push(`- ${item.hash}: ${item.paths.join(", ")}`);
  if (snapshot.exactDuplicateFiles.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Duplicate Functions");
  for (const item of snapshot.duplicateFunctions.slice(0, 30)) {
    const occurrences = item.occurrences.map((occurrence) => `${occurrence.path}:${occurrence.line} ${occurrence.name}()`);
    lines.push(`- ${item.lines} lines, ${item.hash}: ${occurrences.join(", ")}`);
  }
  if (snapshot.duplicateFunctions.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Duplicate Function Names");
  for (const item of snapshot.duplicateFunctionNames.slice(0, 30)) {
    const occurrences = item.occurrences.map(
      (occurrence) => `${occurrence.path}:${occurrence.line} ${occurrence.name}() [${occurrence.hash}]`,
    );
    lines.push(`- ${item.status}, ${item.variants} variant(s), ${item.name}: ${occurrences.join(", ")}`);
  }
  if (snapshot.duplicateFunctionNames.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Content Signals");
  for (const hit of snapshot.contentSignals.slice(0, 50)) {
    lines.push(`- ${hit.path}:${hit.line} ${hit.text}`);
  }
  if (snapshot.contentSignals.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Largest Files");
  for (const file of snapshot.largestFiles) lines.push(`- ${file.path}: ${file.size} bytes`);
  return `${lines.join("\n")}\n`;
}

export function toHtml(snapshot) {
  const snapshotJson = escapeScriptJson(snapshot);
  const extensionRows = snapshot.extensions
    .slice(0, 50)
    .map((ext) => `<tr><td><code>${escapeHtml(ext.ext)}</code></td><td>${ext.count}</td><td>${formatBytes(ext.bytes)}</td></tr>`)
    .join("");
  const largestRows = snapshot.largestFiles
    .map((file) => `<tr><td><code>${escapeHtml(file.path)}</code></td><td>${formatBytes(file.size)}</td></tr>`)
    .join("");
  const contentRows = snapshot.contentSignals
    .slice(0, 100)
    .map(
      (hit) => `<tr><td><code>${escapeHtml(hit.path)}:${hit.line}</code></td><td>${escapeHtml(hit.text)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cleanup Snapshot</title>
  <style>
    :root { color-scheme: light; --bg: #f7f8fb; --panel: #ffffff; --text: #20242c; --muted: #5a6472; --line: #d9dee7; --accent: #0b6bcb; --warn: #9f4a00; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
    header { margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.15; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: 0; }
    section { margin: 18px 0; padding: 18px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 9px 10px; border-top: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; }
    code { overflow-wrap: anywhere; }
    pre { max-height: 520px; overflow: auto; padding: 14px; background: #111827; color: #e5e7eb; border-radius: 6px; }
    .meta, .empty { color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
    .metric { padding: 14px; background: #fbfcff; border: 1px solid var(--line); border-radius: 6px; }
    .metric strong { display: block; font-size: 24px; line-height: 1.2; }
    .metric span { color: var(--muted); }
    .warnings { margin: 0; padding-left: 18px; color: var(--warn); }
    .status { white-space: nowrap; color: var(--accent); font-weight: 650; }
    .path-list { margin: 0; padding-left: 18px; }
    .path-list li { margin: 2px 0; }
    details summary { cursor: pointer; color: var(--accent); font-weight: 650; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Cleanup Snapshot</h1>
      <div class="meta">Root: <code>${escapeHtml(snapshot.root)}</code></div>
      <div class="meta">Generated: ${escapeHtml(snapshot.generatedAt)}</div>
    </header>

    <section aria-labelledby="summary">
      <h2 id="summary">Summary</h2>
      <div class="grid">
        <div class="metric"><strong>${snapshot.fileCount}</strong><span>files scanned</span></div>
        <div class="metric"><strong>${snapshot.dirCount}</strong><span>directories scanned</span></div>
        <div class="metric"><strong>${snapshot.duplicateFileNames.length}</strong><span>duplicate file names</span></div>
        <div class="metric"><strong>${snapshot.duplicateFunctions.length}</strong><span>duplicate function bodies</span></div>
        <div class="metric"><strong>${snapshot.duplicateFunctionNames.length}</strong><span>duplicate function names</span></div>
        <div class="metric"><strong>${snapshot.warnings.length}</strong><span>limit warnings</span></div>
      </div>
    </section>

    <section aria-labelledby="warnings">
      <h2 id="warnings">Limit Warnings</h2>
      ${renderWarningList(snapshot.warnings)}
    </section>

    <section aria-labelledby="file-names">
      <h2 id="file-names">Duplicate File Names</h2>
      ${renderDuplicateNameTable(
        snapshot.duplicateFileNames,
        (occurrence) => `<li><code>${escapeHtml(occurrence.path)}</code> ${formatBytes(occurrence.size)} <code>${escapeHtml(occurrence.hash)}</code></li>`,
      )}
    </section>

    <section aria-labelledby="exact-files">
      <h2 id="exact-files">Exact Duplicate Files</h2>
      ${
        snapshot.exactDuplicateFiles.length === 0
          ? renderEmpty(snapshot.exactDuplicateFiles)
          : snapshot.exactDuplicateFiles
              .map((item) => `<h3><code>${escapeHtml(item.hash)}</code></h3>${renderPathList(item.paths)}`)
              .join("")
      }
    </section>

    <section aria-labelledby="function-bodies">
      <h2 id="function-bodies">Duplicate Function Bodies</h2>
      ${
        snapshot.duplicateFunctions.length === 0
          ? renderEmpty(snapshot.duplicateFunctions)
          : `<table><thead><tr><th>Hash</th><th>Lines</th><th>Occurrences</th></tr></thead><tbody>${snapshot.duplicateFunctions
              .map(
                (item) => `<tr><td><code>${escapeHtml(item.hash)}</code></td><td>${item.lines}</td><td><ul class="path-list">${item.occurrences
                  .map((occurrence) => `<li><code>${escapeHtml(occurrence.path)}:${occurrence.line}</code> ${escapeHtml(occurrence.name)}()</li>`)
                  .join("")}</ul></td></tr>`,
              )
              .join("")}</tbody></table>`
      }
    </section>

    <section aria-labelledby="function-names">
      <h2 id="function-names">Duplicate Function Names</h2>
      ${renderDuplicateNameTable(
        snapshot.duplicateFunctionNames,
        (occurrence) => `<li><code>${escapeHtml(occurrence.path)}:${occurrence.line}</code> ${escapeHtml(occurrence.name)}() <code>${escapeHtml(occurrence.hash)}</code></li>`,
      )}
    </section>

    <section aria-labelledby="legacy">
      <h2 id="legacy">Legacy Path Signals</h2>
      ${snapshot.legacyPathSignals.length === 0 ? renderEmpty(snapshot.legacyPathSignals) : renderPathList(snapshot.legacyPathSignals.slice(0, 100))}
    </section>

    <section aria-labelledby="content">
      <h2 id="content">Content Signals</h2>
      ${contentRows ? `<table><thead><tr><th>Location</th><th>Text</th></tr></thead><tbody>${contentRows}</tbody></table>` : renderEmpty(snapshot.contentSignals)}
    </section>

    <section aria-labelledby="extensions">
      <h2 id="extensions">Extensions</h2>
      <table><thead><tr><th>Extension</th><th>Files</th><th>Bytes</th></tr></thead><tbody>${extensionRows}</tbody></table>
    </section>

    <section aria-labelledby="largest">
      <h2 id="largest">Largest Files</h2>
      <table><thead><tr><th>Path</th><th>Size</th></tr></thead><tbody>${largestRows}</tbody></table>
    </section>

    <section aria-labelledby="agent-data">
      <h2 id="agent-data">Agent Data</h2>
      <p class="meta">The full snapshot is embedded below as JSON for follow-up agents and automated tooling.</p>
      <details>
        <summary>Machine-readable snapshot JSON</summary>
        <pre>${escapeHtml(snapshotJson)}</pre>
      </details>
      <script type="application/json" id="cleanup-snapshot-data">${snapshotJson}</script>
    </section>
  </main>
</body>
</html>
`;
}

export function renderSnapshot(snapshot, format) {
  if (format === "html") return toHtml(snapshot);
  if (format === "markdown") return toMarkdown(snapshot);
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
