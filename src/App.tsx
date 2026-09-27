import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
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

  useEffect(() => {
    installAuthExpiredInterceptor(() => setAuth("locked"));
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data) => setAuth(data.ok ? "ok" : "locked"))
      .catch(() => setAuth("locked"));
  }, []);

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
