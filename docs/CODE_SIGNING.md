# 코드 서명 가이드 (Azure Trusted Signing)

Windows 설치 파일에 코드 서명을 적용해 SmartScreen 경고를 없애는 절차다.
이 프로젝트는 **Azure Trusted Signing** 방식을 사용한다(월 약 $10, SmartScreen 즉시 신뢰,
USB 토큰 불필요, CI 자동화 가능).

> **현재 기본 배포는 미서명이다.** 서명은 Azure Trusted Signing 계정 생성 권한
> (구독 Contributor 이상)이 있어야 가능하므로, 아래 절차는 그 권한이 확보됐을 때
> 적용한다. 권한이 없으면 `npm run dist:publish`(미서명)로 배포하면 된다.

> 기본 배포(`npm run dist:publish`)는 **미서명**이라 자격 증명이 필요 없다.
> 서명 빌드는 `npm run dist:signed`(로컬) / `npm run dist:publish:signed`(배포) 에서만 동작한다.
>
> | 스크립트 | 서명 | 업로드 |
> |---|---|---|
> | `npm run dist` | ✗ | ✗ (로컬 release/) |
> | `npm run dist:publish` | ✗ (기본) | ✓ GitHub |
> | `npm run dist:signed` | ✓ | ✗ (로컬 release/) |
> | `npm run dist:publish:signed` | ✓ | ✓ GitHub |

---

## 0. 사전 요건

