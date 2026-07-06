# 微信 SVG 能力回归测试套件

## 套件用途

本套件通过真实微信草稿箱 API 验证「探针 SVG 在推送后哪些属性被微信保留、哪些被剥除」，
将 `docs/research/svg-capability-research.md §2.2` 中标注为 **uncertain** 的断言逐条升/降级为
**confirmed**，产出一份「经 API 实测的微信 SVG 能力真值表」。

每个**探针（Probe）**包含：
- 一段完整的正文 HTML（含 SVG），经 `create_draft` 推送到草稿箱
- 若干**标记（Marker）**：用正则在回读 HTML 上判断某特性是否存活
- `expect_survive` 字段：预期该特性能否被微信保留（作为参照，不影响 survived 的事实判断）

---

## 目录结构

```
backend/tests/regression/
  __init__.py            # 包标识
  probes.py              # 探针定义（Probe/Marker 数据类 + PROBES 常量）[并行实现，勿修改]
  runner.py              # 运行引擎（run_probe/run_all/render_truth_table/main）[并行实现，勿修改]
  test_probes_offline.py # 离线测试：验证探针自洽性 + runner 评估逻辑（不触网）
  test_runner_live.py    # 真机测试：调用真实 API，验证返回结构
  README.md              # 本文件
```

---

## 运行方式

### 离线测试（不触网，CI 默认跑）

```bash
cd backend
python -m pytest tests/regression/test_probes_offline.py -v
```

验证内容：
- PROBES 非空、key 唯一、每个 probe 至少 1 个 marker
- `expect_survive=True` 的 marker.pattern 能命中自身 probe.html（探针自洽）
- runner 的 marker 评估逻辑（通过 monkeypatch 模拟微信剥离 id 的回读场景）

### live 全量测试（调用真实微信 API）

```bash
cd backend
MBEDITOR_RUN_REAL_WECHAT_TESTS=1 \
  python -m pytest tests/regression/test_runner_live.py -v -s
```

> **警告**：这会在你的微信公众号草稿箱创建 `[SVG-PROBE]` 前缀的草稿。
> 测试默认 `cleanup=True`，会在回读后自动删除。
> **请勿在生产公众号上运行，使用专用测试账号。**

### 单探针 CLI 运行（产出真值表）

```bash
cd backend
WECHAT_APPID=wx... WECHAT_APPSECRET=... \
  MBEDITOR_RUN_REAL_WECHAT_TESTS=1 \
  python -m tests.regression
```

可选参数（由 `runner.main()` 解析）：

| 参数 | 说明 | 默认值 |
|---|---|---|
| `--only KEY` | 只跑指定 key 的单个探针 | 全量 |
| `--cleanup` | 回读后删除草稿（避免污染草稿箱） | 不删除 |
| `--out FILE` | 真值表输出路径 | `docs/research/wechat-svg-truth-table.md` |

示例（只跑 svg-id-retention 探针，不加 `--cleanup` 保留草稿用于手动比对）：

```bash
cd backend
WECHAT_APPID=wx... WECHAT_APPSECRET=... \
  MBEDITOR_RUN_REAL_WECHAT_TESTS=1 \
  python -m tests.regression --only svg-id-retention
```

---

## 凭证配置

凭证读取优先级（与 `tests/visual/infrastructure.py:219-232` 完全一致）：

1. **环境变量**（推荐 CI 使用）：
   ```bash
   export WECHAT_APPID=wx1234567890abcdef
   export WECHAT_APPSECRET=your_appsecret_here
   ```

2. **`backend/data/config.json`**（本地开发，已 gitignore）：
   ```json
   {
     "appid": "wx1234567890abcdef",
     "appsecret": "your_appsecret_here"
   }
   ```
   也支持大写键名 `WECHAT_APPID` / `WECHAT_APPSECRET`。

---

## 输出真值表

CLI 运行结束后，真值表输出到 stdout（或 `--output` 指定文件），格式示例：

```markdown
| probe_key             | marker 描述              | expect_survive | survived | 结论      |
|-----------------------|--------------------------|:--------------:|:--------:|-----------|
| svg-id-retention      | id 属性存活              | True           | False    | confirmed: 微信剥 id |
| smil-animate-basic    | animate 元素存活         | True           | True     | confirmed: SMIL 存活 |
| stroke-dasharray-warn | stroke-dasharray 存活    | True           | False    | warning: 白名单冲突  |
```

将该表格追加到 `docs/research/svg-capability-research.md` 即可完成断言升降级。

---

## 安全提示

- 本套件会在公众号草稿箱创建标题前缀为 `[SVG-PROBE]` 的草稿
- 加 `--cleanup` 选项（默认启用）会在回读后通过 `draft/delete` API 自动删除
- 若中途异常导致未能清理，可手动进草稿箱删除所有 `[SVG-PROBE]` 开头的草稿
- **勿在生产公众号运行**，建议使用微信公众平台测试账号
- 凭证文件 `data/config.json` 已在 `.gitignore` 中，切勿手动 `git add` 该文件
