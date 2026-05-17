import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

interface JudgeCard {
  id: string;
  phase: string;
  judge: string;
  title: string;
  content: string;
}

interface SessionData {
  session: {
    id: string;
    mode: string;
    phase: string;
    phase3InitiatorConfirmed: boolean;
    phase3ResponderConfirmed: boolean;
    initiatorStatement: { fact: string; feeling: string } | null;
    responderStatement: { response: string } | null;
  };
  cards: JudgeCard[];
}

export default function AnalysisPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") || "initiator";
  const navigate = useNavigate();
  const [data, setData] = useState<SessionData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [aiError, setAiError] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.emit("join-room", sessionId);

    socket.on("phase-change", (data: { phase: string; error?: string }) => {
      if (data.error === "ai_failed") {
        setAiError(true);
      }
      if (data.phase === "phase3") {
        fetchData();
      }
      if (data.phase === "phase4") {
        navigate(`/s/${sessionId}/chat?role=${role}`);
      }
    });

    socket.on("cards-updated", () => {
      fetchData();
    });

    socket.on("confirm-updated", (status: { initiatorConfirmed: boolean; responderConfirmed: boolean }) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          session: {
            ...prev.session,
            phase3InitiatorConfirmed: status.initiatorConfirmed,
            phase3ResponderConfirmed: status.responderConfirmed,
          },
        };
      });
    });

    async function fetchData() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) return;
        const sessionData: SessionData = await res.json();
        setData(sessionData);
        if (sessionData.session.phase === "phase4") {
          navigate(`/s/${sessionId}/chat?role=${role}`);
        }
      } catch { /* retry */ }
    }

    fetchData();

    const interval = setInterval(fetchData, 15000);
    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [sessionId, navigate, role]);

  const handleConfirm = async () => {
    setConfirming(true);
    setConfirmError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/confirm-phase3`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("确认失败");
    } catch {
      setConfirmError("确认失败，请重试");
      setConfirming(false);
    }
  };

  /* ── Loading ── */

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--c-text-secondary)" }}>加载中…</p>
      </div>
    );
  }

  /* ── Processing ── */

  if (data.session.phase === "processing") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="spinner mb-6" />
        <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>帮帮团正在分析</h1>
        <p className="mt-2 text-sm text-center" style={{ color: "var(--c-text-secondary)" }}>
          福尔摩斯、{data.session.mode === "parenting" ? "德雷克斯" : "罗杰斯"}和芒格正在综合双方陈述，生成分歧分析报告…
        </p>
      </div>
    );
  }

  const phase3Cards = data.cards.filter((c) => c.phase === "phase3");
  const phase2Cards = data.cards.filter((c) => c.phase === "phase2");
  const phase1Cards = data.cards.filter((c) => c.phase === "phase1");

  const initConfirmed = data.session.phase3InitiatorConfirmed;
  const respConfirmed = data.session.phase3ResponderConfirmed;
  const myConfirmed = role === "initiator" ? initConfirmed : respConfirmed;

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-lg anim-fade-in">

        {/* AI error */}
        {aiError && (
          <div className="mb-4 rounded-xl p-3 text-sm"
               style={{ background: "var(--c-warning-light)", border: "1px solid rgba(232,201,138,0.3)", color: "#8A7240" }}>
            帮帮团分析暂时遇到问题，部分分析可能不完整。你可以继续流程。
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <span className="badge-processing">第三阶段</span>
          <h1 className="mt-3 text-2xl font-bold" style={{ color: "var(--c-text)" }}>分歧分析报告</h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--c-text-secondary)" }}>
            帮帮团基于双方的陈述，给出了以下分析。请认真阅读。
          </p>
        </div>

        {/* Statements summary */}
        <div className="clay-card p-5 mb-6">
          <p className="text-xs font-medium mb-3" style={{ color: "var(--c-text-muted)" }}>双方陈述摘要</p>
          {data.session.initiatorStatement && (
            <p className="text-sm mb-2 leading-relaxed" style={{ color: "var(--c-text-secondary)" }}>
              <span className="font-medium" style={{ color: "var(--c-text)" }}>发起人：</span>
              {data.session.initiatorStatement.fact}
            </p>
          )}
          {data.session.responderStatement && (
            <p className="text-sm leading-relaxed" style={{ color: "var(--c-text-secondary)" }}>
              <span className="font-medium" style={{ color: "var(--c-text)" }}>回应者：</span>
              {data.session.responderStatement.response}
            </p>
          )}
        </div>

        {/* Phase 3: Joint analysis cards */}
        <div className="space-y-4 mb-8">
          {phase3Cards.map((card) => (
            <div key={card.id} className="clay-card p-5"
                 style={{ background: "var(--c-primary-light)", borderColor: "var(--c-primary-border)" }}>
              <p className="text-sm font-semibold mb-3" style={{ color: "#5A7DB3" }}>{card.title}</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--c-text-secondary)" }}>{card.content}</p>
            </div>
          ))}
        </div>

        {/* Phase 2 cards */}
        {phase2Cards.length > 0 && (
          <div className="space-y-4 mb-8">
            <p className="text-sm font-medium" style={{ color: "var(--c-text-muted)" }}>回应分析</p>
            {phase2Cards.map((card) => (
              <div key={card.id} className="clay-card p-5">
                <p className="text-xs font-medium mb-3" style={{ color: "var(--c-text-muted)" }}>{card.title}</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--c-text-secondary)" }}>{card.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Phase 1 cards */}
        {phase1Cards.length > 0 && (
          <div className="space-y-4 mb-8">
            <p className="text-sm font-medium" style={{ color: "var(--c-text-muted)" }}>初始分析</p>
            {phase1Cards.map((card) => (
              <div key={card.id} className="clay-card p-5">
                <p className="text-xs font-medium mb-3" style={{ color: "var(--c-text-muted)" }}>{card.title}</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--c-text-secondary)" }}>{card.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Confirmation area */}
        <div className="clay-card p-6 text-center">
          {confirmError && (
            <p className="text-sm mb-3" style={{ color: "var(--c-danger)" }}>{confirmError}</p>
          )}
          <p className="text-sm mb-4" style={{ color: "var(--c-text-secondary)" }}>我已阅读完毕，准备进入对话</p>

          <button
            onClick={handleConfirm}
            disabled={confirming || myConfirmed}
            className={`clay-btn w-full py-3 text-lg ${
              myConfirmed
                ? "clay-btn-secondary"
                : "clay-btn-primary"
            }`}
          >
            {myConfirmed ? "已确认 ✓" : confirming ? "确认中…" : "确认，进入对话"}
          </button>

          <div className="mt-4 flex items-center justify-center gap-6 text-sm" style={{ color: "var(--c-text-muted)" }}>
            <span>发起人：{initConfirmed ? "✓" : "○"}</span>
            <span>回应者：{respConfirmed ? "✓" : "○"}</span>
          </div>

          {!initConfirmed || !respConfirmed ? (
            <p className="mt-3 text-xs" style={{ color: "var(--c-text-muted)" }}>
              需要双方都确认才能进入下一阶段
            </p>
          ) : (
            <p className="mt-3 text-xs font-medium" style={{ color: "var(--c-success)" }}>
              双方已确认，即将进入对话…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
