import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CreatePage from "./pages/CreatePage";
import WaitingPage from "./pages/WaitingPage";
import RespondPage from "./pages/RespondPage";
import AnalysisPage from "./pages/AnalysisPage";
import ChatPage from "./pages/ChatPage";
import FinalReportPage from "./pages/FinalReportPage";

export default function App() {
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
      </Routes>
    </div>
  );
}
