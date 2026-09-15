import { useState } from "react";

interface GateProps {
  onVerified: () => void;
}

export default function Gate({ onVerified }: GateProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "访问码无效");
        setLoading(false);
        return;
      }
      onVerified();
    } catch {
      setError("网络异常，请稍后重试");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center anim-fade-in">
        <h1 className="text-5xl font-bold tracking-tight" style={{ color: "var(--c-text)" }}>
          Us
        </h1>
        <p className="mt-3 text-lg" style={{ color: "var(--c-text-secondary)" }}>
          不是"你vs我"，是"我们vs问题"
        </p>

        <div className="clay-card mt-10 p-6 text-left">
          <label className="block text-sm font-medium mb-3" style={{ color: "var(--c-text-secondary)" }}>
            请输入访问码
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder="US-XXXX-XXXX"
            autoFocus
            className="w-full rounded-xl px-4 py-3 text-base outline-none"
            style={{
              background: "var(--c-bg)",
              border: "1px solid var(--c-border)",
              color: "var(--c-text)",
            }}
          />

          {error && (
            <div
              className="mt-3 rounded-xl p-3 text-sm anim-fade-in"
              style={{
                background: "var(--c-danger-light)",
                border: "1px solid rgba(212,134,138,0.3)",
                color: "#8A5A5C",
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={loading || !code.trim()}
            className="clay-btn clay-btn-primary w-full mt-4 py-3.5 text-base"
          >
            {loading ? "验证中…" : "进入"}
          </button>

          <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
            访问码由管理员发放。首次打开若长时间加载，是服务器在唤醒，请耐心等待。
          </p>
        </div>
      </div>
    </div>
  );
}
