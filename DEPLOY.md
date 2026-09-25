# 部署操作手册

## 推荐路径：GitHub 私有仓库 + Cloudflare Pages 公开站点

这样源代码仓库可以保持私有，公开访问的是 Cloudflare Pages 生成的网址。

### 1. 创建 GitHub 仓库

建议仓库名：

`zhiyun-family-story-kg`

建议设置：

- Visibility: `Private`
- Initialize repository: 不勾选 README、.gitignore、license

### 2. 推送本地发布仓库

在本目录执行：

```bash
git remote add origin git@github.com:<你的用户名或组织>/zhiyun-family-story-kg.git
git push -u origin main
```

如果没有配置 SSH，也可以使用 HTTPS：

```bash
git remote add origin https://github.com/<你的用户名或组织>/zhiyun-family-story-kg.git
git push -u origin main
```

### 3. 连接 Cloudflare Pages

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages -> Create application -> Pages -> Connect to Git`。
3. 授权 GitHub 并选择 `zhiyun-family-story-kg`。
4. 设置：
   - Framework preset: `None` 或 `Static HTML`
   - Build command: 留空
   - Build output directory: `.`
5. 部署后会得到一个 `*.pages.dev` 公开地址。

## 备选路径：GitHub Pages

如果不使用 Cloudflare，也可以使用 GitHub Pages。

1. 进入 GitHub 仓库 `Settings -> Pages`。
2. Source 选择 `GitHub Actions`。
3. 推送到 `main` 后自动发布。

注意：GitHub Free 通常需要公开仓库才能使用公开 GitHub Pages；如果要私有仓库发布 Pages，取决于你的 GitHub 账号/组织套餐。

## 重新发布

主项目更新后，在主项目目录执行：

```bash
python3 scripts/build_article_data.py
python3 scripts/build_site_data.py
node scripts/verify_site_runtime.js
rsync -a --delete site/ "/Users/richard/Library/CloudStorage/SynologyDrive-backup/云盘/codex/01_项目/家族故事知识图谱/"
```

然后在本发布仓库目录执行：

```bash
git status
git add .
git commit -m "Update published site"
git push
```

