import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function resolveExisting(absolutePath) {
  const candidates = [
    absolutePath,
    `${absolutePath}.ts`,
    `${absolutePath}.tsx`,
    path.join(absolutePath, "index.ts"),
  ];

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) {
        return pathToFileURL(candidate).href;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(projectRoot, "tests/server-only-shim.mjs"))
        .href,
    };
  }

  if (specifier.startsWith("@/")) {
    const absolutePath = path.resolve(projectRoot, specifier.slice(2));
    const resolved = await resolveExisting(absolutePath);
    if (resolved) {
      return {
        shortCircuit: true,
        url: resolved,
      };
    }
  }

  return nextResolve(specifier, context);
}
