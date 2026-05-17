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

    // Slow poll as fallback
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
        {isProcessing ? (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
              <div className="animate-spin h-10 w-10 border-4 border-blue-200 border-t-blue-600 rounded-full" />
            </div>
            <h1 className="text-2xl font-bold">帮帮团正在分析</h1>
            <p className="mt-2 text-gray-500">
              福尔摩斯和{getConflictResolverName(sessionData?.session.mode || "parenting")}正在阅读你的陈述，请稍候…
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-blue-600">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold">陈述已提交</h1>
            <p className="mt-2 text-gray-500">
              帮帮团已完成分析。现在邀请你的伴侣加入吧。
            </p>

            {aiError && (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
                帮帮团分析暂时遇到问题，部分分析可能不完整。你可以继续流程，不影响使用。
              </div>
            )}

            <div className="mt-8 rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500 mb-2">邀请链接</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="flex-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600 select-all"
                />
                <button
                  onClick={handleCopy}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
                >
                  {copied ? "已复制" : "复制"}
                </button>
              </div>
            </div>

            {sessionData?.session.responderJoined ? (
              <div className="mt-6">
                <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-sm text-green-700">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  伴侣已加入，正在回应中…
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm text-amber-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                  等待伴侣加入…
                </div>
              </div>
            )}

            {sessionData?.session.initiatorStatement && (
              <div className="mt-8 rounded-xl border border-gray-200 bg-white p-4 text-left">
                <p className="text-xs font-medium text-gray-400 mb-3">你的陈述</p>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">事实：</span>
                    <span className="text-gray-700">{sessionData.session.initiatorStatement.fact}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">感受：</span>
                    <span className="text-gray-700">{sessionData.session.initiatorStatement.feeling}</span>
                  </div>
                </div>
              </div>
            )}

            {sessionData?.cards && sessionData.cards.length > 0 && (
              <div className="mt-8 space-y-4 text-left">
                <p className="text-sm font-medium text-gray-400">帮帮团分析</p>
                {sessionData.cards.map((card) => (
                  <div key={card.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-medium text-gray-400 mb-2">{card.title}</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{card.content}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getConflictResolverName(mode: string) {
  return mode === "parenting" ? "德雷克斯" : "罗杰斯";
}
