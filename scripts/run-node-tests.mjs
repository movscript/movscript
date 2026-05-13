#!/usr/bin/env node

import { readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const cwd = process.cwd();
const patterns = process.argv.slice(2);

if (patterns.length === 0) {
  console.error("Usage: node scripts/run-node-tests.mjs <test-file-pattern...>");
  process.exit(1);
}

function hasGlob(pattern) {
  return /[*?[\]{}]/.test(pattern);
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern) {
  const normalized = pattern.split(/[\\/]+/).join("/");
  let source = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*") {
      const after = normalized[index + 2];

      if (after === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }

  source += "$";
  return new RegExp(source);
}

function rootFromPattern(pattern) {
  const normalized = pattern.split(/[\\/]+/);
  const parts = [];

  for (const part of normalized) {
    if (hasGlob(part)) {
      break;
    }

    parts.push(part);
  }

  return parts.length > 0 ? parts.join(sep) : ".";
}

function walkFiles(root) {
  const absoluteRoot = resolve(cwd, root);
  const files = [];

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile()) {
        files.push(relative(cwd, absolutePath).split(sep).join("/"));
      }
    }
  }

  try {
    if (statSync(absoluteRoot).isDirectory()) {
      walk(absoluteRoot);
    }
  } catch {
    return [];
  }

  return files;
}

const discovered = new Set();
for (const pattern of patterns) {
  if (!hasGlob(pattern)) {
    try {
      if (statSync(resolve(cwd, pattern)).isFile()) {
        discovered.add(pattern);
      }
    } catch {}

    continue;
  }

  const matcher = globToRegExp(pattern);
  const matches = walkFiles(rootFromPattern(pattern)).filter((file) =>
    matcher.test(file),
  );

  for (const match of matches) {
    discovered.add(match);
  }
}

const testFiles = [...discovered].sort();

if (testFiles.length === 0) {
  console.error(`No test files matched: ${patterns.join(", ")}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  {
    cwd,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
