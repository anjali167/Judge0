// Serve Monaco from our own origin instead of a CDN (self-hosted instances
// must work on restricted networks). Runs on postinstall.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules/monaco-editor/min/vs");
const dest = join(root, "public/monaco/vs");
if (existsSync(src)) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log("monaco copied to public/monaco/vs");
}
