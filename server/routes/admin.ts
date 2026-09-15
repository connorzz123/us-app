import { Router, Request, Response } from "express";
import { createCode, listCodes, revokeCode, deleteCode } from "../access";
import { getUsage, dailyTokenBudget, dailySessionLimit } from "../budget";

export function createAdminRouter() {
  const router = Router();

  // 访问码列表
  router.get("/codes", (_req: Request, res: Response) => {
    res.json({ codes: listCodes() });
  });

  // 生成新访问码
  router.post("/codes", (req: Request, res: Response) => {
    const { note, days, maxSessions } = req.body ?? {};
    const code = createCode({
      note: typeof note === "string" ? note : "",
      days: Number.isFinite(Number(days)) ? Number(days) : 7,
      maxSessions: Number.isFinite(Number(maxSessions)) ? Number(maxSessions) : 3,
    });
    res.status(201).json(code);
  });

  // 吊销（保留记录，标记为已停用）
  router.post("/codes/:code/revoke", (req: Request, res: Response) => {
    const ok = revokeCode(String(req.params.code));
    res.json({ ok });
  });

  // 彻底删除
  router.delete("/codes/:code", (req: Request, res: Response) => {
    const ok = deleteCode(String(req.params.code));
    res.json({ ok });
  });

  // 今日用量
  router.get("/usage", (_req: Request, res: Response) => {
    const u = getUsage();
    const budget = dailyTokenBudget();
    res.json({
      usage: u,
      budget,
      sessionLimit: dailySessionLimit(),
      remaining: Math.max(0, budget - u.tokensUsed),
      percent: budget > 0 ? Math.min(100, Math.round((u.tokensUsed / budget) * 100)) : 0,
    });
  });

  return router;
}
