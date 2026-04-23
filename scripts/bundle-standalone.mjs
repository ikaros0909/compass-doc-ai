/**
 * Next.js standalone 빌드 산출물을 .next-standalone/ 로 모은다.
 *
 *   .next-standalone/
 *     ├ server.js               (next build --output standalone)
 *     ├ node_modules/...
 *     ├ .next/static/...        (정적 청크 — 별도 복사 필요)
 *     ├ public/...              (있으면 복사)
 *     └ package.json
 *
 * electron-builder 가 이 폴더를 통째로 resources/next-app/ 으로 동봉.
 */
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".next-standalone");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const standalone = path.join(root, ".next", "standalone");
  if (!(await exists(standalone))) {
    throw new Error(
      "Run `next build` first — .next/standalone is missing (set output: 'standalone')"
    );
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // 1) standalone 트리 전체
  await cp(standalone, outDir, { recursive: true });

  // 2) static 청크
  const staticDir = path.join(root, ".next", "static");
  if (await exists(staticDir)) {
    await cp(staticDir, path.join(outDir, ".next", "static"), { recursive: true });
  }

  // 3) public 디렉터리 (있을 때만)
  const publicDir = path.join(root, "public");
  if (await exists(publicDir)) {
    await cp(publicDir, path.join(outDir, "public"), { recursive: true });
  }

  // 4) better-sqlite3 의 .node 바이너리는 ABI 가 일치해야만 dlopen 된다.
  //    next build 가 자체 캐시/이전 산출에서 다른 ABI 를 가져왔을 수 있으므로
  //    현재 node_modules 의 활성 .node 를 standalone 쪽에 강제 덮어쓴다.
  //    (dist:prepare 에서 이 직전에 use:electron 이 실행돼 Electron ABI 보장됨)
  const srcNode = path.join(
    root,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node"
  );
  const dstNodeDir = path.join(
    outDir,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release"
  );
  if (await exists(srcNode)) {
    await mkdir(dstNodeDir, { recursive: true });
    await cp(srcNode, path.join(dstNodeDir, "better_sqlite3.node"));
    console.log(`[bundle-standalone] overwrote better_sqlite3.node from active node_modules`);
  } else {
    console.warn(
      `[bundle-standalone] WARNING: ${srcNode} not found — better-sqlite3 may not load in app`
    );
  }

  console.log(`[bundle-standalone] ready → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
