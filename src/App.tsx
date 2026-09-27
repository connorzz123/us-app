import { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CreatePage from "./pages/CreatePage";
import WaitingPage from "./pages/WaitingPage";
import RespondPage from "./pages/RespondPage";
import AnalysisPage from "./pages/AnalysisPage";
import ChatPage from "./pages/ChatPage";
import FinalReportPage from "./pages/FinalReportPage";
import AdminPage from "./pages/AdminPage";
import Gate from "./components/Gate";

type AuthState = "checking" | "locked" | "ok";

// cookie 失效（如 7 天过期/被吊销）后，业务请求会收到 401，
// 通知外层切回登录门，而不是整页 reload（reload 会丢失当前输入，表现为"点确认没反应"）
function installAuthExpiredInterceptor(onExpired: () => void) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await originalFetch(...args);
    const url = typeof args[0] === "string" ? args[0] : String((args[0] as Request).url);
    if (res.status === 401 && url.includes("/api/sessions")) {
      onExpired();
    }
    return res;
  };
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>("checking");
  // 只持邀请凭证的人：记住凭证绑定的那一份复盘，只放行它的页面
  const [inviteSessionId, setInviteSessionId] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    installAuthExpiredInterceptor(() => setAuth("locked"));

    // 回应者拿到的邀请链接形如 /s/<id>?k=<邀请凭证>。
    // 用凭证换一次进入权限即可，不必再让回应者输一遍访问码。
    async function boot() {
      type Status = { ok?: boolean; inviteSessionId?: string | null };
      let status: Status = {};
      try {
        status = await fetch("/api/auth/status").then((r) => r.json());
      } catch { /* 继续尝试邀请凭证 */ }

      // 带 ?k= 的邀请链接：先换票（服务端会下发 HttpOnly 邀请 cookie）
      if (!status.ok) {
        const k = new URLSearchParams(window.location.search).get("k");
        const matched = window.location.pathname.match(/^\/s\/([^/]+)\/?$/);
        if (k && matched) {
          try {
            const res = await fetch(`/api/sessions/${matched[1]}/join`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ k }),
            });
            if (res.ok) {
              status = await fetch("/api/auth/status")
                .then((r) => r.json())
                .catch(() => ({}));
            }
          } catch { /* 落到访问码门 */ }
        }
      }

      if (status.ok) {
        setAuth("ok");
        return;
      }

      // 只有邀请凭证：仅放行它绑定的那一份复盘，
      // 首页等其它页面照旧回访问码门——邀请链接不等于"成了会员"
      const inviteId = status.inviteSessionId ?? null;
      if (inviteId && window.location.pathname.startsWith(`/s/${inviteId}`)) {
        setInviteSessionId(inviteId);
        setAuth("ok");
        return;
      }

      setAuth("locked");
    }

    boot();
  }, []);

  // 邀请用户一旦离开自己那一份复盘（比如点"开始新的复盘"回首页），退回访问码门
  useEffect(() => {
    if (!inviteSessionId) return;
    if (!location.pathname.startsWith(`/s/${inviteSessionId}`)) setAuth("locked");
  }, [location.pathname, inviteSessionId]);

  if (auth === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm" style={{ color: "var(--c-text-muted)" }}>
          加载中…
        </p>
      </div>
    );
  }

  // Admin 后台独立于访问码体系，走 ADMIN_KEY 验证
  if (window.location.pathname.startsWith("/admin")) {
    return (
      <div className="min-h-screen">
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </div>
    );
  }

  if (auth === "locked") {
    return <Gate onVerified={() => setAuth("ok")} />;
  }

  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/s/:sessionId" element={<RespondPage />} />
        <Route path="/s/:sessionId/create" element={<CreatePage />} />
        <Route path="/s/:sessionId/waiting" element={<WaitingPage />} />
        <Route path="/s/:sessionId/analysis" element={<AnalysisPage />} />
        <Route path="/s/:sessionId/chat" element={<ChatPage />} />
        <Route path="/s/:sessionId/final" element={<FinalReportPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}
