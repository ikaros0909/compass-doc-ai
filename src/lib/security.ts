import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";
import {
  createVault,
  unlockWithPassword,
  unlockWithRecovery,
  rewrapPassword,
  type VaultMeta,
} from "./vault";

/**
 * 오프라인 단일 비밀번호 세션/잠금 관리.
 *   - VaultMeta 는 data/vault.json 에 저장 (DEK 자체는 평문 저장 안 함).
 *   - 잠금 해제 시 DEK 를 서버 프로세스 메모리에만 올린다.
 *   - 일정 시간 미사용 시 자동 잠금(메모리의 DEK 폐기).
 */

const VAULT_FILE = path.join(paths.dataDir, "vault.json");
const IDLE_LOCK_MS = Number(process.env.COMPASS_IDLE_LOCK_MS) || 15 * 60_000;

// 사용 허가용 사용자번호 (라이선스성). 메일 문의 시 발급 — 강한 비밀이 아니라 접근 게이트.
const USER_NUMBER = (process.env.COMPASS_USER_NUMBER || "0220130619").trim();

export function checkUserNumber(n: string | undefined | null): boolean {
  return (n ?? "").trim() === USER_NUMBER;
}

interface SecState {
  dek: Buffer | null;
  lastActivity: number;
}

// HMR/다중 라우트 모듈에서 동일 상태 공유 (db.ts 와 동일 패턴)
const g = globalThis as unknown as { __compassSec?: SecState };
const state = g.__compassSec ?? (g.__compassSec = { dek: null, lastActivity: 0 });

export function isConfigured(): boolean {
  return fs.existsSync(VAULT_FILE);
}

function readMeta(): VaultMeta | null {
  try {
    return JSON.parse(fs.readFileSync(VAULT_FILE, "utf8")) as VaultMeta;
  } catch {
    return null;
  }
}

function writeMeta(meta: VaultMeta) {
  fs.writeFileSync(VAULT_FILE, JSON.stringify(meta, null, 2), { mode: 0o600 });
}

export function isUnlocked(): boolean {
  if (!state.dek) return false;
  if (Date.now() - state.lastActivity > IDLE_LOCK_MS) {
    lock();
    return false;
  }
  return true;
}

export function touch() {
  state.lastActivity = Date.now();
}

export function lock() {
  if (state.dek) state.dek.fill(0);
  state.dek = null;
}

/** 최초 비밀번호 설정 → 복구코드 1회 반환 */
export function setup(
  password: string,
  userNumber: string
): { recoveryCode: string } {
  if (!checkUserNumber(userNumber)) {
    throw new Error("사용자번호가 올바르지 않습니다");
  }
  if (isConfigured()) throw new Error("이미 비밀번호가 설정되어 있습니다");
  if (!password || password.length < 4) {
    throw new Error("비밀번호는 4자 이상이어야 합니다");
  }
  const { meta, dek, recoveryCode } = createVault(password);
  writeMeta(meta);
  state.dek = dek;
  touch();
  return { recoveryCode };
}

export function unlock(password: string, userNumber: string): boolean {
  if (!checkUserNumber(userNumber)) return false;
  const meta = readMeta();
  if (!meta) return false;
  const dek = unlockWithPassword(meta, password);
  if (!dek) return false;
  state.dek = dek;
  touch();
  return true;
}

export function unlockRecovery(code: string, userNumber: string): boolean {
  if (!checkUserNumber(userNumber)) return false;
  const meta = readMeta();
  if (!meta) return false;
  const dek = unlockWithRecovery(meta, code);
  if (!dek) return false;
  state.dek = dek;
  touch();
  return true;
}

export function changePassword(current: string, next: string): boolean {
  const meta = readMeta();
  if (!meta) return false;
  const dek = unlockWithPassword(meta, current);
  if (!dek) return false;
  if (!next || next.length < 4) throw new Error("새 비밀번호는 4자 이상이어야 합니다");
  writeMeta(rewrapPassword(meta, dek, next));
  state.dek = dek;
  touch();
  return true;
}

/** 완전 초기화: 메모리 키 폐기 + vault.json 삭제 → 다음 실행은 미설정 상태 */
export function resetVault() {
  lock();
  try {
    fs.rmSync(VAULT_FILE, { force: true });
  } catch {
    /* 이미 없으면 무시 */
  }
}

/** 데이터 암복호화용 DEK. 잠겨 있으면 throw("LOCKED"). */
export function getDek(): Buffer {
  if (!isUnlocked()) throw new Error("LOCKED");
  touch();
  return state.dek as Buffer;
}

export function status() {
  return {
    configured: isConfigured(),
    unlocked: isUnlocked(),
    idleLockMs: IDLE_LOCK_MS,
  };
}
