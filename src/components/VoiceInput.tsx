import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  hint: string;
  isVoice: boolean;
  onModeChange: (voice: boolean) => void;
}

type State = "idle" | "listening" | "result";

export default function VoiceInput({
  value,
  onChange,
  placeholder,
  label,
  hint,
  isVoice,
  onModeChange,
}: Props) {
  const [recState, setRecState] = useState<State>("idle");
  const [interimText, setInterimText] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setUnsupported(true);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "zh-CN";
    rec.interimResults = true;
    rec.continuous = true;
    recognitionRef.current = rec;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        onChange(value ? value + " " + final : final);
        setRecState("result");
      }
      setInterimText(interim);
    };

    rec.onerror = () => {
      setRecState("idle");
      setInterimText("");
    };

    rec.onend = () => {
      if (recState === "listening") {
        setRecState("result");
      }
    };

    return () => {
      rec.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    setInterimText("");
    setRecState("listening");
    rec.start();
  }, []);

  const stopRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    rec.stop();
    setRecState("result");
    setInterimText("");
  }, []);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <p className="text-xs text-gray-400 mb-2">{hint}</p>

      <div className="mb-3 flex items-center gap-3 rounded-xl bg-gray-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => onModeChange(false)}
          className={`flex-1 rounded-lg py-2 font-medium transition ${
            !isVoice ? "bg-white shadow" : "text-gray-500"
          }`}
        >
          文字输入
        </button>
        <button
          type="button"
          onClick={() => onModeChange(true)}
          className={`flex-1 rounded-lg py-2 font-medium transition ${
            isVoice ? "bg-white shadow" : "text-gray-500"
          }`}
        >
          语音输入
        </button>
      </div>

      {!isVoice ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-300 p-4 text-sm min-h-[120px] resize-y"
        />
      ) : unsupported ? (
        <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-500 text-sm mb-2">您的浏览器不支持语音输入</p>
          <p className="text-gray-400 text-xs">请使用 Chrome、Edge 或 Safari 浏览器，或切换到文字输入</p>
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-gray-300 p-8">
          {value && (
            <div className="w-full mb-4 p-3 rounded-lg bg-gray-50 text-sm text-gray-700 text-left">
              {value}
            </div>
          )}

          {recState === "listening" && interimText && (
            <p className="text-sm text-blue-600 italic mb-4 animate-pulse">{interimText}</p>
          )}

          <button
            type="button"
            onClick={recState === "listening" ? stopRecording : startRecording}
            className={`flex items-center gap-2 sm:gap-3 rounded-full px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg font-medium transition ${
              recState === "listening"
                ? "bg-red-500 text-white animate-pulse"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            <MicIcon active={recState === "listening"} />
            {recState === "listening"
              ? "停止录音"
              : recState === "result"
              ? "继续录音"
              : "开始录音"}
          </button>

          {recState === "idle" && !value && (
            <p className="mt-4 text-xs text-gray-400">点击按钮后开始说话，系统会自动转为文字</p>
          )}

          {recState === "result" && (
            <p className="mt-4 text-xs text-green-600">录音完成，可点击按钮继续补充</p>
          )}
        </div>
      )}
    </div>
  );
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
