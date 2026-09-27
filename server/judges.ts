import Anthropic from "@anthropic-ai/sdk";
import type { Card, FinalReport } from "./storage";
import { assertBudgetAvailable, recordUsage } from "./budget";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || "https://api.deepseek.com/anthropic",
});

type Mode = "parenting" | "emotion";

async function ask(prompt: string, retries = 3): Promise<string> {
  let lastText = "";

  // DeepSeek 推理模型的 thinking 会占用输出额度：
  // 额度不够时 thinking 会把 max_tokens 吃光，正式回答为空（stop_reason=max_tokens）。
  // 长 prompt 的思考尤其长，所以这里逐次加倍，而不是用同样的额度硬撞。
  let maxTokens = 4000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // 预算熔断：额度不足就不发请求，直接失败
    assertBudgetAvailable();

    const t0 = Date.now();
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "deepseek-v4-pro",
      max_tokens: maxTokens,
      temperature: 0.7,
      // DeepSeek 推理模型的思考过程会输出大量 token（实测思考量约为正式回答的 10 倍，
      // 单次调用因此长达 20~50 秒）。判官输出是短文本判断，不需要长篇推理，
      // 所以默认关闭 thinking；如需恢复推理过程，在 .env 里加 AI_ENABLE_THINKING=1。
      ...(process.env.AI_ENABLE_THINKING === "1"
        ? {}
        : ({ thinking: { type: "disabled" } } as Record<string, unknown>)),
      system: `你是一位专业的关系冲突分析专家，你的职责是**明辨是非**，不是和稀泥。

铁律：
1. 该是谁的问题就直说。不要为了避免"显得偏袒"而把明显的对错模糊成"双方都有道理"。
2. 只评判「行为」，不评判「人格」。可以说"这个做法很伤人"，但不能说"你是个自私的人"。
3. 判断必须明确。该给责任比例就给（如 7:3），不许用"双方都有责任"这种话搪塞。
4. 用中文，简洁、具体、可操作。拒绝空洞的安慰和模棱两可的总结。`,
      messages: [{ role: "user", content: prompt }],
    });

    // 记录真实 token 消耗（兼容层字段可能缺失，故做可选处理）
    const usage = (msg as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    if (usage) {
      recordUsage(usage.input_tokens ?? 0, usage.output_tokens ?? 0);
    }

    const block = msg.content.find((b) => b.type === "text");
    const text = (block?.text ?? "").trim();
    const raw = msg as unknown as { stop_reason?: string; content?: unknown[] };
    const blockTypes = (raw.content ?? []).map((b) => (b as { type?: string }).type);
    const ms = Date.now() - t0;

    if (text) {
      console.log(
        `[ask] ${ms}ms | out=${usage?.output_tokens ?? "?"}tok | ` +
          `blocks=[${blockTypes.join(",")}] | ${text.length}字`
      );
      return text;
    }

    // 空响应：打印诊断信息
    console.error(
      `[ask] 空响应 (第 ${attempt + 1}/${retries + 1} 次) | ${ms}ms | ` +
        `stop_reason=${raw.stop_reason ?? "?"} | ` +
        `blocks=[${blockTypes.join(",")}] | ` +
        `max_tokens=${maxTokens} | usage=${JSON.stringify(usage ?? null)}`
    );

    // 被 thinking 吃光额度 → 抬高上限再试
    if (raw.stop_reason === "max_tokens" && maxTokens < 16000) {
      maxTokens = Math.min(maxTokens * 2, 16000);
      console.log(`[ask] 下次重试将 max_tokens 提高到 ${maxTokens}`);
    }

    lastText = text;
    if (attempt < retries) {
      // 退避：1.5s / 3s / 4.5s，给限流留出恢复时间
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }

  console.error(`[ask] 重试 ${retries + 1} 次后仍为空，返回空内容`);
  return lastText;
}

// ── Phase 1: Cards for initiator statement ──

