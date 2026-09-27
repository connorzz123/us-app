import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadJson, saveJson } from "./jsonstore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DB_PATH = join(DATA_DIR, "us.json");

export interface Session {
  id: string;
  mode: "parenting" | "emotion";
  phase: "phase1" | "phase2" | "phase3" | "phase4" | "final" | "processing" | "generating";
  /** 邀请凭证：回应者凭它直接进入，无需再输访问码（见 server/invite.ts） */
  inviteKey?: string;
  initiatorStatement: { fact: string; feeling: string; isVoiceTranscript: boolean } | null;
  responderStatement: { response: string; isVoiceTranscript: boolean } | null;
  responderJoined: boolean;
  phase3InitiatorConfirmed: boolean;
  phase3ResponderConfirmed: boolean;
  phase4InitiatorWantsEnd: boolean;
  phase4ResponderWantsEnd: boolean;
  phase4Ended: boolean;
  finalReport: FinalReport | null;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  sessionId: string;
  phase: string;
  judge: "holmes" | "dreikurs" | "rogers" | "munger";
  title: string;
  content: string;
  createdAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  sender: "initiator" | "responder" | "judge";
  judgeRole?: "holmes" | "dreikurs" | "rogers" | "munger";
  content: string;
  isIntervention: boolean;
  createdAt: string;
}

export interface FinalReport {
  holmes: string;
  mungerResponsibility: string;
  conflictCommon: string;
  mungerActions: string;
}

interface DB {
  sessions: Session[];
  cards: Card[];
  messages: Message[];
}

function loadDB(): DB {
  const fallback = (): DB => ({ sessions: [], cards: [], messages: [] });
  const db = loadJson<DB>(DB_PATH, fallback);
  // 形状不对时不要拿去写，否则会把正常数据覆盖掉
  if (!db || !Array.isArray(db.sessions) || !Array.isArray(db.cards) || !Array.isArray(db.messages)) {
    console.error("[storage] 数据文件结构异常，本次按空库处理（不会写回）");
    return fallback();
  }
  return db;
}

function saveDB(db: DB): void {
  saveJson(DB_PATH, db);
}

export function createSession(session: Session): void {
  const db = loadDB();
  db.sessions.push(session);
  saveDB(db);
}

export function getSession(id: string): Session | undefined {
  const db = loadDB();
  return db.sessions.find((s) => s.id === id);
}

/**
 * 彻底删除一份复盘：会话本体 + 它的所有卡片 + 所有对话消息。
 * 这是对用户的隐私承诺——删了就真的没了，不留副本。
 */
export function deleteSession(id: string): boolean {
  const db = loadDB();
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  db.sessions.splice(idx, 1);
  db.cards = db.cards.filter((c) => c.sessionId !== id);
  db.messages = db.messages.filter((m) => m.sessionId !== id);
  saveDB(db);
  return true;
}

export function updateSession(id: string, updates: Partial<Session>): void {
  const db = loadDB();
  const idx = db.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return;
  db.sessions[idx] = { ...db.sessions[idx], ...updates, updatedAt: new Date().toISOString() };
  saveDB(db);
}

export function addCard(card: Card): void {
  const db = loadDB();
  db.cards.push(card);
  saveDB(db);
}

export function getCardsBySession(sessionId: string): Card[] {
  const db = loadDB();
  return db.cards.filter((c) => c.sessionId === sessionId);
}

export function getCardsByPhase(sessionId: string, phase: string): Card[] {
  const db = loadDB();
  return db.cards.filter((c) => c.sessionId === sessionId && c.phase === phase);
}

export function addMessage(message: Message): void {
  const db = loadDB();
  db.messages.push(message);
  saveDB(db);
}

export function getMessagesBySession(sessionId: string): Message[] {
  const db = loadDB();
  return db.messages.filter((m) => m.sessionId === sessionId);
}
