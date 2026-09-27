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
import { INVITE_COOKIE, verifyInviteCookie, getInviteKey } from "./invite";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import os from "os";

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

// ── 局域网地址：手机上打开 localhost 是访问手机自己，邀请链接必须换成局域网 IP ──
app.get("/api/network-info", (_req, res) => {
  const nets = os.networkInterfaces();
  let lanIp: string | null = null;
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        lanIp = net.address;
        break;
      }
    }
    if (lanIp) break;
  }
  res.json({ lanIp, port: 3001 });
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
  if (result.ok) {
    res.json({
      ok: true,
      note: result.note,
      isMaster: result.isMaster,
      invite: false,
      inviteSessionId: null,
    });
    return;
  }
  // 只持邀请凭证的人**不算"已登录"**：邀请凭证只对那一份复盘有效，
  // 首页等其它页面仍应回到访问码门。这里把绑定的会话 id 交给前端，
  // 由前端只放行 /s/<该会话>... 的页面。
  const inviteSessionId = verifyInviteCookie(
    parseCookies(req.header("cookie"))[INVITE_COOKIE]
  );
  res.json({
    ok: false,
    note: null,
    isMaster: false,
    invite: Boolean(inviteSessionId),
    inviteSessionId: inviteSessionId ?? null,
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

  // 邀请链接的入口：回应者带 k 调 /join，用它换取邀请 cookie。
  // 这一步必须放行——否则回应者连"证明自己收到链接"的机会都没有。
  // 只有 k 与目标会话的邀请凭证完全一致才放行，之后由 join 路由下发 cookie。
  const joinMatch = req.method === "POST" ? /^\/([^/]+)\/join$/.exec(req.path) : null;
  if (joinMatch) {
    const k = typeof req.body?.k === "string" ? req.body.k.trim() : "";
    const expected = getInviteKey(joinMatch[1]);
    if (k && expected && k === expected) {
      next();
      return;
    }
  }

  const result = verifyCode(code, { forCreate });
  if (result.ok) {
    (req as unknown as { accessCode: string }).accessCode = result.code;
    next();
    return;
  }

  // 已持有邀请 cookie 的回应者：不必再输访问码。
  // 但只放行「它自己那一份复盘」的读写，且永远不能创建新复盘——
  // 这样即使链接被转发，也不会消耗码的额度或被人拿去白用产品。
  const inviteSessionId = verifyInviteCookie(
    parseCookies(req.header("cookie"))[INVITE_COOKIE]
  );
  if (inviteSessionId && !forCreate) {
    const target = req.path.split("/")[1] ?? "";
    if (target && target === inviteSessionId) {
      (req as unknown as { accessCode: string }).accessCode = "";
      (req as unknown as { inviteSessionId: string }).inviteSessionId = inviteSessionId;
      next();
      return;
    }
  }

  res.status(401).json({ error: "unauthorized", message: reasonText(result.reason) });
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
  const cookies = parseCookies(socket.handshake.headers?.cookie);
  const code = authCode || cookies[COOKIE_NAME] || "";
  const result = verifyCode(code);
  if (result.ok) {
    (socket as unknown as { accessCode: string }).accessCode = result.code;
    next();
    return;
  }
  // 回应者走邀请 cookie：只允许在它自己那一份复盘里收发
  const inviteSessionId = verifyInviteCookie(cookies[INVITE_COOKIE]);
  if (inviteSessionId) {
    (socket as unknown as { inviteSessionId: string }).inviteSessionId = inviteSessionId;
    next();
    return;
  }
  next(new Error("unauthorized"));
});

// ── Socket.IO: Phase 4 chat ──

const interventionCounts = new Map<string, number>();

io.on("connection", (socket) => {
  const inviteOnly = (socket as unknown as { inviteSessionId?: string }).inviteSessionId;

  socket.on("join-room", (sessionId: string) => {
    // 邀请用户只能进自己那一间（别人的复盘读不到）
    if (inviteOnly && sessionId !== inviteOnly) return;
    socket.join(sessionId);
  });

  socket.on("chat-message", (data: { sessionId: string; sender: "initiator" | "responder"; content: string }) => {
    const { sessionId, sender, content } = data;
    if (inviteOnly && sessionId !== inviteOnly) return;
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
        // 生成期间无反馈会让用户以为卡死，先推一次进度让等待界面立刻亮起来
        io.to(sessionId).emit("report-progress", { done: 0, total: 4 });

        generateFinalReport(init.fact, init.feeling, resp.response, chatText, session.mode, (done, total) => {
          io.to(sessionId).emit("report-progress", { done, total });
        })
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

// ⚠️ 2026-09-27 回滚说明：
// 曾改为 Number(process.env.PORT) || 3001（Render 官方推荐做法），
// 但该改动会让 Render 检测到"主端口变更"，触发路由重建，
// 而重建失败导致服务完全不可达（响应头 x-render-routing: no-server）。
// Render 会自动扫描实例的开放端口，保持监听 3001 即为历史可用状态。
const PORT = 3001;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Us server running on http://localhost:${PORT}`);
});
