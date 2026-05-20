#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "./cleanup-snapshot/cli.mjs";
import { renderSnapshot } from "./cleanup-snapshot/renderers.mjs";
import { buildSnapshot } from "./cleanup-snapshot/snapshot.mjs";

async function writeOutput(options, output) {
  if (!options.out || options.out === "-") {
    process.stdout.write(output);
    return;
  }

  const outputPath = path.resolve(options.out);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, output);
  process.stdout.write(`Cleanup snapshot report written to ${outputPath}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const snapshot = await buildSnapshot(options);
  await writeOutput(options, renderSnapshot(snapshot, options.format));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
