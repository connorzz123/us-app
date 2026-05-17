import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { io } from "socket.io-client";

interface FinalReport {
  holmes: string;
  mungerResponsibility: string;
  conflictCommon: string;
  mungerActions: string;
}

interface SessionData {
  session: {
    id: string;
    mode: string;
    phase: string;
    finalReport: FinalReport | null;
    initiatorStatement: { fact: string; feeling: string } | null;
    responderStatement: { response: string } | null;
  };
}

export default function FinalReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") || "initiator";
  const [data, setData] = useState<SessionData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const failCountRef = useRef(0);

  useEffect(() => {
    const socket = io();
    socket.emit("join-room", sessionId);

    socket.on("phase-change", (data: { phase: string }) => {
      if (data.phase === "final") {
        fetchData();
      }
    });

    async function fetchData() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error("fetch failed");
        setData(await res.json());
        failCountRef.current = 0;
      } catch {
        failCountRef.current++;
        if (failCountRef.current > 5) {
          setLoadError(true);
        }
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [sessionId]);

  /* ── Error ── */

  if (loadError && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="mb-4" style={{ color: "var(--c-danger)" }}>加载失败，请检查网络</p>
        <button
          onClick={() => { setLoadError(false); failCountRef.current = 0; }}
          className="clay-btn clay-btn-primary px-6 py-3 text-sm"
        >
          重试
        </button>
      </div>
    );
  }

  /* ── Loading ── */

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--c-text-secondary)" }}>加载中…</p>
      </div>
    );
  }

  const report = data.session.finalReport;
  const isGenerating = !report || data.session.phase === "generating";
  const mode = data.session.mode;

  /* ── Generating ── */

  if (isGenerating) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="spinner mb-6" />
        <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>帮帮团正在生成结语</h1>
        <p className="mt-2 text-sm text-center" style={{ color: "var(--c-text-secondary)" }}>请稍候片刻…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-lg anim-fade-in">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
               style={{ background: "var(--c-success-light)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" style={{ color: "var(--c-success)" }}>
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <span className="badge-success">最终结语</span>
          <h1 className="mt-3 text-2xl font-bold" style={{ color: "var(--c-text)" }}>帮帮团的综合意见</h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--c-text-secondary)" }}>这是帮帮团给你们的最终建议</p>
        </div>

        {/* Report cards */}
        <div className="space-y-4 mb-8">

          {/* Holmes: Discrepancy Confirmation */}
          <div className="clay-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg select-none">🔍</span>
              <h2 className="font-semibold text-base" style={{ color: "var(--c-text)" }}>事实分歧确认</h2>
              <span className="text-xs" style={{ color: "var(--c-text-muted)" }}>夏洛克·福尔摩斯</span>
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--c-text-secondary)" }}>{report.holmes}</p>
          </div>

          {/* Munger: Responsibility */}
          <div className="clay-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg select-none">⚖️</span>
              <h2 className="font-semibold text-base" style={{ color: "var(--c-text)" }}>责任裁定</h2>
              <span className="text-xs" style={{ color: "var(--c-text-muted)" }}>查理·芒格</span>
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--c-text-secondary)" }}>{report.mungerResponsibility}</p>
          </div>

          {/* Conflict resolver: Common Ground */}
          <div className="clay-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg select-none">🤝</span>
              <h2 className="font-semibold text-base" style={{ color: "var(--c-text)" }}>共同出发点</h2>
              <span className="text-xs" style={{ color: "var(--c-text-muted)" }}>{mode === "parenting" ? "鲁道夫·德雷克斯" : "卡尔·罗杰斯"}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--c-text-secondary)" }}>{report.conflictCommon}</p>
          </div>

          {/* Munger: Action Suggestions */}
          <div className="clay-card p-5"
               style={{ background: "var(--c-primary-light)", borderColor: "var(--c-primary-border)" }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg select-none">💡</span>
              <h2 className="font-semibold text-base" style={{ color: "#5A7DB3" }}>双向行动建议</h2>
              <span className="text-xs" style={{ color: "var(--c-primary)" }}>查理·芒格</span>
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#5A7DB3" }}>{report.mungerActions}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3 mb-8">
          <p className="text-sm font-medium" style={{ color: "var(--c-text-muted)" }}>接下来你可以：</p>

          <button
            onClick={() => {
              const text = reportText(report, mode);
              navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className="clay-btn clay-btn-secondary w-full py-3 text-sm"
          >
            {copied ? "已复制 ✓" : "复制报告文本"}
          </button>

          <button
            onClick={async () => {
              const text = reportText(report, mode);
              if (navigator.share) {
                try {
                  await navigator.share({ title: "Us 育儿复盘报告", text });
                  setShared(true);
                  setTimeout(() => setShared(false), 2000);
                } catch { /* user cancelled */ }
              } else {
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }
            }}
            className="clay-btn clay-btn-secondary w-full py-3 text-sm"
          >
            {shared ? "已分享 ✓" : "分享报告"}
          </button>

          <button
            onClick={() => {
              const text = reportText(report, mode);
              const blob = new Blob([text], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `Us-复盘报告-${new Date().toLocaleDateString("zh-CN")}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="clay-btn clay-btn-secondary w-full py-3 text-sm"
          >
            下载报告文件
          </button>

          {/* Reminder */}
          <div className="pt-2">
            {!reminderSet ? (
              <button
                onClick={() => setShowReminder(!showReminder)}
                className="clay-btn clay-btn-primary w-full py-3 text-sm"
              >
                设定下一次复盘提醒
              </button>
            ) : (
              <div className="clay-card p-4 text-center">
                <p className="text-sm font-medium" style={{ color: "var(--c-success)" }}>提醒已设定 ✓</p>
                <p className="text-xs mt-1" style={{ color: "var(--c-text-muted)" }}>届时我们会提醒你们再次使用 Us 复盘</p>
              </div>
            )}

            {showReminder && !reminderSet && (
              <div className="clay-card mt-3 p-4">
                <p className="text-sm mb-3" style={{ color: "var(--c-text-secondary)" }}>选择提醒日期：</p>
                <div className="flex gap-2">
                  {[3, 7, 14, 30].map((days) => (
                    <button
                      key={days}
                      onClick={() => { setReminderSet(true); setShowReminder(false); }}
                      className="clay-btn clay-btn-secondary flex-1 py-2 text-sm"
                    >
                      {days}天后
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer link */}
        <div className="text-center pb-8">
          <Link to="/"
                className="text-sm font-medium transition"
                style={{ color: "var(--c-primary)" }}>
            开始新的复盘 →
          </Link>
        </div>
      </div>
    </div>
  );
}

function reportText(report: FinalReport, mode: string) {
  const conflictName = mode === "parenting" ? "德雷克斯" : "罗杰斯";
  return [
    "Us 育儿复盘报告",
    "",
    "事实分歧确认（夏洛克·福尔摩斯）",
    report.holmes,
    "",
    "责任裁定（查理·芒格）",
    report.mungerResponsibility,
    "",
    `共同出发点（${conflictName}）`,
    report.conflictCommon,
    "",
    "双向行动建议（查理·芒格）",
    report.mungerActions,
  ].join("\n");
}
