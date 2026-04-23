# Compass Doc AI — 설치/배포/업데이트 운영 가이드

이 문서는 **개발자가 코드를 수정한 뒤** 새 버전 인스톨러를 만들어 사용자 PC에
자동 배포하기까지의 전 과정을 단계별 명령과 함께 설명합니다.

> 빌드 머신 OS: **Windows 10/11 (x64)** 기준. macOS/Linux 에서도 빌드 가능하지만
> Windows 인스톨러(NSIS) 산출물 검증은 Windows 에서 권장합니다.

---

## 0. 전체 흐름 한눈에 보기

```
[코드 수정]
   │
   ├─(1) 의존성 설치 / 1회성 ··················  npm install
   │
   ├─(2) 로컬 검증 (Electron 셸 + Next dev) ····  npm run dev
   │                                             npm run electron:dev
   │
   ├─(3) 인스톨러 빌드 (.exe 산출) ·············  npm run dist
   │       └─ release/Compass-DocAI-Setup-X.Y.Z.exe
   │
   └─(4) 자동 업데이트 배포 (사용자 PC 갱신)
           ├─ 수동: 태그 푸시 → GitHub Actions
           └─ 자동: electron-updater 가 사용자 PC 에서 latest.yml 폴링
```

---

## 1. 의존성 설치

### 1-1. 사전 준비물

| 항목 | 버전 | 확인 명령 |
| --- | --- | --- |
| Node.js | 20 LTS | `node -v` → `v20.x.x` |
| npm | 10+ | `npm -v` |
| Git | 2.40+ | `git --version` |
| Visual Studio Build Tools | 2022 (Desktop dev with C++) | `where cl` |
| (빌드 머신) Java | **불필요** | `fetch:jre` 가 자동 다운로드 |

> **Visual Studio Build Tools** 가 없으면 `better-sqlite3` 네이티브 모듈
> 컴파일에 실패합니다. 다운로드: <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
> "Desktop development with C++" 워크로드를 선택해 설치하세요.

### 1-2. 의존성 설치 명령

```powershell
# 프로젝트 폴더로 이동
cd d:\DevRoot\Compass_next\compass-doc-ai

# 깨끗한 설치 (lockfile 일치 보장 — CI 와 동일)
npm ci

# 또는 일반 설치 (package.json 갱신 후)
npm install
```

성공하면 `node_modules/` 가 생성되고 다음 패키지들이 설치됩니다.

| 카테고리 | 핵심 패키지 |
| --- | --- |
| 앱 런타임 | `next@15`, `react@19`, `better-sqlite3@11`, `@opendataloader/pdf` |
| 데스크톱 | `electron@33`, `electron-builder@25`, `electron-updater@6` |
| 빌드 보조 | `cross-env`, `typescript`, `tailwindcss` |

### 1-3. 설치 확인

```powershell
npx electron --version       # 33.x
npx electron-builder --version  # 25.x
node -e "require('better-sqlite3')" && echo OK
```

세 명령이 모두 에러 없이 끝나면 환경 준비가 완료된 것입니다.

---

## 2. 로컬 검증

설치본을 만들기 전에 **개발 모드에서 동작을 확인**합니다.
Electron 메인 프로세스(`electron/main.js`)는 `app.isPackaged === false` 일 때
`http://127.0.0.1:3300` 으로 접속하므로, **Next dev 서버가 먼저 떠 있어야 합니다.**

### 2-1. 두 터미널을 동시에 띄우기

**터미널 A — Next.js 개발 서버**
```powershell
npm run dev
# ▲ Next.js 15.x  - Local: http://localhost:3300
```

**터미널 B — Electron 셸**
```powershell
npm run electron:dev
# Electron 창이 열리면서 http://127.0.0.1:3300 을 로드
```

### 2-2. 검증 체크리스트

