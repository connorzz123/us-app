import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { createSessionRouter } from "./routes/sessions";
import * as storage from "./storage";
import { generateIntervention, generateFinalReport } from "./judges";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());
app.use("/api/sessions", createSessionRouter(io));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
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
