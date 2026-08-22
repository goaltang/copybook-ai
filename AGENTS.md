# AGENTS.md — AI 代理工作须知

> 给在本仓库工作的 AI 编码代理(Codex / Claude / Copilot 等)的说明书。
> 人类贡献者请看 [CONTRIBUTING.md](CONTRIBUTING.md);产品决策背景见 `obsidian-vault/`。

## 项目一句话

对话式汉字字帖生成器:一句话("一年级上册第五课 米字格 带描红")→ 可打印矢量 PDF。
**规则先行、LLM 兜底**:常见指令离线规则解析,只有规则失败才调 LLM;无 API key 时全部功能降级可用。

## 目录结构

```
engine/            零框架 TS 后端(Node 原生 http)
  src/parse.ts       规则解析器(三种模式: lesson/text/unlearned; 样式开关统一在 applySwitches)
  src/llm.ts         LLM 兜底(undici 必须函数内惰性 import, 见下"勿做")
  src/resolve.ts     ParseResult → 字谱 + 描述; cli/server 共用, 禁止再写第二份找课逻辑
  src/index.ts       PDF 引擎(纯库, 不读 env, 不依赖框架)
  src/text.ts        任意文本→字谱(pinyin-pro 上下文定音 + 生字表笔画)
  src/strokes.ts     笔顺渲染(hanzi-writer 数据 y-up 坐标, 勿改翻转逻辑)
  src/cli.ts / server.ts   两个入口, 只调 resolve.ts, 不含业务逻辑
web/               Vue3 单文件聊天前端(App.vue), vite build → web/dist 由 engine 托管
data/final/        12 册生字 JSON(y一年级上册.json … y六年级下册.json) + words.json + strokes.json
```

## 环境与命令

- **Node 22**(CI 用 22;undici 新版与 Node 20 不兼容)
- engine 与 web 依赖**各自安装**,互不共享:
  ```bash
  cd engine && npm install
  cd ../web && npm install
  ```
- 常用命令(engine 目录):
  ```bash
  npx tsc --noEmit                          # 类型检查(提交前必跑)
  npm test                                  # vitest, 75 用例, 全离线
  npx tsx src/cli.ts "一年级上册第五课" --no-llm   # 离线冒烟
  npx tsx src/server.ts                     # http://127.0.0.1:8787, 托管 web/dist
  ```
- web:`npm run dev`(Vite proxy /api → 8787)/ `npm run build`

## tsconfig 严格约束(写代码前记住)

- `exactOptionalPropertyTypes`:可选属性不能直接赋 `undefined`;要么声明 `?: T | undefined`,要么条件赋值
- `noUncheckedIndexedAccess`:下标访问得 `T | undefined`,必须处理
- `verbatimModuleSyntax` + `nodenext`:纯类型用 `import type`;相对导入**带 `.js` 后缀**

## 字体与 PDF(本项目最大的坑)

- **禁止** `embedFont(..., { subset: true })` 用于大型 CJK 字体:`@pdf-lib/fontkit` 的子集器对 4 万+ 字形字体会丢字形(实测霞鹜文楷:虫/云不渲染、标题残缺)
- 正确姿势(已在 index.ts 实现):收集本次用到的全部字符 → `subset-font`(harfbuzz WASM)预子集 → `embedFont(bytes, { subset: false })` 只解析不二次子集
- 新增任何 `drawText` 调用时,必须把其文本并入 `hanziSet`/`latinSet`,否则字形不在子集里会渲染缺失
- 字体:engine/fonts/LXGWWenKai-Regular.ttf(OFL)+ DejaVuSans.ttf(拼音声调);禁 simkai(微软版权)
- PDF 保持矢量、KB 级;不要整字体嵌入(13MB)

## 前端约定

- 预览用 **pdfjs-dist 首页渲染成图片**;不要用 iframe 内嵌 PDF(移动端不渲染)
- worker:`import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`
- 会话记忆:lastBook 存 localStorage,随 POST /api/copybook 发送,用于补全"第8课/全册"等缺册别输入

## 环境变量

| 变量 | 作用 |
|---|---|
| `OPENCODE_GO_API_KEY` | LLM 兜底开关;未设置自动降级纯规则 |
| `LLM_API_BASE` / `LLM_MODEL` | 网关/模型覆盖(默认 opencode-go + deepseek-v4-flash) |
| `LLM_PROXY_URL` | 可选代理;未设置读 `HTTPS_PROXY`,再没有直连 |
| `PORT` | server 端口,默认 8787 |

## 数据约定

- 册名固定 `y{一二三四五六}年级{上下}册`,列表见 parse.ts 的 `BOOKS`
- 拼音**一律小写**(数据源有句首大写残留,resolve.ts 会转;新数据直接给小写)
- 表:`xiezi`(写字表)/ `shizi`(识字表);六年级无识字表,解析层自动用写字表
- 改生字数据 = 改 JSON,PR 即可;字段 char/pinyin/strokes/radical/structure

## 测试与 CI

- 提交前:`npx tsc --noEmit` + `npm test` 必须全绿
- CI 全离线:tsc + vitest + `--no-llm` 冒烟 + vite build;**不要**引入依赖网络/API key 的测试
- 新增解析开关/模式 → 补 `tests/parse.test.ts`;文本管线 → `tests/text.test.ts`;共享层 → `tests/resolve.test.ts`
- 用户可见功能同步更新 README(特性列表 + 示例表)

## 勿做

- 勿把 `undici` import 放回 llm.ts 模块顶部(无 key 的 CLI/CI 会在模块加载时崩)
- 勿改 strokes.ts 的坐标翻转链(flipPathY → drawSvgPath 自带翻转),改一笔全歪
- 勿给后端加框架(零框架是开源门槛设计);共享逻辑进 resolve.ts
- 勿让"第N课"解析失败时静默变全册(已有报错,保持)
- 勿在仓库提交 engine/out/、web/dist/、node_modules/(.gitignore 已覆盖)
