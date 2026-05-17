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
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Us</h1>
      <p className="mt-3 text-lg text-gray-500">
        不是"你vs我"，是"我们vs问题"
      </p>

      <div className="mt-12 w-full max-w-md">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择判官模式
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode("parenting")}
            className={`rounded-xl border-2 p-4 text-left transition ${
              mode === "parenting"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="font-semibold">育儿模式</div>
            <div className="mt-1 text-sm text-gray-500">
              福尔摩斯 + 德雷克斯 + 芒格
            </div>
          </button>
          <button
            onClick={() => setMode("emotion")}
            className={`rounded-xl border-2 p-4 text-left transition ${
              mode === "emotion"
                ? "border-pink-500 bg-pink-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="font-semibold">情感模式</div>
            <div className="mt-1 text-sm text-gray-500">
              福尔摩斯 + 罗杰斯 + 芒格
            </div>
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? "创建中…" : "开始新的复盘"}
        </button>
      </div>
    </div>
  );
}
