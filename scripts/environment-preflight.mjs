import { createRequire } from "node:module";
import { access, statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN_NODE = "22.6.0";
const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;

function parseVersion(raw) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function isAtLeast(current, minimum) {
  const a = parseVersion(current);
  const b = parseVersion(minimum);
  if (!a || !b) return false;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch >= b.patch;
}

const results = [];

async function check(label, fn) {
  try {
    const detail = await fn();
    results.push({ label, ok: true, detail });
    console.log(`PASS ${label}${detail ? ` (${detail})` : ""}`);
  } catch (error) {
    results.push({ label, ok: false, error: String(error) });
    console.log(`FAIL ${label}: ${error}`);
  }
}

await check("operating system", () => os.platform());
await check("cpu architecture", () => os.arch());
await check("node version", () => {
  if (!isAtLeast(process.versions.node, MIN_NODE)) {
    throw new Error(`Node ${process.versions.node} is below required ${MIN_NODE}`);
  }
  return process.versions.node;
});
await check("npm version", async () => {
  const { execFileSync } = await import("node:child_process");
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const version = execFileSync(npmCmd, ["-v"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  }).trim();
  const parsed = parseVersion(version);
  if (!parsed || parsed.major < 10) {
    throw new Error(`npm ${version} is below required 10`);
  }
  return version;
});
await check("node executable", () => process.execPath);
await check("writable project directory", async () => {
  await access(projectRoot);
  return projectRoot;
});
await check("available disk space", async () => {
  const stats = await statfs(projectRoot);
  const free = Number(stats.bavail) * Number(stats.bsize);
  if (free < MIN_FREE_BYTES) {
    throw new Error(
      `Free space ${Math.round(free / 1024 / 1024)}MB is below 2048MB recommended for install/build`,
    );
  }
  return `${Math.round(free / 1024 / 1024 / 1024)}GB free`;
});
await check("package-lock present", async () => {
  await access(path.join(projectRoot, "package-lock.json"));
  return "package-lock.json";
});
await check("playwright chromium", async () => {
  const executable = chromium.executablePath();
  await access(executable);
  return "chromium executable present";
});
await check("next swc binding", () => {
  const platformPackage =
    process.platform === "win32" && process.arch === "x64"
      ? "@next/swc-win32-x64-msvc"
      : process.platform === "win32" && process.arch === "arm64"
        ? "@next/swc-win32-arm64-msvc"
        : null;
  if (!platformPackage) {
    return `non-windows or unmanaged platform ${process.platform}-${process.arch}`;
  }
  require.resolve(platformPackage);
  return platformPackage;
});

const failed = results.filter((entry) => !entry.ok);
console.log(
  `--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
