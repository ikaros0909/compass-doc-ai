/**
 * Compass Doc AI — Electron entrypoint
 *
 * 책임:
 *   1) Next.js standalone 서버를 자식 프로세스로 띄운다 (127.0.0.1:<random>)
 *   2) BrowserWindow를 그 URL로 로드한다
 *   3) 동봉된 JRE 경로를 PATH/JAVA_HOME 으로 주입한다
 *      → opendataloader-pdf 가 별도 Java 설치 없이 동작
 *   4) 데이터 디렉터리(SQLite, PDF, JSON)를 app.getPath("userData")/data 로 강제
 *   5) electron-updater 로 GitHub Releases 자동 업데이트
 */

const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { autoUpdater } = require("electron-updater");

// ---------------------------------------------------------------------------
// 단일 인스턴스 락 — 중복 실행 시 두 번째 인스턴스는 즉시 종료
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 경로 헬퍼
// ---------------------------------------------------------------------------
const isDev = !app.isPackaged;

/** packaged 시 process.resourcesPath 아래에 next-app, jre 가 들어간다 */
function resourcePath(...segments) {
  return isDev
    ? path.join(__dirname, "..", ...segments)
    : path.join(process.resourcesPath, ...segments);
}

function getDataDir() {
  const dir = path.join(app.getPath("userData"), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // 업로드/변환 결과 저장용 하위 디렉터리도 미리 만든다.
  for (const sub of ["pdf", "json", "exports"]) {
    const p = path.join(dir, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
  return dir;
}

function getLogDir() {
  const dir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getJreHome() {
  // electron-builder extraResources 로 동봉되는 JRE 루트.
  // dev 모드에서는 시스템 java 를 그대로 사용한다.
  const candidate = resourcePath("jre");
  return fs.existsSync(candidate) ? candidate : null;
}

function getJavaBin() {
  const home = getJreHome();
  if (!home) return null;
  const exe = process.platform === "win32" ? "java.exe" : "java";
  const bin = path.join(home, "bin", exe);
  return fs.existsSync(bin) ? bin : null;
}

// ---------------------------------------------------------------------------
// 무료 포트 할당
// ---------------------------------------------------------------------------
function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// ---------------------------------------------------------------------------
// Next.js 서버 부트스트랩
// ---------------------------------------------------------------------------
let nextProcess = null;
let nextPort = null;

async function startNextServer() {
  nextPort = await pickFreePort();
  const dataDir = getDataDir();
  const javaBin = getJavaBin();
  const jreHome = getJreHome();

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(nextPort),
    HOSTNAME: "127.0.0.1",
    COMPASS_DATA_DIR: dataDir,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  // 동봉 JRE 우선 사용
  if (jreHome) {
    env.JAVA_HOME = jreHome;
    const binDir = path.join(jreHome, "bin");
    env.PATH = `${binDir}${path.delimiter}${env.PATH ?? ""}`;
  }
  // Windows 한글 콘솔 깨짐 방지 (converter.ts 와 동일 정책)
  if (process.platform === "win32") {
    env.JAVA_TOOL_OPTIONS =
      `${env.JAVA_TOOL_OPTIONS ?? ""} -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8`.trim();
  }

  if (isDev) {
    // dev: 호스트에서 이미 `npm run dev` 가 떠있다고 가정 (3300)
    nextPort = 3300;
    return;
  }

  const serverEntry = resourcePath("next-app", "server.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Next standalone server not found: ${serverEntry}`);
  }

  // 패키지된 앱은 콘솔이 없으므로 Next 서버 로그를 파일로도 떨어뜨린다.
  // 사용자: 메뉴 → 도움말 → "데이터 폴더 열기" 옆의 logs/ 폴더에서 확인.
  const logFile = path.join(getLogDir(), "next-server.log");
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  logStream.write(`\n\n===== ${new Date().toISOString()} app start =====\n`);
  logStream.write(`port=${nextPort} dataDir=${dataDir} jre=${jreHome ?? "(system)"}\n`);

  nextProcess = spawn(process.execPath, [serverEntry], {
    cwd: resourcePath("next-app"),
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  nextProcess.stdout.on("data", (b) => {
    process.stdout.write(`[next] ${b}`);
    logStream.write(b);
  });
  nextProcess.stderr.on("data", (b) => {
    process.stderr.write(`[next] ${b}`);
    logStream.write(b);
  });
  nextProcess.on("exit", (code, signal) => {
    console.error(`[next] exited code=${code} signal=${signal}`);
    if (!app.isQuiting) {
      dialog.showErrorBox(
        "Compass Doc AI",
        `내부 서버가 예기치 않게 종료되었습니다 (code=${code}). 앱을 다시 시작해주세요.`
      );
      app.quit();
    }
  });

  await waitForServerReady(nextPort, 30_000);
}

function waitForServerReady(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = net.createConnection(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Next server not ready on :${port} within ${timeoutMs}ms`));
        } else {
          setTimeout(tryConnect, 200);
        }
      });
    };
    tryConnect();
  });
}

// ---------------------------------------------------------------------------
// BrowserWindow
// ---------------------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#0b0d12",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // 외부 링크는 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(`http://127.0.0.1:${nextPort}`);
}

// ---------------------------------------------------------------------------
// 메뉴 (업데이트 확인 항목)
// ---------------------------------------------------------------------------
function buildMenu() {
  const template = [
    {
      label: "파일",
      submenu: [{ role: "quit", label: "종료" }],
    },
    {
      label: "보기",
      submenu: [
        { role: "reload", label: "새로고침" },
        { role: "toggleDevTools", label: "개발자 도구" },
        { type: "separator" },
        { role: "resetZoom", label: "확대 초기화" },
        { role: "zoomIn", label: "확대" },
        { role: "zoomOut", label: "축소" },
      ],
    },
    {
      label: "도움말",
      submenu: [
        {
          label: "업데이트 확인",
          click: () => manualCheckForUpdates(),
        },
        {
          label: "데이터 폴더 열기",
          click: () => shell.openPath(getDataDir()),
        },
        {
          label: "로그 폴더 열기",
          click: () => shell.openPath(getLogDir()),
        },
        { type: "separator" },
        {
          label: `버전 ${app.getVersion()}`,
          enabled: false,
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// 자동 업데이트 (electron-updater + GitHub Releases)
// ---------------------------------------------------------------------------
let updaterLogStream = null;
let manualCheckInProgress = false;

function logUpdater(line) {
  const text = `[updater ${new Date().toISOString()}] ${line}\n`;
  process.stdout.write(text);
  if (!updaterLogStream) {
    updaterLogStream = fs.createWriteStream(
      path.join(getLogDir(), "updater.log"),
      { flags: "a" }
    );
  }
  updaterLogStream.write(text);
}

function setupAutoUpdater() {
  if (isDev) {
    logUpdater("dev mode — auto updater disabled");
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // electron-updater 의 내부 로그도 같은 파일로 흘려보냄
  autoUpdater.logger = {
    info: (m) => logUpdater(`INFO  ${m}`),
    warn: (m) => logUpdater(`WARN  ${m}`),
    error: (m) => logUpdater(`ERROR ${m}`),
    debug: (m) => logUpdater(`DEBUG ${m}`),
  };

  autoUpdater.on("checking-for-update", () => logUpdater("checking-for-update"));
  autoUpdater.on("update-available", (info) =>
    logUpdater(`update-available: ${info.version}`)
  );
  autoUpdater.on("update-not-available", (info) =>
    logUpdater(`update-not-available (current=${app.getVersion()} latest=${info.version})`)
  );
  autoUpdater.on("download-progress", (p) =>
    logUpdater(`download-progress ${Math.round(p.percent)}%`)
  );
  autoUpdater.on("update-downloaded", (info) => {
    logUpdater(`update-downloaded: ${info.version}`);
    dialog
      .showMessageBox({
        type: "info",
        title: "업데이트 준비 완료",
        message: `새 버전 ${info.version} 이 다운로드되었습니다.`,
        detail: "지금 재시작하여 적용하시겠습니까?",
        buttons: ["지금 재시작", "나중에"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          app.isQuiting = true;
          autoUpdater.quitAndInstall();
        }
      });
  });
  autoUpdater.on("error", (err) => {
    logUpdater(`error: ${err && err.stack ? err.stack : err}`);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    logUpdater(`initial check failed: ${err && err.message ? err.message : err}`);
  });
}

/**
 * 메뉴 → "업데이트 확인" 으로 호출. 모든 결과(최신/새버전/실패)를
 * 즉시 다이얼로그로 표시한다 — 사용자가 "동작했는지" 확신할 수 있게.
 */
async function manualCheckForUpdates() {
  if (isDev) {
    dialog.showMessageBox({
      type: "info",
      title: "업데이트 확인",
      message: "개발 모드에서는 자동 업데이트가 비활성화됩니다.",
      detail: "패키지된 빌드(.exe)에서만 동작합니다.",
    });
    return;
  }
  if (manualCheckInProgress) return;
  manualCheckInProgress = true;
  logUpdater(`manual check (current=${app.getVersion()})`);

  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.updateInfo) {
      throw new Error("checkForUpdates 결과가 비어있습니다.");
    }
    const latest = result.updateInfo.version;
    const current = app.getVersion();
    if (latest === current || compareSemver(latest, current) <= 0) {
      await dialog.showMessageBox({
        type: "info",
        title: "업데이트 확인",
        message: "현재 버전이 최신입니다.",
        detail: `현재 버전: ${current}\n저장소 최신: ${latest}`,
      });
    } else {
      // 업데이트가 발견됨 → 백그라운드에서 다운로드가 시작됐음을 알린다.
      // 다운로드 완료 다이얼로그는 "update-downloaded" 핸들러가 별도로 띄움.
      await dialog.showMessageBox({
        type: "info",
        title: "업데이트 발견",
        message: `새 버전 ${latest} 을 다운로드합니다.`,
        detail:
          `현재 버전: ${current}\n새 버전: ${latest}\n\n` +
          "다운로드가 끝나면 재시작 안내 창이 뜹니다.",
      });
    }
  } catch (err) {
    const detail = err && err.stack ? err.stack : String(err);
    logUpdater(`manual check failed: ${detail}`);
    await dialog.showMessageBox({
      type: "error",
      title: "업데이트 확인 실패",
      message: "업데이트 정보를 가져오지 못했습니다.",
      detail:
        `${err && err.message ? err.message : err}\n\n` +
        "GitHub Releases 에 latest.yml 이 업로드돼있는지 확인하세요.\n" +
        "로그: 도움말 → 로그 폴더 열기 → updater.log",
    });
  } finally {
    manualCheckInProgress = false;
  }
}

/** 단순 semver 비교 (prerelease 미고려) — a > b 이면 양수 */
function compareSemver(a, b) {
  const pa = String(a).split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 앱 라이프사이클
// ---------------------------------------------------------------------------
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  app.isQuiting = true;
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  app.isQuiting = true;
  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill();
  }
});

app.whenReady().then(async () => {
  buildMenu();
  try {
    await startNextServer();
    createWindow();
    setupAutoUpdater();
  } catch (err) {
    dialog.showErrorBox(
      "Compass Doc AI 시작 실패",
      err && err.message ? err.message : String(err)
    );
    app.quit();
  }
});
