import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { createSessionRouter } from "./routes/sessions";
import { createAdminRouter } from "./routes/admin";
import * as storage from "./storage";
import { generateIntervention, generateFinalReport } from "./judges";
import { verifyCode, reasonText } from "./access";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

const COOKIE_NAME = "us_code";
const COOKIE_MAX_AGE = 7 * 24 * 3600; // 7 天

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** 优先读请求头（方便脚本/调试），其次读 cookie（浏览器自动带） */
function readAccessCode(req: express.Request): string {
  const fromHeader = req.header("X-Access-Code");
  if (fromHeader) return fromHeader;
  return parseCookies(req.header("cookie"))[COOKIE_NAME] || "";
}

// ── 探活：必须放在 SPA fallback 之前，否则会被 index.html 吃掉 ──
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── 访问码验证 ──
app.post("/api/auth/verify", (req, res) => {
  const code = (req.body?.code as string) || "";
  // 耗尽的码也允许登录（可继续进行中的会话、查看历史），只提示额度状态
  const result = verifyCode(code);
  if (!result.ok) {
    res.status(401).json({ ok: false, message: reasonText(result.reason) });
    return;
  }
  const createCheck = verifyCode(code, { forCreate: true });
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(result.code)}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`
  );
  res.json({
    ok: true,
    code: result.code,
    note: createCheck.ok ? result.note : `${result.note}（新增复盘额度已用完，仍可继续/查看）`,
    isMaster: result.isMaster,
    canCreate: createCheck.ok,
  });
});

// ── 当前登录状态（前端用它判断要不要弹输入框）──
app.get("/api/auth/status", (req, res) => {
  const result = verifyCode(readAccessCode(req));
  res.json({
    ok: result.ok,
    note: result.ok ? result.note : null,
    isMaster: result.ok ? result.isMaster : false,
  });
});

// ── Admin 后台：ADMIN_KEY 保护 ──
const ADMIN_KEY = process.env.ADMIN_KEY || "";
app.use("/api/admin", (req, res, next) => {
  if (!ADMIN_KEY) {
    res.status(503).json({ error: "admin_not_configured" });
    return;
  }
  if (req.header("X-Admin-Key") !== ADMIN_KEY) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
});
app.use("/api/admin", createAdminRouter());

// ── 业务接口：访问码保护 ──
app.use("/api/sessions", (req, res, next) => {
  const code = readAccessCode(req);
  // 只有“创建新复盘”（POST /api/sessions）才检查次数是否耗尽，
  // 进行中的会话和历史查看不因次数用完被中断
  const forCreate = req.method === "POST" && req.path === "/";
  const result = verifyCode(code, { forCreate });
  if (!result.ok) {
    res.status(401).json({ error: "unauthorized", message: reasonText(result.reason) });
    return;
  }
  (req as unknown as { accessCode: string }).accessCode = result.code;
  next();
});
app.use("/api/sessions", createSessionRouter(io));

// ── 静态前端 ──
const distPath = join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("/{*path}", (_req, res) => {
  res.sendFile(join(distPath, "index.html"));
});

// ── Socket.IO 连接鉴权 ──
io.use((socket, next) => {
  const authCode = (socket.handshake.auth?.code as string) || "";
  const cookieCode = parseCookies(socket.handshake.headers?.cookie)[COOKIE_NAME] || "";
  const code = authCode || cookieCode;
  const result = verifyCode(code);
  if (!result.ok) {
    next(new Error("unauthorized"));
    return;
  }
  (socket as unknown as { accessCode: string }).accessCode = result.code;
  next();
});

// ── Socket.IO: Phase 4 chat ──

const interventionCounts = new Map<string, number>();

io.on("connection", (socket) => {
  socket.on("join-room", (sessionId: string) => {
    socket.join(sessionId);
  });

  socket.on("chat-message", (data: { sessionId: string; sender: "initiator" | "responder"; content: string }) => {
    const { sessionId, sender, content } = data;
    const session = storage.getSession(sessionId);
    if (!session || session.phase !== "phase4") return;

    const message: storage.Message = {
      id: uuid(),
      sessionId,
      sender,
      content,
      isIntervention: false,
      createdAt: new Date().toISOString(),
    };
    storage.addMessage(message);

    io.to(sessionId).emit("chat-message", message);

    // Check for judge intervention every ~3 messages
    const count = (interventionCounts.get(sessionId) || 0) + 1;
    interventionCounts.set(sessionId, count);

    if (count % 3 === 0) {
      const messages = storage.getMessagesBySession(sessionId);
      const context = messages
        .filter((m) => !m.isIntervention)
        .map((m) => `${m.sender === "initiator" ? "发起人" : "回应者"}：${m.content}`)
        .join("\n");

      generateIntervention(context, session.mode).then((intervention) => {
        if (intervention.includes("不需要干预") || intervention.includes("继续")) return;

        const judgeMsg: storage.Message = {
          id: uuid(),
          sessionId,
          sender: "judge",
          content: `💡 ${intervention}`,
          isIntervention: true,
          createdAt: new Date().toISOString(),
        };
        storage.addMessage(judgeMsg);
        io.to(sessionId).emit("chat-message", judgeMsg);
      });
    }
  });

  socket.on("request-end", (data: { sessionId: string; role: "initiator" | "responder" }) => {
    const { sessionId, role } = data;
    const session = storage.getSession(sessionId);
    if (!session) return;

    if (role === "initiator") {
      storage.updateSession(sessionId, { phase4InitiatorWantsEnd: true });
    } else {
      storage.updateSession(sessionId, { phase4ResponderWantsEnd: true });
    }

    const updated = storage.getSession(sessionId)!;
    io.to(sessionId).emit("end-status", {
      initiatorWantEnd: updated.phase4InitiatorWantsEnd,
      responderWantEnd: updated.phase4ResponderWantsEnd,
    });

    if (updated.phase4InitiatorWantsEnd && updated.phase4ResponderWantsEnd) {
      storage.updateSession(sessionId, { phase4Ended: true, phase: "generating" });
      io.to(sessionId).emit("end-status", {
        initiatorWantEnd: true,
        responderWantEnd: true,
      });

      const init = session.initiatorStatement;
      const resp = session.responderStatement;
      const msgs = storage.getMessagesBySession(sessionId);
      const chatText = msgs
        .filter((m) => !m.isIntervention)
        .map((m) => `${m.sender === "initiator" ? "发起人" : "回应者"}：${m.content}`)
        .join("\n");

      if (init && resp) {
        generateFinalReport(init.fact, init.feeling, resp.response, chatText, session.mode)
          .then((report) => {
            storage.updateSession(sessionId, { finalReport: report, phase: "final" });
            io.to(sessionId).emit("phase-change", { phase: "final" });
          })
          .catch((err) => {
            console.error("Final report generation error:", err);
            storage.updateSession(sessionId, { phase: "final" });
            io.to(sessionId).emit("phase-change", { phase: "final" });
          });
      } else {
        storage.updateSession(sessionId, { phase: "final" });
        io.to(sessionId).emit("phase-change", { phase: "final" });
      }
    }
  });

  socket.on("cancel-end", (data: { sessionId: string; role: "initiator" | "responder" }) => {
    const { sessionId, role } = data;
    const session = storage.getSession(sessionId);
    if (!session) return;

    if (role === "initiator") {
      storage.updateSession(sessionId, { phase4InitiatorWantsEnd: false });
    } else {
      storage.updateSession(sessionId, { phase4ResponderWantsEnd: false });
    }

    const updated = storage.getSession(sessionId)!;
    io.to(sessionId).emit("end-status", {
      initiatorWantEnd: updated.phase4InitiatorWantsEnd,
      responderWantEnd: updated.phase4ResponderWantsEnd,
    });
  });
});

const PORT = 3001;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Us server running on http://localhost:${PORT}`);
});
