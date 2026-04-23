/**
 * better-sqlite3 의 .node 바이너리가 어느 ABI 로 컴파일됐는지 추적하고,
 * 요청한 타깃(node|electron)과 다르면 알맞게 rebuild 한다.
 *
 *   node scripts/ensure-native-abi.mjs node      → npm rebuild better-sqlite3
 *   node scripts/ensure-native-abi.mjs electron  → electron-rebuild -f -w better-sqlite3
 *
 * 마지막으로 적용한 타깃은 node_modules/better-sqlite3/.abi-target 에 기록.
 * 이미 같은 타깃이면 즉시 종료(불필요한 컴파일 회피).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const target = (process.argv[2] || "").toLowerCase();
if (target !== "node" && target !== "electron") {
  console.error(`Usage: ensure-native-abi.mjs <node|electron>`);
  process.exit(2);
}

const moduleDir = path.join(root, "node_modules", "better-sqlite3");
const stampPath = path.join(moduleDir, ".abi-target");
const binaryPath = path.join(moduleDir, "build", "Release", "better_sqlite3.node");

if (!existsSync(moduleDir)) {
  console.error(`[abi] better-sqlite3 not installed — run npm install first`);
  process.exit(1);
}

const current = existsSync(stampPath) ? readFileSync(stampPath, "utf8").trim() : null;
const haveBinary = existsSync(binaryPath);

if (current === target && haveBinary) {
  console.log(`[abi] better-sqlite3 already built for ${target} — skip`);
  process.exit(0);
}

console.log(`[abi] rebuilding better-sqlite3 for ${target} (was: ${current ?? "unknown"})`);

// Windows 에서는 npm/npx 가 .cmd 셸 스크립트라 shell:true 가 반드시 필요하다.
// (Node 18+ 의 spawn 보안 변경으로 .cmd 직접 실행은 차단됨)
const isWin = process.platform === "win32";
const cmd = target === "node" ? "npm" : "npx";
const args =
  target === "node"
    ? ["rebuild", "better-sqlite3"]
    : ["electron-rebuild", "-f", "-w", "better-sqlite3"];

const result = spawnSync(cmd, args, {
  stdio: "inherit",
  cwd: root,
  shell: isWin,
});

if (result.error) {
  console.error(`[abi] failed to spawn ${cmd}:`, result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`[abi] rebuild failed (code=${result.status}, signal=${result.signal})`);
  process.exit(result.status ?? 1);
}

writeFileSync(stampPath, target, "utf8");
console.log(`[abi] OK — better-sqlite3 now linked for ${target}`);