export async function generatePhase1Cards(
  fact: string,
  feeling: string,
  mode: Mode,
  onProgress?: (done: number, total: number) => void
): Promise<Card[]> {
  const cards: Card[] = [];
  const total = 2;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  // Holmes - Fact skeleton
  const holmesPrompt = `你是一位名叫"夏洛克·福尔摩斯"的事实解析师。你只认事实，不认情绪。

请从发起人的陈述中提炼**事实骨架**：
- 剔除"你总是""你从来不""每次都是"这类绝对化表达
- 提取可观察的具体行为和时间线
- 指出这段陈述里哪些是站得住脚的事实，哪些是主观解读或夸大

发起人的陈述：
【事实】${fact}
【感受】${feeling}

输出格式：3-5 条短句，一行一条，每条不超过 25 字，不要使用 markdown 语法。
最后用一句话点出核心分歧。总字数控制在 120 字以内。`;

  const holmesContent = await ask(holmesPrompt);
  cards.push({
    id: "",
    sessionId: "",
    phase: "phase1",
    judge: "holmes",
    title: "福尔摩斯 · 事实骨架",
    content: holmesContent,
    createdAt: new Date().toISOString(),
  });
  tick();

  // Conflict resolver
  if (mode === "parenting") {
    const dreikursPrompt = `你是一位名叫"鲁道夫·德雷克斯"的儿童心理学家和育儿专家。
你看重的是"哪种做法对孩子真正好"，而不是"谁的态度更好看"。

请分析发起人的陈述：
- 指出其做法中真正对孩子有益的部分
- 指出其做法中不妥当、或对孩子不利的部分（如果有，必须直说）
- 判断这次冲突中，哪一方的处理方式对孩子更不利

发起人的陈述：
【事实】${fact}
【感受】${feeling}

输出 3 条以内的短句，一行一条，每条不超过 30 字。总字数 120 字以内，不要使用 markdown 语法。语气专业、直接，不回避判断。`;

    const dreikursContent = await ask(dreikursPrompt);
    cards.push({
      id: "",
      sessionId: "",
      phase: "phase1",
      judge: "dreikurs",
      title: "德雷克斯 · 育儿分析",
      content: dreikursContent,
      createdAt: new Date().toISOString(),
    });
  } else {
    const rogersPrompt = `你是一位名叫"卡尔·罗杰斯"的人本主义心理学家。
你既能共情一个人的感受，也不会因为他"觉得委屈"就认定他做得对。

请分析发起人的陈述：
- 他的核心感受是什么，这个感受是否合理
- 他的哪些情绪是被主观解读放大的
- 他真正在意的深层需求是什么，这个需求站不站得住脚

发起人的陈述：
【事实】${fact}
【感受】${feeling}

输出 3 条以内的短句，一行一条，每条不超过 30 字。总字数 120 字以内，不要使用 markdown 语法。
共情归共情，判断归判断，两者都要有。`;

    const rogersContent = await ask(rogersPrompt);
    cards.push({
      id: "",
      sessionId: "",
      phase: "phase1",
      judge: "rogers",
      title: "罗杰斯 · 情感分析",
      content: rogersContent,
      createdAt: new Date().toISOString(),
    });
  }
  tick();

  return cards;
}

// ── Phase 2: Cards for responder statement ──

