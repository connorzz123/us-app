import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

interface ChatMessage {
  id: string;
  sender: "initiator" | "responder" | "judge";
  content: string;
  isIntervention: boolean;
  createdAt: string;
}

interface EndStatus {
  initiatorWantEnd: boolean;
  responderWantEnd: boolean;
}

export default function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") || "initiator";
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [endStatus, setEndStatus] = useState<EndStatus>({ initiatorWantEnd: false, responderWantEnd: false });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.emit("join-room", sessionId);

    async function loadSession() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        setMessages(data.messages || []);
        const s = data.session;
        setEndStatus({
          initiatorWantEnd: s.phase4InitiatorWantsEnd,
          responderWantEnd: s.phase4ResponderWantsEnd,
        });
        if (s.phase === "final") {
          navigate(`/s/${sessionId}/final?role=${role}`);
        }
        setLoadError(false);
      } catch {
        setLoadError(true);
      }
      setLoading(false);
    }

    loadSession();

    socket.on("chat-message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("end-status", (status: EndStatus) => {
      setEndStatus(status);
    });

    socket.on("phase-change", (data: { phase: string }) => {
      if (data.phase === "final") {
        navigate(`/s/${sessionId}/final?role=${role}`);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [sessionId, navigate, role]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current) return;
    socketRef.current.emit("chat-message", {
      sessionId,
      sender: role,
      content: input.trim(),
    });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const myWantEnd = role === "initiator" ? endStatus.initiatorWantEnd : endStatus.responderWantEnd;
  const otherWantEnd = role === "initiator" ? endStatus.responderWantEnd : endStatus.initiatorWantEnd;

  const requestEnd = () => {
    if (!socketRef.current) return;
    socketRef.current.emit(myWantEnd ? "cancel-end" : "request-end", { sessionId, role });
  };

  /* ── Loading ── */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--c-text-secondary)" }}>连接中…</p>
      </div>
    );
  }

  /* ── Error ── */

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="mb-4" style={{ color: "var(--c-danger)" }}>连接失败，请检查网络</p>
        <button
          onClick={() => window.location.reload()}
          className="clay-btn clay-btn-primary px-6 py-3 text-sm"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">

      {/* Header */}
      <div className="clay-card px-4 py-3 mx-3 mt-3"
           style={{ borderRadius: "var(--r-card)", marginBottom: 0 }}>
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: "var(--c-text)" }}>自由对话</h1>
            <p className="text-xs" style={{ color: "var(--c-text-muted)" }}>第四阶段 · 把话说清楚</p>
          </div>
          {otherWantEnd && (
            <span className="badge-warning">对方想结束对话</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-sm py-12" style={{ color: "var(--c-text-muted)" }}>
              帮帮团已经完成了分析。现在请坦诚地交谈吧。
            </p>
          )}
          {messages.map((msg) => {
            const isMine = msg.sender === role;
            const isJudge = msg.sender === "judge";

            if (isJudge) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="chat-bubble-judge max-w-[85%] text-sm">
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] text-sm ${isMine ? "chat-bubble-mine" : "chat-bubble-other"}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <p className={`mt-0.5 text-xs ${
                    isMine ? "opacity-60" : ""
                  }`} style={!isMine ? { color: "var(--c-text-muted)" } : undefined}>
                    {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="px-4 py-3 pb-[env(safe-area-inset-bottom,12px)]">
        <div className="mx-auto max-w-lg">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="说说你想说的话…"
              className="clay-input resize-none min-h-[40px] max-h-[120px]"
              rows={1}
              style={{ flex: 1 }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="clay-btn clay-btn-primary px-3 py-2.5 text-sm shrink-0"
            >
              发送
            </button>
          </div>

          {/* End conversation */}
          <div className="mt-2 text-center">
            <button
              onClick={requestEnd}
              className="text-xs font-medium transition"
              style={{ color: myWantEnd ? "var(--c-warning)" : "var(--c-text-muted)" }}
            >
              {myWantEnd ? "已请求结束（点击取消）" : "我们都讲完了，请帮帮团生成结语"}
            </button>
            {myWantEnd && (
              <span className="ml-2 text-xs" style={{ color: "var(--c-text-muted)" }}>
                {otherWantEnd ? "" : "（1/2）"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
