const data = window.KNOWLEDGE_DATA;
const articleData = window.ARTICLE_DATA || { articles: [] };

const typeMeta = {
  story: { label: "故事", color: "#0f766e" },
  concept: { label: "概念", color: "#2563eb" },
  family: { label: "家族", color: "#b45309" },
  person: { label: "人物", color: "#be123c" },
  company: { label: "企业", color: "#6d28d9" },
  tool: { label: "工具", color: "#047857" },
  event: { label: "事件", color: "#c2410c" },
  segment: { label: "片段", color: "#475569" },
};

const state = {
  query: "",
  type: "all",
  topic: "all",
  selectedId: null,
  articleId: null,
};

const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
const articleByStoryId = new Map(articleData.articles.map((article) => [article.story_id, article]));
const storyTotal = data.nodes.filter((node) => node.type === "story").length;
const paragraphTotal = articleData.articles.reduce((sum, article) => sum + article.paragraphs.length, 0);
const degree = new Map(data.nodes.map((node) => [node.id, 0]));

for (const edge of data.edges) {
  degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
  degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
}

const els = {
  workspace: document.querySelector(".workspace"),
  generatedAt: document.querySelector("#generatedAt"),
  stats: document.querySelector("#stats"),
  topicFilters: document.querySelector("#topicFilters"),
  typeFilters: document.querySelector("#typeFilters"),
  quickNav: document.querySelector("#quickNav"),
  search: document.querySelector("#searchInput"),
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  graphMode: document.querySelector("#graphMode"),
  graph: document.querySelector("#graph"),
  content: document.querySelector("#content"),
};

const topics = [
  {
    id: "succession",
    title: "接班与继承人培养",
    question: "家族怎样把权力、能力和责任交给下一代？",
    thesis: "接班不是把职位交出去，而是提前设计训练、授权、试错和意外继承预案。",
    concepts: ["concept:succession-training", "concept:gradual-succession", "concept:succession-contingency", "concept:third-generation-risk"],
    stories: ["story:zhou-dafu", "story:agnelli", "story:lego", "story:toyoda", "story:wang-yongqing"],
    cautions: ["story:gucci", "story:stanley-ho", "story:hu-xueyan"],
    tools: ["tool:son-in-law-professional-succession", "tool:family-letters-as-governance", "tool:toji-succession"],
  },
  {
    id: "conflict",
    title: "兄弟共治与家族冲突",
    question: "亲情、股权和经营权发生冲突时，家族靠什么止损？",
    thesis: "冲突本身并不可怕，真正危险的是没有分歧处理规则、退出机制和共同底线。",
    concepts: ["concept:family-conflict-as-innovation", "concept:family-consensus", "concept:joint-sibling-leadership", "concept:governance-complexity"],
    stories: ["story:kikkoman", "story:ambani", "story:cp-group", "story:pao-family"],
    cautions: ["story:gucci", "story:stanley-ho", "story:medici"],
    tools: ["tool:brother-partnership", "tool:multi-branch-family-settlement", "tool:family-council"],
  },
  {
    id: "trust",
    title: "信托、分配与家族办公室",
    question: "财富越来越复杂时，家族怎样把分配和控制分开？",
    thesis: "信托和家族办公室不是装饰，而是把受益、控制、经营和沟通拆开的基础设施。",
    concepts: ["concept:family-trust", "concept:separation-of-rights", "concept:institutionalized-trust", "concept:family-trust-substituting-governance"],
    stories: ["story:pao-family", "story:zhou-dafu", "story:sheng-xuanhuai", "story:rockefeller"],
    cautions: ["story:stanley-ho", "story:hu-xueyan", "story:delong"],
    tools: ["tool:pao-family-trust", "tool:family-office", "tool:family-trust", "tool:family-council"],
  },
  {
    id: "ownership",
    title: "基金会、控股平台与所有权",
    question: "家族怎样既保持长期控制，又避免企业沦为私人提款机？",
    thesis: "好的所有权设计会给家族权力加边界，把企业使命、控制权和经营权重新排列。",
    concepts: ["concept:foundation-ownership", "concept:mission-locked-ownership", "concept:steward-ownership", "concept:family-as-guardian"],
    stories: ["story:bosch", "story:ikea", "story:agnelli", "story:lego", "story:hermes"],
    cautions: ["story:delong", "story:gucci"],
    tools: ["tool:foundation-ownership-structure", "tool:kirkbi-family-holding", "tool:holding-company-stewardship", "tool:family-holding-defense"],
  },
  {
    id: "professionalization",
    title: "职业经理人与家族控制",
    question: "家族什么时候该亲自经营，什么时候该退到所有者位置？",
    thesis: "职业经理人不是家族控制的反面，关键在授权边界、监督机制和家族守门能力。",
    concepts: ["concept:professionalization", "concept:enterprise-before-family", "concept:enterprise-independence", "concept:separation-of-rights"],
    stories: ["story:agnelli", "story:bosch", "story:watson-ibm", "story:gucci", "story:disney"],
    cautions: ["story:mars", "story:delong"],
    tools: ["tool:external-ceo-family-control", "tool:professional-corporate-culture", "tool:brand-professionalization"],
  },
  {
    id: "craft",
    title: "品牌、工艺与长期主义",
    question: "为什么有些家族企业能把标准守成护城河？",
    thesis: "长期品牌靠的不是怀旧，而是把质量、工艺、产品系统和克制增长变成组织纪律。",
    concepts: ["concept:standard-setting", "concept:patient-long-termism", "concept:reinvestment-discipline", "concept:constraint-as-power"],
    stories: ["story:lego", "story:hermes", "story:takagi-shuzo", "story:kikkoman", "story:zhou-dafu"],
    cautions: ["story:gucci"],
    tools: ["tool:quality-motto", "tool:lego-system-of-play", "tool:craft-standard-governance", "tool:limited-production-standard"],
  },
  {
    id: "credit-risk",
    title: "信用、官商与资金链风险",
    question: "个人信用和融资能力为什么可能反过来拖垮家族？",
    thesis: "信用可以放大事业，也会放大错误；缺少刹车机制时，能借到钱会变成最危险的能力。",
    concepts: ["concept:credit-capital", "concept:capital-chain-risk", "concept:debt-pressure", "concept:brake-mechanism", "concept:funding-boundary"],
    stories: ["story:hu-xueyan", "story:delong", "story:qiao-family", "story:sheng-xuanhuai", "story:patek-philippe"],
    cautions: ["story:delong", "story:hu-xueyan", "story:zhou-dafu"],
    tools: ["tool:anti-fraud-motto", "tool:official-merchant-network", "tool:unlimited-liability-partnership", "tool:book-value-exit"],
  },
  {
    id: "legitimacy",
    title: "慈善、文化与家族合法性",
    question: "财富如何从私人资产变成公共信任？",
    thesis: "慈善和文化不是声誉包装，而是家族把财富嵌入社会、城市和代际记忆的方式。",
    concepts: ["concept:philanthropy-as-governance", "concept:cultural-legitimacy", "concept:mission-locked-ownership", "concept:community-embeddedness"],
    stories: ["story:rockefeller", "story:medici", "story:pao-family", "story:pei-family", "story:rong-family"],
    cautions: ["story:gucci", "story:hu-xueyan"],
    tools: ["tool:philanthropic-foundation-governance", "tool:cultural-patronage", "tool:family-pact-cultural-legacy", "tool:medical-philanthropy"],
  },
  {
    id: "rules",
    title: "家训、宪章与制度化信任",
    question: "家训什么时候只是口号，什么时候能变成治理制度？",
    thesis: "家训有效的前提，是它能转译成选择、惩戒、退出、教育和共同决策规则。",
    concepts: ["concept:family-constitution", "concept:institutionalized-trust", "concept:family-consensus", "concept:one-member-per-branch"],
    stories: ["story:kikkoman", "story:zeng-guofan", "story:rockefeller", "story:hermes", "story:hu-xueyan"],
    cautions: ["story:delong", "story:gucci"],
    tools: ["tool:family-letters-as-governance", "tool:daily-cultivation-rules", "tool:three-donts-family-instruction", "tool:family-rules-and-frugality"],
  },
  {
    id: "failure",
    title: "失败案例与反向教材",
    question: "家族企业崩塌前，通常先坏在哪一层？",
    thesis: "失败往往不是缺少野心，而是缺少边界：资金边界、权力边界、亲属边界和风险边界。",
    concepts: ["concept:founder-expansion-bias", "concept:financialization-trap", "concept:information-opacity", "concept:succession-planning-gap", "concept:brake-mechanism"],
    stories: ["story:delong", "story:hu-xueyan", "story:gucci", "story:stanley-ho", "story:sheng-xuanhuai"],
    cautions: ["story:delong", "story:hu-xueyan", "story:gucci"],
    tools: ["tool:three-donts-family-instruction", "tool:book-value-exit", "tool:multi-branch-family-settlement"],
  },
];

