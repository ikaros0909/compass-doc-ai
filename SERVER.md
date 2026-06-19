# Compass Doc AI — 백엔드 서버 운영 가이드

이 앱은 두 가지 형태로 배포됩니다.

| 형태 | 진입점 | 사용처 |
| --- | --- | --- |
| Windows 데스크톱 (.exe) | Electron + 동봉 JRE | 단말 PC 단독 실행 |
| **백엔드 웹 서버** | `npm run dev` / `npm start` | **사내 GPU 서버에서 모두가 URL 로 접속** |

이 문서는 두 번째(서버 배포) 시나리오를 설명합니다.
Electron 빌드와 무관하게 **소스 코드만 git pull → npm install → npm start** 로 동작합니다.

---

## 0. 빠른 시작 (5분)

```bash
# 1) GPU 서버에 SSH 접속 후
git clone https://github.com/ikaros0909/compass-doc-ai.git
cd compass-doc-ai

# 2) 의존성 + Java
sudo apt install -y openjdk-17-jre-headless build-essential python3
npm install

# 3) 실행
npm run build
PORT=3300 HOST=0.0.0.0 npm start

# 4) 접속
#   http://<서버-IP>:3300
```

---

## 1. 사전 요구사항

| 항목 | 버전 | 설치 명령 (Ubuntu 22.04 기준) |
| --- | --- | --- |
| Node.js | 20 LTS | `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install nodejs` |
| **Java JRE** | **17+** (필수) | `sudo apt install openjdk-17-jre-headless` |
| 빌드 도구 | gcc, python3 | `sudo apt install build-essential python3` |
| (선택) PM2 | 최신 | `sudo npm i -g pm2` |
| (선택) Nginx | 1.18+ | `sudo apt install nginx` |

> Java 가 없으면 모든 PDF 가 `pdfjs-fallback` 으로만 처리되어 표 인식 품질이 크게 떨어집니다.
> 서버 배포에서는 반드시 JRE 설치하세요. `java -version` 으로 확인.

---

## 2. 코드 가져오기 + 의존성

```bash
git clone https://github.com/ikaros0909/compass-doc-ai.git
cd compass-doc-ai
npm install
```

`better-sqlite3` 가 네이티브 컴파일됩니다 (위 build-essential 필요).
컴파일 실패 시:
```bash
npm rebuild better-sqlite3
```

---

## 3. 실행 모드 — 3가지

### (a) 개발 모드 — 코드 수정 즉시 반영

```bash
PORT=3300 HOST=0.0.0.0 npm run dev
```

- 핫 리로드 활성
- 디버깅/검증용. 운영에는 비추천 (메모리 사용량 큼)

### (b) 운영 모드 — 빌드 후 standalone 서버 (권장 ⭐)

```bash
npm run build
PORT=3300 HOST=0.0.0.0 npm start
```

- 최적화된 production 번들
- 메모리 약 100~200MB
- 멀티 사용자 동시 접속 OK

### (c) 백그라운드 운영 — PM2 로 항상 살아있게

```bash
sudo npm i -g pm2
npm run build
pm2 start npm --name compass-doc-ai \
  --update-env \
  --env PORT=3300 \
  --env HOST=0.0.0.0 \
  --env COMPASS_DATA_DIR=/var/lib/compass-doc-ai \
  -- start

pm2 save
pm2 startup    # 부팅 시 자동 기동 등록
```

PM2 로그 확인: `pm2 logs compass-doc-ai`
재시작: `pm2 restart compass-doc-ai`
중지: `pm2 stop compass-doc-ai`

---

## 4. 환경변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `3300` | 리스닝 포트 |
| `HOST` | `0.0.0.0` | 바인딩 호스트 (외부 접근 허용) |
| `COMPASS_DATA_DIR` | `./data` | SQLite/PDF/JSON 저장 경로 |
| `NODE_ENV` | (next 가 결정) | 운영은 `production` |
| `NEXT_TELEMETRY_DISABLED` | — | `1` 로 설정 권장 |

`.env` 파일로 관리하려면:
```bash
# .env (커밋 금지 — 이미 .gitignore 에 .env*.local 등록됨)
PORT=3300
HOST=0.0.0.0
COMPASS_DATA_DIR=/var/lib/compass-doc-ai
NEXT_TELEMETRY_DISABLED=1
```

PM2 의 `--env` 또는 systemd unit 의 `Environment=` 로도 가능.

---

## 5. 데이터 보관 위치

| 경로 | 내용 |
| --- | --- |
| `$COMPASS_DATA_DIR/pdf/` | 업로드된 원본 PDF |
| `$COMPASS_DATA_DIR/json/` | 변환된 JSON |
| `$COMPASS_DATA_DIR/exports/` | db3 export 산출물 |
| `$COMPASS_DATA_DIR/compass.db` | SQLite (작업 메타) |

**서버 배포 권장**:
```bash
sudo mkdir -p /var/lib/compass-doc-ai
sudo chown -R $USER:$USER /var/lib/compass-doc-ai
export COMPASS_DATA_DIR=/var/lib/compass-doc-ai
```