- 활성 **Azure 구독** (없으면 [portal.azure.com](https://portal.azure.com) 에서 생성)
- **PowerShell 5.1 이상** (Windows 11 기본 탑재) — electron-builder 가 빌드 중
  `TrustedSigning` PowerShell 모듈(0.4.1)을 자동 설치하고 `Invoke-TrustedSigning` 을 호출한다.
- 최초 서명 시 인터넷/PSGallery 접근 필요(모듈 설치 + Azure 호출)

---

## 1. Trusted Signing 계정 + 인증서 프로파일 생성

1. Azure Portal → **Trusted Signing Accounts** 검색 → **Create**
   - Resource group / 이름 / **Region** 지정 (예: East US)
   - Pricing tier: **Basic** (월 약 $9.99)
   - 여기서 정한 **계정 이름**과 **Region** 을 기록해 둔다.
2. 생성된 계정 → **Identity validations** → **New identity validation**
   - **개인 개발자**: *Individual* 선택 → 신분증 등 본인 확인 (승인까지 보통 수 시간~수일)
   - **사업자**: *Organization* 선택 → 사업자 정보 확인
   - 승인되면 검증된 이름(개인은 실명)이 인증서 주체(CN)가 된다.
     → 이 값이 `electron-builder.signing.yml` 의 `publisherName` 이다.
3. 계정 → **Certificate profiles** → **Create**
   - Profile type: **Public Trust**
   - 위에서 승인된 identity validation 을 연결
   - **프로파일 이름**을 기록해 둔다.

---

## 2. 서명 권한용 서비스 주체(앱 등록) 만들기

빌드가 Azure 에 인증할 때 쓸 서비스 주체(service principal)를 만든다.

1. Azure Portal → **Microsoft Entra ID** → **App registrations** → **New registration**
   - 이름 지정(예: `compass-doc-ai-signer`) → 등록
   - **Application (client) ID** 와 **Directory (tenant) ID** 기록
     → 각각 `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`
2. 만든 앱 → **Certificates & secrets** → **New client secret**
   - 만료 기간 지정 후 생성 → **Value** 를 즉시 복사(이후 다시 못 봄)
     → `AZURE_CLIENT_SECRET`
3. 이 서비스 주체에 서명 권한 부여:
   - Trusted Signing 계정(또는 상위 리소스 그룹) → **Access control (IAM)**
     → **Add role assignment**
   - 역할: **Trusted Signing Certificate Profile Signer**
   - 멤버: 위에서 만든 앱(`compass-doc-ai-signer`) 지정 → 저장

---

## 3. 프로젝트 설정값 채우기

### 3-1. `electron-builder.signing.yml` (커밋됨, 비밀 아님)

```yaml
win:
  publisherName: "홍길동"                                   # 1단계에서 승인된 인증서 주체(CN)
  azureSignOptions:
    endpoint: "https://eus.codesigning.azure.net/"          # 계정 Region 에 맞게
    codeSigningAccountName: "compass-signing"               # 1단계 계정 이름
    certificateProfileName: "compass-public-trust"          # 1단계 프로파일 이름
```

엔드포인트는 Region 별로 다르다(예: East US → `eus`, West US 2 → `wus2`,
West Europe → `weu`, North Europe → `neu`). 정확한 값은 Trusted Signing 계정
개요 페이지의 **Account URI** 를 그대로 쓰면 된다.

### 3-2. `.env.local` (커밋 안 됨, 비밀)

`.env.example` 을 복사해 값을 채운다. 이미 `.gitignore` 에 등록돼 있다.

```
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> 시크릿이 노출되면 즉시 Entra ID → 앱 → Certificates & secrets 에서 해당
> client secret 을 삭제(Revoke)하고 새로 발급할 것.

---

## 4. 빌드

```powershell
# 서명된 로컬 빌드 (release/ 폴더에 산출, 업로드 안 함) — 먼저 이걸로 검증 권장
npm run dist:signed

# 서명 + GitHub Releases 업로드 (실제 배포)
npm run dist:publish:signed
```

성공하면 빌드 로그에 `TrustedSigning` 모듈 설치 및 `Invoke-TrustedSigning` 호출이
보이고, 산출된 `Compass Doc AI-Setup.exe` 에 디지털 서명이 붙는다.

---

## 5. 검증

설치 파일에 서명이 제대로 붙었는지 확인:

```powershell
# 서명 상태 확인
Get-AuthenticodeSignature ".\release\Compass Doc AI-Setup.exe" | Format-List

# Status 가 Valid, SignerCertificate 의 Subject 가 publisherName 과 일치해야 함
```

또는 `.exe` 우클릭 → 속성 → **디지털 서명** 탭에서 서명자/타임스탬프 확인.

SmartScreen 동작:
- Trusted Signing(Public Trust)은 **즉시 신뢰**되므로 새 버전이라도 경고가
  뜨지 않는다(평판 누적 대기 불필요).
- 첫 배포 직후 드물게 경고가 보이면 잠시 후 사라진다.

---

## 6. 자동 업데이트(electron-updater)와의 관계

- `win.publisherName` 으로 업데이트 서명을 검증한다(`verifyUpdateCodeSignature`, 기본 켜짐).
- 따라서 **모든 릴리스를 동일한 인증서로 일관되게 서명**해야 한다.
  서명/미서명을 섞으면 기존 사용자의 자동 업데이트가 깨질 수 있다.
- 한 번 정한 `publisherName`(인증서 주체 CN)은 이후 릴리스에서 바꾸지 말 것.

---

## 7. CI(GitHub Actions)에서 서명하기

`.env.local` 대신 리포지토리 Secrets 에 `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` /
`AZURE_CLIENT_SECRET` (+ `GH_TOKEN`)을 등록하고, **windows-latest** 러너에서
`electron-builder --win -c electron-builder.signing.yml --publish always` 를
실행하면 된다(러너 셸 환경변수로 주입되므로 dotenv-cli 불필요).
Linux/macOS 러너에서는 PowerShell 기반 Trusted Signing 서명이 동작하지 않으니
**Windows 러너**를 써야 한다.

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `Unable to find valid azure env field AZURE_TENANT_ID` | `.env.local` 미설정 또는 `dist:signed`/`dist:publish:signed` 가 아닌 미서명 스크립트로 빌드함 |
| `Unable to find valid azure env configuration` | `AZURE_CLIENT_SECRET`(또는 인증서/사용자명) 누락 |
| 서명은 되는데 권한 오류(403) | 2-3 단계의 **Certificate Profile Signer** 역할 할당 누락 또는 전파 지연(수 분 대기) |
| `Install-Module TrustedSigning` 실패 | PSGallery 접근 불가/NuGet 공급자 누락 → `Install-PackageProvider NuGet -Force` 후 재시도 |
| endpoint 관련 오류 | Region 과 엔드포인트 불일치 → 계정 개요의 Account URI 사용 |
