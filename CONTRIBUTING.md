# 贡献指南

感谢你对 MBEditor 的关注！欢迎提交 Issue、PR 或参与讨论。

## 快速开始

```bash
git clone https://github.com/AAAAAnson/mbeditor.git
cd mbeditor

# 后端（无状态；凭证/图片/文章都走前端 localStorage，无需 export 目录）
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 7071

# 前端（新终端）
cd frontend
npm install && npm run dev
```

## 如何贡献

### 报告 Bug
请使用 [Bug Report 模板](https://github.com/AAAAAnson/mbeditor/issues/new?template=bug_report.md) 提交，包含：
- �