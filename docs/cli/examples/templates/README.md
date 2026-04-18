# 模板文章集

5 种风格的示范文章，用于演示编辑器在微信公众号白名单约束下能做到的排版效果。

| 文件 | 风格 | 封面 | 适用场景 |
|------|------|------|----------|
| `tpl_biz_minimal.json` | 极简商务 | swiss | 行业报告、企业通告 |
| `tpl_tech_neon.json` | 科技霓虹 | neon | 科技资讯、产品发布 |
| `tpl_literary.json` | 文艺手札 | paper | 散文、读书笔记 |
| `tpl_vibrant.json` | 活力撞色 | warm | 生活方式、清单类 |
| `tpl_magazine.json` | 杂志专栏 | terminal | 深度报道、人物专访 |

## 设计规范

- 所有样式均为内联 `style`，100% 通过微信公众号 sanitizer 白名单
- 仅使用 `section` + `display:inline-block` + `vertical-align` 布局（无 flex/grid）
- 内嵌 SVG 用于装饰（分割线、图标、数据图表），微信 paste handler 完整保留
- 每篇 1500+ 字，内容包含具体事实、研究引用或采访场景

## 导入方式

通过 API 批量导入当前环境：

```bash
for f in docs/cli/examples/templates/tpl_*.json; do
  # 创建文章
  id=$(curl -s -X POST http://localhost:7072/api/v1/articles \
    -H 'Content-Type: application/json' \
    -d "$(python -c "import json,sys; d=json.load(open('$f','r',encoding='utf-8')); print(json.dumps({'title':d['title'],'mode':d['mode']}))")" \
    | python -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
  # 写入正文
  curl -s -X PUT "http://localhost:7072/api/v1/articles/$id" \
    -H 'Content-Type: application/json' \
    -d @"$f" >/dev/null
  echo "imported $f -> $id"
done
```
