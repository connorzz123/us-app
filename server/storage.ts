import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DB_PATH = join(DATA_DIR, "us.json");

export interface Session {
  id: string;
  mode: "parenting" | "emotion";
  phase: "phase1" | "phase2" | "phase3" | "phase4" | "final" | "processing" | "generating";
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
  if (!existsSync(DB_PATH)) return { sessions: [], cards: [], messages: [] };
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf-8"));
  } catch {
    return { sessions: [], cards: [], messages: [] };
  }
}

function saveDB(db: DB): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
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
