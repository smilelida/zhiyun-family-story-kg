# 执允·家族故事知识图谱

这是“执允·家族故事知识图谱”的公开静态站点发布仓库。

## 站点结构

- `index.html`：站点入口
- `app.js`：交互逻辑
- `styles.css`：页面样式
- `data/knowledge.js`：知识节点与关系数据
- `data/articles.js`：32 篇故事正文数据

## 发布方式

本仓库是纯静态网站，不需要数据库、服务器或构建步骤。

### GitHub Pages

仓库已包含 `.github/workflows/deploy-github-pages.yml`。

在 GitHub 仓库中启用 Pages：

1. 进入 `Settings -> Pages`。
2. `Build and deployment` 的 `Source` 选择 `GitHub Actions`。
3. 推送到 `main` 后，Actions 会自动发布。

### Cloudflare Pages

在 Cloudflare Pages 中连接本仓库：

- Framework preset: `None` 或 `Static HTML`
- Build command: 留空
- Build output directory: `.` 或 `/`

## 更新流程

主项目仍是：

`/Users/richard/Library/CloudStorage/SynologyDrive-backup/云盘/codex/02_研究与写作/家族传承与治理知识库`

主项目更新后，重新生成站点数据，再把 `site/` 同步到本发布仓库。