export async function generatePhase2Cards(
  initiatorFact: string,
  initiatorFeeling: string,
  responderText: string,
  mode: Mode,
  onProgress?: (done: number, total: number) => void
): Promise<Card[]> {
  const cards: Card[] = [];
  const total = 2;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  const holmesPrompt = `你是一位名叫"夏洛克·福尔摩斯"的事实解析师。你只认事实，不认情绪。

请对比双方的陈述，提炼回应者版本的事实骨架：
- 回应者提供了哪些新的事实细节
- 双方的陈述在哪里对不上
- 谁的版本与事实更吻合（如果有依据可以判断，就明确说出来）

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

输出 3-5 条短句，一行一条，每条不超过 25 字，不要使用 markdown 语法。
最后一句点出：在事实层面，谁的说法更站得住脚。总字数控制在 120 字以内。`;

  const holmesContent = await ask(holmesPrompt);
  cards.push({
    id: "",
    sessionId: "",
    phase: "phase2",
    judge: "holmes",
    title: "福尔摩斯 · 事实骨架（回应）",
    content: holmesContent,
    createdAt: new Date().toISOString(),
  });
  tick();

  if (mode === "parenting") {
    const dreikursPrompt = `你是一位名叫"鲁道夫·德雷克斯"的儿童心理学家。

请从育儿角度分析回应者的立场：
- 回应者的育儿考量是否成立
- 双方分歧的根源在哪里
- 哪一方的做法对孩子更不利（必须给出判断，不要回避）

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

输出 3 条以内的短句，一行一条，每条不超过 30 字。总字数 120 字以内，不要使用 markdown 语法。
对事不对人，但该指出的问题要说清楚。`;

    const dreikursContent = await ask(dreikursPrompt);
    cards.push({
      id: "",
      sessionId: "",
      phase: "phase2",
      judge: "dreikurs",
      title: "德雷克斯 · 育儿分析（回应）",
      content: dreikursContent,
      createdAt: new Date().toISOString(),
    });
  } else {
    const rogersPrompt = `你是一位名叫"卡尔·罗杰斯"的人本主义心理学家。

请分析回应者的情感世界：
- 回应者没说出口的深层感受是什么
- 他的哪些感受是合理的，哪些是被情绪放大的
- 双方的需求在哪里相遇、在哪里冲突

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

输出 3 条以内的短句，一行一条，每条不超过 30 字。总字数 120 字以内，不要使用 markdown 语法。
理解不等于认同，该点明的问题要明确点出来。`;

    const rogersContent = await ask(rogersPrompt);
    cards.push({
      id: "",
      sessionId: "",
      phase: "phase2",
      judge: "rogers",
      title: "罗杰斯 · 情感分析（回应）",
      content: rogersContent,
      createdAt: new Date().toISOString(),
    });
  }
  tick();

  return cards;
}

// ── Phase 3: Joint analysis (when both statements are in) ──

