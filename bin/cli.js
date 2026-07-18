#!/usr/bin/env node
"use strict";

// Copies the bundled Screenshot Studio agent skill into the current project so
// coding agents (Claude Code, etc.) pick it up. No dependencies on purpose —
// this runs straight from `npx`.

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const has = (f) => args.includes(f);

if (has("-h") || has("--help")) {
  console.log(`screenshot-studio-skill — install the App Store screenshot agent skill

Usage:
  npx screenshot-studio-skill [options]

Options:
  --agents        Install into .agents/skills/ instead of .claude/skills/
  --dir <path>    Install into a custom skills directory
  --force         Overwrite an existing skill
  -h, --help      Show this help

Default target: .claude/skills/screenshot-studio/`);
  process.exit(0);
}

function optionValue(name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

const skillName = "screenshot-studio";
const baseDir =
  optionValue("--dir") ||
  path.join(has("--agents") ? ".agents" : ".claude", "skills");
const dest = path.resolve(process.cwd(), baseDir, skillName);
const src = path.join(__dirname, "..", "skill");

if (fs.existsSync(dest) && !has("--force")) {
  console.error(
    `✗ ${path.relative(process.cwd(), dest)} already exists. Re-run with --force to overwrite.`
  );
  process.exit(1);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(src, dest);

const shown = path.relative(process.cwd(), dest) || dest;
console.log(`✓ Installed the Screenshot Studio skill to ${shown}/`);
console.log(`  Ask your agent: "make App Store screenshots for this app".`);
