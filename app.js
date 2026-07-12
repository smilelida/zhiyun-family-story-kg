const data = window.KNOWLEDGE_DATA;
const articleData = window.ARTICLE_DATA || { articles: [] };

// 节点类型色：执允文人色族（青、古铜、朱砂、黛松、赭）
const typeMeta = {
  story: { label: "故事", color: "#30607f" },
  concept: { label: "概念", color: "#407090" },
  family: { label: "家族", color: "#a98b5d" },
  person: { label: "人物", color: "#9e3b32" },
  company: { label: "企业", color: "#3a4a3f" },
  tool: { label: "工具", color: "#8a6d46" },
  event: { label: "事件", color: "#a8643c" },
  segment: { label: "片段", color: "#948f84" },
};

const state = {
  view: "home",
  query: "",
  type: "all",
  topic: "all",
  selectedId: null,
  articleId: null,
  matrixCell: null,
};

const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
const articleByStoryId = new Map(articleData.articles.map((article) => [article.story_id, article]));
const insightArticles = articleData.articles
  .filter((article) => article.kind === "insight")
  .sort((a, b) => (a.insight_no || 0) - (b.insight_no || 0));
const storyTotal = data.nodes.filter((node) => node.type === "story").length;
const paragraphTotal = articleData.articles.reduce((sum, article) => sum + article.paragraphs.length, 0);
const insightTotal = insightArticles.length;
const degree = new Map(data.nodes.map((node) => [node.id, 0]));

for (const edge of data.edges) {
  degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
  degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
}

// ---------- linking infrastructure ----------

// titles that can be auto-linked inside card prose, longest first
const linkableTypes = new Set(["person", "family", "company", "tool", "concept", "story"]);
const titleIndex = data.nodes
  .filter((node) => linkableTypes.has(node.type) && (node.title || "").length >= 2)
  .map((node) => ({ title: node.title, id: node.id }))
  .sort((a, b) => b.title.length - a.title.length);

function autoLink(text, selfId, limit = 12) {
  const source = String(text || "");
  const ranges = [];
  const used = new Set();
  for (const { title, id } of titleIndex) {
    if (id === selfId || used.has(id) || ranges.length >= limit) continue;
    const idx = source.indexOf(title);
    if (idx === -1) continue;
    if (ranges.some((range) => idx < range.end && idx + title.length > range.start)) continue;
    ranges.push({ start: idx, end: idx + title.length, id });
    used.add(id);
  }
  ranges.sort((a, b) => a.start - b.start);
  let html = "";
  let cursor = 0;
  for (const range of ranges) {
    html += escapeHtml(source.slice(cursor, range.start));
    html += `<button class="text-link" data-id="${escapeHtml(range.id)}">${escapeHtml(source.slice(range.start, range.end))}</button>`;
    cursor = range.end;
  }
  return html + escapeHtml(source.slice(cursor));
}

const adjacency = new Map();
for (const edge of data.edges) {
  if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
  if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
  adjacency.get(edge.source).add(edge.target);
  adjacency.get(edge.target).add(edge.source);
}

