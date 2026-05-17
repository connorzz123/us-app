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
  const otherRole = role === "initiator" ? "responder" : "initiator";

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">连接中…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-red-600 mb-4">连接失败，请检查网络</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">自由对话</h1>
            <p className="text-xs text-gray-400">第四阶段 · 把话说清楚</p>
          </div>
          {otherWantEnd && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              对方想结束对话
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-12">
              帮帮团已经完成了分析。现在请坦诚地交谈吧。
            </p>
          )}
          {messages.map((msg) => {
            const isMine = msg.sender === role;
            const isJudge = msg.sender === "judge";

            if (isJudge) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 max-w-[85%] text-sm text-amber-800">
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    isMine
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-gray-100 text-gray-800 rounded-bl-md"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={`mt-0.5 text-xs ${isMine ? "text-blue-200" : "text-gray-400"}`}>
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
      <div className="border-t border-gray-200 bg-white px-4 py-3 pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto max-w-lg">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="说说你想说的话…"
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-sm resize-none min-h-[40px] max-h-[120px]"
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition shrink-0"
            >
              发送
            </button>
          </div>

          {/* End conversation action */}
          <div className="mt-2 text-center">
            <button
              onClick={requestEnd}
              className={`text-xs font-medium transition ${
                myWantEnd
                  ? "text-amber-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {myWantEnd ? "已请求结束（点击取消）" : "我们都讲完了，请帮帮团生成结语"}
            </button>
            {myWantEnd && (
              <span className="ml-2 text-xs text-gray-400">
                {otherWantEnd ? "" : "（1/2）"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
