import { spawn } from "node:child_process";

const steps = [
  ["preflight", ["run", "preflight"]],
  ["lint", ["run", "lint"]],
  ["typecheck", ["run", "typecheck"]],
  ["test", ["test"]],
  ["build", ["run", "build"]],
];

function run(name, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${name} ===`);
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${name} failed with exit code ${code}`));
    });
  });
}

for (const [name, args] of steps) {
  await run(name, args);
}

console.log("\nRelease validation passed.");
