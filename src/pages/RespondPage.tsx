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

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">正在加入…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中…</p>
      </div>
    );
  }

  if (data.session.phase === "processing") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="animate-spin h-10 w-10 border-4 border-blue-200 border-t-blue-600 rounded-full mb-4" />
        <h1 className="text-xl font-bold">帮帮团正在分析</h1>
        <p className="mt-2 text-gray-500 text-center">
          福尔摩斯和{data.session.mode === "parenting" ? "德雷克斯" : "罗杰斯"}正在阅读伴侣的陈述，请稍候…
        </p>
      </div>
    );
  }

  const statement = data.session.initiatorStatement;

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        {aiError && (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
            帮帮团分析暂时遇到问题，部分分析可能不完整。你可以继续流程。
          </div>
        )}

        <div className="mb-8">
          <span className="text-sm font-medium text-blue-600">伴侣邀请你一起回顾</span>
          <h1 className="mt-2 text-2xl font-bold">听听 Ta 的版本</h1>
        </div>

        {statement && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
            <p className="text-xs font-medium text-gray-400 mb-3">Ta 的原始陈述</p>
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-600">事实：</span>
                <span className="text-gray-700">{statement.fact}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">感受：</span>
                <span className="text-gray-700">{statement.feeling}</span>
              </div>
            </div>
          </div>
        )}

        {data.cards.length > 0 && (
          <div className="space-y-4 mb-6">
            {data.cards.map((card) => (
              <div key={card.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium text-gray-400 mb-2">{card.title}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{card.content}</p>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">你的回应</label>
          <p className="text-xs text-gray-400 mb-2">请针对以上内容，说出你的版本。你可以解释事实，也可以回应Ta的感受和观点。</p>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="说出你的版本，聊聊你的感受…"
            className="w-full rounded-xl border border-gray-300 p-4 text-sm min-h-[120px] resize-y"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 mt-4">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || !response.trim()}
          className="mt-4 w-full rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {submitting ? "提交中…" : "提交回应"}
        </button>
      </div>
    </div>
  );
}
