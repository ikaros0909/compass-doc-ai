# Compass Doc AI

학생부 PDF를 **Drag & Drop**으로 수백 개 일괄 업로드 → [`opendataloader-pdf`](https://github.com/ikaros0909/opendataloader-pdf)로 **순차 JSON 변환** → 목록/상세 뷰어 제공.

## 스택

- Next.js 15 (App Router) · React 19 · TypeScript
- Tailwind CSS + shadcn/ui 기반 컴포넌트
- `@opendataloader/pdf` (Java 11+ JRE 필요)
- SQLite (better-sqlite3) — 작업 메타데이터
- 로컬 파일시스템 — `./data/pdf`, `./data/json`
- SSE (Server-Sent Events) — 실시간 진행률

## 디렉터리

```
src/
  app/
    page.tsx               # 메인: 업로드 + 큐 뷰
    jobs/[id]/page.tsx     # 상세: JSON 트리 뷰어
    api/
      upload/              # POST — 다중 PDF 업로드
      events/              # GET  — SSE 진행 이벤트
      jobs/                # GET  — 목록/요약/배치
      jobs/[id]/           # GET/DELETE — 상세/삭제
      jobs/[id]/json/      # GET  — JSON 원문 (download)
      jobs/[id]/pdf/       # GET  — 원본 PDF 스트리밍
  components/              # UI (Dropzone, JobQueue, JsonTreeViewer…)
  lib/
    db.ts                  # SQLite 스키마 + jobsRepo
    converter.ts           # @opendataloader/pdf 래퍼 (파일 단위)
    queue.ts               # in-process 순차 워커 + progress ticker
    events.ts              # SSE 이벤트 버스
data/
  pdf/                     # 업로드 원본 (gitignored)
  json/                    # 변환 결과 (gitignored)
  compass.db               # SQLite (gitignored)
```

## 로컬 실행

사전 요구사항:
- **Node.js 20+**
- **Java 11+ JRE** (`@opendataloader/pdf`가 내부에서 호출)
  - Windows: `winget install EclipseAdoptium.Temurin.17.JRE` 또는 `scoop install temurin17-jre`
  - macOS: `brew install --cask temurin@17`
  - Ubuntu: `sudo apt install -y openjdk-17-jre-headless`

```bash
npm install
npm run dev
# → http://localhost:3300
```

## Docker로 실행 (권장 배포 방식)

Docker 이미지에 Java 17 JRE가 포함되어 있어 별도 설치 불필요:

```bash
docker compose up -d --build
# → http://localhost:3300
```

`./data` 폴더가 컨테이너에 마운트되므로 재기동 후에도 업로드/변환 결과와 이력이 유지됩니다.

## 동작 흐름

1. 사용자가 PDF들을 Drop → `POST /api/upload`
2. 파일은 `./data/pdf/{uuid}__{원본명}.pdf`로 저장, `jobs` 테이블에 `queued` 상태로 삽입
3. 인-프로세스 워커(`kickQueue`)가 한 건씩 꺼내 `@opendataloader/pdf` 호출
4. 변환 중 700ms 주기로 진행률(5→90%)을 SSE로 전송해 UI가 실시간 갱신
5. 완료 시 `./data/json/*.json` 경로를 DB에 저장, `/jobs/[id]`에서 트리/원문 확인

## 설계 메모

- **순차 처리 고정**: SDK가 JVM 프로세스를 띄우므로 동시 N건은 메모리 리스크. 1건씩 처리해 투명한 진행 표시에 집중.
- **재시작 복원**: 앱 재시작 시 `processing` 상태였던 작업은 자동으로 `queued`로 리셋.
- **개인정보 보호**: 업로드/변환 결과 모두 로컬 파일시스템 및 사내 인프라 내에만 보존.
- **학생부 필드 파싱**은 의도적으로 1차 범위에서 제외 — 원시 JSON 구조를 그대로 보존해 2차 후처리(인적·출결·교과·세특·행동특성 등)가 자유롭게 얹힐 수 있도록 설계.

## 변환 엔진 / Fallback

`@opendataloader/pdf`(Java 11+)가 사용 가능한 환경에서는 이를 우선 사용해 고품질 구조 JSON을 생성합니다. Java가 없거나 JVM 기동에 실패하면 **`pdfjs-dist` 기반 텍스트 추출 fallback**으로 자동 전환합니다(JSON 페이로드의 `engine: "pdfjs-fallback"` 필드로 구분). Fallback 경로는 좌표 기반 라인 추출만 하므로 테이블 재구성 품질은 떨어집니다 — Docker 배포 환경에서는 반드시 JRE 경로를 타도록 하세요.

## 학생부 파서

`src/lib/studentRecord.ts`가 두 형식(opendataloader 트리, pdfjs fallback)을 모두 소비해 아래 8개 섹션으로 분류합니다:

`인적·학적사항` · `출결상황` · `수상경력` · `자격증 및 인증 취득상황` · `창의적 체험활동상황` · `교과학습발달상황` · `독서활동상황` · `행동특성 및 종합의견`

상세 페이지(`/jobs/[id]`)의 기본 탭이 **학생부 뷰**이며, 메타 정보(학교/발급일/학년·반·번호)를 헤더 카드로 표시합니다.

## 다음 단계로 열어둔 것들

- 섹션별 필드화 (성적 표 → `{학기, 교과, 과목, 단위, 원점수/평균, 성취도, 석차등급}` 행 배열)
- 동시 처리 수 설정(`CONCURRENCY` env)
- 업로드 중복 정책(같은 파일명 스킵/덮어쓰기 토글)
- CSV 일괄 내보내기

---

`@opendataloader/pdf` 라이선스 및 한계는 [상위 저장소](https://github.com/ikaros0909/opendataloader-pdf)를 참고하세요.
