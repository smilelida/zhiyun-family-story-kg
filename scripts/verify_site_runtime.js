#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
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
const window = {};

Function("window", knowledge)(window);
Function("window", articles)(window);
Function("window", "document", app)(window, document);

const content = () => elements.get("#content")?.innerHTML || "";
const graph = () => elements.get("#graph")?.innerHTML || "";
const graphMode = () => elements.get("#graphMode")?.textContent || "";

assert(html.includes("执允·家族故事知识图谱"), "published page should use the public site title");
assert(window.KNOWLEDGE_DATA.nodes.length === 695, "published knowledge data should include all nodes");
assert(window.KNOWLEDGE_DATA.edges.length === 2843, "published knowledge data should include person relationship layer");
assert(window.ARTICLE_DATA.articles.length === 32, "published article data should include all 32 stories");
assert(content().includes("atlas-layout"), "initial view should render story map home");
assert(graph().includes("graph-summary"), "initial graph should render overview summary");

listeners["document:click"]({
  target: {
    closest(selector) {
      if (selector === "[data-type]") return { dataset: { type: "person" } };
      return null;
    },
  },
});

assert(graph().includes("graph-person-network"), "person graph should render person-network mode");
assert(graphMode().includes("人物直连关系"), "person graph mode label should describe direct person relationships");

listeners["document:click"]({
  target: {
    closest(selector) {
      if (selector === "[data-scroll-target]") return { dataset: { scrollTarget: "#graphSection", graphOverview: "true" } };
      return null;
    },
  },
});

assert(!graph().includes("graph-person-network"), "knowledge graph button should leave person-network mode");
assert(graphMode().includes("代表节点"), "knowledge graph button should restore overview graph mode");
assert(content().includes("atlas-layout"), "knowledge graph button should restore story map context");
assert(scrolls.some((item) => item.name === "#graphSection"), "knowledge graph button should scroll to graph section");

console.log(JSON.stringify({
  nodes: window.KNOWLEDGE_DATA.nodes.length,
  edges: window.KNOWLEDGE_DATA.edges.length,
  runtime: "ok",
}, null, 2));
