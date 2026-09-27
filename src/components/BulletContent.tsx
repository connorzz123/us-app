/** 把「一行一条」的分析文本渲染成清单要点，而不是糊成一大段文字 */
export default function BulletContent({ content }: { content: string }) {
  const trimmed = (content ?? "").trim();

  // 兜底：万一这条分析没生成出来，不要留一片空白
  if (!trimmed) {
    return (
      <p className="text-sm leading-relaxed" style={{ color: "var(--c-text-muted)" }}>
        这一条暂时没生成出来，不影响继续使用。
      </p>
    );
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-*•·]\s*/, ""));

  if (lines.length <= 1) {
    return (
      <p className="text-sm leading-relaxed" style={{ color: "var(--c-text)" }}>
        {trimmed}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {lines.map((line, i) => (
        <li
          key={i}
          className="flex gap-2 text-sm leading-relaxed"
          style={{ color: "var(--c-text)" }}
        >
          <span
            className="shrink-0 mt-[6px] h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--c-primary)" }}
          />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