export async function generatePhase3Cards(
  initiatorFact: string,
  initiatorFeeling: string,
  responderText: string,
  mode: Mode,
  onProgress?: (done: number, total: number) => void
): Promise<Card[]> {
  const cards: Card[] = [];
  const total = 3;
  let done = 0;
  const tick = () => onProgress?.(++done, total);

  // Holmes - Fact discrepancies
  const holmesPrompt = `你是一位名叫"夏洛克·福尔摩斯"的事实解析师。你的职责是查清真相，不是维持表面和气。

请综合双方陈述，出具**事实判定**：
- 双方都明确确认了哪些**具体事实**（只写双方原话里都出现过的）
- 哪些关键事实存在矛盾
- 从陈述的具体程度、前后逻辑来看，哪一方的说法更可信（必须给出判断）

【严禁事项】
1. 严禁只依据一方的说法就下结论。
2. 严禁使用"双方默认""双方无争议""双方没有异议"这类概括表述——
   除非双方原话里都明确表达过同意的意思。
3. 双方只是"都承认某件事发生过"，不等于"对这件事没有争议"。
   例如：一方说"你总翻我手机"，另一方说"我翻是因为你不让我看"——
   这是**对"翻看是否正当"存在争议**，绝不能写成"双方对翻手机一事无争议"。

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

输出 3-5 条短句，一行一条，每条不超过 25 字，不要使用 markdown 语法。
最后一句明确写出：在事实层面，谁的说法更站得住脚。总字数控制在 130 字以内。`;

  const holmesContent = await ask(holmesPrompt);
  cards.push({
    id: "",
    sessionId: "",
    phase: "phase3",
    judge: "holmes",
    title: "福尔摩斯 · 事实分歧点",
    content: holmesContent,
    createdAt: new Date().toISOString(),
  });
  tick();

  // Conflict resolver deep analysis
  if (mode === "parenting") {
    const dreikursPrompt = `你是一位名叫"鲁道夫·德雷克斯"的儿童心理学家。

请对本次冲突做**育儿层面的判定**：
- 双方育儿理念的底层分歧是什么
- 这次争吵的本质是什么（权力斗争？还是方法之争？）
- 谁的做法对孩子的影响更负面（必须给出判断）

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

输出 3 条以内的短句，一行一条，每条不超过 30 字。总字数 130 字以内，不要使用 markdown 语法。
判断要明确，不要回避。`;

    const dreikursContent = await ask(dreikursPrompt);
    cards.push({
      id: "",
      sessionId: "",
      phase: "phase3",
      judge: "dreikurs",
      title: "德雷克斯 · 深度分析",
      content: dreikursContent,
      createdAt: new Date().toISOString(),
    });
  } else {
    const rogersPrompt = `你是一位名叫"卡尔·罗杰斯"的人本主义心理学家。

请做**情感层面的判定**：
- 双方各自真正在意的是什么
- 哪些需求是共同的，哪些是冲突的
- 哪一方的表达方式正在伤害这段关系（必须给出判断）

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

输出 3 条以内的短句，一行一条，每条不超过 30 字。总字数 130 字以内，不要使用 markdown 语法。
既要看见感受，也要指出问题，两者缺一不可。`;

    const rogersContent = await ask(rogersPrompt);
    cards.push({
      id: "",
      sessionId: "",
      phase: "phase3",
      judge: "rogers",
      title: "罗杰斯 · 深度分析",
      content: rogersContent,
      createdAt: new Date().toISOString(),
    });
  }
  tick();

  // Munger - Initial solution direction
  const mungerPrompt = `你是一位名叫"查理·芒格"的系统思维和决策专家。你务实、直接，最讨厌和稀泥。

请基于双方陈述，给出**解法方向**：
- 首先明确：这一次谁该先让步、或先做出改变（必须给出判断）
- 再给 1-2 个具体、可执行的小行动（沟通方式、相处习惯层面）
- 如果某一方明显做错了，直接告诉他该怎么补救

【严禁】任何惩罚性、威胁性、破坏关系的建议，例如：分房睡、冷战、分居、离婚、
离家出走、"再犯就……"这类最后通牒。判官给的是方法和话术，不是惩罚措施。

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

输出 3 条以内的短句，一行一条，每条不超过 30 字。总字数 130 字以内，不要使用 markdown 语法。
具体、可操作，不要"多沟通"这种废话。`;

  const mungerContent = await ask(mungerPrompt);
  cards.push({
    id: "",
    sessionId: "",
    phase: "phase3",
    judge: "munger",
    title: "芒格 · 解法方向",
    content: mungerContent,
    createdAt: new Date().toISOString(),
  });
  tick();

  return cards;
}

// ── Phase 4 interventions (during chat) ──

export async function generateIntervention(
  chatContext: string,
  mode: Mode
): Promise<string> {
  const conflictRole = mode === "parenting" ? "德雷克斯" : "罗杰斯";
  const prompt = `作为帮帮团（福尔摩斯、${conflictRole}、芒格），请阅读以下伴侣对话。

如果出现这些情况，请介入：
- 对话陷入僵局、偏离主题、或出现攻击性言语
- 有人在推卸责任、强词夺理、偷换概念（这类情况必须直接点破，不许和稀泥）

如果对话进展顺利，只需回复"不需要干预"。

对话历史：
${chatContext}

请回应（无需干预就回复"不需要干预"；需要的话，给出 1-3 句明确的引导）：`;

  return await ask(prompt);
}

// ── Final Report ──

