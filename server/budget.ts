import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadJson, saveJson } from "./jsonstore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const BUDGET_PATH = join(DATA_DIR, "budget.json");

export interface BudgetState {
  date: string;
  tokensUsed: number;
  sessionsCreated: number;
  aiCalls: number;
  blocked: number;
}

// 默认按北京时间（UTC+8）跨天重置，可用环境变量覆盖
const TZ_OFFSET = Number(process.env.BUDGET_TZ_OFFSET ?? 8);

/** 单次 AI 调用的保守预估值，用于调用前判断是否还有余量 */
const ESTIMATED_TOKENS_PER_CALL = 2000;

function todayKey(): string {
  const shifted = new Date(Date.now() + TZ_OFFSET * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function emptyState(): BudgetState {
  return { date: todayKey(), tokensUsed: 0, sessionsCreated: 0, aiCalls: 0, blocked: 0 };
}

function load(): BudgetState {
  const s = loadJson<BudgetState>(BUDGET_PATH, emptyState);
  // 跨天自动重置
  if (!s || s.date !== todayKey()) return emptyState();
  return s;
}

function save(s: BudgetState): void {
  saveJson(BUDGET_PATH, s);
}

export function dailyTokenBudget(): number {
  return Number(process.env.DAILY_TOKEN_BUDGET ?? 300000);
}

export function dailySessionLimit(): number {
  return Number(process.env.DAILY_SESSION_LIMIT ?? 20);
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export function getUsage(): BudgetState {
  return load();
}

/** 调用 AI 之前调用：额度不足直接抛错，拦住这次请求 */
export function assertBudgetAvailable(): void {
  const s = load();
  const budget = dailyTokenBudget();
  if (s.tokensUsed + ESTIMATED_TOKENS_PER_CALL > budget) {
    save({ ...s, blocked: s.blocked + 1 });
    throw new BudgetExceededError("budget_exceeded");
  }
}

/** AI 调用成功后记录真实消耗 */
export function recordUsage(inputTokens: number, outputTokens: number): void {
  const s = load();
  save({
    ...s,
    tokensUsed: s.tokensUsed + inputTokens + outputTokens,
    aiCalls: s.aiCalls + 1,
  });
}

/** 创建新 session 之前调用 */
export function canCreateSession(): boolean {
  return load().sessionsCreated < dailySessionLimit();
}

export function recordSession(): void {
  const s = load();
  save({ ...s, sessionsCreated: s.sessionsCreated + 1 });
}
