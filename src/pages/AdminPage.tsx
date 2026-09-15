import { useCallback, useEffect, useState } from "react";

interface AccessCode {
  code: string;
  note: string;
  createdAt: string;
  expireAt: string | null;
  maxSessions: number;
  usedSessions: number;
  revoked: boolean;
  lastUsedAt: string | null;
}

interface UsageInfo {
  usage: { tokensUsed: number; sessionsCreated: number; aiCalls: number; blocked: number };
  budget: number;
  sessionLimit: number;
  remaining: number;
  percent: number;
}

const ADMIN_KEY_STORAGE = "us_admin_key";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // 生成表单
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [maxSessions, setMaxSessions] = useState(3);

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`/api/admin${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey,
          ...(init?.headers || {}),
        },
      });
      if (res.status === 403) throw new Error("管理密钥错误");
      if (!res.ok) throw new Error(`请求失败 (${res.status})`);
      return res.json();
    },
    [adminKey]
  );

  const refresh = useCallback(async () => {
    if (!unlocked) return;
    try {
      const [c, u] = await Promise.all([api("/codes"), api("/usage")]);
      setCodes(c.codes || []);
      setUsage(u);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      if (e instanceof Error && e.message === "管理密钥错误") {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setUnlocked(false);
      }
    }
  }, [api, unlocked]);

  useEffect(() => {
    const saved = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (saved) {
      setAdminKey(saved);
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUnlock = async () => {
    if (!adminKey.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/codes");
      sessionStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
      setUnlocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "验证失败");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/codes", {
        method: "POST",
        body: JSON.stringify({ note, days, maxSessions }),
      });
      setNote("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (code: string, action: "revoke" | "delete") => {
    if (action === "delete" && !confirm(`彻底删除 ${code}？该操作不可恢复。`)) return;
    setBusy(true);
    try {
      await api(action === "revoke" ? `/codes/${code}/revoke` : `/codes/${code}`, {
        method: action === "revoke" ? "POST" : "DELETE",
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  // ── 未解锁：密钥输入 ──
  if (!unlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm anim-fade-in">
          <h1 className="text-2xl font-bold text-center" style={{ color: "var(--c-text)" }}>
            Us 管理后台
          </h1>
          <div className="clay-card mt-8 p-6">
            <label className="block text-sm font-medium mb-3" style={{ color: "var(--c-text-secondary)" }}>
              管理密钥（ADMIN_KEY）
            </label>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
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
                className="mt-3 rounded-xl p-3 text-sm"
                style={{ background: "var(--c-danger-light)", color: "#8A5A5C" }}
              >
                {error}
              </div>
            )}
            <button
              onClick={handleUnlock}
              disabled={busy || !adminKey.trim()}
              className="clay-btn clay-btn-primary w-full mt-4 py-3"
            >
              {busy ? "验证中…" : "解锁"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 已解锁：管理面板 ──
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: "var(--c-text)" }}>
            Us 管理后台
          </h1>
          <button
            onClick={() => {
              sessionStorage.removeItem(ADMIN_KEY_STORAGE);
              setUnlocked(false);
              setAdminKey("");
            }}
            className="clay-btn px-4 py-2 text-sm"
          >
            退出
          </button>
        </div>

        {error && (
          <div
            className="mt-4 rounded-xl p-3 text-sm"
            style={{ background: "var(--c-danger-light)", color: "#8A5A5C" }}
          >
            {error}
          </div>
        )}

        {/* 今日用量 */}
        {usage && (
          <div className="clay-card mt-6 p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold" style={{ color: "var(--c-text)" }}>
                今日用量
              </div>
              <button onClick={refresh} disabled={busy} className="clay-btn px-3 py-1.5 text-xs">
                刷新
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Token 消耗", value: usage.usage.tokensUsed.toLocaleString(), sub: `预算 ${usage.budget.toLocaleString()}` },
                { label: "新建复盘", value: `${usage.usage.sessionsCreated}`, sub: `上限 ${usage.sessionLimit}` },
                { label: "AI 调用", value: `${usage.usage.aiCalls}`, sub: "" },
                { label: "拦截次数", value: `${usage.usage.blocked}`, sub: "" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl p-3" style={{ background: "var(--c-bg)" }}>
                  <div className="text-xs" style={{ color: "var(--c-text-muted)" }}>
                    {item.label}
                  </div>
                  <div className="mt-1 text-lg font-semibold" style={{ color: "var(--c-text)" }}>
                    {item.value}
                  </div>
                  {item.sub && (
                    <div className="text-xs" style={{ color: "var(--c-text-muted)" }}>
                      {item.sub}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "var(--c-bg)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${usage.percent}%`,
                  background: usage.percent > 80 ? "#D4868A" : "var(--c-accent)",
                }}
              />
            </div>
            <div className="mt-1 text-xs text-right" style={{ color: "var(--c-text-muted)" }}>
              预算已用 {usage.percent}%
            </div>
          </div>
        )}

        {/* 生成访问码 */}
        <div className="clay-card mt-6 p-5">
          <div className="font-semibold" style={{ color: "var(--c-text)" }}>
            生成访问码
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="备注（如：公众号粉丝A）"
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text)" }}
            />
            <input
              type="number"
              value={days}
              min={0}
              onChange={(e) => setDays(Number(e.target.value))}
              placeholder="有效天数"
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text)" }}
            />
            <input
              type="number"
              value={maxSessions}
              min={-1}
              onChange={(e) => setMaxSessions(Number(e.target.value))}
              placeholder="可创建复盘次数"
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text)" }}
            />
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--c-text-muted)" }}>
            天数填 0 = 永不过期；次数填 -1 = 不限次。发放给粉丝建议 7 天 / 3 次。
          </p>
          <button
            onClick={handleCreate}
            disabled={busy}
            className="clay-btn clay-btn-primary mt-3 px-5 py-2.5 text-sm"
          >
            {busy ? "生成中…" : "生成"}
          </button>
        </div>

        {/* 访问码列表 */}
        <div className="clay-card mt-6 p-5">
          <div className="font-semibold" style={{ color: "var(--c-text)" }}>
            访问码列表（{codes.length}）
          </div>
          {codes.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--c-text-muted)" }}>
              还没有生成过访问码
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {codes.map((c) => {
                const expired = c.expireAt && Date.parse(c.expireAt) < Date.now();
                const exhausted = c.maxSessions >= 0 && c.usedSessions >= c.maxSessions;
                const status = c.revoked
                  ? "已停用"
                  : expired
                    ? "已过期"
                    : exhausted
                      ? "已用完"
                      : "有效";
                const statusColor = c.revoked || expired || exhausted ? "var(--c-text-muted)" : "#5A9E6F";
                return (
                  <div
                    key={c.code}
                    className="flex flex-wrap items-center gap-2 rounded-xl p-3"
                    style={{ background: "var(--c-bg)" }}
                  >
                    <code className="text-sm font-semibold" style={{ color: "var(--c-text)" }}>
                      {c.code}
                    </code>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: statusColor, background: "var(--c-bg-card)" }}>
                      {status}
                    </span>
                    {c.note && (
                      <span className="text-xs" style={{ color: "var(--c-text-secondary)" }}>
                        {c.note}
                      </span>
                    )}
                    <span className="ml-auto text-xs" style={{ color: "var(--c-text-muted)" }}>
                      {c.maxSessions < 0 ? `${c.usedSessions} 次` : `${c.usedSessions}/${c.maxSessions} 次`} ·{" "}
                      {c.expireAt ? `至 ${fmtDate(c.expireAt)}` : "永不过期"}
                    </span>
                    {!c.revoked && (
                      <button
                        onClick={() => handleAction(c.code, "revoke")}
                        disabled={busy}
                        className="clay-btn px-3 py-1 text-xs"
                      >
                        停用
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(c.code, "delete")}
                      disabled={busy}
                      className="clay-btn px-3 py-1 text-xs"
                      style={{ color: "#8A5A5C" }}
                    >
                      删除
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
