import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

export default function CreatePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [fact, setFact] = useState("");
  const [feeling, setFeeling] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!fact.trim() || !feeling.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/initiator`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fact: fact.trim(),
          feeling: feeling.trim(),
          isVoiceTranscript: false,
        }),
      });
      if (!res.ok) throw new Error("提交失败");
      navigate(`/s/${sessionId}/waiting`);
    } catch {
      setError("提交失败，请检查网络后重试");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-lg anim-fade-in">

        {/* Header */}
        <div className="mb-10">
          <span className="badge-processing">第一阶段</span>
          <h1 className="mt-3 text-2xl font-bold" style={{ color: "var(--c-text)" }}>
            告诉我们发生了什么
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--c-text-secondary)" }}>
            请从你的角度描述这件事。没有对错，只有你的看到和感受。
          </p>
        </div>

        {/* Form */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--c-text)" }}>
              事实描述
            </label>
            <p className="text-xs mb-2" style={{ color: "var(--c-text-muted)" }}>
              具体发生了什么？时间、关于孩子的什么事、双方做了什么
            </p>
            <textarea
              value={fact}
              onChange={(e) => setFact(e.target.value)}
              placeholder="例如：今天晚饭时，孩子不肯吃青菜，我坚持让孩子至少尝一口，你直接把青菜拿走了…"
              className="clay-input min-h-[130px]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--c-text)" }}>
              感受表达
            </label>
            <p className="text-xs mb-2" style={{ color: "var(--c-text-muted)" }}>
              你的感受是什么？哪个点最让你难受？
            </p>
            <textarea
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
              placeholder="例如：我觉得你总是在孩子面前否定我，让我感觉很孤立…"
              className="clay-input min-h-[130px]"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl p-3 text-sm mt-6 anim-fade-in"
               style={{ background: "var(--c-danger-light)", border: "1px solid rgba(212,134,138,0.3)", color: "#8A5A5C" }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !fact.trim() || !feeling.trim()}
          className="clay-btn clay-btn-primary w-full mt-6 py-4 text-lg"
        >
          {submitting ? "提交中…" : "提交陈述"}
        </button>
      </div>
    </div>
  );
}
