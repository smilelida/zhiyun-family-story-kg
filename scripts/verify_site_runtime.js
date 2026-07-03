#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const repoRoot = path.resolve(__dirname, "..");
// Works from both layouts: the publish repo (files at root) and the
// master knowledge base (files under site/).
const root = fs.existsSync(path.join(repoRoot, "index.html"))
  ? repoRoot
  : path.join(repoRoot, "site");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const knowledge = fs.readFileSync(path.join(root, "data/knowledge.js"), "utf8");
const articles = fs.readFileSync(path.join(root, "data/articles.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const listeners = {};
const scrolls = [];

function element(name) {
  return {
    name,
    dataset: {},
    value: "",
    innerHTML: "",
    textContent: "",
    style: {},
    setAttribute() {},
    scrollIntoView(options) {
      scrolls.push({ name, options });
    },
    addEventListener(type, fn) {
      listeners[`${name}:${type}`] = fn;
    },
    closest() {
      return null;
    },
  };
}

const elements = new Map();
const document = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, element(selector));
    return elements.get(selector);
  },
  addEventListener(type, fn) {
    listeners[`document:${type}`] = fn;
  },
};
const windowListeners = {};
const window = {
  addEventListener(type, fn) {
    windowListeners[type] = fn;
  },
};
// app.js reads the bare `location` global for hash routing.
// Mirror browser semantics: assigning location.hash fires hashchange.
let currentHash = "";
const fakeLocation = {
  get hash() {
    return currentHash;
  },
  set hash(value) {
    const next = String(value).startsWith("#") ? String(value) : `#${value}`;
    if (next === currentHash) return;
    currentHash = next;
    windowListeners.hashchange?.();
  },
};
globalThis.location = fakeLocation;

Function("window", knowledge)(window);
Function("window", articles)(window);
Function("window", "document", app)(window, document);

const content = () => elements.get("#content")?.innerHTML || "";
const graph = () => elements.get("#graph")?.innerHTML || "";
const graphMode = () => elements.get("#graphMode")?.textContent || "";
const viewTitle = () => elements.get("#viewTitle")?.textContent || "";
const viewSubtitle = () => elements.get("#viewSubtitle")?.textContent || "";

function clickDataset(selector, dataset) {
  listeners["document:click"]({
    target: {
      closest(candidate) {
        if (candidate === selector) return { dataset };
        return null;
      },
    },
  });
}

assert(html.includes("执允·家族故事知识图谱"), "published page should use the public site title");
assert(!html.includes("data-graph-overview"), "top navigation should not expose knowledge graph as a pseudo page");
assert(!html.includes('data-scroll-target="#graphSection"'), "top navigation should not jump to the embedded graph module");
const nodeIds = new Set(window.KNOWLEDGE_DATA.nodes.map((node) => node.id));
const storyNodeCount = window.KNOWLEDGE_DATA.nodes.filter((node) => node.type === "story").length;
assert(window.KNOWLEDGE_DATA.nodes.length >= 695, "published knowledge data should include all nodes");
assert(window.KNOWLEDGE_DATA.edges.length >= 2843, "published knowledge data should include person relationship layer");
assert(storyNodeCount >= 32, "published knowledge data should keep every existing story");
assert(
  window.ARTICLE_DATA.articles.length === storyNodeCount,
  `every story node should ship with its article (stories: ${storyNodeCount}, articles: ${window.ARTICLE_DATA.articles.length})`,
);
for (const edge of window.KNOWLEDGE_DATA.edges) {
  assert(nodeIds.has(edge.source), `edge source missing from nodes: ${edge.source}`);
  assert(nodeIds.has(edge.target), `edge target missing from nodes: ${edge.target}`);
}
assert(content().includes("atlas-layout"), "initial view should render story map home");
const graphSection = () => elements.get("#graphSection") || { style: {} };
assert(graphSection().style.display === "none", "overview graph is retired: graph section should be hidden on load");

