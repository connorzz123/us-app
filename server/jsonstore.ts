import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { dirname, join } from "path";

/**
 * JSON 文件读写工具
 *
 * 为什么要专门做一层：
 * `writeFileSync` 是"先清空、再写入"，不是原子操作。当有人正在写、
 * 另一个人同时在读时，读到的可能是**写了一半的残缺文件**；此时 JSON.parse 失败，
 * 如果调用方默默回退成"空数据"，紧接着的写入就会把整份数据抹掉（真实数据丢失）。
 *
 * 两道防线：
 * 1. 写入走"临时文件 + 改名"，rename 是原子的 —— 读到的永远是完整的旧版或完整的新版。
 * 2. 读取失败时回退到"本进程上一次成功读到的内容"，而不是空的，避免覆盖式丢数据。
 */

const lastGood = new Map<string, unknown>();

export function loadJson<T>(filePath: string, fallback: () => T): T {
  if (!existsSync(filePath)) return fallback();
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as T;
    lastGood.set(filePath, parsed);
    return parsed;
  } catch (err) {
    console.error(`[jsonstore] 读取失败，改用上次成功读取的内容：${filePath}`, err);
    const cached = lastGood.get(filePath) as T | undefined;
    return cached !== undefined ? cached : fallback();
  }
}

export function saveJson(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = join(
    dir,
    `.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`
  );
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, filePath);
  } catch (err) {
    console.error(`[jsonstore] 写入失败：${filePath}`, err);
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* 清理临时文件失败可忽略 */
    }
    throw err;
  }
}
