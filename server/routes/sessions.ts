import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import type { Server } from "socket.io";
import * as storage from "../storage";
import { consumeCode, withinRateLimit } from "../access";
import { canCreateSession, recordSession } from "../budget";
import {
  generatePhase1Cards,
  generatePhase2Cards,
  generatePhase3Cards,
} from "../judges";

export function createSessionRouter(io: Server) {
  const router = Router();

  // Create a new session
  router.post("/", (req: Request, res: Response) => {
    const { mode = "parenting" } = req.body;
    if (mode !== "parenting" && mode !== "emotion") {
      res.status(400).json({ error: "mode must be 'parenting' or 'emotion'" });
      return;
    }

    // 速率限制：单 IP 每小时
    const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
    if (!withinRateLimit(ip)) {
      res.status(429).json({ error: "rate_limited", message: "操作太频繁了，请稍后再试" });
      return;
    }

    // 每日 session 上限
    if (!canCreateSession()) {
      res.status(429).json({ error: "session_limit", message: "今日额度已用完，明天再来吧" });
      return;
    }

    const session: storage.Session = {
      id: uuid(),
      mode,
      phase: "phase1",
      initiatorStatement: null,
      responderStatement: null,
      responderJoined: false,
      phase3InitiatorConfirmed: false,
      phase3ResponderConfirmed: false,
      phase4InitiatorWantsEnd: false,
      phase4ResponderWantsEnd: false,
      phase4Ended: false,
      finalReport: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storage.createSession(session);
    recordSession();
    consumeCode((req as unknown as { accessCode?: string }).accessCode ?? "", ip);
    res.status(201).json(session);
  });

  // Get session by ID
  router.get("/:id", (req: Request, res: Response) => {
    const session = storage.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: "session not found" });
      return;
    }
    const cards = storage.getCardsBySession(session.id);
    const messages = storage.getMessagesBySession(session.id);
    res.json({ session, cards, messages });
  });

  // Update initiator statement (Phase 1)
  router.put("/:id/initiator", async (req: Request, res: Response) => {
    const session = storage.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: "session not found" });
      return;
    }
    const { fact, feeling, isVoiceTranscript } = req.body;
    if (!fact || !feeling) {
      res.status(400).json({ error: "fact and feeling are required" });
      return;
    }

    storage.updateSession(String(req.params.id), {
      initiatorStatement: { fact, feeling, isVoiceTranscript: isVoiceTranscript || false },
      phase: "processing",
    });
    io.to(session.id).emit("phase-change", { phase: "processing" });

    generatePhase1Cards(fact, feeling, session.mode, (done, total) => {
      io.to(session.id).emit("analysis-progress", { done, total });
    })
      .then((cards) => {
        for (const card of cards) {
          storage.addCard({
            ...card,
            id: uuid(),
            sessionId: session.id,
          });
        }
        storage.updateSession(session.id, { phase: "phase2" });
        io.to(session.id).emit("cards-updated", {});
        io.to(session.id).emit("phase-change", { phase: "phase2" });
      })
      .catch((err) => {
        console.error("Phase 1 AI error:", err);
        storage.updateSession(session.id, { phase: "phase2" });
        io.to(session.id).emit("phase-change", { phase: "phase2", error: "ai_failed" });
      });

    res.json(storage.getSession(String(req.params.id)));
  });

  // Mark responder as joined
  router.post("/:id/join", (req: Request, res: Response) => {
    const session = storage.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: "session not found" });
      return;
    }
    storage.updateSession(String(req.params.id), { responderJoined: true });
    io.to(session.id).emit("responder-joined", {});
    res.json({ joined: true });
  });

  // Update responder statement (Phase 2)
  router.put("/:id/responder", async (req: Request, res: Response) => {
    const session = storage.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: "session not found" });
      return;
    }
    const { response, isVoiceTranscript } = req.body;
    if (!response) {
      res.status(400).json({ error: "response is required" });
      return;
    }

    storage.updateSession(String(req.params.id), {
      responderStatement: { response, isVoiceTranscript: isVoiceTranscript || false },
      phase: "processing",
    });
    io.to(session.id).emit("phase-change", { phase: "processing" });

    const init = session.initiatorStatement;
    if (init) {
      // 串行执行：并发调用 DeepSeek 容易触发限流，导致部分卡片返回空内容
      (async () => {
        let done = 0;
        const TOTAL = 5;
        const onProgress = () => {
          done++;
          io.to(session.id).emit("analysis-progress", { done, total: TOTAL });
        };
        const phase2Cards = await generatePhase2Cards(
          init.fact,
          init.feeling,
          response,
          session.mode,
          onProgress
        );
        const phase3Cards = await generatePhase3Cards(
          init.fact,
          init.feeling,
          response,
          session.mode,
          onProgress
        );
        return [...phase2Cards, ...phase3Cards];
      })()
        .then((allCards) => {
          for (const card of allCards) {
            storage.addCard({
              ...card,
              id: uuid(),
              sessionId: session.id,
            });
          }
          storage.updateSession(session.id, { phase: "phase3" });
          io.to(session.id).emit("cards-updated", {});
          io.to(session.id).emit("phase-change", { phase: "phase3" });
        })
        .catch((err) => {
          console.error("Phase 2 AI error:", err);
          storage.updateSession(session.id, { phase: "phase3" });
          io.to(session.id).emit("phase-change", { phase: "phase3", error: "ai_failed" });
        });
    }

    res.json(storage.getSession(String(req.params.id)));
  });

  // Phase 3 confirmation
  router.post("/:id/confirm-phase3", (req: Request, res: Response) => {
    const session = storage.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: "session not found" });
      return;
    }
    const { role } = req.body;
    if (role === "initiator") {
      storage.updateSession(String(req.params.id), { phase3InitiatorConfirmed: true });
    } else if (role === "responder") {
      storage.updateSession(String(req.params.id), { phase3ResponderConfirmed: true });
    } else {
      res.status(400).json({ error: "role must be 'initiator' or 'responder'" });
      return;
    }

    const updated = storage.getSession(String(req.params.id))!;
    io.to(session.id).emit("confirm-updated", {
      initiatorConfirmed: updated.phase3InitiatorConfirmed,
      responderConfirmed: updated.phase3ResponderConfirmed,
    });
    if (updated.phase3InitiatorConfirmed && updated.phase3ResponderConfirmed) {
      storage.updateSession(String(req.params.id), { phase: "phase4" });
      io.to(session.id).emit("phase-change", { phase: "phase4" });
    }
    res.json(updated);
  });

  return router;
}