| 항목 | 확인 방법 |
| --- | --- |
| 창이 정상적으로 열리고 메인 페이지가 보인다 | 빈 흰 화면이 아니면 OK |
| PDF 드래그 앤 드롭 → 큐에 등록 | `data/pdf/` 에 파일 복사됐는지 확인 |
| opendataloader-pdf 변환 성공 | `data/json/` 에 .json 생성 + UI 진행률 100% |
| SQLite 기록 | `data/compass.db` 파일 크기 변화 |
| 메뉴 → 도움말 → 데이터 폴더 열기 | 탐색기가 `data/` 를 연다 |
| 메뉴 → 보기 → 개발자 도구 | DevTools 가 열린다 |

> dev 모드에서는 **데이터가 프로젝트의 `./data/` 에 저장**됩니다.
> 패키지된 설치본은 `%APPDATA%\Compass Doc AI\data\` 를 사용하므로 별개입니다.

### 2-3. 자주 만나는 dev 모드 이슈

| 증상 | 해결 |
| --- | --- |
| `electron:dev` 가 흰 화면에서 멈춤 | 터미널 A 의 `npm run dev` 가 떠있는지 확인 |
| 한글이 □□□ 로 깨짐 | Windows 터미널을 UTF-8 로 설정 (`chcp 65001`) — 앱은 이미 `JAVA_TOOL_OPTIONS` 로 강제 |
| `better-sqlite3` 로드 실패 | Electron 버전 변경 시 `npx electron-rebuild` |
| 포트 3300 이미 사용 중 | 다른 프로세스(`netstat -ano | findstr :3300`)를 끄거나 `package.json` 의 `dev` 포트 변경 |

---

## 3. 인스톨러 빌드 (소스 수정 → .exe 생성)

### 3-1. 버전 번호 올리기 (필수)

`electron-updater` 는 `package.json` 의 `version` 으로 신규 버전을 판별합니다.
**버전을 올리지 않으면 사용자 PC 가 새 빌드를 인식하지 못합니다.**

```powershell
# 패치 (0.1.0 → 0.1.1) — 버그 수정
npm version patch --no-git-tag-version

# 마이너 (0.1.0 → 0.2.0) — 기능 추가
npm version minor --no-git-tag-version

# 메이저 (0.1.0 → 1.0.0) — 호환성 변경
npm version major --no-git-tag-version
```

> `--no-git-tag-version` 옵션은 자동 커밋/태그를 막습니다.
> 태그는 4단계에서 직접 만듭니다.

### 3-2. 한 방에 빌드

```powershell
npm run dist
```

이 명령은 내부적으로 다음 4단계를 순차 실행합니다.

| # | 명령 | 결과물 |
| --- | --- | --- |
| 1 | `next build` | `.next/` (Next 빌드 산출물) |
| 2 | `node scripts/bundle-standalone.mjs` | `.next-standalone/` (server.js + static + public) |
| 3 | `node scripts/fetch-jre.mjs` | `./jre/` (Adoptium Temurin 17, ~50MB) |
| 4 | `electron-builder --win --x64` | `release/Compass Doc AI-Setup-X.Y.Z.exe` |

**빌드 시간**: 첫 빌드 5~10분 (JRE 다운로드 포함), 이후 2~4분.
**산출물 크기**: 인스톨러 약 100~150MB, 설치 후 디스크 사용 약 300MB.

### 3-3. 단계별로 빌드 (디버깅용)

문제가 생기면 단계별로 실행해 어디서 막히는지 확인합니다.

```powershell
# 1. Next 빌드만
npm run build

# 2. standalone 산출물 정리
npm run bundle:standalone
ls .next-standalone

# 3. JRE 다운로드 (이미 받았으면 스킵됨)
npm run fetch:jre
.\jre\bin\java -version    # openjdk version "17.x.x" 표시되면 OK

# 4. Electron 패키징
npx electron-builder --win --x64 -c electron-builder.yml
```

### 3-4. 빌드 검증 (실제 설치 테스트)

```powershell
# 산출물 확인
ls release\