clickDataset("[data-topic]", { topic: "rules" });

assert(viewTitle().includes("家训、宪章与制度化信任"), "topic entry should render the selected topic detail");
assert(content().includes("topic-brief"), "topic entry should render a topic detail page");

clickDataset("[data-view]", { view: "people" });

assert(graphSection().style.display === "", "graph section should reappear for the person network");
assert(graph().includes("graph-person-network"), "person graph should render person-network mode");
assert(graphMode().includes("人物直连关系"), "person graph mode label should describe direct person relationships");
assert(viewTitle() === "人物图谱", "person page should have its own page title");
assert(!viewSubtitle().includes("家训、宪章与制度化信任"), "person page should not inherit a previous topic subtitle");
assert(content().includes("人物索引"), "person page should render a person-specific directory");

clickDataset("[data-view]", { view: "topics" });

assert(viewTitle() === "主题索引", "topics page should have its own page title");
assert(content().includes("全部治理专题"), "topics page should explain where topic selection happens");
assert(content().includes("接班与继承人培养"), "topics page should list all governance topics");
assert(content().includes("家训、宪章与制度化信任"), "topics page should include rules as one topic, not as the global title");

clickDataset("[data-view]", { view: "stories" });

assert(viewTitle() === "故事列表", "story list should have its own page title");
assert(!viewSubtitle().includes("家训、宪章与制度化信任"), "story list should not inherit a previous topic subtitle");
assert(content().includes("故事索引"), "story list should render a story-specific directory");

clickDataset("[data-view]", { view: "methods" });

assert(graphSection().style.display === "none", "methods view should not show the overview graph");
assert(viewTitle() === "方法论", "methods page should have its own page title");
assert(!viewSubtitle().includes("家训、宪章与制度化信任"), "methods page should not inherit a previous topic subtitle");
assert(content().includes("方法论索引"), "methods page should render a method-specific directory");
assert(!scrolls.some((item) => item.name === "#graphSection"), "top navigation should not rely on graph-section scrolling");

clickDataset("[data-view]", { view: "matrix" });

assert(viewTitle() === "对照矩阵", "matrix view should have its own page title");
assert(content().includes("matrix-table"), "matrix view should render the family-by-concept table");
assert(content().includes("matrix-cell"), "matrix view should render evidence cells");

clickDataset("[data-matrix-cell]", { matrixCell: "family:tata-family|concept:steward-ownership" });

assert(content().includes("matrix-evidence-head"), "clicking a matrix cell should open the evidence panel");
assert(fakeLocation.hash === "#/matrix/family:tata-family/concept:steward-ownership", `matrix cell should deep-link (got ${fakeLocation.hash})`);

fakeLocation.hash = "#/matrix";
assert(viewTitle() === "对照矩阵", "matrix hash should open matrix view");

clickDataset("[data-id]", { id: "person:jrd-tata" });
assert(graphSection().style.display === "", "selecting a node should reveal its local ego network");

// hash routing: user actions write the hash, hash changes drive the state
assert(fakeLocation.hash === "#/node/person:jrd-tata", `node selection should update the hash (got ${fakeLocation.hash})`);

clickDataset("[data-id]", { id: "story:tata" });
assert(fakeLocation.hash === "#/node/story:tata", `node selection should update the hash (got ${fakeLocation.hash})`);

fakeLocation.hash = "#/topic/succession";
assert(viewTitle().includes("接班与继承人培养"), "hashchange should open the topic detail");

fakeLocation.hash = "#/article/story:dassler";
assert(viewTitle().includes("低头看鞋"), "hashchange should open the article reader");

fakeLocation.hash = "#/node/no-such-node";
assert(viewTitle() === "故事地图", "invalid hash should fall back to home");

console.log(JSON.stringify({
  nodes: window.KNOWLEDGE_DATA.nodes.length,
  edges: window.KNOWLEDGE_DATA.edges.length,
  runtime: "ok",
}, null, 2));
