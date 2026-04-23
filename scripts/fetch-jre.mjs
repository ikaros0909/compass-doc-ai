/**
 * Adoptium Temurin 17 JRE (Windows x64) 를 ./jre 로 받아 풀어둔다.
 * electron-builder 가 extraResources 로 동봉.
 *
 * - 이미 ./jre/bin/java.exe 가 있으면 다운로드를 건너뛴다.
 * - 다운로드는 Adoptium API 의 latest GA JRE 링크를 사용한다.
 *
 * 참고: 라이선스(GPLv2 + Classpath Exception)에 따라 재배포 가능.
 *      배포본 안에 LICENSE 파일을 함께 넣을 것.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const jreDir = path.join(root, "jre");
const tmpDir = path.join(root, ".tmp-jre");

const FEATURE_VERSION = process.env.JRE_VERSION || "17";
const OS = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
const ARCH = "x64";

const downloadUrl =
  `https://api.adoptium.net/v3/binary/latest/${FEATURE_VERSION}/ga/` +
  `${OS}/${ARCH}/jre/hotspot/normal/eclipse?project=jdk`;

async function ensureFresh() {
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
}

function fetchToFile(srcUrl, dest) {
  return new Promise((resolve, reject) => {
    console.log(`[fetch-jre] downloading ${srcUrl}`);
    fetch(srcUrl, { redirect: "follow" })
      .then(async (res) => {
        if (!res.ok) {
          reject(new Error(`HTTP ${res.status} ${res.statusText} for ${srcUrl}`));
          return;
        }
        const out = createWriteStream(dest);
        const reader = res.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!out.write(value)) {
              await new Promise((r) => out.once("drain", r));
            }
          }
          out.end(resolve);
        };
        pump().catch(reject);
      })
      .catch(reject);
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: true, ...opts });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))
    );
    p.on("error", reject);
  });
}

async function extractZip(zipPath, destDir) {
  if (process.platform === "win32") {
    // PowerShell Expand-Archive — 외부 의존성 없음
    await run("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
    ]);
  } else {
    await run("unzip", ["-q", zipPath, "-d", destDir]);
  }
}

async function extractTarGz(tgzPath, destDir) {
  await run("tar", ["-xzf", tgzPath, "-C", destDir]);
}

async function findJreRoot(dir) {
  const fs = await import("node:fs/promises");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const inner = path.join(dir, e.name);
    if (existsSync(path.join(inner, "bin"))) return inner;
  }
  throw new Error(`No JRE root with bin/ found under ${dir}`);
}

async function main() {
  const javaExe =
    process.platform === "win32"
      ? path.join(jreDir, "bin", "java.exe")
      : path.join(jreDir, "bin", "java");

  if (existsSync(javaExe) && !process.env.JRE_FORCE) {
    console.log(`[fetch-jre] reuse existing JRE at ${jreDir}`);
    return;
  }

  await ensureFresh();
  const archiveExt = OS === "windows" ? "zip" : "tar.gz";
  const archivePath = path.join(tmpDir, `jre.${archiveExt}`);
  await fetchToFile(downloadUrl, archivePath);

  console.log(`[fetch-jre] extracting...`);
  if (archiveExt === "zip") {
    await extractZip(archivePath, tmpDir);
  } else {
    await extractTarGz(archivePath, tmpDir);
  }

  const innerRoot = await findJreRoot(tmpDir);
  await rm(jreDir, { recursive: true, force: true });
  const fs = await import("node:fs/promises");
  await fs.rename(innerRoot, jreDir);
  await rm(tmpDir, { recursive: true, force: true });

  console.log(`[fetch-jre] ready → ${jreDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