# 인스톨러 실행 (관리자 권한 불필요 — perMachine: false)
.\release\"Compass Doc AI-Setup-0.1.1.exe"
```

설치 후 확인할 것:
1. 시작 메뉴 / 바탕화면에 **Compass Doc AI** 바로가기 생성됨
2. 실행 시 5초 이내 창이 열림
3. PDF 1개 변환 → 정상 완료
4. `%APPDATA%\Compass Doc AI\data\` 에 데이터 저장 확인
5. 도움말 메뉴 → 버전 표시가 새로 올린 버전과 일치

> 검증 끝났으면 인스톨러를 다시 실행해 **제거**하거나, 제어판에서 언인스톨.
> 데이터 폴더(`%APPDATA%\Compass Doc AI\data\`)는 의도적으로 보존됩니다.

---

## 4. 자동 업데이트 활성화 (사용자 PC 무중단 배포)

### 4-1. 한 번만 하는 초기 설정

#### (a) GitHub 저장소 연결

`package.json` 에 `repository` 필드를 추가합니다.

```json
{
  "name": "compass-doc-ai",
  "version": "0.1.1",
  "repository": {
    "type": "git",
    "url": "https://github.com/<owner>/<repo>.git"
  }
}
```

`<owner>/<repo>` 는 실제 GitHub 경로로 교체하세요.
electron-builder 는 이 정보를 읽어 `latest.yml` 에 다운로드 URL 을 기록합니다.

#### (b) 저장소가 private 이면

`electron-builder.yml` 의 publish 설정을 수정합니다.

```yaml
publish:
  - provider: github
    private: true
    releaseType: release
```

그리고 사용자 PC 가 release 자산을 받을 수 있도록 PAT 를 별도 채널로 전달해야
합니다. **public 저장소면 추가 설정 불필요 (권장)**.

#### (c) GitHub Actions 권한 확인

`.github/workflows/release.yml` 가 이미 `contents: write` 권한을 가지고 있어
`GITHUB_TOKEN` 만으로 Releases 에 업로드할 수 있습니다.
조직 차원에서 Actions 가 비활성화돼있다면 Settings → Actions 에서 활성화하세요.

---

### 4-2. 신규 버전 배포 — 표준 절차 (권장)

코드 수정부터 사용자 PC 갱신까지의 전체 흐름.

```powershell
# 1) 코드 수정 + 로컬 검증 완료된 상태라고 가정

# 2) 버전 올리기
npm version patch --no-git-tag-version
#  → package.json: 0.1.1 → 0.1.2

# 3) 변경 사항 커밋
git add package.json package-lock.json src/...
git commit -m "fix: 변환 큐가 빈 PDF 에 멈추는 문제 수정"

# 4) 태그 생성 + 푸시
git tag v0.1.2
git push origin main --tags
```

푸시 직후 GitHub Actions 가 자동으로:
1. windows-latest 러너에서 `npm ci` → `npm run dist:publish` 실행
2. NSIS 인스톨러 + `latest.yml` + 블록맵을 GitHub Releases 의 `v0.1.2` 태그에 업로드
3. 약 8~12분 후 Releases 페이지에서 산출물 확인 가능

확인 URL: `https://github.com/<owner>/<repo>/releases/tag/v0.1.2`

---

### 4-3. 사용자 PC 에서 일어나는 일

설치본이 떠있는 사용자 PC 에서는:

1. **앱 시작 시** electron-updater 가 `https://github.com/<owner>/<repo>/releases/latest/download/latest.yml` 폴링
2. 자기 버전(예: 0.1.1) 보다 높은 버전(0.1.2) 발견 → 백그라운드 다운로드
3. 다운로드 완료 시 다이얼로그:
   ```
   ┌─────────────────────────────┐
   │ 업데이트 준비 완료            │
   │                             │
   │ 새 버전 0.1.2 가 다운로드     │
   │ 되었습니다.                  │
   │ 지금 재시작하여 적용?         │
   │                             │
   │  [지금 재시작]  [나중에]      │
   └─────────────────────────────┘
   ```
