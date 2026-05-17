import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import VoiceInput from "../components/VoiceInput";

export default function CreatePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [fact, setFact] = useState("");
  const [feeling, setFeeling] = useState("");
  const [factVoice, setFactVoice] = useState(false);
  const [feelingVoice, setFeelingVoice] = useState(false);
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
          isVoiceTranscript: factVoice || feelingVoice,
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
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8">
          <span className="text-sm font-medium text-blue-600">第一阶段</span>
          <h1 className="mt-2 text-2xl font-bold">告诉我们发生了什么</h1>
          <p className="mt-1 text-gray-500">
            请从你的角度描述这件事。没有对错，只有你的看到和感受。
          </p>
        </div>

        <div className="space-y-6">
          <VoiceInput
            value={fact}
            onChange={setFact}
            label="事实描述"
            hint="具体发生了什么？时间、关于孩子的什么事、双方做了什么"
            placeholder="例如：今天晚饭时，孩子不肯吃青菜，我坚持让孩子至少尝一口，你直接把青菜拿走了…"
            isVoice={factVoice}
            onModeChange={setFactVoice}
          />

          <VoiceInput
            value={feeling}
            onChange={setFeeling}
            label="感受表达"
            hint="你的感受是什么？哪个点最让你难受？"
            placeholder="例如：我觉得你总是在孩子面前否定我，让我感觉很孤立…"
            isVoice={feelingVoice}
            onModeChange={setFeelingVoice}
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 mt-6">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || !fact.trim() || !feeling.trim()}
          className="mt-6 w-full rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {submitting ? "提交中…" : "提交陈述"}
        </button>
      </div>
    </div>
  );
}
