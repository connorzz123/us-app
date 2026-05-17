import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function HomePage() {
  const [mode, setMode] = useState<"parenting" | "emotion">("parenting");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleStart = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("创建失败");
      const session = await res.json();
      navigate(`/s/${session.id}/create`);
    } catch {
      setError("创建会话失败，请检查网络后重试");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      {/* Logo area */}
      <div className="text-center anim-fade-in">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight" style={{ color: "var(--c-text)" }}>
          Us
        </h1>
        <p className="mt-3 text-lg" style={{ color: "var(--c-text-secondary)" }}>
          不是"你vs我"，是"我们vs问题"
        </p>
      </div>

      {/* Mode selector */}
      <div className="mt-14 w-full max-w-md anim-fade-in" style={{ animationDelay: "0.1s", animationFillMode: "both" }}>
        <label className="block text-sm font-medium mb-3" style={{ color: "var(--c-text-secondary)" }}>
          选择帮帮团模式
        </label>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode("parenting")}
            className={`mode-card p-4 text-left ${mode === "parenting" ? "selected" : ""}`}
          >
            <div className="font-semibold text-base" style={{ color: "var(--c-text)" }}>育儿模式</div>
            <div className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
              福尔摩斯 + 德雷克斯 + 芒格
            </div>
          </button>

          <button
            onClick={() => setMode("emotion")}
            className={`mode-card p-4 text-left ${mode === "emotion" ? "selected" : ""}`}
          >
            <div className="font-semibold text-base" style={{ color: "var(--c-text)" }}>情感模式</div>
            <div className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
              福尔摩斯 + 罗杰斯 + 芒格
            </div>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl p-3 text-sm anim-fade-in"
               style={{ background: "var(--c-danger-light)", border: "1px solid rgba(212,134,138,0.3)", color: "#8A5A5C" }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleStart}
          disabled={loading}
          className="clay-btn clay-btn-primary w-full mt-4 py-4 text-lg"
        >
          {loading ? "创建中…" : "开始新的复盘"}
        </button>
      </div>
    </div>
  );
}
