# Changelog

All notable changes to MBEditor will be documented in this file.

## [3.1] - 2026-04-09

### Fixed
- **预览所见即所得** — 预览框改为显示后端处理后的内联化 HTML，复制到微信后台的效果与预览完全一致
- 移除 base CSS 中 section 全局 margin/padding 重置，防止覆盖文章自定义样式
- 复制时直接使用预处理好的 HTML，避免重复 API 调用

## [3.0] - 2026-04-09

### Changed
- 下架 SVG 交互模板功能（不稳定，代码保留待优化）
- 排版组件全面转向纯 inline style HTML（标签徽章、渐变卡片、数据看板、时间线、引用样式、对比表格）
- 复制/发布流程注入 base styles，实现所见即所得
- 示例文章重新设计

### Added
- Docker 启动自动创建 data 目录（无需手动 mkdir）
- 首页 Header 设置页面入口
- README 升级指南

### Fixed
- 复制富文本 / 推送草稿箱与预览样式不一致的问题

## [2.0] - 2026-04-06

### Added
- SVG + foreignObject 交互组件（6 种纯 CSS 模板）
- 发布弹窗微信配置连接测试
- 5 种排版设计模板

## [1.0] - 2026-04-03

### Added
- 初始版本
- HTML / Markdown / 可视化三种编辑模式
- Monaco Editor 代码编辑
- 微信公众号草稿箱推送
- 图片上传管理
- CSS 自动内联
- Docker 一键部署
- AI Agent Skill 文件