백업: 위 디렉터리 통째로 tar 하면 끝. SQLite 는 `.backup` 명령 또는 WAL 체크포인트 후 복사.

---

## 6. 접속 — 방화벽/Nginx 리버스 프록시

### 직접 노출 (간단 — 사내망 한정)

```bash
# 우분투 ufw
sudo ufw allow 3300/tcp
```

브라우저: `http://<서버-IP>:3300`

### Nginx 리버스 프록시 (권장 — 도메인 + HTTPS)

```nginx
# /etc/nginx/sites-available/compass-doc-ai
server {
  listen 80;
  server_name compass.intra.example.com;

  client_max_body_size 500M;     # 대용량 PDF 업로드 허용
  proxy_read_timeout 300;        # 변환 시간 여유

  location / {
    proxy_pass http://127.0.0.1:3300;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE (실시간 진행률) 필수 설정
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/compass-doc-ai /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS 추가 (Let's Encrypt):
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d compass.intra.example.com
```

---

## 7. systemd 서비스 (PM2 대신 시스템 서비스)

```ini
# /etc/systemd/system/compass-doc-ai.service
[Unit]
Description=Compass Doc AI
After=network.target

[Service]
Type=simple
User=compass
WorkingDirectory=/opt/compass-doc-ai
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3300
Environment=HOST=0.0.0.0
Environment=COMPASS_DATA_DIR=/var/lib/compass-doc-ai
Environment=NEXT_TELEMETRY_DISABLED=1

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now compass-doc-ai
sudo systemctl status compass-doc-ai
journalctl -u compass-doc-ai -f
```

---

## 8. 코드 업데이트 절차

```bash
cd /opt/compass-doc-ai
git pull origin main
npm install                      # 의존성 변경 시
npm run build                    # 빌드
pm2 restart compass-doc-ai       # 또는 sudo systemctl restart compass-doc-ai
```

업데이트 중 중단 시간을 줄이려면 PM2 의 reload (zero-downtime):
```bash
pm2 reload compass-doc-ai
```

---

## 9. Docker 로 운영 (대안)

레포에 이미 Dockerfile 이 있어 한 명령으로 실행 가능합니다.
```bash
docker compose up -d --build
# → http://localhost:3300 (또는 host port 매핑에 따라)
```

`docker-compose.yml` 의 `volumes` 항목으로 데이터 디렉터리를 호스트와 묶으면 컨테이너 재기동 후에도 데이터 유지.

---

## 10. 모니터링/문제 진단

### 헬스 체크
```bash
curl -f http://127.0.0.1:3300/api/jobs?summary=1 || echo DOWN
```

### Java 동작 확인
```bash
# Node 가 java 를 잡을 수 있는지
which java && java -version
```

### 로그
- PM2: `pm2 logs compass-doc-ai --lines 200`
- systemd: `journalctl -u compass-doc-ai -f`
- Nginx: `/var/log/nginx/access.log`, `error.log`

### 포트 점유 확인
```bash
sudo lsof -i :3300
```

---

## 11. 보안 권고

이 앱은 **인증 기능이 없습니다** (사내망 전용 가정).
공개 인터넷에 노출하려면 다음 중 하나:

1. **Nginx basic auth** 한 줄로 보호:
   ```nginx
   auth_basic "Compass Doc AI";
   auth_basic_user_file /etc/nginx/.htpasswd;
   ```
   ```bash
   sudo apt install apache2-utils
   sudo htpasswd -c /etc/nginx/.htpasswd <username>
   ```

2. **OAuth 프록시** (oauth2-proxy + Google/사내 IdP)

3. **사내 VPN 뒤** 에 두기

업로드되는 학생부 PDF 가 개인정보이므로 절대 공개 인터넷 직노출 금지.

---

## 12. 이미지/스캔 PDF 처리 — opendataloader hybrid 백엔드

데스크톱·서버 모두 동일하게 동작합니다.
앱에서 `COMPASS_HYBRID_URL` 환경변수만 잡아주면 자동으로 hybrid 모드가 활성화되어
이미지 PDF 도 OCR + 표 인식까지 처리됩니다.

### 변환 흐름 (자동)

```
[Compass Doc AI 앱]
   │
   ├─ ① opendataloader-pdf 호출 (hybrid auto 모드)
   │       └─ docling-fast 백엔드가 페이지 단위로 triage:
   │            · 디지털 PDF 페이지 → 빠른 Java 처리
   │            · 복잡한 표 / 이미지 페이지 → Python 백엔드로 라우팅
   │
   ├─ ② 결과가 비어있는가? (이미지 PDF 감지 — 본문 텍스트 < 30자)
   │       └─ Yes → hybrid full 모드로 재시도
   │                 (모든 페이지를 강제로 백엔드로 → OCR 수행)
   │
   └─ ③ 그래도 비면 pdfjs 폴백 (사실상 텍스트 없음 안내)
```

### 백엔드 설치 (Ubuntu/CentOS, 같은 GPU 서버 또는 별도 호스트)