const topicById = new Map(topics.map((topic) => [topic.id, topic]));
const topicNodeCache = new Map();

const topicGuides = {
  succession: {
    judgement: "接班的核心不是找到一个“像创始人”的人，而是让下一代在真正接权前，已经被制度训练、被组织检验、被风险预案保护。",
    mistakes: [
      "把接班理解成职位交接，忽略能力、责任和权威的长期形成。",
      "只准备一个继承人，却没有意外死亡、主动退出或能力不足时的备用安排。",
      "让创始人长期保护企业，同时压缩下一代独立决策和犯错空间。",
    ],
    principles: [
      "提前设计继承人训练场景，而不是等到交班时才判断能力。",
      "把继承权、经营权和所有者责任拆开评估。",
      "为突发继承危机准备临时治理人、外部经理人和家族共识机制。",
    ],
    reading: ["story:agnelli", "story:lego", "story:toyoda", "story:zhou-dafu", "concept:succession-contingency"],
  },
  conflict: {
    judgement: "家族冲突无法被亲情消除，只能被规则吸收。好的治理不是没有分歧，而是分歧出现时仍有共同底线和可执行程序。",
    mistakes: [
      "把兄弟和睦当作治理结构，忽略股权、职位和现金流的真实差异。",
      "在冲突爆发后才临时谈规则，导致每一次协商都变成重新分家。",
      "只追求表面团结，不给不同分支合理的退出和表达渠道。",
    ],
    principles: [
      "在顺境中先定义分歧处理程序。",
      "让家族共识落到董事会、股权安排、分红规则和退出机制上。",
      "区分家庭关系修复和企业治理决策，不让情绪替代规则。",
    ],
    reading: ["story:kikkoman", "story:ambani", "story:pao-family", "story:gucci", "concept:family-conflict-as-innovation"],
  },
  trust: {
    judgement: "信托和家族办公室的价值，不在于把财富藏起来，而在于把受益、控制、经营和沟通拆开，让复杂家族仍能协同。",
    mistakes: [
      "把信托当成税务或避险工具，忽略家族成员之间的分配心理。",
      "受托安排很复杂，但经营授权和家族沟通仍靠个人威望。",
      "只解决资产归属，不解决下一代如何参与、学习和退出。",
    ],
    principles: [
      "先定义家族目标，再设计信托结构。",
      "让家族办公室承担记录、沟通、教育和治理支持功能。",
      "把公平分配和有效经营分开处理，避免平均主义拖垮企业。",
    ],
    reading: ["story:pao-family", "story:zhou-dafu", "story:sheng-xuanhuai", "tool:pao-family-trust", "concept:family-trust"],
  },
  ownership: {
    judgement: "所有权设计的高级目标，是让家族有能力守住方向，同时没有能力随意掏空企业。",
    mistakes: [
      "把控制权等同于经营权，导致家族成员必须占据所有关键位置。",
      "用复杂架构制造神秘感，却没有清楚说明使命、监督和退出规则。",
      "只追求不上市的自由，忽略私有企业同样需要透明度和纪律。",
    ],
    principles: [
      "把所有权、经营权、监督权和使命约束分层设计。",
      "用基金会、控股平台或家族协议锁定长期目标。",
      "让家族从经营者逐步升级为长期所有者和价值守门人。",
    ],
    reading: ["story:bosch", "story:ikea", "story:agnelli", "story:hermes", "concept:steward-ownership"],
  },
  professionalization: {
    judgement: "职业经理人不是家族控制的对立面。真正的问题是家族有没有能力授权、监督，并在关键时刻判断谁适合驾驶企业。",
    mistakes: [
      "把外部经理人视为失控风险，因此长期让能力不足的家族成员占位。",
      "只引入经理人，却没有清晰授权边界和评价机制。",
      "家族退出经营后，也退出了所有者责任。",
    ],
    principles: [
      "让家族保留方向、价值和重大人事判断。",
      "给职业经理人明确的经营权和可衡量目标。",
      "把家族成员培养成好所有者，而不强迫每个人成为经营者。",
    ],
    reading: ["story:agnelli", "story:bosch", "story:watson-ibm", "story:gucci", "concept:professionalization"],
  },
  craft: {
    judgement: "长期品牌不是靠家族怀旧守出来的，而是靠标准、材料、工艺和克制增长共同形成的组织纪律。",
    mistakes: [
      "把传统理解成不变化，导致产品系统失去更新能力。",
      "在品牌受欢迎后过度授权、过度扩张，稀释标准。",
      "把工艺交给少数师傅或家族成员记忆，没有形成可训练流程。",
    ],
    principles: [
      "把质量信念翻译成材料、流程、检验和产品系统。",
      "让稀缺性成为治理约束，而不是单纯营销话术。",
      "用长期再投资保护品牌根部，不被短期利润牵走。",
    ],
    reading: ["story:lego", "story:hermes", "story:takagi-shuzo", "story:kikkoman", "concept:standard-setting"],
  },
  "credit-risk": {
    judgement: "信用是家族事业的加速器，也可能是崩塌的放大器。越能融资，越需要刹车机制。",
    mistakes: [
      "把能借到钱当成经营能力，忽略现金流和风险期限错配。",
      "依赖创始人个人信用和官商关系，缺少组织化风控。",
      "在成功经验中不断加杠杆，直到一次外部冲击击穿全部信用。",
    ],
    principles: [
      "为融资能力设置用途边界、期限边界和止损边界。",
      "让风险决策拥有真实否决权，而不是只做提醒。",
      "把个人信用沉淀为制度信用，避免所有关系系于一人。",
    ],
    reading: ["story:hu-xueyan", "story:delong", "story:patek-philippe", "concept:brake-mechanism", "concept:capital-chain-risk"],
  },
  legitimacy: {
    judgement: "慈善和文化不是财富的装饰，而是家族把私人成功转化为公共信任和城市记忆的方式。",
    mistakes: [
      "把公益当成声誉修补，而不是家族使命的一部分。",
      "只捐钱，不建立可持续机构和治理规则。",
      "文化赞助脱离家族价值，最后变成消费而非传承。",
    ],
    principles: [
      "让公益方向与家族长期价值一致。",
      "用基金会、学校、博物馆或城市资产承接家族记忆。",
      "把公共性当作家族合法性的一部分，而不是企业利润之后的附属品。",
    ],
    reading: ["story:rockefeller", "story:medici", "story:pao-family", "story:pei-family", "concept:philanthropy-as-governance"],
  },
  rules: {
    judgement: "家训只有进入选择、惩戒、教育、分配和退出机制，才会从口号变成治理制度。",
    mistakes: [
      "把创始人的品德故事当成家族制度。",
      "后代只背诵家训，却没有对应的行为边界和决策流程。",
      "用道德要求替代股权、职位、分红和风险的硬规则。",
    ],
    principles: [
      "把家训翻译成可执行的家族宪章和议事规则。",
      "用教育、例会、记录和家族办公室维持规则记忆。",
      "允许规则更新，但不允许核心价值被临时情绪替代。",
    ],
    reading: ["story:kikkoman", "story:zeng-guofan", "story:rockefeller", "story:hu-xueyan", "concept:family-constitution"],
  },
  failure: {
    judgement: "家族企业失败通常不是野心不足，而是边界不足：资金边界、权力边界、亲属边界和风险边界同时失守。",
    mistakes: [
      "把过往成功归因于创始人直觉，于是不断扩大同一种赌法。",
      "家族信任替代公司治理，亲密关系替代风险披露。",
      "危机发生后只救现金流，不重建决策和监督结构。",
    ],
    principles: [
      "先识别单点依赖：人、钱、关系、牌照、客户或政策。",
      "让反对意见拥有制度位置和否决权。",
      "把失败案例当成治理压力测试，而不是道德评价。",
    ],
    reading: ["story:delong", "story:hu-xueyan", "story:gucci", "story:sheng-xuanhuai", "concept:founder-expansion-bias"],
  },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncate(value, size = 42) {
  const text = String(value ?? "");
  return text.length > size ? `${text.slice(0, size - 1)}…` : text;
}

function labelFor(id) {
  return nodeById.get(id)?.title || id;
}

function colorFor(type) {
  return typeMeta[type]?.color || "#475569";
}

function selectedTopic() {
  return state.topic === "all" ? null : topicById.get(state.topic);
}

function focusWorkspace() {
  els.workspace?.scrollIntoView?.({ block: "start" });
}

function topicSeeds(topic) {
  if (!topic) return [];
  return uniqueIds([
    ...topic.concepts,
    ...topic.stories,
    ...topic.cautions,
    ...topic.tools,
  ]).filter((id) => nodeById.has(id));
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function topicNodeIds(topicId) {
  if (topicId === "all") return null;
  if (topicNodeCache.has(topicId)) return topicNodeCache.get(topicId);

  const topic = topicById.get(topicId);
  const ids = new Set(topicSeeds(topic));
  for (const edge of data.edges) {
    if (ids.has(edge.source) || ids.has(edge.target)) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
  }

  topicNodeCache.set(topicId, ids);
  return ids;
}

function matchesTopic(node) {
  const ids = topicNodeIds(state.topic);
  return !ids || ids.has(node.id);
}

function matchesQuery(node) {
  if (!state.query) return true;
  const haystack = [
    node.id,
    node.title,
    node.summary,
    JSON.stringify(node.frontmatter),
  ].join(" ").toLowerCase();
  return haystack.includes(state.query.toLowerCase());
}

function visibleNodes() {
  return data.nodes.filter((node) => {
    const typeMatch = state.type === "all" || node.type === state.type;
    return typeMatch && matchesTopic(node) && matchesQuery(node);
  });
}

function connectedEdges(id) {
  return data.edges.filter((edge) => edge.source === id || edge.target === id);
}

function otherNode(edge, id) {
  return edge.source === id ? edge.target : edge.source;
}

function renderStats() {
  const stats = [
    ["故事", storyTotal],
    ["节点", data.nodes.length],
    ["关系", data.edges.length],
    ["段落", paragraphTotal],
  ];

  els.stats.innerHTML = stats
    .map(([label, count]) => `<div class="stat"><strong>${count.toLocaleString("zh-CN")}</strong><span>${label}</span></div>`)
    .join("");
}

function renderTypeFilters() {
  const ordered = ["all", "story", "concept", "family", "person", "company", "tool", "event", "segment"];
  const counts = data.nodes.reduce((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {});

  els.typeFilters.innerHTML = ordered
    .map((type) => {
      const label = type === "all" ? "全部" : typeMeta[type].label;
      const count = type === "all" ? data.nodes.length : counts[type] || 0;
      return `<button class="type-pill" data-type="${type}" aria-pressed="${state.type === type}">${label} ${count}</button>`;
    })
    .join("");
}

function renderTopicFilters() {
  const activeTopic = selectedTopic();
  const topicButtons = topics
    .map((topic) => {
      const count = topicNodeIds(topic.id)?.size || 0;
      return `<button class="topic-pill" data-topic="${topic.id}" aria-pressed="${state.topic === topic.id}">
        <span>${escapeHtml(topic.title)}</span>
        <strong>${count}</strong>
      </button>`;
    })
    .join("");

  els.topicFilters.innerHTML = `
    <section class="topic-group">
      <div class="topic-group-header">
        <h2>治理专题</h2>
        <button class="topic-clear" data-topic="all" aria-pressed="${state.topic === "all"}">全部</button>
      </div>
      <div class="topic-list">${topicButtons}</div>
      ${activeTopic ? `<p class="topic-mini">${escapeHtml(activeTopic.question)}</p>` : ""}
    </section>
  `;
}

function navItem(node) {
  const active = node.id === state.selectedId ? " is-active" : "";
  return `
    <button class="nav-item${active}" data-id="${escapeHtml(node.id)}">
      <span class="dot" style="color:${colorFor(node.type)}"></span>
      <span>
        <span class="nav-item-title">${escapeHtml(node.title)}</span>
        <span class="nav-item-meta">${escapeHtml(typeMeta[node.type]?.label || node.type)} · ${degree.get(node.id) || 0} 连接</span>
      </span>
    </button>
  `;
}

function byConnectionThenTitle(a, b) {
  return (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.title.localeCompare(b.title, "zh-CN");
}

function emptyState(message = "没有匹配节点") {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function nodeLink(id, className = "inline-link") {
  if (!nodeById.has(id)) return "";
  return `<button class="${className}" data-id="${escapeHtml(id)}">${escapeHtml(labelFor(id))}</button>`;
}

function articleForNode(node) {
  return node?.type === "story" ? articleByStoryId.get(node.id) : null;
}

function linkedChips(ids, limit = 12) {
  const chips = ids
    .filter((id) => nodeById.has(id))
    .slice(0, limit)
    .map((id) => nodeLink(id))
    .join("");
  return chips ? `<div class="chip-list">${chips}</div>` : emptyState("暂无节点");
}

function renderArticleEntry(node) {
  const article = articleForNode(node);
  if (!article) return "";

  return `
    <button class="read-button" data-article-id="${escapeHtml(article.story_id)}">
      <span>阅读全文</span>
      <strong>${escapeHtml(article.paragraphs.length)} 段</strong>
    </button>
  `;
}

function renderGuideList(items) {
  return `
    <ul>
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function renderReadingPath(ids) {
  return `
    <div class="guide-reading">
      ${ids.filter((id) => nodeById.has(id)).map((id, index) => `
        <button data-id="${escapeHtml(id)}">
          <span>${index + 1}</span>
          <strong>${escapeHtml(labelFor(id))}</strong>
          <em>${escapeHtml(typeMeta[nodeById.get(id).type]?.label || nodeById.get(id).type)}</em>
        </button>
      `).join("")}
    </div>
  `;
}

function renderTopicGuide(topic) {
  const guide = topicGuides[topic.id];
  if (!guide) return "";

  return `
    <article class="panel panel-wide guide-article">
      <div class="guide-kicker">专题导读</div>
      <div class="guide-head">
        <h3>核心判断</h3>
        <p>${escapeHtml(guide.judgement)}</p>
      </div>
      <div class="guide-columns">
        <section class="guide-section guide-mistakes">
          <h4>常见误区</h4>
          ${renderGuideList(guide.mistakes)}
        </section>
        <section class="guide-section guide-principles">
          <h4>治理原则</h4>
          ${renderGuideList(guide.principles)}
        </section>
      </div>
      <section class="guide-section guide-path">
        <h4>推荐阅读路径</h4>
        ${renderReadingPath(guide.reading)}
      </section>
    </article>
  `;
}

function topicCard(topic) {
  const count = topicNodeIds(topic.id)?.size || 0;
  const storyLabels = topic.stories
    .filter((id) => nodeById.has(id))
    .slice(0, 3)
    .map((id) => labelFor(id));

  return `
    <article class="topic-card" data-topic="${escapeHtml(topic.id)}">
      <div class="topic-card-top">
        <span>治理专题</span>
        <strong>${count} 节点</strong>
      </div>
      <h4>${escapeHtml(topic.title)}</h4>
      <p>${escapeHtml(topic.thesis)}</p>
      <div class="topic-card-meta">${escapeHtml(storyLabels.join(" / "))}</div>
    </article>
  `;
}

function readingPath(title, topicIds) {
  return `
    <article class="pathway">
      <h4>${escapeHtml(title)}</h4>
      <div class="pathway-steps">
        ${topicIds.map((topicId, index) => {
          const topic = topicById.get(topicId);
          return topic
            ? `<button data-topic="${escapeHtml(topic.id)}"><span>${index + 1}</span>${escapeHtml(topic.title)}</button>`
            : "";
        }).join("")}
      </div>
    </article>
  `;
}

function storyComparison(topic) {
  const positive = topic.stories.filter((id) => nodeById.has(id));
  const caution = topic.cautions.filter((id) => nodeById.has(id));
  return `
    <div class="comparison-grid">
      <div>
        <h4>样本案例</h4>
        <div class="story-stack">${positive.map((id) => card(nodeById.get(id))).join("")}</div>
      </div>
      <div>
        <h4>风险案例</h4>
        <div class="story-stack">${caution.map((id) => card(nodeById.get(id))).join("")}</div>
      </div>
    </div>
  `;
}

function renderQuickNav() {
  const nodes = visibleNodes();
  const topic = selectedTopic();
  const isFiltered = Boolean(state.query || state.type !== "all" || topic);
  const activeItems = [...nodes].sort(byConnectionThenTitle).slice(0, 14);
  const storyItems = nodes.filter((node) => node.type === "story").slice(0, topic ? 12 : 8);
  const conceptItems = nodes
    .filter((node) => node.type === "concept")
    .sort(byConnectionThenTitle)
    .slice(0, 10);
  const entityItems = nodes
    .filter((node) => ["family", "person", "company", "tool", "event"].includes(node.type))
    .sort(byConnectionThenTitle)
    .slice(0, 10);
  const segmentItems = nodes
    .filter((node) => node.type === "segment")
    .slice(0, 12);

  const sections = isFiltered
    ? [["匹配节点", activeItems]]
    : [
        ["故事", storyItems],
        ["高频概念", conceptItems],
        ["实体与事件", entityItems],
        ["片段", segmentItems],
      ].filter(([, items]) => items.length);

  els.quickNav.innerHTML = sections.length
    ? sections
    .map(([title, items]) => `
      <section class="nav-group">
        <h2>${title}</h2>
        <div class="nav-list">${items.length ? items.map(navItem).join("") : emptyState()}</div>
      </section>
    `)
    .join("")
    : emptyState();
}

function card(node) {
  const meta = node.frontmatter;
  const chips = [
    meta.series_no ? `第 ${meta.series_no} 期` : null,
    node.type === "concept" ? meta.category : null,
    node.type === "story" && meta.industries?.length ? meta.industries.slice(0, 2).join(" / ") : null,
    `${degree.get(node.id) || 0} 连接`,
  ].filter(Boolean);
  const summary = node.type === "story" && meta.family_governance_signature
    ? meta.family_governance_signature
    : node.summary;

  return `
    <article class="card card-${escapeHtml(node.type)}" data-id="${escapeHtml(node.id)}">
      <div class="card-type" style="color:${colorFor(node.type)}">${escapeHtml(typeMeta[node.type]?.label || node.type)}</div>
      <h4>${escapeHtml(node.title)}</h4>
      <p>${escapeHtml(truncate(summary, 132))}</p>
      <div class="chip-list" style="margin-top:14px">
        ${chips.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}
      </div>
    </article>
  `;
}

function renderOverview() {
  const nodes = visibleNodes();
  const topic = selectedTopic();
  const isFiltered = Boolean(state.query || state.type !== "all");

  if (topic && !isFiltered) {
    const topicNodes = [...nodes].sort(byConnectionThenTitle).slice(0, 18);
    const knowledgeIds = uniqueIds([...topic.concepts, ...topic.tools]).filter((id) => nodeById.has(id));
    return `
      <section class="panel panel-wide topic-brief">
        <div class="card-type">治理专题</div>
        <h3>${escapeHtml(topic.title)}</h3>
        <p class="topic-question">${escapeHtml(topic.question)}</p>
        <p>${escapeHtml(topic.thesis)}</p>
        ${linkedChips(topic.concepts, 8)}
      </section>
      ${renderTopicGuide(topic)}
      <section class="panel panel-wide">
        <h3>案例对照</h3>
        ${storyComparison(topic)}
      </section>
      <section class="panel">
        <h3>知识点与工具</h3>
        <div class="card-grid">${knowledgeIds.map((id) => card(nodeById.get(id))).join("")}</div>
      </section>
      <section class="panel">
        <h3>专题节点</h3>
        <div class="card-grid">${topicNodes.map(card).join("")}</div>
      </section>
    `;
  }

  if (isFiltered) {
    const matches = [...nodes].sort((a, b) => {
      const typeDelta = (typeMeta[a.type]?.label || a.type).localeCompare(typeMeta[b.type]?.label || b.type, "zh-CN");
      return typeDelta || byConnectionThenTitle(a, b);
    });

    return `
      <section class="panel panel-wide">
        <h3>匹配节点</h3>
        ${matches.length ? `<div class="card-grid">${matches.map(card).join("")}</div>` : emptyState("没有找到匹配节点")}
      </section>
      <section class="panel result-note">
        <h3>结果脉络</h3>
        <p>${escapeHtml(matches.length)} 个节点与当前筛选条件匹配，关系图谱会呈现这些节点的一跳连接。</p>
      </section>
    `;
  }

  const stories = nodes.filter((node) => node.type === "story");
  const concepts = nodes
    .filter((node) => node.type === "concept")
    .sort(byConnectionThenTitle)
    .slice(0, 12);
  const highlightedTopics = topics.slice(0, 6);
  const topStories = [...stories].sort(byConnectionThenTitle).slice(0, 9);

  return `
    <section class="atlas-layout panel-wide">
      <div class="home-hero">
        <div class="card-type">Family Governance Atlas</div>
        <h3>把 ${storyTotal} 篇家族故事，整理成一张可验证的治理地图。</h3>
        <p>从家族实践故事出发，连接治理主题、人物、机构、制度工具和关键事件，形成可检索、可追溯、可继续扩展的研究底稿。</p>
        <div class="hero-metrics">
          <div><strong>${stories.length}</strong><span>家族故事</span></div>
          <div><strong>${topics.length}</strong><span>治理专题</span></div>
          <div><strong>${paragraphTotal.toLocaleString("zh-CN")}</strong><span>段落引用</span></div>
        </div>
      </div>
      <aside class="atlas-brief">
        <h3>研究摘要</h3>
        <ul>
          <li>以故事原文为底稿，保留完整阅读入口。</li>
          <li>以治理问题组织知识，而不是按发布时间排列。</li>
          <li>每个节点都能回到原文、专题或关系图谱。</li>
        </ul>
      </aside>
    </section>
    <section class="panel panel-wide topic-section">
      <div class="panel-heading">
        <h3>从问题进入</h3>
        <span>专题导读</span>
      </div>
      <div class="topic-card-grid">${highlightedTopics.map(topicCard).join("")}</div>
    </section>
    <section class="panel panel-wide pathway-section">
      <div class="panel-heading">
        <h3>推荐阅读路径</h3>
        <span>三条主线</span>
      </div>
      <div class="pathway-grid">
        ${readingPath("传承设计", ["succession", "trust", "rules"])}
        ${readingPath("所有权与经营", ["ownership", "professionalization", "craft"])}
        ${readingPath("风险与失败", ["credit-risk", "failure", "legitimacy"])}
      </div>
    </section>
    <section class="panel panel-wide story-section">
      <div class="panel-heading">
        <h3>代表案例</h3>
        <span>高连接故事</span>
      </div>
      <div class="card-grid">${topStories.map(card).join("")}</div>
    </section>
    <section class="panel panel-wide concept-section">
      <h3>概念入口</h3>
      <div class="card-grid">${concepts.map(card).join("")}</div>
    </section>
  `;
}

function renderMetaValue(value) {
  if (Array.isArray(value)) {
    return `
      <div class="chip-list">
        ${value.map((item) => {
          if (nodeById.has(item)) {
            return `<button class="inline-link" data-id="${escapeHtml(item)}">${escapeHtml(labelFor(item))}</button>`;
          }
          return `<span class="chip">${escapeHtml(item)}</span>`;
        }).join("")}
      </div>
    `;
  }

  if (nodeById.has(value)) {
    return `<button class="inline-link" data-id="${escapeHtml(value)}">${escapeHtml(labelFor(value))}</button>`;
  }

  if (typeof value === "object" && value !== null) {
    return `<code>${escapeHtml(JSON.stringify(value))}</code>`;
  }

  return `<span>${escapeHtml(value)}</span>`;
}

function renderMetadata(node) {
  const skip = new Set(["id", "type", "title", "reviewed"]);
  const priority = [
    "series_no",
    "category",
    "story",
    "families",
    "family",
    "key_people",
    "related_people",
    "key_companies",
    "related_companies",
    "concepts",
    "related_concepts",
    "events",
    "tools",
    "source_segments",
    "source_stories",
    "source_file",
  ];

  const keys = [
    ...priority.filter((key) => key in node.frontmatter),
    ...Object.keys(node.frontmatter).filter((key) => !priority.includes(key)),
  ].filter((key) => !skip.has(key));

  return keys
    .map((key) => `
      <div class="meta-row">
        <div class="meta-label">${escapeHtml(key)}</div>
        ${renderMetaValue(node.frontmatter[key])}
      </div>
    `)
    .join("");
}

function renderEdges(node) {
  const edges = connectedEdges(node.id)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 16);

  if (!edges.length) return "<p class='empty-state'>还没有关系边</p>";

  return `
    <ul class="edge-list">
      ${edges.map((edge) => {
        const target = otherNode(edge, node.id);
        return `
          <li class="edge-item">
            <strong>
              <button class="inline-link" data-id="${escapeHtml(target)}">${escapeHtml(labelFor(target))}</button>
              <span>${escapeHtml(edge.label || edge.type)}</span>
            </strong>
            <span>${escapeHtml(edge.evidence || "")}</span>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function renderArticleToc(article) {
  const toc = article.toc.slice(0, 80);
  if (!toc.length) return emptyState("暂无目录");

  return `
    <nav class="article-toc" aria-label="文章目录">
      ${toc.map((item) => `
        <button class="toc-item toc-level-${item.level}" data-para="${escapeHtml(item.id)}">
          ${escapeHtml(truncate(item.title, 34))}
        </button>
      `).join("")}
    </nav>
  `;
}

function renderParagraphLinks(ids) {
  const links = ids
    .filter((id) => nodeById.has(id))
    .slice(0, 5)
    .map((id) => nodeLink(id, "inline-link para-link"))
    .join("");
  return links ? `<div class="para-links">${links}</div>` : "";
}

function renderArticleParagraph(paragraph) {
  const text = escapeHtml(paragraph.text);
  const anchor = `<span class="para-num">${paragraph.index}</span>`;
  const links = renderParagraphLinks(paragraph.related_node_ids || []);

  if (paragraph.kind === "heading") {
    const tag = paragraph.level <= 1 ? "h2" : paragraph.level === 2 ? "h3" : "h4";
    return `
      <${tag} id="${escapeHtml(paragraph.id)}" class="article-heading article-heading-${paragraph.level}">
        ${anchor}
        <span>${text}</span>
      </${tag}>
    `;
  }

  return `
    <div id="${escapeHtml(paragraph.id)}" class="article-paragraph article-${escapeHtml(paragraph.kind)}">
      ${anchor}
      <span>${text}</span>
      ${links}
    </div>
  `;
}

function renderArticleReader(article) {
  const story = nodeById.get(article.story_id);
  const relatedIds = uniqueIds([article.story_id, ...(article.related_node_ids || [])]).filter((id) => nodeById.has(id));
  const sourceList = article.source_files
    .map((file) => `<span class="source-chip">${escapeHtml(file.replace(/^文章\//, ""))}</span>`)
    .join("");

  return `
    <section class="article-reader panel-wide">
      <article class="article-main">
        <div class="article-toolbar">
          <button class="reset-button" data-id="${escapeHtml(article.story_id)}">返回节点</button>
          <button class="reset-button" data-reset="true">返回地图</button>
        </div>
        <header class="article-header">
          <div class="card-type">正文阅读</div>
          <h3>${escapeHtml(article.title)}</h3>
          <p>${story ? escapeHtml(story.frontmatter.family_governance_signature || story.summary) : ""}</p>
          <div class="article-source-list">${sourceList}</div>
        </header>
        <div class="article-body">
          ${article.paragraphs.map(renderArticleParagraph).join("")}
        </div>
      </article>
      <aside class="article-sidebar">
        <section class="reader-panel">
          <h4>目录</h4>
          ${renderArticleToc(article)}
        </section>
        <section class="reader-panel knowledge-backlinks">
          <h4>关联知识节点</h4>
          ${linkedChips(relatedIds, 18)}
        </section>
      </aside>
    </section>
  `;
}

function renderDetail(node) {
  return `
    <section class="panel detail">
      <div class="detail-header">
        <div>
          <div class="card-type" style="color:${colorFor(node.type)}">${escapeHtml(typeMeta[node.type]?.label || node.type)}</div>
          <h3>${escapeHtml(node.title)}</h3>
        </div>
        <div class="detail-actions">
          ${renderArticleEntry(node)}
          <button class="reset-button" data-reset="true">返回地图</button>
        </div>
      </div>
      <p>${escapeHtml(node.summary)}</p>
      <dl class="meta-list">${renderMetadata(node)}</dl>
    </section>
    <section class="panel detail-links">
      <h3>连接</h3>
      ${renderEdges(node)}
    </section>
  `;
}

const graphTypeLimits = {
  story: 8,
  family: 5,
  person: 7,
  company: 5,
  concept: 8,
  tool: 6,
  event: 5,
};

function graphPriority(node, focusId = null) {
  const focusBonus = node.id === focusId ? 10000 : 0;
  const reviewedBonus = node.frontmatter.reviewed ? 8 : 0;
  const storyBonus = node.type === "story" ? 16 : 0;
  return focusBonus + storyBonus + reviewedBonus + (degree.get(node.id) || 0);
}

function capGraphNodes(nodes, focusId = null) {
  const byType = nodes.reduce((acc, node) => {
    if (node.type === "segment") return acc;
    acc[node.type] ||= [];
    acc[node.type].push(node);
    return acc;
  }, {});

  const capped = [];
  for (const type of ["story", "family", "person", "company", "concept", "tool", "event"]) {
    const group = byType[type] || [];
    group.sort((a, b) => graphPriority(b, focusId) - graphPriority(a, focusId) || a.title.localeCompare(b.title, "zh-CN"));
    capped.push(...group.slice(0, graphTypeLimits[type] || 4));
  }

  if (focusId && nodeById.has(focusId) && !capped.some((node) => node.id === focusId)) {
    capped.unshift(nodeById.get(focusId));
  }

  return capped.slice(0, 36);
}

const personRelationPriority = {
  parent_child: 9,
  successor: 8,
  spouse: 7,
  sibling: 6,
  partner: 5,
  professional_delegate: 4,
  conflict: 3,
  mentor: 2,
};

function isPersonPersonEdge(edge) {
  return edge.source.startsWith("person:") && edge.target.startsWith("person:");
}

function storyNumber(storyId) {
  return nodeById.get(storyId)?.frontmatter.series_no || 0;
}

function comparePersonRelations(a, b) {
  return (
    (personRelationPriority[b.type] || 0) - (personRelationPriority[a.type] || 0) ||
    (b.confidence || 0) - (a.confidence || 0) ||
    labelFor(a.source).localeCompare(labelFor(b.source), "zh-CN")
  );
}

function personNetworkSelection() {
  const allEdges = data.edges.filter(isPersonPersonEdge);
  const allPersonIds = new Set(allEdges.flatMap((edge) => [edge.source, edge.target]));
  const byStory = allEdges.reduce((acc, edge) => {
    const storyId = edge.source_story || "story:unknown";
    acc[storyId] ||= [];
    acc[storyId].push(edge);
    return acc;
  }, {});

  const storyIds = Object.keys(byStory)
    .filter((storyId) => storyId !== "story:unknown")
    .sort((a, b) => storyNumber(b) - storyNumber(a) || labelFor(a).localeCompare(labelFor(b), "zh-CN"))
    .slice(0, 6);

  for (const storyId of storyIds) byStory[storyId].sort(comparePersonRelations);

  const edges = [];
  const personIds = new Set();
  const addEdge = (edge) => {
    const newNodeCount = [edge.source, edge.target].filter((id) => !personIds.has(id)).length;
    if (edges.length >= 20 || personIds.size + newNodeCount > 26) return false;
    edges.push(edge);
    personIds.add(edge.source);
    personIds.add(edge.target);
    return true;
  };

  for (let round = 0; round < 2; round++) {
    for (const storyId of storyIds) {
      const edge = byStory[storyId][round];
      if (edge) addEdge(edge);
    }
  }

  for (const storyId of storyIds) {
    for (const edge of byStory[storyId].slice(3)) addEdge(edge);
  }

  const nodes = [...personIds].map((id) => nodeById.get(id)).filter(Boolean);
  return {
    nodes,
    edges,
    sourceCount: allPersonIds.size,
    edgeSourceCount: allEdges.length,
    mode: "person-network",
    focusId: null,
    hiddenCount: Math.max(0, allPersonIds.size - nodes.length),
    hiddenEdgeCount: Math.max(0, allEdges.length - edges.length),
    segmentCount: 0,
  };
}

function graphSelection() {
  let sourceNodes = [];
  let sourceCount = 0;
  let mode = "overview";
  let focusId = null;

  if (state.selectedId) {
    const ids = new Set([state.selectedId]);
    for (const edge of connectedEdges(state.selectedId)) ids.add(otherNode(edge, state.selectedId));
    sourceNodes = [...ids].map((id) => nodeById.get(id)).filter(Boolean);
    sourceCount = sourceNodes.length;
    mode = "focus";
    focusId = state.selectedId;
    return {
      nodes: capGraphNodes(sourceNodes, focusId),
      sourceCount,
      mode,
      focusId,
      hiddenCount: Math.max(0, sourceNodes.filter((node) => node.type !== "segment").length - capGraphNodes(sourceNodes, focusId).length),
      segmentCount: sourceNodes.filter((node) => node.type === "segment").length,
    };
  }

  if (state.type === "person" && state.topic === "all" && !state.query) {
    return personNetworkSelection();
  }

  const matches = visibleNodes();
  if (state.query || state.type !== "all" || state.topic !== "all") {
    const base = matches.slice(0, state.type === "segment" ? 50 : 60);
    const ids = new Set(base.map((node) => node.id));
    for (const edge of data.edges) {
      if (ids.has(edge.source) || ids.has(edge.target)) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
    }
    sourceNodes = [...ids].map((id) => nodeById.get(id)).filter(Boolean);
    sourceCount = sourceNodes.length;
    mode = "filtered";
    const nodes = capGraphNodes(sourceNodes);
    return {
      nodes,
      sourceCount,
      mode,
      focusId,
      hiddenCount: Math.max(0, sourceNodes.filter((node) => node.type !== "segment").length - nodes.length),
      segmentCount: sourceNodes.filter((node) => node.type === "segment").length,
    };
  }

  const stories = data.nodes.filter((node) => node.type === "story");
  const concepts = data.nodes
    .filter((node) => node.type === "concept")
    .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
    .slice(0, 34);
  const entities = data.nodes
    .filter((node) => ["family", "company", "tool", "event"].includes(node.type))
    .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
    .slice(0, 22);
  sourceNodes = [...stories, ...concepts, ...entities];
  return {
    nodes: capGraphNodes(sourceNodes),
    sourceCount: sourceNodes.length,
    mode,
    focusId,
    hiddenCount: Math.max(0, sourceNodes.length - capGraphNodes(sourceNodes).length),
    segmentCount: 0,
  };
}

function layoutGraph(nodes) {
  const width = 1080;
  const height = 520;
  const columns = {
    story: 120,
    family: 265,
    person: 395,
    company: 525,
    concept: 720,
    tool: 895,
    event: 960,
    segment: 160,
  };
  const groups = nodes.reduce((acc, node) => {
    acc[node.type] ||= [];
    acc[node.type].push(node);
    return acc;
  }, {});

  const positions = new Map();
  for (const [type, group] of Object.entries(groups)) {
    const x = columns[type] || 540;
    const step = height / (group.length + 1);
    group.forEach((node, index) => {
      const offset = group.length > 12 ? ((index % 3) - 1) * 18 : 0;
      positions.set(node.id, { x: x + offset, y: step * (index + 1) });
    });
  }
  return { width, height, positions };
}

function layoutPersonNetwork(nodes, edges) {
  const width = 1080;
  const clusterWidth = 340;
  const clusterHeight = 206;
  const byStory = edges.reduce((acc, edge) => {
    const storyId = edge.source_story || "story:unknown";
    acc[storyId] ||= new Set();
    acc[storyId].add(edge.source);
    acc[storyId].add(edge.target);
    return acc;
  }, {});
  const storyIds = Object.keys(byStory)
    .sort((a, b) => storyNumber(b) - storyNumber(a) || labelFor(a).localeCompare(labelFor(b), "zh-CN"));
  const rows = Math.max(1, Math.ceil(storyIds.length / 3));
  const height = Math.max(540, rows * clusterHeight + 90);
  const positions = new Map();
  const used = new Set();

  storyIds.forEach((storyId, storyIndex) => {
    const col = storyIndex % 3;
    const row = Math.floor(storyIndex / 3);
    const baseX = 96 + col * clusterWidth;
    const baseY = 76 + row * clusterHeight;
    const localIds = [...byStory[storyId]]
      .filter((id) => nodeById.has(id))
      .sort((a, b) => (degree.get(b) || 0) - (degree.get(a) || 0) || labelFor(a).localeCompare(labelFor(b), "zh-CN"));

    localIds.forEach((id, index) => {
      if (used.has(id)) return;
      used.add(id);
      positions.set(id, {
        x: baseX,
        y: baseY + index * 30,
      });
    });
  });

  nodes.forEach((node, index) => {
    if (positions.has(node.id)) return;
    positions.set(node.id, {
      x: 86 + (index % 6) * 168,
      y: height - 72 + Math.floor(index / 6) * 30,
    });
  });

  return { width, height, positions };
}

function renderGraph() {
  const selection = graphSelection();
  const nodes = selection.nodes;
  const ids = new Set(nodes.map((node) => node.id));
  const edges = selection.edges || data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const { width, height, positions } = selection.mode === "person-network"
    ? layoutPersonNetwork(nodes, edges)
    : layoutGraph(nodes);
  const topic = selectedTopic();
  const isFiltered = Boolean(state.query || state.type !== "all" || topic);

  els.graph.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (selection.mode === "person-network") {
    els.graphMode.textContent = `人物直连关系 · 精选 ${edges.length}/${selection.edgeSourceCount} 条 · ${nodes.length}/${selection.sourceCount} 位人物`;
  } else {
    els.graphMode.textContent = state.selectedId
      ? `${labelFor(state.selectedId)} 的一跳关系 · 精选 ${nodes.length}/${selection.sourceCount} 节点`
      : isFiltered
        ? `${topic ? topic.title + " · " : ""}${visibleNodes().length} 个匹配 · 精选 ${nodes.length}/${selection.sourceCount} 节点`
        : `${nodes.length} 个代表节点 · ${edges.length} 条关系`;
  }

  const summaryText = selection.mode === "person-network"
    ? `${selection.hiddenEdgeCount ? `另有 ${selection.hiddenEdgeCount} 条人物关系未显示，` : ""}${selection.hiddenCount ? `${selection.hiddenCount} 位人物未显示` : "显示当前最相关人物关系"}`
    : `${selection.segmentCount ? `已隐藏 ${selection.segmentCount} 个正文片段节点，` : ""}${selection.hiddenCount ? `另有 ${selection.hiddenCount} 个低优先级节点未显示` : "显示当前最相关节点"}`;

  const summaryMarkup = `
    <g class="graph-summary${selection.mode === "person-network" ? " graph-person-network" : ""}" transform="translate(24, 26)">
      <text class="graph-summary-title" x="0" y="0">${selection.mode === "person-network" ? "人物关系图" : "可读摘要图"}</text>
      <text class="graph-summary-text" x="0" y="20">
        ${summaryText}
      </text>
    </g>
  `;

  const edgeMarkup = edges
    .map((edge) => {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (!source || !target) return "";
      const edgeKind = isPersonPersonEdge(edge) ? "person-person" : "mixed";
      return `<line class="graph-edge${edgeKind === "person-person" ? " graph-edge-person" : ""}" data-edge-kind="${edgeKind}" data-edge-type="${escapeHtml(edge.type)}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"><title>${escapeHtml(`${labelFor(edge.source)} - ${edge.label || edge.type} - ${labelFor(edge.target)}`)}</title></line>`;
    })
    .join("");

  const nodeMarkup = nodes
    .map((node) => {
      const point = positions.get(node.id);
      const isFocus = node.id === selection.focusId;
      const radius = selection.mode === "person-network" ? 11 : isFocus ? 18 : Math.min(14, 7 + (degree.get(node.id) || 0) * 0.42);
      const label = truncate(node.title, selection.mode === "person-network" ? 11 : isFocus ? 22 : 15);
      return `
        <g class="graph-node${isFocus ? " is-focus" : ""}" data-id="${escapeHtml(node.id)}" data-type="${escapeHtml(node.type)}" transform="translate(${point.x}, ${point.y})">
          <circle r="${radius}" fill="${colorFor(node.type)}"></circle>
          <text x="${radius + 8}" y="4" ${selection.mode === "person-network" ? "style=\"font-size:16px\"" : ""}>${escapeHtml(label)}</text>
        </g>
      `;
    })
    .join("");

  els.graph.innerHTML = `${summaryMarkup}${edgeMarkup}${nodeMarkup}`;
}

function renderContent() {
  const article = state.articleId ? articleByStoryId.get(state.articleId) : null;
  const selected = state.selectedId ? nodeById.get(state.selectedId) : null;
  const topic = selectedTopic();

  if (article) {
    els.viewTitle.textContent = article.title;
    els.viewSubtitle.textContent = `正文阅读 · ${article.paragraphs.length} 段 · ${article.toc.length} 个目录入口`;
    els.content.innerHTML = renderArticleReader(article);
    return;
  }

  els.viewTitle.textContent = selected ? selected.title : topic ? topic.title : "故事地图";
  els.viewSubtitle.textContent = selected
    ? `${typeMeta[selected.type]?.label || selected.type} · ${degree.get(selected.id) || 0} 条连接`
    : topic
      ? topic.question
      : `从治理专题、家族案例和关系图谱进入 ${storyTotal} 篇家族故事。`;
  els.content.innerHTML = selected ? renderDetail(selected) : renderOverview();
}

function render() {
  els.generatedAt.textContent = data.generated_at;
  renderStats();
  renderTopicFilters();
  renderTypeFilters();
  renderQuickNav();
  renderGraph();
  renderContent();
}

document.addEventListener("click", (event) => {
  const scrollButton = event.target.closest("[data-scroll-target]");
  if (scrollButton) {
    const target = document.querySelector(scrollButton.dataset.scrollTarget);
    target?.scrollIntoView?.({ block: "start" });
    return;
  }

  const reset = event.target.closest("[data-reset]");
  if (reset) {
    state.query = "";
    state.type = "all";
    state.topic = "all";
    state.selectedId = null;
    state.articleId = null;
    els.search.value = "";
    render();
    focusWorkspace();
    return;
  }

  const paragraphButton = event.target.closest("[data-para]");
  if (paragraphButton) {
    const target = document.querySelector(`#${paragraphButton.dataset.para}`);
    target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    return;
  }

  const topicButton = event.target.closest("[data-topic]");
  if (topicButton) {
    state.topic = topicButton.dataset.topic;
    state.type = "all";
    state.selectedId = null;
    state.articleId = null;
    render();
    focusWorkspace();
    return;
  }

  const typeButton = event.target.closest("[data-type]");
  if (typeButton) {
    state.type = typeButton.dataset.type;
    state.selectedId = null;
    state.articleId = null;
    render();
    focusWorkspace();
    return;
  }

  const articleButton = event.target.closest("[data-article-id]");
  if (articleButton) {
    state.articleId = articleButton.dataset.articleId;
    state.selectedId = articleButton.dataset.articleId;
    state.type = "all";
    render();
    focusWorkspace();
    return;
  }

  const nodeButton = event.target.closest("[data-id]");
  if (nodeButton) {
    state.selectedId = nodeButton.dataset.id;
    state.articleId = null;
    state.type = "all";
    render();
    focusWorkspace();
  }
});

els.search.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  state.selectedId = null;
  state.articleId = null;
  render();
  focusWorkspace();
});

render();
