# 贡献指南

感谢你对 MBEditor 的关注！欢迎提交 Issue、PR 或参与讨论。

## 快速开始

```bash
git clone https://github.com/AAAAAnson/mbeditor.git
cd mbeditor

# 后端
cd backend
pip install -r requirements.txt
export IMAGES_DIR=../data/images ARTICLES_DIR=../data/articles CONFIG_FILE=../data/config.json
uvicorn app.main:app --reload --port 7071

# 前端（新终端）
cd frontend
npm install && npm run dev
```

## 如何贡献

### 报告 Bug
请使用 [Bug Report 模板](https://github.com/AAAAAnson/mbeditor/issues/new?template=bug_report.md) 提交，包含：
- 复现步骤
- 期望行为 vs 实际行为
- 环境信息（OS、Docker 版本等）

### 提交功能建议
使用 [Feature Request 模板](https://github.com/AAAAAnson/mbeditor/issues/new?template=feature_request.md) 提交，说明使用场景。

### 提交代码

1. Fork 仓库
2. 创建分支：`git checkout -b feat/your-feature`
3. 提交改动：`git commit -m "feat: add xxx"`
4. 推送分支：`git push origin feat/your-feature`
5. 开 Pull Request

**Commit 格式**（遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)）：
- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `refactor:` 代码重构
- `chore:` 构建/工具链

## 项目结构

```
mbeditor/
├── frontend/    # React 19 + TypeScript + Tailwind 4
├── backend/     # FastAPI + Python
├── skill/       # AI Agent Skill 定义
└── data/        # 运行时数据（Docker 挂载）
```

## 技术栈

| 前端 | 后端 |
|------|------|
| React 19 | FastAPI |
| TypeScript | Python 3.11+ |
| Tailwind CSS 4 | premailer |
| Monaco Editor | Pillow |

## 有问题？

- 💬 [GitHub Discussions](https://github.com/AAAAAnson/mbeditor/discussions) — 功能讨论、使用问题
- 🐛 [Issues](https://github.com/AAAAAnson/mbeditor/issues) — Bug 报告
