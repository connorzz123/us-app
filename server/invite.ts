import { randomBytes } from "crypto";
import * as storage from "./storage";

/**
 * 邀请凭证（invite key）
 *
 * 目的：回应者拿到链接就能直接进入，不必再输一次访问码。
 *
 * 安全设计（重要）：
 * - 邀请凭证**只授权它自己那一份复盘**，不能创建新复盘、也读不了别人的复盘。
 *   所以就算链接被转发出去，被转发者的损失也只是"看到了这一份复盘"，
 *   不会消耗码的额度，也不会拿它去白用整个产品。
 * - 主访问码体系（MASTER_CODE / 粉丝码）完全不受影响，仍然是"进门钥匙"。
 */

export const INVITE_COOKIE = "us_invite";
export const INVITE_MAX_AGE = 7 * 24 * 3600; // 7 天，与访问码 cookie 一致

export function newInviteKey(): string {
  return randomBytes(12).toString("hex"); // 24 位十六进制
}

export function getInviteKey(sessionId: string): string | null {
  const session = storage.getSession(sessionId) as
    | (storage.Session & { inviteKey?: string })
    | undefined;
  const key = session?.inviteKey;
  return key && key.trim() ? key : null;
}

export function makeInviteCookieValue(sessionId: string, key: string): string {
  return `${sessionId}.${key}`;
}

/**
 * 校验邀请 cookie，返回它绑定的 sessionId；无效则返回 null。
 * 每次校验都回数据库核对，所以删掉复盘后邀请凭证立即失效。
 */
export function verifyInviteCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf(".");
  if (idx <= 0) return null;
  const sessionId = raw.slice(0, idx);
  const key = raw.slice(idx + 1);
  const expected = getInviteKey(sessionId);
  if (!expected || expected !== key) return null;
  return sessionId;
}

/** 生成 Set-Cookie 头（HttpOnly，JS 读不到） */
export function inviteCookieHeader(sessionId: string, key: string): string {
  return (
    `${INVITE_COOKIE}=${encodeURIComponent(makeInviteCookieValue(sessionId, key))}; ` +
    `HttpOnly; Path=/; Max-Age=${INVITE_MAX_AGE}; SameSite=Lax`
  );
}
