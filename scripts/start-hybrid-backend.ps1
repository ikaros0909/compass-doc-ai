# opendataloader hybrid(docling) 백엔드 실행 스크립트 (Windows / 로컬 개발용)
#
# 복잡한 표/이미지 PDF(예: 정부24 학생부)의 표 구조 인식을 위해 docling 백엔드를
# 띄운다. 앱(dev 모드)은 .env.local 의 COMPASS_HYBRID_URL 로 이 백엔드를 사용한다.
#
# 사용:
#   powershell -ExecutionPolicy Bypass -File scripts\start-hybrid-backend.ps1
#
# 사전 준비(최초 1회):
#   py -3.12 -m venv D:\DevRoot\venv-odl-hybrid
#   D:\DevRoot\venv-odl-hybrid\Scripts\python -m pip install -U "opendataloader-pdf[hybrid]"
#
# 설치/연동 전체 안내: docs/CODE_SIGNING.md 가 아니라 SERVER.md 의 12 장 참고.

param(
  # venv 경로(다른 곳에 만들었으면 -VenvDir 로 덮어쓰기)
  [string]$VenvDir = "D:\DevRoot\venv-odl-hybrid",
  [int]$Port = 5002,
  [string]$OcrLang = "ko,en",
  # GPU(CUDA)가 있으면 "cuda" 로 바꾸면 수배 빨라진다.
  [string]$Device = "auto"
)

$ErrorActionPreference = "Stop"

# 콘솔 인코딩(cp949)에서 유니코드 로그 출력 시 크래시 방지
$env:PYTHONIOENCODING = "utf-8"

$exe = Join-Path $VenvDir "Scripts\opendataloader-pdf-hybrid.exe"
if (-not (Test-Path $exe)) {
  Write-Error "백엔드 실행 파일이 없습니다: $exe`n먼저 venv 생성 + 'pip install opendataloader-pdf[hybrid]' 를 하세요 (스크립트 상단 주석 참고)."
  exit 1
}

Write-Host "Starting opendataloader hybrid backend on http://127.0.0.1:$Port (device=$Device, ocr=$OcrLang)" -ForegroundColor Cyan
Write-Host "중지: Ctrl+C / 헬스체크: curl http://127.0.0.1:$Port/health" -ForegroundColor DarkGray

& $exe --host 127.0.0.1 --port $Port --ocr-lang $OcrLang --device $Device --log-level info
