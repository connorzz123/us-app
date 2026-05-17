import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";

interface JudgeCard {
  id: string;
  judge: string;
  title: string;
  content: string;
}

interface SessionData {
  session: {
    id: string;
    mode: string;
    phase: string;
    initiatorStatement: { fact: string; feeling: string; isVoiceTranscript: boolean } | null;
    responderJoined: boolean;
  };
  cards: JudgeCard[];
}

export default function RespondPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SessionData | null>(null);
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [aiError, setAiError] = useState(false);
  const [joined, setJoined] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const join = useCallback(async () => {
    try {
      await fetch(`/api/sessions/${sessionId}/join`, { method: "POST" });
    } catch { /* retry */ }
    setJoined(true);
  }, [sessionId]);

  useEffect(() => {
    join();
  }, [join]);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.emit("join-room", sessionId);

    socket.on("phase-change", (data: { phase: string; error?: string }) => {
      if (data.error === "ai_failed") {
        setAiError(true);
      }
      if (data.phase === "phase2") {
        fetchSession();
      }
      if (data.phase === "phase3") {
        navigate(`/s/${sessionId}/analysis?role=responder`);
      }
    });

    socket.on("cards-updated", () => {
      fetchSession();
    });

    async function fetchSession() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) return;
        const sessionData: SessionData = await res.json();
        setData(sessionData);
        if (sessionData.session.phase === "phase3") {
          navigate(`/s/${sessionId}/analysis?role=responder`);
        }
      } catch { /* retry */ }
    }

    fetchSession();

    const interval = setInterval(fetchSession, 15000);
    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [sessionId, navigate]);

  const handleSubmit = async () => {
    if (!response.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/responder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: response.trim(), isVoiceTranscript: false }),
      });
      if (!res.ok) throw new Error("提交失败");
      navigate(`/s/${sessionId}/analysis?role=responder`);
    } catch {
      setError("提交失败，请检查网络后重试");
      setSubmitting(false);
    }
  };

  /* ── Loading / joining states ── */

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--c-text-secondary)" }}>正在加入…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--c-text-secondary)" }}>加载中…</p>
      </div>
    );
  }

  /* ── Processing state ── */

  if (data.session.phase === "processing") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="spinner mb-6" />
        <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>帮帮团正在分析</h1>
        <p className="mt-2 text-sm text-center" style={{ color: "var(--c-text-secondary)" }}>
          福尔摩斯和{data.session.mode === "parenting" ? "德雷克斯" : "罗杰斯"}正在阅读伴侣的陈述，请稍候…
        </p>
      </div>
    );
  }

  /* ── Main respond view ── */

  const statement = data.session.initiatorStatement;

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-lg anim-fade-in">

        {/* AI error banner */}
        {aiError && (
          <div className="mb-4 rounded-xl p-3 text-sm"
               style={{ background: "var(--c-warning-light)", border: "1px solid rgba(232,201,138,0.3)", color: "#8A7240" }}>
            帮帮团分析暂时遇到问题，部分分析可能不完整。你可以继续流程。
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <span className="badge-processing">伴侣邀请你一起回顾</span>
          <h1 className="mt-3 text-2xl font-bold" style={{ color: "var(--c-text)" }}>听听 Ta 的版本</h1>
        </div>

        {/* Initiator's original statement */}
        {statement && (
          <div className="clay-card p-5 mb-6">
            <p className="text-xs font-medium mb-4" style={{ color: "var(--c-text-muted)" }}>Ta 的原始陈述</p>
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium" style={{ color: "var(--c-text-secondary)" }}>事实：</span>
                <span style={{ color: "var(--c-text)" }}>{statement.fact}</span>
              </div>
              <div>
                <span className="font-medium" style={{ color: "var(--c-text-secondary)" }}>感受：</span>
                <span style={{ color: "var(--c-text)" }}>{statement.feeling}</span>
              </div>
            </div>
          </div>
        )}

        {/* Judge cards (phase 1) */}
        {data.cards.length > 0 && (
          <div className="space-y-4 mb-6">
            {data.cards.map((card) => (
              <div key={card.id} className="clay-card p-5">
                <p className="text-xs font-medium mb-3" style={{ color: "var(--c-text-muted)" }}>{card.title}</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--c-text-secondary)" }}>{card.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Responder input */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--c-text)" }}>你的回应</label>
          <p className="text-xs mb-2" style={{ color: "var(--c-text-muted)" }}>
            请针对以上内容，说出你的版本。你可以解释事实，也可以回应Ta的感受和观点。
          </p>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="说出你的版本，聊聊你的感受…"
            className="clay-input min-h-[130px]"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl p-3 text-sm mb-4 anim-fade-in"
               style={{ background: "var(--c-danger-light)", border: "1px solid rgba(212,134,138,0.3)", color: "#8A5A5C" }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !response.trim()}
          className="clay-btn clay-btn-primary w-full py-4 text-lg"
        >
          {submitting ? "提交中…" : "提交回应"}
        </button>
      </div>
    </div>
  );
}