4. **나중에** 선택 시 → 다음 앱 종료 시점에 자동 적용 (`autoInstallOnAppQuit`)
5. **지금 재시작** 선택 시 → 즉시 새 버전으로 재기동

> 사용자가 메뉴 → 도움말 → "업데이트 확인" 으로 강제 폴링도 가능합니다.

---

### 4-4. 수동 배포 (CI 없이 로컬에서 직접 publish)

CI 가 막혔거나 긴급 패치가 필요할 때.

```powershell
# GitHub PAT 발급: repo 권한 필요
# https://github.com/settings/tokens?type=beta

$env:GH_TOKEN = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
npm run dist:publish
```

이 명령은 로컬에서 빌드한 산출물을 직접 GitHub Releases 에 업로드합니다.
**같은 버전 태그로 두 번 업로드하지 마세요** — `latest.yml` 의 sha 가 어긋나
사용자 PC 에서 검증 실패가 발생합니다. 실수했다면 Releases 페이지에서 해당
릴리스를 삭제 후 재시도하세요.

---

## 5. 운영 시나리오별 예시

### 5-1. 단순 버그 수정 (코드만 변경)

```powershell
# 코드 수정
code src/lib/converter.ts

# 검증
npm run dev   # 터미널 A
npm run electron:dev   # 터미널 B (PDF 1개 변환 확인)

# 배포
npm version patch --no-git-tag-version
git add -A && git commit -m "fix: opendataloader-pdf 한글 파일명 처리"
git tag v0.1.2 && git push origin main --tags
# → GitHub Actions 가 인스톨러 자동 빌드/배포
```

### 5-2. 의존성 추가 (예: 새 React 컴포넌트 라이브러리)

```powershell
npm install @radix-ui/react-select
# → package.json + package-lock.json 변경됨

# 검증 후
npm version minor --no-git-tag-version
git add -A && git commit -m "feat: 학생부 필터 셀렉터 추가"
git tag v0.2.0 && git push origin main --tags
```

### 5-3. JRE 버전 업그레이드 (17 → 21)

```powershell
# 환경변수로 지정 후 재다운로드
$env:JRE_VERSION = "21"
$env:JRE_FORCE = "1"
npm run fetch:jre

# 동작 확인
.\jre\bin\java -version

# 빌드
npm run dist

# 정상이면 scripts/fetch-jre.mjs 의 default FEATURE_VERSION 도 21 로 변경 후 커밋
```

### 5-4. 핫픽스 — 사용자에게 24시간 내 강제 적용

electron-updater 는 다음 앱 시작 때만 폴링하므로, 즉시 적용을 강제하려면:

1. 위 절차로 새 버전 빌드/배포
2. 사용자에게 "앱을 다시 시작해주세요" 공지 (사내 메신저 등)
3. 또는 `electron-updater` 의 `forceDevUpdateConfig` + 짧은 폴링 주기 코드 추가
   (현재 main.js 는 시작 시 1회만 체크 — 필요 시 `setInterval` 로 주기 폴링 추가)

### 5-5. 롤백 (방금 배포한 버전이 망가졌을 때)

```powershell
# 1) 문제 버전의 GitHub Release 를 "Pre-release" 로 표시 또는 삭제
gh release delete v0.1.2 --yes

# 2) 한 단계 낮은 버전으로 새 패치 배포 (latest.yml 갱신용)
npm version patch --no-git-tag-version    # 0.1.2 → 0.1.3
# 코드는 v0.1.1 시점 상태로 되돌리고 빌드
git revert <문제커밋SHA>
git tag v0.1.3 && git push origin main --tags
```

> **중요**: 절대 같은 버전 번호로 다시 배포하지 마세요. 항상 *앞으로만* 올립니다.

---

## 6. 체크리스트 (배포 전 점검)

