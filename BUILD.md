# Compass Doc AI — Windows 데스크톱 빌드 / 배포

이 앱은 두 가지 형태로 배포됩니다.

| 형태 | 진입점 | 용도 |
| --- | --- | --- |
| Docker (사내 Node 서버) | `docker compose up` | 멀티 사용자 / 사내망 |
| **Windows 설치본 (.exe)** | `Compass-DocAI-Setup-x.y.z.exe` | 단말 PC에서 단독 실행 |

설치본은 다음을 포함합니다:
- Next.js 15 standalone 서버 (`localhost:<랜덤 포트>`)
- 동봉 OpenJDK 17 JRE (Adoptium Temurin) → 사용자 PC에 Java 미설치여도 동작
- SQLite/PDF/JSON 데이터는 `%APPDATA%/Compass Doc AI/data` 에 저장
- electron-updater 를 통해 GitHub Releases 에서 자동 업데이트 수신

---

## 사전 준비

| 항목 | 비고 |
| --- | --- |
| Node.js 20 LTS | `npm` 동반 |
| Git | 소스 클론용 |
| Visual Studio Build Tools (C++) | `better-sqlite3` 네이티브 빌드 |
| (선택) GitHub 토큰 | `dist:publish` 시 `GH_TOKEN` 으로 주입 |

> JDK 는 **빌드 머신에는 필요 없습니다.** `npm run fetch:jre` 가 Adoptium API 에서
> Windows x64 JRE 를 자동으로 받아 `./jre` 에 풀어두고, electron-builder 가
> 설치본 안에 동봉합니다.

---

## 로컬 개발 (Electron 셸 + 기존 Next dev 서버)

```powershell
# 1) 평소처럼 Next dev 띄우기
npm run dev          # http://localhost:3300

# 2) 다른 터미널에서 Electron 창만 띄우기
npm run electron:dev
```

`electron/main.js` 는 `app.isPackaged === false` 일 때 `npm run dev` 가
이미 떠있다고 가정하고 `http://127.0.0.1:3300` 을 로드합니다.

---

## 설치본 만들기

```powershell
# 한 번에:
npm run dist
#   1) next build
#   2) .next/standalone + .next/static + public → .next-standalone/
#   3) Adoptium Temurin 17 JRE 다운로드 → ./jre
#   4) electron-builder --win --x64 → release/Compass-DocAI-Setup-<ver>.exe
```

산출물: `release/Compass-DocAI-Setup-<version>.exe` (NSIS 인스톨러)

> **첫 빌드 시 약 200~300MB**. JRE 50MB, Electron 런타임 80MB, Next 산출물 30MB 정도가 차지합니다.

---

## GitHub Releases 자동 배포 (권장 업데이트 채널)

`electron-updater` 는 `package.json` 의 버전과 GitHub Releases 의 `latest.yml`
을 비교해 자동 업데이트를 수행합니다.

1. `package.json` 의 `version` 을 올리고 커밋.
2. 태그를 푸시:
   ```powershell
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. `.github/workflows/release.yml` 가 windows-latest 러너에서
   `npm run dist:publish` 를 실행 → 인스톨러 + `latest.yml` 을 GitHub Releases 에 업로드.
4. 사용자가 다음에 앱을 실행하면 새 버전이 자동 다운로드되고, 종료/재시작 시 적용됩니다.
   메뉴의 **도움말 → 업데이트 확인** 으로도 즉시 확인 가능.

> 저장소가 private 이면 `electron-builder.yml` 의 `publish` 에 `private: true`
> 를 추가하고, 클라이언트에 PAT 를 별도로 전달해야 합니다. public 저장소면 추가 설정 불필요.

---

## "git pull 식" 패치를 정말 원할 때

운영 정책상 GitHub Releases 자동 업데이트가 가장 안정적이지만, 사내 Git 서버에서
**소스 자체를 끌어오는** 방식이 필요하면 다음 두 가지 추가 옵션이 있습니다.

1. **isomorphic-git 으로 데이터/리소스 파일만 동기화**
   - 코드 변경은 GitHub Releases 로,
   - 학생부 추출 룰/프롬프트/SQL 같은 *데이터성 파일* 만 git 으로 끌어오는 방식.
   - 사용자 PC 에 Git 설치가 필요 없습니다.

2. **portable-git 동봉 + `simple-git` 으로 `git pull`**
   - `extraResources` 에 PortableGit 를 추가 (45MB).
   - 메뉴에 "최신 코드 동기화" 액션을 만들어 `git pull && npm rebuild && next build`
     수행 후 자동 재시작.
   - 사용자 PC 에서 `npm install` 실패 시 복구가 어려우므로 권장하지 않습니다.

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| 첫 실행이 느림 (검은 창 5초+) | Next.js 서버 부팅 대기. 정상. 포트 점유 시 `pickFreePort` 가 다시 잡습니다. |
| `better-sqlite3` 로드 실패 | `electron-builder.yml` 의 `asarUnpack` 항목 유지 필수. |
| Java 미동작 | `process.resourcesPath/jre/bin/java.exe` 존재 확인. `fetch:jre` 재실행. |
| 한글 깨짐 | `JAVA_TOOL_OPTIONS` 가 메인 프로세스에서 주입되는지 확인. |
| 자동 업데이트 미동작 | dev 모드에서는 disabled. 패키지된 빌드 + GitHub Releases 의 `latest.yml` 확인. |
