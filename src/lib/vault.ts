import crypto from "node:crypto";

/**
 * 오프라인 단일 비밀번호 금고(vault) — 엔벨로프 암호화.
 *
 * 설계:
 *   - 랜덤 마스터키(DEK, 32B)로 모든 학생부 데이터(DB 필드·PDF·JSON)를 암호화한다.
 *   - DEK 자체는 디스크에 평문으로 두지 않는다. 비밀번호에서 파생한 키(KEK)로
 *     감싸서(wrap) 저장하고, 잠금 해제 시 비밀번호로 풀어 메모리에만 올린다.
 *   - 복구코드(recovery)로도 같은 DEK를 풀 수 있게 한 벌 더 감싸 둔다 →
 *     비밀번호 분실 시 데이터 복구 가능.
 *
 * 의존성 0: Node 내장 crypto(scrypt + AES-256-GCM)만 사용 → 오프라인 동작.
 */

const KDF = { N: 16384, r: 8, p: 1, keyLen: 32 } as const;
const ALG = "aes-256-gcm";

interface WrappedKey {
  salt: string; // hex (KDF salt)
  iv: string; // hex (GCM nonce)
  tag: string; // hex (GCM auth tag)
  ct: string; // hex (wrapped DEK ciphertext)
}

export interface VaultMeta {
  version: 1;
  kdf: { N: number; r: number; p: number; keyLen: number };
  /** 비밀번호로 푼다 */
  password: WrappedKey;
  /** 복구코드로 푼다 */
  recovery: WrappedKey;
  createdAt: string;
}

function deriveKey(secret: string, saltHex: string): Buffer {
  return crypto.scryptSync(secret.normalize("NFKC"), Buffer.from(saltHex, "hex"), KDF.keyLen, {
    N: KDF.N,
    r: KDF.r,
    p: KDF.p,
    maxmem: 256 * 1024 * 1024,
  });
}

function wrap(dek: Buffer, secret: string): WrappedKey {
  const salt = crypto.randomBytes(16);
  const kek = deriveKey(secret, salt.toString("hex"));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, kek, iv);
  const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ct: ct.toString("hex"),
  };
}

function unwrap(w: WrappedKey, secret: string): Buffer | null {
  try {
    const kek = deriveKey(secret, w.salt);
    const decipher = crypto.createDecipheriv(ALG, kek, Buffer.from(w.iv, "hex"));
    decipher.setAuthTag(Buffer.from(w.tag, "hex"));
    const dek = Buffer.concat([
      decipher.update(Buffer.from(w.ct, "hex")),
      decipher.final(),
    ]);
    return dek.length === KDF.keyLen ? dek : null;
  } catch {
    // GCM 인증 실패 = 잘못된 비밀번호/복구코드
    return null;
  }
}

/** 사람이 받아적기 쉬운 복구코드 (예: ABCD-EFGH-JKLM-NPQR-STUV) */
function generateRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 혼동 글자(0,O,1,I) 제외
  const bytes = crypto.randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i % 4 === 3 && i !== 19) out += "-";
  }
  return out;
}

/** 최초 설정: 비밀번호로 금고 생성. 복구코드는 이 때 1번만 노출해야 한다. */
export function createVault(password: string): {
  meta: VaultMeta;
  dek: Buffer;
  recoveryCode: string;
} {
  const dek = crypto.randomBytes(KDF.keyLen);
  const recoveryCode = generateRecoveryCode();
  const meta: VaultMeta = {
    version: 1,
    kdf: { ...KDF },
    password: wrap(dek, password),
    recovery: wrap(dek, recoveryCode),
    createdAt: new Date().toISOString(),
  };
  return { meta, dek, recoveryCode };
}

/** 비밀번호로 잠금 해제 → DEK (실패 시 null) */
export function unlockWithPassword(meta: VaultMeta, password: string): Buffer | null {
  return unwrap(meta.password, password);
}

/** 복구코드로 잠금 해제 → DEK (실패 시 null) */
export function unlockWithRecovery(meta: VaultMeta, recoveryCode: string): Buffer | null {
  return unwrap(meta.recovery, recoveryCode.trim().toUpperCase());
}

/** 비밀번호 변경: 기존 DEK를 새 비밀번호로 다시 감싼다(데이터 재암호화 불필요). */
export function rewrapPassword(meta: VaultMeta, dek: Buffer, newPassword: string): VaultMeta {
  return { ...meta, password: wrap(dek, newPassword) };
}

// ── 데이터 암호화 (DEK 사용) ───────────────────────────────────────────────
// 형식: [12B IV][16B TAG][CT]  — 단일 Buffer

export function encryptBytes(dek: Buffer, plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, dek, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptBytes(dek: Buffer, blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = crypto.createDecipheriv(ALG, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** DB 필드(문자열) 암호화 → "enc:v1:<base64>" 마커 포함 */
export function encryptField(dek: Buffer, plain: string): string {
  return "enc:v1:" + encryptBytes(dek, Buffer.from(plain, "utf8")).toString("base64");
}

export function decryptField(dek: Buffer, value: string): string {
  if (!value.startsWith("enc:v1:")) return value; // 평문(미마이그레이션) 호환
  const blob = Buffer.from(value.slice("enc:v1:".length), "base64");
  return decryptBytes(dek, blob).toString("utf8");
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("enc:v1:");
}
