# 贡献指南

欢迎参与字帖项目!无论是修 bug、加功能、补数据,还是写文档,都欢迎。

## 环境准备

- Node.js 20+(开发时建议 20.19+)
- 克隆仓库:

```bash
git clone https://github.com/goaltang/copybook-ai.git
cd copybook-ai
```

- 安装依赖(engine 和 web 各自安装,互不共享):

```bash
cd engine && npm install
cd ../web && npm install
```

- 本地跑起来:

```bash
# CLI 冒烟(离线,无需 API key)
cd engine && npx tsx src/cli.ts "一年级上册第五课" --no-llm

# HTTP 服务(默认 http://127.0.0.1:8787,托管 web/dist)
cd engine && npx tsx src/server.ts

# 前端开发模式(proxy /api → 8787)
cd web && npm run dev
```

## 开发流程

1. 从 `master` 新建分支:`git checkout -b feat/xxx` 或 `fix/xxx`
2. 写代码 + 本地验证(至少跑通 CLI 冒烟和 `web` 的 `npm run build`)
3. 提交信息用 conventional commits(中文描述也可以):

```
feat(parse): 支持"第X课X字表"更多说法
fix(server): 修复超大请求体报错
docs(readme): 补充使用示例
data: 更正一年级上册第10课写字表
```

4. 推送分支,向 `master` 提 PR,附上改动说明与验证方式

## 数据贡献

如果发现某册某课的生字/拼音/笔画有误,欢迎提 PR 修正:

1. 编辑对应的 `data/final/`.json`(如 `y一年级上册.json`)
2. 在 PR 描述中说明:
   - 改的是哪一课、哪几个字,错在哪
   - 依据来源(课本页码/截图/官网资料,附链接或图片)
3. 保持 JSON 结构不变(`book` / `tables.shizi` / `tables.xiezi`,字段见 [data/README.md](data/README.md))

> 数据以课本 PDF(TapXWorld/ChinaTextbook)为准;若与网上资料冲突,优先课本,并在 PR 里说明。

## 行为准则

友好、尊重、用中文交流;对事不对人,欢迎任何水平的贡献者。