function neighborCards(node, count = 4) {
  const own = adjacency.get(node.id) || new Set();
  const scores = new Map();
  for (const mid of own) {
    for (const other of adjacency.get(mid) || []) {
      if (other === node.id || own.has(other)) continue;
      const candidate = nodeById.get(other);
      if (!candidate || candidate.type === "segment") continue;
      scores.set(other, (scores.get(other) || 0) + 1);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (degree.get(b[0]) || 0) - (degree.get(a[0]) || 0))
    .slice(0, count)
    .map(([id]) => nodeById.get(id));
}

// ---------- family × concept evidence matrix ----------

const storyFamily = new Map();
const storySeries = new Map();
for (const node of data.nodes) {
  if (node.type !== "story") continue;
  const familyId = node.frontmatter.families?.[0];
  if (familyId) storyFamily.set(node.id, familyId);
  storySeries.set(node.id, node.frontmatter.series_no || 999);
}

const segmentStory = new Map();
for (const node of data.nodes) {
  if (node.type === "segment") segmentStory.set(node.id, node.frontmatter.story);
}

const matrixCells = new Map();
for (const edge of data.edges) {
  if (edge.type !== "illustrates" || !String(edge.target).startsWith("concept:")) continue;
  let storyId = null;
  let segmentId = null;
  if (String(edge.source).startsWith("story:")) {
    storyId = edge.source;
  } else if (String(edge.source).startsWith("segment:")) {
    segmentId = edge.source;
    storyId = segmentStory.get(segmentId);
  } else {
    continue;
  }
  const familyId = storyFamily.get(storyId);
  if (!familyId) continue;
  const key = `${familyId}|${edge.target}`;
  if (!matrixCells.has(key)) matrixCells.set(key, { stories: new Set(), segments: new Set() });
  const cell = matrixCells.get(key);
  if (segmentId) cell.segments.add(segmentId);
  if (storyId) cell.stories.add(storyId);
}

const matrixFamilies = [...new Set([...storyFamily.values()])]
  .filter((id) => nodeById.has(id))
  .sort((a, b) => {
    const seriesOf = (familyId) => Math.min(
      ...[...storyFamily.entries()].filter(([, fam]) => fam === familyId).map(([sid]) => storySeries.get(sid) || 999),
    );
    return seriesOf(a) - seriesOf(b);
  });

const conceptEvidenceTotal = new Map();
for (const [key, cell] of matrixCells) {
  const conceptId = key.split("|")[1];
  const weight = cell.stories.size + cell.segments.size;
  conceptEvidenceTotal.set(conceptId, (conceptEvidenceTotal.get(conceptId) || 0) + weight);
}

const matrixConcepts = data.nodes
  .filter((node) => node.type === "concept" && conceptEvidenceTotal.has(node.id))
  .sort((a, b) => (conceptEvidenceTotal.get(b.id) || 0) - (conceptEvidenceTotal.get(a.id) || 0))
  .map((node) => node.id);

// concept -> stories that illustrate it; tool -> its concepts (for sibling lookups)
const conceptStories = new Map();
const toolConcepts = new Map();
for (const edge of data.edges) {
  if (edge.type !== "illustrates" || !String(edge.target).startsWith("concept:")) continue;
  if (String(edge.source).startsWith("story:")) {
    if (!conceptStories.has(edge.target)) conceptStories.set(edge.target, new Set());
    conceptStories.get(edge.target).add(edge.source);
  }
  if (String(edge.source).startsWith("tool:")) {
    if (!toolConcepts.has(edge.source)) toolConcepts.set(edge.source, new Set());
    toolConcepts.get(edge.source).add(edge.target);
  }
}

const els = {
  workspace: document.querySelector(".workspace"),
  topNav: document.querySelector("#topNav"),
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
  graphSection: document.querySelector("#graphSection"),
  content: document.querySelector("#content"),
};

const topics = [
  {
    id: "succession",
    title: "接班与继承人培养",
    question: "家族怎样把权力、能力和责任交给下一代？",
    thesis: "接班不是把职位交出去，而是提前设计训练、授权、试错和意外继承预案。",
    concepts: ["concept:succession-training", "concept:gradual-succession", "concept:succession-contingency", "concept:third-generation-risk"],
    stories: ["story:zhou-dafu", "story:agnelli", "story:lego", "story:toyoda", "story:tata"],
    cautions: ["story:gucci", "story:stanley-ho", "story:dassler"],
    tools: ["tool:son-in-law-professional-succession", "tool:family-letters-as-governance", "tool:toji-succession"],
  },
  {
    id: "conflict",
    title: "兄弟共治与家族冲突",
    question: "亲情、股权和经营权发生冲突时，家族靠什么止损？",
    thesis: "冲突本身并不可怕，真正危险的是没有分歧处理规则、退出机制和共同底线。",
    concepts: ["concept:family-conflict-as-innovation", "concept:family-consensus", "concept:joint-sibling-leadership", "concept:governance-complexity"],
    stories: ["story:kikkoman", "story:ambani", "story:cp-group", "story:pao-family"],
    cautions: ["story:gucci", "story:dassler", "story:stanley-ho"],
    tools: ["tool:brother-partnership", "tool:multi-branch-family-settlement", "tool:family-council"],
  },
  {
    id: "trust",
    title: "信托、分配与家族办公室",
    question: "财富越来越复杂时，家族怎样把分配和控制分开？",
    thesis: "信托和家族办公室不是装饰，而是把受益、控制、经营和沟通拆开的基础设施。",
    concepts: ["concept:family-trust", "concept:separation-of-rights", "concept:institutionalized-trust", "concept:family-trust-substituting-governance"],
    stories: ["story:pao-family", "story:tata", "story:zhou-dafu", "story:rockefeller"],
    cautions: ["story:stanley-ho", "story:hu-xueyan", "story:delong"],
    tools: ["tool:pao-family-trust", "tool:family-office", "tool:family-trust", "tool:family-council"],
  },
  {
    id: "ownership",
    title: "基金会、控股平台与所有权",
    question: "家族怎样既保持长期控制，又避免企业沦为私人提款机？",
    thesis: "好的所有权设计会给家族权力加边界，把企业使命、控制权和经营权重新排列。",
    concepts: ["concept:foundation-ownership", "concept:mission-locked-ownership", "concept:steward-ownership", "concept:family-as-guardian"],
    stories: ["story:bosch", "story:tata", "story:ikea", "story:lego", "story:hermes"],
    cautions: ["story:delong", "story:gucci"],
    tools: ["tool:foundation-ownership-structure", "tool:kirkbi-family-holding", "tool:holding-company-stewardship", "tool:family-holding-defense"],
  },
  {
    id: "professionalization",
    title: "职业经理人与家族控制",
    question: "家族什么时候该亲自经营，什么时候该退到所有者位置？",
    thesis: "职业经理人不是家族控制的反面，关键在授权边界、监督机制和家族守门能力。",
    concepts: ["concept:professionalization", "concept:enterprise-before-family", "concept:enterprise-independence", "concept:separation-of-rights"],
    stories: ["story:agnelli", "story:tata", "story:watson-ibm", "story:gucci", "story:disney"],
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
    stories: ["story:delong", "story:hu-xueyan", "story:dassler", "story:gucci", "story:sheng-xuanhuai"],
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

const navViews = [
  { id: "home", label: "故事地图" },
  { id: "topics", label: "主题索引" },
  { id: "matrix", label: "对照矩阵" },
  { id: "timeline", label: "年表" },
  { id: "people", label: "人物图谱" },
  { id: "stories", label: "故事列表" },
  { id: "methods", label: "方法论" },
];

const viewMeta = {
  home: {
    title: "故事地图",
    subtitle: `从治理专题、家族案例和关系图谱进入 ${storyTotal} 篇家族故事。`,
    type: "all",
  },
  topics: {
    title: "主题索引",
    subtitle: `围绕 ${topics.length} 个治理问题浏览专题，每个专题都能进入案例、概念和方法论节点。`,
    type: "all",
  },
  matrix: {
    title: "对照矩阵",
    subtitle: "家族 × 治理概念的证据密度总览，点击交叉格查看该家族在该概念下的案例证据。",
    type: "all",
  },
  timeline: {
    title: "大事年表",
    subtitle: "跨家族的时间维度：从范氏义庄的义田契约，到安踏收购彪马，事件按年代排布。",
    type: "all",
  },
  people: {
    title: "人物图谱",
    subtitle: "按人物节点与人物直连关系浏览家族传承中的关键角色。",
    type: "person",
  },
  stories: {
    title: "故事列表",
    subtitle: `按系列整理 ${storyTotal} 篇家族故事，并保留完整正文入口。`,
    type: "story",
  },
  methods: {
    title: "方法论",
    subtitle: "集中查看家族治理工具、制度设计和可复用做法。",
    type: "tool",
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

function activeNavView() {
  return state.view === "topic" ? "topics" : state.view;
}

function focusWorkspace() {
  els.workspace?.scrollIntoView?.({ block: "start" });
}

function setView(view) {
  const meta = viewMeta[view] || viewMeta.home;
  state.view = viewMeta[view] ? view : "home";
  state.query = "";
  state.type = meta.type;
  state.topic = "all";
  state.selectedId = null;
  state.articleId = null;
  state.matrixCell = null;
  els.search.value = "";
}

function setTopic(topicId) {
  state.view = topicId === "all" ? "home" : "topic";
  state.query = "";
  state.type = "all";
  state.topic = topicId;
  state.selectedId = null;
  state.articleId = null;
  state.matrixCell = null;
  els.search.value = "";
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
  // Expand only through the seed stories. A blanket one-hop expansion from
  // every seed used to pull in over 80% of the graph, which made the topic
  // filter meaningless as a filter.
  const seedStories = new Set([...(topic.stories || []), ...(topic.cautions || [])]);
  for (const edge of data.edges) {
    if (seedStories.has(edge.source)) ids.add(edge.target);
    if (seedStories.has(edge.target)) ids.add(edge.source);
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

function renderTopNav() {
  const current = activeNavView();
  els.topNav.innerHTML = navViews
    .map((view) => `<button data-view="${view.id}"${view.id === current ? ' aria-current="page"' : ""}>${escapeHtml(view.label)}</button>`)
    .join("");
}

function renderTypeFilters() {
  // 片段是内部证据单元，不作为一级筛选入口（搜索与故事页仍可达）
  const ordered = ["all", "story", "concept", "family", "person", "company", "tool", "event"];
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
        <span class="nav-item-meta">${escapeHtml(node.type === "story" ? storyIssueLabel(node) : (typeMeta[node.type]?.label || node.type))} · ${degree.get(node.id) || 0} 连接</span>
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

function readingMinutes(article) {
  const chars = article.paragraphs.reduce((sum, paragraph) => sum + paragraph.text.length, 0);
  return Math.max(3, Math.round(chars / 480));
}

function renderArticleEntry(node) {
  const article = articleForNode(node);
  if (!article) return "";

  return `
    <button class="read-button" data-article-id="${escapeHtml(article.story_id)}">
      <span>阅读全文</span>
      <strong>约 ${readingMinutes(article)} 分钟</strong>
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

function compareStories(a, b) {
  return (a.frontmatter.series_no || 999) - (b.frontmatter.series_no || 999) || a.title.localeCompare(b.title, "zh-CN");
}

function renderNodeDirectory({ heading, marker, nodes, description, sort = byConnectionThenTitle }) {
  const sorted = [...nodes].sort(sort);
  return `
    <section class="panel panel-wide directory-section">
      <div class="panel-heading">
        <h3>${escapeHtml(heading)}</h3>
        <span>${sorted.length} 个节点</span>
      </div>
      <p class="directory-note">${escapeHtml(description)}</p>
      ${sorted.length ? `<div class="card-grid">${sorted.map(card).join("")}</div>` : emptyState("没有匹配节点")}
    </section>
    <section class="panel result-note">
      <h3>关系提示</h3>
      <p>${escapeHtml(marker)}会同步驱动下方关系图谱；点击任一卡片可查看它的一跳关系和原文入口。</p>
    </section>
  `;
}

function insightItem(article) {
  return `
    <button class="insight-item" data-article-id="${escapeHtml(article.story_id)}">
      <span class="insight-no">第 ${article.insight_no} 期</span>
      <strong>${escapeHtml(article.title)}</strong>
      <span class="insight-meta">约 ${readingMinutes(article)} 分钟</span>
    </button>
  `;
}

function renderInsightShelf() {
  if (!insightArticles.length) return "";
  return `
    <section class="panel panel-wide insight-shelf">
      <div class="panel-heading">
        <h3>家族洞察系列</h3>
        <span>${insightArticles.length} 期 · 跨案例的横向方法文章</span>
      </div>
      <div class="insight-grid">${insightArticles.map(insightItem).join("")}</div>
    </section>
  `;
}

function renderTopicsIndex() {
  return `
    <section class="panel panel-wide topic-section">
      <div class="panel-heading">
        <h3>全部治理专题</h3>
        <span>${topics.length} 个专题</span>
      </div>
      <p class="directory-note">这里是专题选择入口。选择一个专题后，页面会进入该专题详情，并同步更新左侧匹配节点和下方关系图谱。</p>
      <div class="topic-card-grid">${topics.map(topicCard).join("")}</div>
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
  `;
}

function eventYear(node) {
  const idMatch = String(node.id).match(/-(\d{3,4})$/);
  if (idMatch) return Number(idMatch[1]);
  const dateMatch = String(node.frontmatter.date || "").match(/^(\d{3,4})/);
  if (dateMatch) return Number(dateMatch[1]);
  const titleMatch = node.title.match(/（(\d{3,4})/) || node.title.match(/(\d{4})/);
  if (titleMatch) return Number(titleMatch[1]);
  return null;
}

const RING_BANDS = [
  [1000, 1400], [1400, 1700], [1700, 1850],
  [1850, 1900], [1900, 1950], [1950, 2000], [2000, 2030],
];
const RING_INNER = 92;
const RING_OUTER = 398;

function ringRadius(year) {
  const step = (RING_OUTER - RING_INNER) / RING_BANDS.length;
  for (let i = 0; i < RING_BANDS.length; i++) {
    const [from, to] = RING_BANDS[i];
    if (year >= from && year < to) {
      return RING_INNER + step * i + step * ((year - from) / (to - from));
    }
  }
  return year < RING_BANDS[0][0] ? RING_INNER : RING_OUTER;
}

function renderTimelineRings(dated) {
  if (!dated.length) return "";
  const size = 1080;
  const c = size / 2;

  // families around the wheel, ordered by their earliest event
  const byFamily = new Map();
  for (const item of dated) {
    const familyId = (item.node.frontmatter.families || [])[0];
    if (!familyId || !nodeById.has(familyId)) continue;
    if (!byFamily.has(familyId)) byFamily.set(familyId, []);
    byFamily.get(familyId).push(item);
  }
  const families = [...byFamily.entries()]
    .sort((a, b) => Math.min(...a[1].map((i) => i.year)) - Math.min(...b[1].map((i) => i.year)));
  if (!families.length) return "";

  const angleStep = (Math.PI * 2) / families.length;
  const startAngle = -Math.PI / 2;

  const guideMarkup = RING_BANDS.map((band, i) => {
    const r = RING_INNER + ((RING_OUTER - RING_INNER) / RING_BANDS.length) * (i + 1);
    return `<circle class="ring-guide" cx="${c}" cy="${c}" r="${r}"></circle>
      <text class="ring-year" x="${c}" y="${c - r + 13}">${band[1] === 2030 ? "今" : band[1]}</text>`;
  }).join("");

  const spokes = [];
  const dots = [];
  const labels = [];
  families.forEach(([familyId, items], index) => {
    const angle = startAngle + angleStep * index;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    spokes.push(`<line class="ring-spoke" x1="${c + cos * RING_INNER}" y1="${c + sin * RING_INNER}" x2="${c + cos * RING_OUTER}" y2="${c + sin * RING_OUTER}"></line>`);

    items.sort((a, b) => a.year - b.year);
    items.forEach((item, j) => {
      const jitter = ((j % 3) - 1) * 0.035;
      const a = angle + jitter;
      const r = ringRadius(item.year);
      const delay = Math.min(1.1, 0.15 + ((r - RING_INNER) / (RING_OUTER - RING_INNER)) * 0.7 + (index % 5) * 0.05);
      dots.push(`
        <g class="ring-dot" data-id="${escapeHtml(item.node.id)}" transform="translate(${(c + Math.cos(a) * r).toFixed(1)}, ${(c + Math.sin(a) * r).toFixed(1)})" style="animation-delay:${delay.toFixed(2)}s">
          <circle r="4"></circle>
          <title>${escapeHtml(`${item.year} · ${item.node.title} · ${labelFor(familyId)}`)}</title>
        </g>
      `);
    });

    const deg = (angle * 180) / Math.PI;
    const flip = deg > 90 || deg < -90;
    const lr = RING_OUTER + 16;
    labels.push(`
      <text class="ring-label" data-id="${escapeHtml(familyId)}"
        transform="translate(${(c + cos * lr).toFixed(1)}, ${(c + sin * lr).toFixed(1)}) rotate(${(flip ? deg + 180 : deg).toFixed(1)})"
        text-anchor="${flip ? "end" : "start"}">${escapeHtml(truncate(labelFor(familyId), 8))}</text>
    `);
  });

  return `
    <div class="ring-wrap">
      <svg class="timeline-rings" viewBox="0 0 ${size} ${size}" role="img" aria-label="家族年轮盘">
        ${guideMarkup}
        ${spokes.join("")}
        ${dots.join("")}
        ${labels.join("")}
        <circle class="ring-core" cx="${c}" cy="${c}" r="${RING_INNER - 26}"></circle>
        <image href="./logo.png" x="${c - 26}" y="${c - 40}" width="52" height="52"></image>
        <text class="ring-core-label" x="${c}" y="${c + 34}">家族年轮</text>
      </svg>
      <p class="ring-caption">环为年代，辐为家族，籽点即事件。悬停看详情，点击入卡片。</p>
    </div>
  `;
}

function timelineEraLabel(year) {
  if (year < 1850) return `${Math.floor(year / 100) + 1} 世纪`;
  return `${Math.floor(year / 10) * 10} 年代`;
}

function timelineItem(node, year) {
  const familyId = (node.frontmatter.families || [])[0];
  return `
    <li class="timeline-item">
      <span class="timeline-year">${year ?? "—"}</span>
      <div class="timeline-body">
        <button class="inline-link timeline-title" data-id="${escapeHtml(node.id)}">${escapeHtml(node.title)}</button>
        ${familyId && nodeById.has(familyId) ? `<button class="timeline-family" data-id="${escapeHtml(familyId)}">${escapeHtml(labelFor(familyId))}</button>` : ""}
        <p>${escapeHtml(truncate(node.summary || "", 96))}</p>
      </div>
    </li>
  `;
}

function renderTimeline() {
  const events = data.nodes
    .filter((node) => node.type === "event" && matchesTopic(node) && matchesQuery(node))
    .map((node) => ({ node, year: eventYear(node) }));

  const dated = events.filter((item) => item.year).sort((a, b) => a.year - b.year || a.node.title.localeCompare(b.node.title, "zh-CN"));
  const undated = events.filter((item) => !item.year);

  const groups = [];
  for (const item of dated) {
    const label = timelineEraLabel(item.year);
    if (!groups.length || groups[groups.length - 1].label !== label) {
      groups.push({ label, items: [] });
    }
    groups[groups.length - 1].items.push(item);
  }

  const groupMarkup = groups.map((group) => `
    <div class="timeline-era">
      <h4>${escapeHtml(group.label)}</h4>
      <ul class="timeline-list">${group.items.map(({ node, year }) => timelineItem(node, year)).join("")}</ul>
    </div>
  `).join("");

  const undatedMarkup = undated.length ? `
    <div class="timeline-era timeline-undated">
      <h4>跨时期</h4>
      <ul class="timeline-list">${undated.map(({ node }) => timelineItem(node, null)).join("")}</ul>
    </div>
  ` : "";

  return `
    <section class="panel panel-wide timeline-panel">
      <div class="section-heading">
        <h3>家族大事年表</h3>
        <strong>${dated.length} 个系年事件${undated.length ? ` · ${undated.length} 个跨时期` : ""}</strong>
      </div>
      <p class="directory-note">每个事件都链接到它的事件卡与所属家族。搜索与专题筛选同样作用于本页。</p>
      ${renderTimelineRings(dated)}
      ${groupMarkup}
      ${undatedMarkup}
    </section>
  `;
}

function matrixLevel(count) {
  if (count >= 7) return 4;
  if (count >= 5) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}

function renderMatrixEvidence() {
  if (!state.matrixCell) {
    return `
      <div class="matrix-evidence matrix-evidence-empty">
        <p>点击任意交叉格，这里会展示该家族在该概念下的故事与原文片段证据。颜色越深，证据越密。</p>
      </div>
    `;
  }
  const { family, concept } = state.matrixCell;
  const cell = matrixCells.get(`${family}|${concept}`) || { stories: new Set(), segments: new Set() };
  const stories = [...cell.stories].sort((a, b) => (storySeries.get(a) || 999) - (storySeries.get(b) || 999));
  const segments = [...cell.segments].sort();

  const storyChips = stories.map((id) => `
    <button class="inline-link" data-id="${escapeHtml(id)}">${escapeHtml(labelFor(id))}</button>
  `).join("");

  const segmentItems = segments.map((id) => {
    const node = nodeById.get(id);
    if (!node) return "";
    return `
      <li>
        <button class="inline-link" data-id="${escapeHtml(id)}">${escapeHtml(node.title)}</button>
        <p>${escapeHtml(truncate(node.summary || "", 150))}</p>
      </li>
    `;
  }).join("");

  return `
    <div class="matrix-evidence">
      <div class="matrix-evidence-head">
        <h4>
          <button class="inline-link" data-id="${escapeHtml(family)}">${escapeHtml(labelFor(family))}</button>
          ×
          <button class="inline-link" data-id="${escapeHtml(concept)}">${escapeHtml(labelFor(concept))}</button>
        </h4>
        <span>${stories.length} 篇故事 · ${segments.length} 个原文片段</span>
      </div>
      ${stories.length ? `<div class="chip-list">${storyChips}</div>` : ""}
      ${segments.length ? `<ul class="matrix-segment-list">${segmentItems}</ul>` : ""}
      ${!stories.length && !segments.length ? "<p class='empty-state'>这个交叉格还没有直接证据。</p>" : ""}
    </div>
  `;
}

function renderMatrix() {
  const headerCells = matrixConcepts.map((conceptId) => `
    <th><button class="matrix-col" data-id="${escapeHtml(conceptId)}">${escapeHtml(labelFor(conceptId))}</button></th>
  `).join("");

  const rows = matrixFamilies.map((familyId) => {
    const cells = matrixConcepts.map((conceptId) => {
      const cell = matrixCells.get(`${familyId}|${conceptId}`);
      const count = cell ? cell.stories.size + cell.segments.size : 0;
      const level = matrixLevel(count);
      const active = state.matrixCell && state.matrixCell.family === familyId && state.matrixCell.concept === conceptId;
      if (!count) return `<td><span class="matrix-cell matrix-cell-0"></span></td>`;
      return `
        <td>
          <button
            class="matrix-cell matrix-cell-${level}${active ? " matrix-cell-active" : ""}"
            data-matrix-cell="${escapeHtml(`${familyId}|${conceptId}`)}"
            title="${escapeHtml(`${labelFor(familyId)} × ${labelFor(conceptId)}：${count} 条证据`)}"
          >${count}</button>
        </td>
      `;
    }).join("");
    return `
      <tr>
        <th scope="row"><button class="matrix-row" data-id="${escapeHtml(familyId)}">${escapeHtml(labelFor(familyId))}</button></th>
        ${cells}
      </tr>
    `;
  }).join("");

  return `
    <section class="panel panel-wide matrix-panel">
      <div class="section-heading">
        <h3>概念 × 家族对照矩阵</h3>
        <strong>${matrixFamilies.length} 个家族 × ${matrixConcepts.length} 个概念</strong>
      </div>
      <p class="directory-note">行按系列期数排序，列按证据总量从密到疏。数字是故事与原文片段的证据条数，点击可展开。</p>
      ${renderMatrixEvidence()}
      <div class="matrix-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="matrix-corner">家族 \\ 概念</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderViewDirectory(view) {
  if (view === "topics") return renderInsightShelf() + renderTopicsIndex();

  if (view === "matrix") return renderMatrix();

  if (view === "timeline") return renderTimeline();

  if (view === "people") {
    return renderNodeDirectory({
      heading: "人物索引",
      marker: "人物图谱",
      nodes: visibleNodes(),
      description: "这里集中列出人物节点。下方关系图谱会优先呈现人物之间的亲属、接班、冲突和授权关系。",
    });
  }

  if (view === "stories") {
    return renderNodeDirectory({
      heading: "故事索引",
      marker: "故事列表",
      nodes: visibleNodes(),
      description: "这里按系列顺序列出全部家族故事。进入故事节点后，可以继续打开完整正文。",
      sort: compareStories,
    });
  }

  if (view === "methods") {
    return renderNodeDirectory({
      heading: "方法论索引",
      marker: "方法论",
      nodes: visibleNodes(),
      description: "这里集中呈现可以迁移复用的治理工具、制度安排和操作方法。",
    });
  }

  return renderOverview();
}

function renderQuickNav() {
  const nodes = visibleNodes();
  const topic = selectedTopic();
  const isFiltered = Boolean(state.query || state.type !== "all" || topic);
  const activeItems = [...nodes].sort(byConnectionThenTitle).slice(0, 14);
  const storyItems = nodes
    .filter((node) => node.type === "story")
    .sort((a, b) => (b.frontmatter.series_no || 0) - (a.frontmatter.series_no || 0))
    .slice(0, topic ? 12 : 8);
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

function storyIssueLabel(node) {
  if (node.type !== "story") return "";
  return node.frontmatter.series_no ? `第 ${node.frontmatter.series_no} 期` : "番外";
}

function card(node) {
  const meta = node.frontmatter;
  const chips = [
    node.type !== "story" && meta.series_no ? `第 ${meta.series_no} 期` : null,
    node.type === "concept" ? meta.category : null,
    node.type === "story" && meta.industries?.length ? meta.industries.slice(0, 2).join(" / ") : null,
    `${degree.get(node.id) || 0} 连接`,
  ].filter(Boolean);
  const summary = node.type === "story" && meta.family_governance_signature
    ? meta.family_governance_signature
    : node.summary;
  const issue = storyIssueLabel(node);

  return `
    <article class="card card-${escapeHtml(node.type)}" data-id="${escapeHtml(node.id)}">
      <div class="card-head">
        <div class="card-type" style="color:${colorFor(node.type)}">${escapeHtml(typeMeta[node.type]?.label || node.type)}</div>
        ${issue ? `<span class="card-no">${escapeHtml(issue)}</span>` : ""}
      </div>
      <h4>${escapeHtml(node.title)}</h4>
      <p>${escapeHtml(truncate(summary, 132))}</p>
      <div class="chip-list" style="margin-top:14px">
        ${chips.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}
      </div>
    </article>
  `;
}

function searchParagraphs(query, limit = 24) {
  const q = query.toLowerCase();
  if (q.length < 2) return [];
  const hits = [];
  for (const article of articleData.articles) {
    for (const paragraph of article.paragraphs) {
      if (paragraph.kind === "heading") continue;
      if (paragraph.text.toLowerCase().includes(q)) {
        hits.push({ article, paragraph });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

function searchSnippet(text, query, span = 72) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, idx - Math.floor(span / 2));
  const raw = text.slice(start, start + span + query.length);
  const safe = escapeHtml(raw);
  const safeQuery = escapeHtml(text.slice(idx, idx + query.length));
  const marked = safeQuery ? safe.split(safeQuery).join(`<mark>${safeQuery}</mark>`) : safe;
  const prefix = start > 0 ? "…" : "";
  const suffix = start + span + query.length < text.length ? "…" : "";
  return prefix + marked + suffix;
}

function renderParagraphHits(query) {
  const hits = searchParagraphs(query);
  if (!hits.length) return "";
  const items = hits.map(({ article, paragraph }) => `
    <li>
      <button
        class="inline-link"
        data-article-id="${escapeHtml(article.story_id)}"
        data-para-target="${escapeHtml(paragraph.id)}"
      >${escapeHtml(article.title)} · 第 ${paragraph.index} 段</button>
      <p>${searchSnippet(paragraph.text, query)}</p>
    </li>
  `).join("");
  return `
    <section class="panel panel-wide">
      <h3>原文命中</h3>
      <p class="directory-note">在 ${paragraphTotal.toLocaleString("zh-CN")} 个原文段落里找到 ${hits.length >= 24 ? "24+" : hits.length} 处，点击直接跳到那一段。</p>
      <ul class="paragraph-hit-list">${items}</ul>
    </section>
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
        ${insightArticles.filter((a) => a.topic === topic.id).map((a) => `
          <button class="insight-callout" data-article-id="${escapeHtml(a.story_id)}">
            <span>深度洞察</span>
            <strong>${escapeHtml(a.title)}</strong>
            <em>约 ${readingMinutes(a)} 分钟 →</em>
          </button>
        `).join("")}
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
      ${state.query ? renderParagraphHits(state.query) : `
      <section class="panel result-note">
        <h3>结果脉络</h3>
        <p>${escapeHtml(matches.length)} 个节点与当前筛选条件匹配。</p>
      </section>`}
    `;
  }

  const stories = nodes.filter((node) => node.type === "story");
  const highlightedTopics = topics.slice(0, 6);
  const topStories = [...stories].sort(byConnectionThenTitle).slice(0, 9).sort(compareStories);
  const latest = [...stories]
    .filter((node) => node.frontmatter.series_no)
    .sort((a, b) => (b.frontmatter.series_no || 0) - (a.frontmatter.series_no || 0))
    .slice(0, 2);
  const topTools = data.nodes
    .filter((node) => node.type === "tool")
    .sort(byConnectionThenTitle)
    .slice(0, 6);

  return `
    <section class="atlas-layout panel-wide">
      <div class="home-hero">
        <img class="hero-logo" src="./logo.png" alt="执允" width="56" height="56" />
        <div class="card-type">Family Governance Atlas</div>
        <h3>${storyTotal} 篇家族故事，一张可检索的治理地图。</h3>
        <p>从治理问题出发，进入家族案例、人物关系、制度工具与原文段落。每一个结论，都能回到它的出处。</p>
        <div class="hero-actions">
          <button data-view="topics">从问题进入</button>
          <button data-view="matrix">打开对照矩阵</button>
          <button data-action="lucky"><svg class="lucky-die" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><rect x="2.4" y="2.4" width="19.2" height="19.2" rx="4.6" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="8.1" cy="8.1" r="1.65" fill="currentColor"/><circle cx="15.9" cy="8.1" r="1.65" fill="currentColor"/><circle cx="12" cy="12" r="1.65" fill="currentColor"/><circle cx="8.1" cy="15.9" r="1.65" fill="currentColor"/><circle cx="15.9" cy="15.9" r="1.65" fill="currentColor"/></svg><span>随便看看</span></button>
        </div>
        <div class="hero-metrics">
          <div><strong>${stories.length}</strong><span>家族故事</span></div>
          <div><strong>${topics.length}</strong><span>治理专题</span></div>
          <div><strong>${paragraphTotal.toLocaleString("zh-CN")}</strong><span>段落引用</span></div>
        </div>
      </div>
      <aside class="atlas-brief">
        <h3>最新收录</h3>
        <div class="latest-list">
          ${latest.map((node) => `
            <button class="latest-item" data-id="${escapeHtml(node.id)}">
              <span class="latest-no">第 ${node.frontmatter.series_no} 期</span>
              <strong>${escapeHtml(node.title)}</strong>
              <p>${escapeHtml(truncate(node.summary || "", 68))}</p>
            </button>
          `).join("")}
        </div>
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
    <section class="panel panel-wide tool-section">
      <div class="panel-heading">
        <h3>方法论精选</h3>
        <span>可迁移的治理工具</span>
      </div>
      <div class="card-grid">${topTools.map(card).join("")}</div>
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

const metaLabels = {
  series_no: "期数",
  category: "分类",
  story: "所属故事",
  families: "家族",
  family: "家族",
  key_people: "关键人物",
  related_people: "相关人物",
  key_companies: "关键机构",
  related_companies: "相关机构",
  concepts: "治理概念",
  related_concepts: "相关概念",
  events: "事件",
  key_events: "关键事件",
  tools: "治理工具",
  source_segments: "来源片段",
  source_stories: "来源故事",
  regions: "地域",
  industries: "行业",
  core_questions: "核心问题",
  family_governance_signature: "治理主线",
  governance_signature: "治理主线",
  risk_profile: "风险侧写",
  governance_insight: "治理提示",
  definition: "定义",
  core_mechanism: "核心机制",
  aliases: "别名",
  source_heading: "原文章节",
  birth_year: "生年",
  death_year: "卒年",
  date: "时间",
  period: "时期",
  country: "国家",
  countries: "国家",
  region: "地域",
  founder_generation: "创始世代",
  founding_families: "创始家族",
  companies: "相关企业",
  people: "相关人物",
  roles: "角色",
  purpose: "用途",
  failure_modes: "失败模式",
  limitations: "局限",
  related_concept: "相关概念",
};

function renderMetadata(node) {
  // internal pipeline fields stay out of the reading surface;
  // definition/core_mechanism render as the concept brief block instead
  const skip = new Set([
    "id", "type", "title", "reviewed", "draft", "curation_stage",
    "confidence", "order", "entities", "source_file", "source_files",
    "definition", "core_mechanism", "aliases", "category",
  ]);
  const priority = [
    "series_no",
    "category",
    "family_governance_signature",
    "governance_signature",
    "risk_profile",
    "core_questions",
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
    "key_events",
    "tools",
    "regions",
    "industries",
    "source_segments",
    "source_stories",
  ];

  const keys = [
    ...priority.filter((key) => key in node.frontmatter),
    ...Object.keys(node.frontmatter).filter((key) => !priority.includes(key)),
  ].filter((key) => !skip.has(key));

  return keys
    .map((key) => `
      <div class="meta-row">
        <div class="meta-label">${escapeHtml(metaLabels[key] || key)}</div>
        ${renderMetaValue(node.frontmatter[key])}
      </div>
    `)
    .join("");
}

const personRelationLabels = {
  parent_child: "亲缘与接班",
  successor: "亲缘与接班",
  spouse: "亲缘与接班",
  sibling: "亲缘与接班",
  mentor: "亲缘与接班",
  partner: "共治与搭档",
  professional_delegate: "授权与经理人",
  conflict: "冲突",
};

function chipRow(ids, limit = 12) {
  const list = uniqueIds(ids).filter((id) => nodeById.has(id)).slice(0, limit);
  if (!list.length) return "";
  return `<div class="chip-list">${list.map((id) => nodeLink(id)).join("")}</div>`;
}

function connectionGroup(title, bodyHtml) {
  if (!bodyHtml) return "";
  return `
    <div class="connection-group">
      <h4>${escapeHtml(title)}</h4>
      ${bodyHtml}
    </div>
  `;
}

function personRelationList(node) {
  const relations = connectedEdges(node.id).filter(isPersonPersonEdge);
  if (!relations.length) return "";
  const groups = new Map();
  for (const edge of relations.sort(comparePersonRelations)) {
    const key = personRelationLabels[edge.type] || "其他关系";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  return [...groups.entries()].map(([label, edges]) => connectionGroup(label, `
    <ul class="relation-list">
      ${edges.slice(0, 6).map((edge) => {
        const other = otherNode(edge, node.id);
        return `
          <li>
            ${nodeLink(other)}
            <span class="relation-label">${escapeHtml(edge.label || edge.type)}</span>
            ${edge.evidence ? `<p>${escapeHtml(truncate(edge.evidence, 90))}</p>` : ""}
          </li>
        `;
      }).join("")}
    </ul>
  `)).join("");
}

function matrixChips(pairs, perspective, limit = 8) {
  const rows = pairs.slice(0, limit);
  if (!rows.length) return "";
  return `<div class="chip-list">${rows.map(([familyId, conceptId, count]) => `
    <button class="inline-link matrix-link" data-matrix-cell="${escapeHtml(`${familyId}|${conceptId}`)}">
      ${escapeHtml(labelFor(perspective === "concept" ? familyId : conceptId))}
      <strong>${count}</strong>
    </button>
  `).join("")}</div>`;
}

function conceptFamilies(conceptId) {
  const rows = [];
  for (const [key, cell] of matrixCells) {
    const [familyId, cid] = key.split("|");
    if (cid !== conceptId) continue;
    rows.push([familyId, conceptId, cell.stories.size + cell.segments.size]);
  }
  return rows.sort((a, b) => b[2] - a[2]);
}

function familyConcepts(familyId) {
  const rows = [];
  for (const [key, cell] of matrixCells) {
    const [fid, conceptId] = key.split("|");
    if (fid !== familyId) continue;
    rows.push([familyId, conceptId, cell.stories.size + cell.segments.size]);
  }
  return rows.sort((a, b) => b[2] - a[2]);
}

function overlapSiblings(id, map, poolPrefix, count = 4) {
  const own = map.get(id);
  if (!own || !own.size) return [];
  const scores = new Map();
  for (const [otherId, set] of map) {
    if (otherId === id || !String(otherId).startsWith(poolPrefix)) continue;
    let shared = 0;
    for (const item of own) if (set.has(item)) shared += 1;
    if (shared) scores.set(otherId, shared);
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, count).map(([nid]) => nid);
}

function storySegments(storyId) {
  return data.nodes
    .filter((node) => node.type === "segment" && node.frontmatter.story === storyId)
    .sort((a, b) => (a.frontmatter.order || 0) - (b.frontmatter.order || 0));
}

function edgeNeighbors(node, matcher) {
  return uniqueIds(connectedEdges(node.id)
    .map((edge) => otherNode(edge, node.id))
    .filter((id) => matcher(id)));
}

function renderConnections(node) {
  const fm = node.frontmatter;
  const sections = [];

  if (node.type === "person") {
    sections.push(personRelationList(node));
    sections.push(connectionGroup("所属家族", chipRow(fm.families || [])));
    sections.push(connectionGroup("出场故事", chipRow(edgeNeighbors(node, (id) => id.startsWith("story:")))));
    sections.push(connectionGroup("关联概念", chipRow(edgeNeighbors(node, (id) => id.startsWith("concept:")), 6)));
  } else if (node.type === "concept") {
    sections.push(connectionGroup("案例家族（点击进入矩阵证据）", matrixChips(conceptFamilies(node.id), "concept")));
    sections.push(connectionGroup("治理工具", chipRow(edgeNeighbors(node, (id) => id.startsWith("tool:")), 8)));
    const near = overlapSiblings(node.id, conceptStories, "concept:");
    sections.push(connectionGroup("概念近邻（共享案例）", chipRow(near)));
  } else if (node.type === "story") {
    const segments = storySegments(node.id);
    if (segments.length) {
      sections.push(connectionGroup("证据片段", `
        <ul class="segment-list">
          ${segments.map((segment) => `
            <li>
              <button class="inline-link" data-id="${escapeHtml(segment.id)}">${escapeHtml(segment.title)}</button>
              <p>${escapeHtml(truncate(segment.summary || "", 84))}</p>
            </li>
          `).join("")}
        </ul>
      `));
    }
    const inTopics = topics.filter((topic) => (topic.stories || []).includes(node.id) || (topic.cautions || []).includes(node.id));
    if (inTopics.length) {
      sections.push(connectionGroup("所属治理专题", `<div class="chip-list">${inTopics.map((topic) => `
        <button class="inline-link" data-topic="${escapeHtml(topic.id)}">${escapeHtml(topic.title)}</button>
      `).join("")}</div>`));
    }
  } else if (node.type === "tool") {
    sections.push(connectionGroup("出处故事", chipRow(fm.source_stories || [])));
    sections.push(connectionGroup("关联概念", chipRow(edgeNeighbors(node, (id) => id.startsWith("concept:")), 6)));
    const siblings = overlapSiblings(node.id, toolConcepts, "tool:");
    sections.push(connectionGroup("同类工具（共享概念）", chipRow(siblings)));
  } else if (node.type === "family") {
    sections.push(connectionGroup("家族故事", chipRow(fm.source_stories || [])));
    sections.push(connectionGroup("成员", chipRow(fm.key_people || [], 10)));
    sections.push(connectionGroup("企业与机构", chipRow(fm.key_companies || [], 8)));
    sections.push(connectionGroup("概念足迹（点击进入矩阵证据）", matrixChips(familyConcepts(node.id), "family")));
  } else if (node.type === "segment") {
    sections.push(connectionGroup("所属故事", chipRow([fm.story])));
    sections.push(connectionGroup("涉及概念", chipRow(fm.concepts || [], 6)));
  } else {
    sections.push(connectionGroup("所属家族", chipRow(fm.families || [])));
    sections.push(connectionGroup("出场故事", chipRow(edgeNeighbors(node, (id) => id.startsWith("story:")))));
    sections.push(connectionGroup("关联概念", chipRow(edgeNeighbors(node, (id) => id.startsWith("concept:")), 6)));
  }

  const related = neighborCards(node);
  if (related.length) {
    sections.push(connectionGroup("相邻卡片（共享连接最多）", `<div class="chip-list">${related.map((item) => `
      <button class="inline-link sibling-chip" data-id="${escapeHtml(item.id)}">
        <span class="dot" style="color:${colorFor(item.type)}"></span>${escapeHtml(item.title)}
      </button>
    `).join("")}</div>`));
  }

  const body = sections.filter(Boolean).join("");
  return body || "<p class='empty-state'>还没有关系连接</p>";
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
  // raw markdown leftovers: horizontal rules become dividers,
  // bullet markers become typographic bullets
  if (/^[-*_]{3,}$/.test(paragraph.text.trim())) {
    return `<hr id="${escapeHtml(paragraph.id)}" class="article-divider" />`;
  }

  let displayText = paragraph.text;
  let quoteClass = "";
  if (paragraph.kind === "list") {
    displayText = displayText.replace(/^[-*+]\s+/, "· ");
  }
  if (/^>\s+/.test(displayText)) {
    displayText = displayText.replace(/^>\s+/, "");
    quoteClass = " article-quote";
  }

  const text = escapeHtml(displayText);
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
    <div id="${escapeHtml(paragraph.id)}" class="article-paragraph article-${escapeHtml(paragraph.kind)}${quoteClass}">
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
    .map((file) => `<span class="source-chip">${escapeHtml(file.replace(/^(文章|洞察)\//, ""))}</span>`)
    .join("");

  return `
    <section class="article-reader panel-wide">
      <article class="article-main">
        <div class="article-toolbar">
          ${nodeById.has(article.story_id) ? `<button class="reset-button" data-id="${escapeHtml(article.story_id)}">返回节点</button>` : ""}
          <button class="reset-button" data-reset="true">返回地图</button>
        </div>
        <header class="article-header">
          <div class="card-type">${article.kind === "insight" ? "家族洞察" : "正文阅读"}</div>
          <h3>${escapeHtml(article.title)}</h3>
          <p>${story
            ? escapeHtml(story.frontmatter.family_governance_signature || story.summary)
            : article.kind === "insight"
              ? escapeHtml(`家族洞察 第 ${article.insight_no} 期 · 约 ${readingMinutes(article)} 分钟`)
              : ""}</p>
          <div class="article-source-list">${sourceList}</div>
        </header>
        <div class="article-body">
          ${(() => {
            const multi = (article.source_files || []).length > 1;
            let currentSource = null;
            return article.paragraphs.map((paragraph) => {
              let divider = "";
              if (multi && paragraph.source_index !== currentSource) {
                currentSource = paragraph.source_index;
                divider = `<div class="part-divider"><span>${currentSource === 1 ? "上篇" : currentSource === 2 ? "下篇" : `第 ${currentSource} 篇`}</span></div>`;
              }
              return divider + renderArticleParagraph(paragraph);
            }).join("");
          })()}
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

function storyKicker(node) {
  const fm = node.frontmatter;
  const parts = [];
  if (fm.series_no) parts.push(`执允家族·故事 第 ${fm.series_no} 期`);
  const family = (fm.families || [])[0];
  if (family && nodeById.has(family)) parts.push(labelFor(family));
  if (fm.regions?.length) parts.push(fm.regions.slice(0, 2).join("、"));
  if (fm.industries?.length) parts.push(fm.industries.slice(0, 2).join("、"));
  return parts.length ? `<p class="detail-kicker">${parts.map(escapeHtml).join(" · ")}</p>` : "";
}

function conceptBrief(node) {
  const fm = node.frontmatter;
  if (node.type !== "concept" || !fm.definition) return "";
  const mechanisms = Array.isArray(fm.core_mechanism) ? fm.core_mechanism : [];
  return `
    <div class="concept-brief">
      ${fm.category ? `<p class="detail-kicker">${escapeHtml(fm.category)}</p>` : ""}
      <p class="concept-definition">${escapeHtml(fm.definition)}</p>
      ${mechanisms.length ? `
        <div class="concept-mechanism">
          <span>核心机制</span>
          <ul>${mechanisms.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>` : ""}
    </div>
  `;
}

function renderDetail(node) {
  return `
    <section class="panel detail">
      <div class="detail-header">
        <div>
          <div class="card-type" style="color:${colorFor(node.type)}">${escapeHtml(typeMeta[node.type]?.label || node.type)}</div>
          <h3>${escapeHtml(node.title)}</h3>
          ${node.type === "story" ? storyKicker(node) : ""}
        </div>
        <div class="detail-actions">
          ${renderArticleEntry(node)}
          <button class="reset-button" data-reset="true">返回地图</button>
        </div>
      </div>
      ${conceptBrief(node)}
      <p class="detail-summary">${autoLink(node.summary, node.id)}</p>
      <dl class="meta-list">${renderMetadata(node)}</dl>
    </section>
    <section class="panel detail-links">
      <h3>连接</h3>
      ${renderConnections(node)}
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

function layoutEgo(nodes, focusId) {
  const width = 1080;
  const height = 620;
  const cx = width / 2;
  const cy = height / 2;
  const positions = new Map();
  positions.set(focusId, { x: cx, y: cy, side: "center" });

  // neighbors clustered by type so the ring reads as sectors
  const typeOrder = ["story", "family", "person", "company", "concept", "tool", "event", "segment"];
  const ring = nodes
    .filter((node) => node.id !== focusId)
    .sort((a, b) =>
      typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) ||
      (degree.get(b.id) || 0) - (degree.get(a.id) || 0));

  const inner = ring.slice(0, 14);
  const outer = ring.slice(14);
  const place = (list, radius, offset) => {
    const step = (Math.PI * 2) / Math.max(list.length, 1);
    list.forEach((node, index) => {
      const angle = -Math.PI / 2 + offset + step * index;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      positions.set(node.id, {
        x,
        y,
        side: Math.cos(angle) > 0.25 ? "right" : Math.cos(angle) < -0.25 ? "left" : "middle",
      });
    });
  };
  place(inner, 170, 0);
  if (outer.length) place(outer, 262, Math.PI / Math.max(outer.length, 1));

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

  // The overview hairball added noise, not insight. The graph earns its
  // screen space only as a local ego network (a node is selected) or as
  // the person-relationship view.
  const graphUseful = selection.mode === "focus" || selection.mode === "person-network";
  if (els.graphSection) {
    els.graphSection.style.display = graphUseful ? "" : "none";
  }
  if (!graphUseful) {
    els.graph.innerHTML = "";
    els.graphMode.textContent = "";
    return;
  }

  const nodes = selection.nodes;
  const ids = new Set(nodes.map((node) => node.id));
  const edges = selection.edges || data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const { width, height, positions } = selection.mode === "person-network"
    ? layoutPersonNetwork(nodes, edges)
    : selection.mode === "focus"
      ? layoutEgo(nodes, selection.focusId)
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
      const side = point.side || "right";
      const labelX = side === "left" ? -(radius + 8) : side === "middle" || side === "center" ? 0 : radius + 8;
      const labelY = side === "middle" ? (point.y < 320 ? -(radius + 10) : radius + 18) : side === "center" ? radius + 18 : 4;
      const anchor = side === "left" ? "end" : side === "middle" || side === "center" ? "middle" : "start";
      return `
        <g class="graph-node${isFocus ? " is-focus" : ""}" data-id="${escapeHtml(node.id)}" data-type="${escapeHtml(node.type)}" transform="translate(${point.x}, ${point.y})">
          <circle r="${radius}" fill="${colorFor(node.type)}"></circle>
          <text x="${labelX}" y="${labelY}" text-anchor="${anchor}" ${selection.mode === "person-network" ? "style=\"font-size:16px\"" : ""}>${escapeHtml(label)}</text>
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
  const meta = viewMeta[state.view] || viewMeta.home;

  if (article) {
    els.viewTitle.textContent = article.title;
    els.viewTitle.classList?.toggle?.("long-title", article.title.length > 12);
    els.viewSubtitle.textContent = `正文阅读 · ${article.paragraphs.length} 段 · ${article.toc.length} 个目录入口`;
    els.content.innerHTML = renderArticleReader(article);
    return;
  }

  // a selected card always wins over the topic backdrop, otherwise
  // chips inside a topic page look dead (hash moves, screen doesn't)
  if (state.view === "topic" && topic && !selected) {
    els.viewTitle.textContent = topic.title;
    els.viewTitle.classList?.toggle?.("long-title", topic.title.length > 12);
    els.viewSubtitle.textContent = topic.question;
    els.content.innerHTML = renderOverview();
    return;
  }

  els.viewTitle.textContent = selected ? selected.title : meta.title;
  els.viewTitle.classList?.toggle?.("long-title", (selected ? selected.title : meta.title).length > 12);
  els.viewSubtitle.textContent = selected
    ? `${typeMeta[selected.type]?.label || selected.type} · ${degree.get(selected.id) || 0} 条连接`
    : meta.subtitle;
  els.content.innerHTML = selected ? renderDetail(selected) : renderViewDirectory(state.view);
}

function render() {
  els.generatedAt.textContent = data.generated_at;
  renderStats();
  renderTopNav();
  renderTopicFilters();
  renderTypeFilters();
  renderQuickNav();
  renderGraph();
  applyEntranceMode();
  renderContent();
  syncHash();
  updateReadingProgress();
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    setView(viewButton.dataset.view);
    render();
    focusWorkspace();
    return;
  }

  const scrollButton = event.target.closest("[data-scroll-target]");
  if (scrollButton) {
    if (scrollButton.dataset.graphOverview === "true") {
      setView("home");
      render();
    }
    const target = document.querySelector(scrollButton.dataset.scrollTarget);
    target?.scrollIntoView?.({ block: "start" });
    return;
  }

  const reset = event.target.closest("[data-reset]");
  if (reset) {
    setView("home");
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
    setTopic(topicButton.dataset.topic);
    render();
    focusWorkspace();
    return;
  }

  const matrixButton = event.target.closest("[data-matrix-cell]");
  if (matrixButton) {
    const [family, concept] = matrixButton.dataset.matrixCell.split("|");
    state.view = "matrix";
    state.selectedId = null;
    state.articleId = null;
    state.topic = "all";
    state.matrixCell = { family, concept };
    render();
    focusWorkspace();
    return;
  }

  const luckyButton = event.target.closest("[data-action='lucky']");
  if (luckyButton) {
    jumpToRandomNode();
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
    const paraTarget = articleButton.dataset.paraTarget;
    if (paraTarget) {
      document.querySelector(`#${paraTarget}`)?.scrollIntoView?.({ block: "center" });
    } else {
      focusWorkspace();
    }
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
  suppressEntrance = true;
  render();
  suppressEntrance = false;
});

// ---------- presentation enhancements (no-op outside a real browser) ----------

const inBrowser = typeof requestAnimationFrame === "function" && typeof window.requestAnimationFrame === "function";
let suppressEntrance = false;

function applyEntranceMode() {
  els.content.classList?.toggle?.("no-anim", suppressEntrance);
}

function animateStats() {
  if (!inBrowser || !els.stats.querySelectorAll) return;
  const targets = [...els.stats.querySelectorAll(".stat strong")];
  const duration = 1100;
  const start = performance.now();
  const finals = targets.map((el) => Number(el.textContent.replace(/[^0-9]/g, "")) || 0);
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    targets.forEach((el, i) => {
      el.textContent = Math.round(finals[i] * eased).toLocaleString("zh-CN");
    });
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

let progressEl = null;

function updateReadingProgress() {
  if (!progressEl) return;
  if (!state.articleId) {
    progressEl.style.transform = "scaleX(0)";
    return;
  }
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  const ratio = max > 0 ? Math.min(1, window.scrollY / max) : 0;
  progressEl.style.transform = `scaleX(${ratio})`;
}

function setupEnhancements() {
  if (!inBrowser) return;

  // when the atlas lives under the corporate site (/atlas/), home is one hop up
  if ((location.pathname || "").startsWith("/atlas")) {
    document.querySelector("#siteHomeLink")?.setAttribute?.("href", "/");
    document.querySelector("#brandHome")?.setAttribute?.("href", "/");
    document.querySelector(".sidebar-home")?.setAttribute?.("href", "/");
  }

  progressEl = document.createElement("div");
  progressEl.className = "reading-progress";
  document.body.appendChild(progressEl);
  window.addEventListener("scroll", updateReadingProgress, { passive: true });

  window.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== els.search) {
      event.preventDefault();
      els.search.focus();
    }
  });

  const lucky = document.querySelector("#luckyButton");
  lucky?.addEventListener?.("click", jumpToRandomNode);

  animateStats();
}

function jumpToRandomNode() {
  const button = document.querySelector("#luckyButton");
  button?.classList?.add?.("rolling");
  setTimeout(() => button?.classList?.remove?.("rolling"), 650);
  const pool = data.nodes.filter((node) =>
    ["story", "person", "company", "tool", "event", "concept"].includes(node.type));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (!pick) return;
  state.selectedId = pick.id;
  state.articleId = null;
  state.type = "all";
  render();
  focusWorkspace();
}

// ---------- hash routing ----------
// Deep states become shareable URLs:
//   #/article/story:tata   正文阅读
//   #/node/person:jrd-tata 节点详情
//   #/topic/succession     治理专题
//   #/topics …/people /stories /methods  视图
const routingEnabled = typeof location !== "undefined" && typeof window.addEventListener === "function";
let suppressHashEvent = false;

function stateToHash() {
  if (state.articleId) return `#/article/${state.articleId}`;
  if (state.selectedId) return `#/node/${state.selectedId}`;
  if (state.query) return `#/search/${encodeURIComponent(state.query)}`;
  if (state.view === "topic" && state.topic !== "all") return `#/topic/${state.topic}`;
  if (state.view === "matrix" && state.matrixCell) {
    return `#/matrix/${state.matrixCell.family}/${state.matrixCell.concept}`;
  }
  if (state.view !== "home") return `#/${state.view}`;
  return "#/";
}

function applyHash() {
  if (!routingEnabled) return;
  const parts = (location.hash || "")
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try { return decodeURIComponent(part); } catch { return part; }
    });
  setView("home");
  if (!parts.length) return;
  const [head, ...rest] = parts;
  const target = rest.join("/");
  if (head === "search" && target) {
    state.query = target;
    els.search.value = target;
    return;
  }
  if (head === "article" && articleByStoryId.has(target)) {
    state.articleId = target;
    state.selectedId = target;
    state.type = "all";
    return;
  }
  if (head === "node" && nodeById.has(target)) {
    state.selectedId = target;
    state.articleId = null;
    state.type = "all";
    return;
  }
  if (head === "topic" && topicById.has(target)) {
    setTopic(target);
    return;
  }
  if (head === "matrix") {
    setView("matrix");
    const [family, concept] = rest;
    if (family && concept && nodeById.has(family) && nodeById.has(concept)) {
      state.matrixCell = { family, concept };
    }
    return;
  }
  if (viewMeta[head]) setView(head);
}

function syncHash() {
  if (!routingEnabled) return;
  const target = stateToHash();
  const current = location.hash || "#/";
  if (current === target) return;
  if (target.startsWith("#/search/") && typeof history !== "undefined" && history.replaceState) {
    history.replaceState(null, "", target);
    return;
  }
  suppressHashEvent = true;
  location.hash = target;
}

if (routingEnabled) {
  window.addEventListener("hashchange", () => {
    if (suppressHashEvent) {
      suppressHashEvent = false;
      return;
    }
    applyHash();
    render();
    focusWorkspace();
  });
  applyHash();
}

render();
setupEnhancements();