export async function generateFinalReport(
  initiatorFact: string,
  initiatorFeeling: string,
  responderText: string,
  chatMessages: string,
  mode: Mode,
  onProgress?: (done: number, total: number) => void
): Promise<FinalReport> {
  const conflictName = mode === "parenting" ? "德雷克斯" : "罗杰斯";

  // 共 4 项：前三项并发 + 行动建议串行
  const TOTAL = 4;
  let done = 0;
  const withTick = <T>(p: Promise<T>): Promise<T> =>
    p.then((v) => {
      done += 1;
      onProgress?.(done, TOTAL);
      return v;
    });

  // 前三项互不依赖，可以并发
  const [holmes, mungerResp, conflict] = await Promise.all([
    withTick(ask(`你是一位名叫"夏洛克·福尔摩斯"的事实解析师。

请总结本次分歧的核心事实与争议点，并明确指出：在事实层面，谁的说法更站得住脚。

发起人陈述：【事实】${initiatorFact}【感受】${initiatorFeeling}
回应者陈述：${responderText}
对话记录：${chatMessages}

请输出一段话（80-130字）。必须包含两个要素：① 分歧的核心是什么；② 事实层面的判定。
不要用"双方各执一词"这类模糊表述收尾。
输出纯文本，不要使用 markdown 语法（不要出现 ** # - 等符号）。`)),

    withTick(ask(`你是一位名叫"查理·芒格"的思维专家。你的信条是：含糊其辞，是对双方最大的不负责。

请对本次冲突做责任裁定，必须给出明确结论，严格按下面的结构输出：

责任划分：发起人占 X 成，回应者占 Y 成（X+Y=10，务必写清哪边是哪边，不要写成容易看反的 X:Y）。不许给 5:5，除非你确实认为双方完全等价。
注意：写成数字更多的那一方，必须就是「更需要先调整」的那一方，两者不能自相矛盾。
主要问题在哪：明确指出哪一方的哪个具体行为是本次冲突的主要起因。
为什么站不住脚：从道理上、或对关系的影响上，说明这个行为的问题所在。
另一方的问题：如实指出，但不夸大。
结论：这一次，谁更需要先调整。

只评判行为，不进行人格攻击。宁可得罪人，也不要和稀泥。
输出纯文本，不要使用 markdown 语法（不要出现 ** # - 等符号）。

发起人陈述：【事实】${initiatorFact}【感受】${initiatorFeeling}
回应者陈述：${responderText}
对话记录：${chatMessages}`)),

    withTick(ask(`你是一位名叫"${conflictName}"的${mode === "parenting" ? "育儿" : "心理"}专家。

请指出双方真正共同的利益所在。
注意：这不是"你们都没错"式的和稀泥。对错前面已经判过了，这里要说的是——
不管谁对谁错，你们共同在意的东西是什么（${mode === "parenting" ? "都是希望孩子好" : "都是希望这段关系好"}），
以及为什么继续争"谁对"反而会损害这个共同利益。

发起人陈述：【事实】${initiatorFact}【感受】${initiatorFeeling}
回应者陈述：${responderText}
对话记录：${chatMessages}

请输出一段话（100-150字）。目标是让双方明白：判对错不是目的，解决问题才是。
输出纯文本，不要使用 markdown 语法（不要出现 ** # - 等符号）。`)),
  ]);

  // 行动建议依赖责任裁定的结论，避免同一份报告里出现两个互相矛盾的比例
  const mungerActions = await withTick(ask(`你是一位名叫"查理·芒格"的思维专家。你务实、直接，讨厌和稀泥。

【前置条件】本次冲突的责任裁定已经做出，内容如下：
---
${mungerResp}
---
你的建议必须与上面的裁定完全一致：谁的问题更大、谁该先改，以及提到的任何责任比例，
都必须与裁定保持一致，严禁出现第二个不同的比例数字。

请给出具体的行动建议，包含三个部分：
① 谁先动：明确指出这一次哪一方需要先做出改变（不要两边各提一堆要求，等于没提）
② 具体话术：需要先改变的那一方，可以照着说的原话
③ 相处方式：一个能防止同类冲突再次发生的具体做法（例如约定一个沟通习惯）

【严禁】提出任何惩罚性、威胁性、破坏关系的建议。包括但不限于：
分房睡、冷战、分居、离婚、离家出走、"再犯就……"这类最后通牒，
以及任何"让对方吃点苦头"式的做法。
判官给的是沟通方式和相处建议，不是惩罚措施。
③ 必须是双方都能接受的建设性做法，不能是一方对另一方的单方面处罚。

发起人陈述：【事实】${initiatorFact}【感受】${initiatorFeeling}
回应者陈述：${responderText}
对话记录：${chatMessages}

请输出（130-200字）。具体、可直接照做，不要"多沟通""互相理解"这种废话。
输出纯文本，不要使用 markdown 语法（不要出现 ** # - 等符号）。`));

  return {
    holmes,
    mungerResponsibility: mungerResp,
    conflictCommon: conflict,
    mungerActions,
  };
}
