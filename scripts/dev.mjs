import { spawn } from "node:child_process";
const commands = [
  ["--experimental-strip-types", "server/index.ts"],
  ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"],
];
const children = commands.map((args) =>
  spawn(process.execPath, args, { stdio: "inherit", windowsHide: true }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((p) => p.kill());
  process.exitCode = code;
}
children.forEach((p) => p.on("exit", (code) => stop(code || 0)));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
