#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const cwd = process.cwd();
const rawArgs = process.argv.slice(2);
let suiteName;
let testNamePattern;
const cliPatterns = [];

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === "--suite") {
    suiteName = rawArgs[index + 1];
    index += 1;
  } else if (arg === "--test-name-pattern") {
    testNamePattern = rawArgs[index + 1];
    index += 1;
  } else {
    cliPatterns.push(arg);
  }
}

const suite = suiteName ? readSuite(suiteName) : undefined;
const patterns = [...(suite?.patterns ?? []), ...cliPatterns];
if (suite?.testNamePattern && !testNamePattern) {
  testNamePattern = suite.testNamePattern;
}

if (patterns.length === 0) {
  console.error("Usage: node scripts/run-node-tests.mjs [--suite name] [--test-name-pattern pattern] <test-file-pattern...>");
  process.exit(1);
}

function readSuite(name) {
  if (!name) {
    console.error("--suite requires a suite name");
    process.exit(1);
  }

  let packageJson;
  try {
    packageJson = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
  } catch (error) {
    console.error(`Unable to read package.json for test suite ${name}: ${error.message}`);
    process.exit(1);
  }

  const suiteValue = packageJson.testSuites?.[name];
  if (Array.isArray(suiteValue)) {
    return { patterns: suiteValue };
  }
  if (suiteValue && typeof suiteValue === "object" && Array.isArray(suiteValue.patterns)) {
    return {
      patterns: suiteValue.patterns,
      testNamePattern: typeof suiteValue.testNamePattern === "string" ? suiteValue.testNamePattern : undefined,
    };
  }

  console.error(`Unknown or invalid test suite ${name} in ${resolve(cwd, "package.json")}`);
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

const needsTsx = testFiles.some((file) => /\.(?:ts|tsx)$/.test(file));
if (needsTsx && !canResolveFromCwd("tsx")) {
  console.error(tsxMissingMessage());
  process.exit(1);
}

const nodeArgs = needsTsx
  ? ["--import", "tsx", "--test"]
  : ["--test"];

if (testNamePattern) {
  nodeArgs.push("--test-name-pattern", testNamePattern);
}

nodeArgs.push(...testFiles);

const result = spawnSync(
  process.execPath,
  nodeArgs,
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

function canResolveFromCwd(packageName) {
  try {
    createRequire(resolve(cwd, "package.json")).resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

function tsxMissingMessage() {
  const packageJson = readPackageJsonForDiagnostics();
  const declaration = packageDependencyDeclaration(packageJson, "tsx");
  const pnpmCandidates = pnpmPackageCandidates("tsx");
  const lines = [
    "Unable to run TypeScript tests because package 'tsx' is not installed for this workspace.",
    `cwd: ${cwd}`,
    `resolver: ${resolve(cwd, "package.json")}`,
  ];

  if (declaration) {
    lines.push(`package.json declares tsx (${declaration}), but Node cannot resolve it from this workspace.`);
  } else {
    lines.push("package.json does not declare tsx for this workspace.");
  }

  if (pnpmCandidates.length > 0) {
    lines.push(`pnpm store candidates: ${pnpmCandidates.join(", ")}`);
  }

  lines.push(...nodeInstallDiagnostics("tsx", pnpmCandidates));
  lines.push("Run the workspace install step, then rerun this command.");
  return lines.join("\n");
}

function readPackageJsonForDiagnostics() {
  try {
    return JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
}

function packageDependencyDeclaration(packageJson, packageName) {
  if (!packageJson || typeof packageJson !== "object") return undefined;
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const value = packageJson[section]?.[packageName];
    if (typeof value === "string") return `${section} ${value}`;
  }
  return undefined;
}

function pnpmPackageCandidates(packageName) {
  const root = workspaceRoot();
  if (!root) return [];
  const pnpmDir = resolve(root, "node_modules", ".pnpm");
  try {
    return readdirSync(pnpmDir)
      .filter((entry) => entry.startsWith(`${packageName}@`))
      .slice(0, 5)
      .map((entry) => {
        const packagePath = resolve(pnpmDir, entry, "node_modules", packageName);
        return existsSync(packagePath) ? entry : `${entry} (missing package directory)`;
      });
  } catch {
    return [];
  }
}

function nodeInstallDiagnostics(packageName, pnpmCandidates) {
  const root = workspaceRoot();
  if (!root) return [];
  const lines = [];
  const rootNodeModules = resolve(root, "node_modules");
  const commandShimDir = resolve(rootNodeModules, ".bin");
  const packageLink = resolve(rootNodeModules, packageName);

  if (!existsSync(rootNodeModules)) {
    lines.push(`workspace node_modules is missing at ${rootNodeModules}.`);
  } else {
    if (!existsSync(commandShimDir)) {
      lines.push(`workspace command shims are missing at ${commandShimDir}; install did not finish linking binaries.`);
    }
    if (!existsSync(packageLink)) {
      lines.push(`workspace package link is missing at ${packageLink}.`);
    }
  }

  for (const candidate of pnpmCandidates) {
    if (!candidate.includes("(missing package directory)")) continue;
    const entry = candidate.replace(" (missing package directory)", "");
    lines.push(`pnpm store entry ${entry} is incomplete; expected ${resolve(rootNodeModules, ".pnpm", entry, "node_modules", packageName)}.`);
  }

  lines.push("If offline install fails with ERR_PNPM_NO_OFFLINE_TARBALL, hydrate the pnpm store or rerun install with registry access.");
  return lines;
}

function workspaceRoot() {
  let directory = cwd;
  while (true) {
    if (existsSync(resolve(directory, "pnpm-workspace.yaml"))) return directory;
    const parent = resolve(directory, "..");
    if (parent === directory) return undefined;
    directory = parent;
  }
}