- [ ] `package.json` 의 `version` 이 이전 릴리스보다 큰가
- [ ] `npm run electron:dev` 로 핵심 기능(PDF 변환) 동작 확인
- [ ] `npm run dist` 가 에러 없이 종료되고 `release/*.exe` 가 생성됨
- [ ] 인스톨러를 실제로 한 번 설치/실행해 봤는가
- [ ] 변경 사항이 커밋되고 태그(`v*.*.*`)가 푸시됐는가
- [ ] GitHub Actions 빌드가 녹색인가 (`https://github.com/<owner>/<repo>/actions`)
- [ ] Releases 페이지에 `latest.yml` + `*.exe` + `*.exe.blockmap` 3종이 모두 업로드됐는가
- [ ] 테스트 PC에서 자동 업데이트 다이얼로그가 뜨는지 확인

---

## 7. 자주 묻는 질문

**Q. 사용자가 인터넷이 안 되는 환경입니다.**
A. 자동 업데이트는 비활성화하고, USB 등으로 새 인스톨러를 전달해 덮어쓰기 설치하세요.
   덮어쓰기 설치 시 `%APPDATA%\Compass Doc AI\data\` 의 SQLite/PDF/JSON 은 보존됩니다.

**Q. 한 PC 에 두 사용자가 각자 데이터를 가지려면?**
A. `%APPDATA%` 는 Windows 사용자 계정마다 분리됩니다. 별도 설정 불필요.

**Q. 회사 정책상 GitHub 을 못 씁니다.**
A. `electron-builder.yml` 의 `publish` 를 `generic` 으로 바꿔 사내 정적 웹서버
   (예: nginx, S3 호환) 에 `latest.yml` + `*.exe` 를 올리면 됩니다.
   ```yaml
   publish:
     - provider: generic
       url: https://internal.example.com/compass-doc-ai/
   ```

**Q. 코드 서명을 하고 싶습니다.**
A. EV 코드 사인 인증서를 구매한 뒤 `electron-builder.yml` 에 `win.certificateFile`
   과 `win.certificatePassword` 를 추가하세요. SmartScreen 경고가 사라집니다.

**Q. 자동 업데이트가 적용 안 됩니다.**
A. (1) 사용자 PC 의 현재 버전이 GitHub `latest.yml` 의 버전보다 낮은가
   (2) `latest.yml` 의 sha512 가 실제 .exe 와 일치하는가 (재업로드 시 어긋남)
   (3) dev 모드(`!app.isPackaged`)에서는 비활성화됩니다 — 반드시 설치본으로 테스트
   (4) 도움말 → 업데이트 확인 클릭 후 콘솔 로그 확인 (`%APPDATA%\Compass Doc AI\logs\`)

**Q. `npm run dist` 가 `EPERM: operation not permitted, unlink ... better_sqlite3.node` 로 실패합니다.**
A. 누군가가 .node 파일을 잠그고 있다는 뜻입니다. 다음 순서로 해결:
```powershell
# 1) 점유 프로세스 종료 (VSCode 의 TS 서버가 가장 흔한 범인)
taskkill /F /IM node.exe /T 2>$null
taskkill /F /IM electron.exe /T 2>$null
taskkill /F /IM "Compass Doc AI.exe" /T 2>$null

# 2) 잠긴 폴더 통째로 정리
Remove-Item -Recurse -Force node_modules\better-sqlite3
Remove-Item -Recurse -Force release 2>$null

# 3) 재설치 + 재빌드
npm install
npm run rebuild:native
npm run dist
```
이미 `electron-builder.yml` 에 `npmRebuild: false` 가 설정돼 있어 빌드 중 자동
재컴파일이 비활성화돼있고, `dist:prepare` 단계에서만 `electron-rebuild` 가 한
번 실행됩니다. 그래도 반복되면 백신 실시간 검사가 .node 파일을 잡고 있는
경우이므로 프로젝트 폴더를 검사 예외로 등록하세요.
