import Anthropic from "@anthropic-ai/sdk";
import type { Card, FinalReport } from "./storage";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || "https://api.deepseek.com/anthropic",
});

type Mode = "parenting" | "emotion";

async function ask(prompt: string): Promise<string> {
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "deepseek-v4-pro",
    max_tokens: 1024,
    temperature: 0.7,
    system: "你是一位专业的家庭关系、育儿和冲突解决专家。请用中文回复，语气温和而专业，像一位智慧的朋友。回答要具体、可操作，避免空洞的安慰。",
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content.find((b) => b.type === "text");
  return block?.text ?? "";
}

// ── Phase 1: Cards for initiator statement ──

export async function generatePhase1Cards(
  fact: string,
  feeling: string,
  mode: Mode
): Promise<Card[]> {
  const cards: Card[] = [];

  // Holmes - Fact skeleton
  const holmesPrompt = `你是一位名叫"夏洛克·福尔摩斯"的事实解析师。你的任务是：

请阅读发起人的陈述，提炼出**事实骨架**：
- 剔除"你总是""你从来不""每次都是"等模糊、绝对化的表达
- 提取可观察的具体行为和时间线
- 定位核心的事实分歧点

发起人的陈述：
【事实】${fact}
【感受】${feeling}

请输出一段连贯的中文分析（200-400字），格式：先列出客观时间线，然后指出核心分歧点（如果有的话）。用"我们"而非"你"来指代双方，保持中立、温和的语气。`;

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

  // Conflict resolver
  if (mode === "parenting") {
    const dreikursPrompt = `你是一位名叫"鲁道夫·德雷克斯"的儿童心理学家和育儿专家。你的任务是：

请阅读发起人的陈述，进行**核心分析**：
- 识别双方育儿理念的差异
- 分析孩子可能的"错误行为目的"（寻求关注、权力斗争、报复、或自暴自弃）
- 评估当前冲突对孩子的影响

发起人的陈述：
【事实】${fact}
【感受】${feeling}

请输出一段连贯的中文分析（200-400字）。语气温和而专业，像一位理解家长困境的朋友。指出问题但不评判人格。`;

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
    const rogersPrompt = `你是一位名叫"卡尔·罗杰斯"的人本主义心理学家。你的任务是：

请阅读发起人的陈述，进行**核心分析**：
- 将情绪化语言翻译成核心感受和未被满足的需求
- 识别发起人真正在意的深层渴望
- 用共情的方式重述Ta的体验

发起人的陈述：
【事实】${fact}
【感受】${feeling}

请输出一段连贯的中文分析（200-400字）。语气温和、充满共情，像一位真正理解Ta的人。避免评价或建议，专注于理解和翻译情绪。`;

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

  return cards;
}

// ── Phase 2: Cards for responder statement ──

export async function generatePhase2Cards(
  initiatorFact: string,
  initiatorFeeling: string,
  responderText: string,
  mode: Mode
): Promise<Card[]> {
  const cards: Card[] = [];

  const holmesPrompt = `你是一位名叫"夏洛克·福尔摩斯"的事实解析师。

请阅读发起人与回应者双方的陈述，提炼回应者版本的**事实骨架**：
- 提取回应者提到的新事实细节和不同视角
- 对比发起人的陈述，初步标记双方在事实认知上的异同

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

请输出一段连贯的中文分析（200-400字）。客观、中立，只聚焦事实层面。`;

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

  if (mode === "parenting") {
    const dreikursPrompt = `你是一位名叫"鲁道夫·德雷克斯"的儿童心理学家。

请阅读双方的陈述，从育儿角度分析回应者的观点：
- 回应者可能的育儿理念和担忧
- 双方育儿方式的差异根源
- 这些差异对孩子可能的影响

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

请输出一段连贯的中文分析（200-400字）。温和专业，不对任何一方贴标签。`;

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

请阅读双方的陈述，分析回应者的情感世界：
- 回应者未被表达的深层感受
- 回应者真正的需求是什么
- 双方的感受和需求在何处相遇、在何处冲突

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

请输出一段连贯的中文分析（200-400字）。充满共情和温暖。`;

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

  return cards;
}

// ── Phase 3: Joint analysis (when both statements are in) ──

export async function generatePhase3Cards(
  initiatorFact: string,
  initiatorFeeling: string,
  responderText: string,
  mode: Mode
): Promise<Card[]> {
  const cards: Card[] = [];

  // Holmes - Fact discrepancies
  const holmesPrompt = `你是一位名叫"夏洛克·福尔摩斯"的事实解析师。

请综合双方陈述，生成**事实分歧点报告**：
- 双方对事实认知的共同点
- 双方对事实认知的差异点
- 明确"你们在哪个具体问题上卡住了"

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

请输出一段连贯的中文分析（200-400字）。用一句"你们卡在了XXX这个具体问题上"作为结尾。`;

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

  // Conflict resolver deep analysis
  if (mode === "parenting") {
    const dreikursPrompt = `你是一位名叫"鲁道夫·德雷克斯"的儿童心理学家。

请综合双方陈述，进行**深度育儿分析**：
- 双方教育理念的底层逻辑差异
- 本次争吵陷入的错误行为目的（权力斗争、报复等）
- 对孩子的影响评估

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

请输出一段连贯的中文分析（250-400字）。指出差异但不评判优劣，像在帮助朋友理解自己。`;

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

请综合双方陈述，进行**深度情感分析**：
- 双方各自真正在意什么
- 哪些需求是共同的，哪些是冲突的
- 情感层面的连接点和断裂点

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

请输出一段连贯的中文分析（250-400字）。用温暖而深邃的洞察力，帮助双方看见自己。`;

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

  // Munger - Initial solution direction
  const mungerPrompt = `你是一位名叫"查理·芒格"的系统思维和决策专家。你的风格是务实、直接、有洞察力。

请基于双方的陈述，给出一个**初步解法方向**：
- 不必给出最终方案，而是提供一个值得尝试的思维框架
- 或一个短期实验方向（可测试的小行动）
- 用芒格式的直白和智慧来说话

发起人陈述：
【事实】${initiatorFact}
【感受】${initiatorFeeling}

回应者陈述：
${responderText}

请输出一段连贯的中文分析（200-300字）。务实、简洁、不绕弯子。`;

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

  return cards;
}

// ── Phase 4 interventions (during chat) ──

export async function generateIntervention(
  chatContext: string,
  mode: Mode
): Promise<string> {
  const conflictRole = mode === "parenting" ? "德雷克斯" : "罗杰斯";
  const prompt = `作为帮帮团（福尔摩斯、${conflictRole}、芒格），请阅读以下伴侣对话。如果对话陷入僵局、偏离主题、或出现攻击性言语，请给出温和的引导。如果对话进展顺利，只需说"继续"。

对话历史：
${chatContext}

请回应（如果无需干预，回复"不需要干预"；如果需要，给出1-3句温和的引导）：`;

  return await ask(prompt);
}

// ── Final Report ──

export async function generateFinalReport(
  initiatorFact: string,
  initiatorFeeling: string,
  responderText: string,
  chatMessages: string,
  mode: Mode
): Promise<FinalReport> {
  const conflictName = mode === "parenting" ? "德雷克斯" : "罗杰斯";

  // Run all 4 in parallel
  const [holmes, mungerResp, conflict, mungerActions] = await Promise.all([
    ask(`你是一位名叫"夏洛克·福尔摩斯"的事实解析师。

请用一句话总结本次分歧的核心事实与争议点。

发起人陈述：【事实】${initiatorFact}【感受】${initiatorFeeling}
回应者陈述：${responderText}
对话记录：${chatMessages}

请输出一段话（100-200字），明确点出分歧的核心是什么，不使用"你vs我"的说法，用"我们面临着…"的表达。`),

    ask(`你是一位名叫"查理·芒格"的思维专家。

请根据以下信息进行**责任裁定**。如果存在明显过失方，请清晰、中立地指出具体行为及其影响，不评判人格。如果没有明显过错方，说明核心在于理念差异或沟通方式问题。

发起人陈述：【事实】${initiatorFact}【感受】${initiatorFeeling}
回应者陈述：${responderText}
对话记录：${chatMessages}

请输出一段话（150-250字）。`),

    ask(`你是一位名叫"${conflictName}"的${mode === "parenting" ? "育儿" : "心理"}专家。

请指出双方的**共同出发点**。育儿模式的格式：肯定双方"为了孩子好"的共同初衷，指出各自方法背后的合理担忧。情感模式的格式：指出双方共同的深层渴望，肯定彼此为修复关系所做的坦诚努力。

发起人陈述：【事实】${initiatorFact}【感受】${initiatorFeeling}
回应者陈述：${responderText}
对话记录：${chatMessages}

请输出一段话（150-250字），温和而坚定地指出双方共同的出发点。`),

    ask(`你是一位名叫"查理·芒格"的思维专家。

请给出具体的**双向行动建议**，包含两个部分：
① 针对本次分歧的具体话术（双方可以说的话）
② 长期机制建议（如家庭会议制度、事前协商规则等）

发起人陈述：【事实】${initiatorFact}【感受】${initiatorFeeling}
回应者陈述：${responderText}
对话记录：${chatMessages}

请输出（200-400字）。具体、可操作，避免空洞的"多沟通"之类的话。`),
  ]);

  return {
    holmes,
    mungerResponsibility: mungerResp,
    conflictCommon: conflict,
    mungerActions,
  };
}