```bash
# Python 3.10+ 필요
sudo apt install -y python3.10 python3.10-venv python3-pip

# 가상환경 권장
python3.10 -m venv ~/venv-opendataloader
source ~/venv-opendataloader/bin/activate

# hybrid 패키지 설치 (docling, tesseract, easyocr 의존성 자동 설치)
pip install -U "opendataloader-pdf[hybrid]"

# (옵션) GPU 가속 — CUDA 12 환경에서 PyTorch GPU 빌드 설치
pip install torch --index-url https://download.pytorch.org/whl/cu121
```

### 백엔드 실행 (포트 5002, 한국어+영어 OCR)

```bash
opendataloader-pdf-hybrid \
  --port 5002 \
  --force-ocr \
  --ocr-lang "ko,en" \
  --host 127.0.0.1
```

**설명**:
- `--force-ocr` — 텍스트 레이어 없는 페이지를 OCR 처리
- `--ocr-lang "ko,en"` — 한국어 + 영어 인식
- `--host 127.0.0.1` — 같은 머신에서만 접근 (다른 머신에서 접근하려면 `0.0.0.0`)
- `--port 5002` — 임의 포트

상시 가동 (PM2):
```bash
pm2 start opendataloader-pdf-hybrid --name odl-hybrid \
  -- --port 5002 --force-ocr --ocr-lang "ko,en"
pm2 save
```

상시 가동 (systemd):
```ini
# /etc/systemd/system/odl-hybrid.service
[Unit]
Description=opendataloader-pdf hybrid backend
After=network.target

[Service]
Type=simple
User=compass
WorkingDirectory=/home/compass
ExecStart=/home/compass/venv-opendataloader/bin/opendataloader-pdf-hybrid \
  --port 5002 --force-ocr --ocr-lang "ko,en" --host 127.0.0.1
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now odl-hybrid
```

### Compass Doc AI 앱에 백엔드 URL 주입

```bash
# .env 또는 PM2/systemd 환경변수
COMPASS_HYBRID_URL=http://127.0.0.1:5002
COMPASS_HYBRID_BACKEND=docling-fast       # 기본값. 다른 백엔드 추가되면 변경.
COMPASS_HYBRID_TIMEOUT_MS=180000          # 기본 180초. 큰 스캔본은 300000+ 권장.
```

PM2 재시작:
```bash
pm2 restart compass-doc-ai --update-env
```

### 동작 검증

```bash
# 백엔드 헬스
curl -fsS http://127.0.0.1:5002/health || echo BACKEND_DOWN

# 앱 헬스
curl -fsS http://127.0.0.1:3300/api/jobs?summary=1
```

이미지 PDF 1장을 업로드하면 [JobItem](src/components/JobItem.tsx) 의 engine 뱃지가
**"opendataloader hybrid + OCR"** 로 표시되면 정상 동작.

### 백엔드를 안 띄울 경우의 동작

`COMPASS_HYBRID_URL` 가 비어있으면 hybrid 모드가 자동으로 비활성화됩니다.
디지털 PDF 는 그대로 Java 엔진으로 처리되고, 이미지 PDF 는 빈 결과가 나옴 + 로그에
`COMPASS_HYBRID_URL 환경변수 미설정` 경고가 떨어집니다. 코드 변경 없이 백엔드만
나중에 추가해도 즉시 활성화됩니다.

---

## 13. 자주 묻는 질문

**Q. Electron 빌드와 충돌하나요?**
A. 아니요. `npm start` (서버) 와 `npm run dist` (Electron) 는 같은 코드 베이스에서
   동시에 운영 가능합니다. 서버에서는 `npm run dist:*` 스크립트만 안 쓰면 됩니다.

**Q. Windows 에서 서버로 띄우고 싶어요.**
A. 똑같이 동작합니다. PowerShell 에서:
   ```powershell
   $env:HOST="0.0.0.0"; $env:PORT="3300"; npm start
   ```
   다만 운영 환경은 Linux 권장 (Java/native module 호환성, PM2 안정성).

**Q. better-sqlite3 가 'NODE_MODULE_VERSION' 오류로 안 됩니다.**
A. 이 머신에서 Electron 용으로 컴파일된 .node 가 남아있을 가능성. 다음 명령으로 정리:
   ```bash
   npm rebuild better-sqlite3
   ```

**Q. 동시 변환 수를 늘리고 싶어요.**
A. 현재는 의도적으로 순차 처리(JVM 메모리 보호). `src/lib/queue.ts` 의 `runLoop`
   을 N-way 풀로 확장 후 환경변수 `CONCURRENCY` 로 제어하는 방식으로 손대시면 됩니다.

**Q. 멀티 인스턴스(여러 Node 프로세스) 로 띄우면 안 되나요?**
A. SQLite + 인-프로세스 SSE 이벤트 버스 구조라 단일 인스턴스 가정입니다.
   부하가 커지면 SQLite → Postgres, EventEmitter → Redis pub/sub 으로 교체 후 가능.
