import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const CODES_PATH = join(DATA_DIR, "access-codes.json");

export interface AccessCode {
  code: string;
  note: string;
  createdAt: string;
  expireAt: string | null; // null = 永不过期
  maxSessions: number; // -1 = 不限次
  usedSessions: number;
  revoked: boolean;
  lastUsedAt: string | null;
  lastIp: string | null;
}

interface CodeDB {
  codes: AccessCode[];
}

function load(): CodeDB {
  if (!existsSync(CODES_PATH)) return { codes: [] };
  try {
    const db = JSON.parse(readFileSync(CODES_PATH, "utf-8")) as CodeDB;
    return db && Array.isArray(db.codes) ? db : { codes: [] };
  } catch {
    return { codes: [] };
  }
}

function save(db: CodeDB): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CODES_PATH, JSON.stringify(db, null, 2));
}

// 去掉了 I/O/0/1 等易混淆字符
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomPart(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function newCode(): string {
  return `US-${randomPart(4)}-${randomPart(4)}`;
}

/** 主码：从环境变量读，永不过期、不限次数 */
export function masterCode(): string | null {
  const v = process.env.MASTER_CODE;
  return v && v.trim() ? v.trim() : null;
}

export function createCode(opts: {
  note?: string;
  days?: number;
  maxSessions?: number;
}): AccessCode {
  const db = load();
  let code = newCode();
  while (db.codes.some((c) => c.code === code)) code = newCode();

  const days = opts.days ?? 7;
  const entry: AccessCode = {
    code,
    note: opts.note ?? "",
    createdAt: new Date().toISOString(),
    expireAt: days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    maxSessions: opts.maxSessions ?? 3,
    usedSessions: 0,
    revoked: false,
    lastUsedAt: null,
    lastIp: null,
  };
  db.codes.push(entry);
  save(db);
  return entry;
}

export function listCodes(): AccessCode[] {
  return load().codes;
}

export function revokeCode(code: string): boolean {
  const db = load();
  const target = db.codes.find((c) => c.code.toUpperCase() === code.toUpperCase());
  if (!target) return false;
  target.revoked = true;
  save(db);
  return true;
}

export function deleteCode(code: string): boolean {
  const db = load();
  const before = db.codes.length;
  db.codes = db.codes.filter((c) => c.code.toUpperCase() !== code.toUpperCase());
  if (db.codes.length === before) return false;
  save(db);
  return true;
}

export type VerifyFailure = "not_found" | "expired" | "exhausted" | "revoked";

export type VerifyResult =
  | { ok: true; code: string; note: string; isMaster: boolean }
  | { ok: false; reason: VerifyFailure };

export function verifyCode(
  input: string,
  opts?: { forCreate?: boolean }
): VerifyResult {
  const raw = (input || "").trim().toUpperCase();
  if (!raw) return { ok: false, reason: "not_found" };

  const master = masterCode();
  if (master && raw === master.toUpperCase()) {
    return { ok: true, code: raw, note: "主码", isMaster: true };
  }

  const db = load();
  const target = db.codes.find((c) => c.code.toUpperCase() === raw);
  if (!target) return { ok: false, reason: "not_found" };
  if (target.revoked) return { ok: false, reason: "revoked" };
  if (target.expireAt && Date.parse(target.expireAt) < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  // 次数耗尽只拦截“创建新复盘”，不中断进行中的会话和查看历史
  if (
    opts?.forCreate &&
    target.maxSessions >= 0 &&
    target.usedSessions >= target.maxSessions
  ) {
    return { ok: false, reason: "exhausted" };
  }
  return { ok: true, code: target.code, note: target.note, isMaster: false };
}

/** 每创建一个 session 消耗一次额度（主码不在库里，自动忽略） */
export function consumeCode(code: string, ip?: string): void {
  if (!code) return;
  const db = load();
  const target = db.codes.find((c) => c.code.toUpperCase() === code.toUpperCase());
  if (!target) return;
  target.usedSessions += 1;
  target.lastUsedAt = new Date().toISOString();
  target.lastIp = ip ?? null;
  save(db);
}

export function reasonText(reason: VerifyFailure): string {
  switch (reason) {
    case "expired":
      return "访问码已过期";
    case "exhausted":
      return "访问码次数已用完";
    case "revoked":
      return "访问码已被停用";
    default:
      return "访问码无效";
  }
}

// ── 速率限制：单 IP 每小时内可创建的 session 数 ──

interface RateHit {
  count: number;
  resetAt: number;
}

const rateHits = new Map<string, RateHit>();

export function rateLimitPerIp(): number {
  return Number(process.env.RATE_LIMIT_PER_IP ?? 5);
}

export function withinRateLimit(ip: string): boolean {
  const limit = rateLimitPerIp();
  const now = Date.now();
  const hit = rateHits.get(ip);

  if (!hit || hit.resetAt < now) {
    rateHits.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (hit.count >= limit) return false;
  hit.count += 1;
  return true;
}
