import { useEffect, useState, useRef } from "react";
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

export default function WaitingPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [aiError, setAiError] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const inviteLink = `${window.location.origin}/s/${sessionId}`;

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.emit("join-room", sessionId);

    socket.on("phase-change", (data: { phase: string; error?: string }) => {
      if (data.error === "ai_failed") {
        setAiError(true);
      }
      if (data.phase === "phase2" || data.phase === "phase3") {
        fetchSession();
      }
      if (data.phase === "phase3") {
        navigate(`/s/${sessionId}/analysis?role=initiator`);
      }
    });

    socket.on("responder-joined", () => {
      fetchSession();
    });

    socket.on("cards-updated", () => {
      fetchSession();
    });

    async function fetchSession() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) return;
        const data: SessionData = await res.json();
        setSessionData(data);
        if (data.session.phase === "phase3") {
          navigate(`/s/${sessionId}/analysis?role=initiator`);
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      const el = document.createElement("textarea");
      el.value = inviteLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const phase = sessionData?.session.phase;
  const isProcessing = phase === "processing";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">

        {/* Processing state */}
        {isProcessing ? (
          <div className="anim-fade-in">
            <div className="mx-auto mb-8 flex items-center justify-center">
              <div className="spinner" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--c-text)" }}>帮帮团正在分析</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--c-text-secondary)" }}>
              福尔摩斯和{getConflictResolverName(sessionData?.session.mode || "parenting")}正在阅读你的陈述，请稍候…
            </p>
          </div>
        ) : (
          <div className="anim-fade-in">

            {/* Success icon */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
                 style={{ background: "var(--c-success-light)" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" className="anim-fade-in"
                   style={{ color: "var(--c-success)" }}>
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold" style={{ color: "var(--c-text)" }}>陈述已提交</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--c-text-secondary)" }}>
              帮帮团已完成分析。现在邀请你的伴侣加入吧。
            </p>

            {/* AI error */}
            {aiError && (
              <div className="mt-4 rounded-xl p-3 text-sm"
                   style={{ background: "var(--c-warning-light)", border: "1px solid rgba(232,201,138,0.3)", color: "#8A7240" }}>
                帮帮团分析暂时遇到问题，部分分析可能不完整。你可以继续流程，不影响使用。
              </div>
            )}

            {/* Invite link */}
            <div className="clay-card mt-8 p-5 text-left">
              <p className="text-xs font-medium mb-2" style={{ color: "var(--c-text-muted)" }}>邀请链接</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="clay-input flex-1 text-sm py-2"
                />
                <button
                  onClick={handleCopy}
                  className="clay-btn clay-btn-primary px-4 py-2 text-sm shrink-0"
                >
                  {copied ? "已复制" : "复制"}
                </button>
              </div>
            </div>

            {/* Responder status */}
            <div className="mt-6">
              {sessionData?.session.responderJoined ? (
                <span className="badge-success inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--c-success)" }} />
                  伴侣已加入，正在回应中…
                </span>
              ) : (
                <span className="badge-warning inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full anim-pulse-soft" style={{ background: "var(--c-warning)" }} />
                  等待伴侣加入…
                </span>
              )}
            </div>

            {/* Your statement */}
            {sessionData?.session.initiatorStatement && (
              <div className="clay-card mt-8 p-5 text-left">
                <p className="text-xs font-medium mb-4" style={{ color: "var(--c-text-muted)" }}>你的陈述</p>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium" style={{ color: "var(--c-text-secondary)" }}>事实：</span>
                    <span style={{ color: "var(--c-text)" }}>{sessionData.session.initiatorStatement.fact}</span>
                  </div>
                  <div>
                    <span className="font-medium" style={{ color: "var(--c-text-secondary)" }}>感受：</span>
                    <span style={{ color: "var(--c-text)" }}>{sessionData.session.initiatorStatement.feeling}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Judge cards */}
            {sessionData?.cards && sessionData.cards.length > 0 && (
              <div className="mt-8 space-y-4 text-left">
                <p className="text-sm font-medium" style={{ color: "var(--c-text-muted)" }}>帮帮团分析</p>
                {sessionData.cards.map((card) => (
                  <div key={card.id} className="clay-card p-5">
                    <p className="text-xs font-medium mb-3" style={{ color: "var(--c-text-muted)" }}>{card.title}</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--c-text-secondary)" }}>{card.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getConflictResolverName(mode: string) {
  return mode === "parenting" ? "德雷克斯" : "罗杰斯";
}
