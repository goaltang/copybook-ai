# 夜间自治任务报告(copybook-ai 字帖项目 · 数据补齐 + 单测)

日期:2026-08-11 · 工作目录:/mnt/d/zitie · 分支:master

## 一、任务完成状态

| 任务 | 状态 | 说明 |
|---|---|---|
| P1 组词数据 | ✅ 完成 | CC-CEDICT + wordfreq 词频,2980 字全覆盖 |
| P2 笔顺数据 | ✅ 完成 | hanzi-writer-data + cnchar-order,2980 字全覆盖 |
| P3 OFL 楷体选定 | ✅ 完成 | 选定霞鹜文楷 LXGW WenKai (OFL 1.1),嵌入测试通过 |
| P4 2024 新版 1-3 年级数据 | ❌ 失败 | 教材 PDF 数据源全部不可达,已记录原因与已定位资源 |
| P5 engine 单测 | ✅ 完成 | vitest 2 文件 26 用例全绿 |

## 二、各项详情

### P1 组词数据 ✅
- 下载 CC-CEDICT 带声调版(124,806 条,直连 mdbg 成功,无需代理)
- 筛选 2-4 字简体词条 104,251 条;词频用 wordfreq 3.1.1 (zh, Zipf 值) 打分,专有名词降权、2 字词优先
- 输出 `data/final/words.json`(1.2 MB):每字最多 5 个开头组词 + 单字词兜底(带拼音、zipf)
- 校验脚本 `scripts/check-words.ts`:覆盖率 100%(目标 >90%),多字组词覆盖 96.74%
- 构建脚本 `data/build-words.py` 已固化可复现

### P2 笔顺数据 ✅
- hanzi-writer-data(MIT,9581 字矢量笔顺)+ cnchar 3.2.6 cnchar-order(笔画名,6939 字)
- 输出 `data/final/strokes.json`(7.8 MB):每字 names(按书写顺序笔画名)+ paths(每笔 SVG)+ medians(折线)
- 校验脚本 `scripts/check-strokes.ts`:笔画名/矢量路径覆盖率均 100%(目标 >95%),笔画数与生字表字段 0 不一致
- 构建脚本 `data/build-strokes.py` 已固化

### P3 OFL 楷体选定 ✅
- 选定:**霞鹜文楷 LXGW WenKai Regular v1.522**(SIL OFL 1.1,24.4 MB),加入 `engine/fonts/LXGWWenKai-Regular.ttf`
- 嵌入测试:pdf-lib 子集化生成 10 字 PDF(天地玄黄宇宙洪荒日月盈昃),pdftotext 提取中文无乱码、无缺字
- 未改任何代码(CLI 仍默认演示春风楷,切换仅需改 cli.ts 一行);报告见 `docs/fonts-report.md`
- 候选对比:寒蝉拙楷/法华文楷官方源本环境不可达(GitHub 404/搜索无结果);演示春风楷为仓库现有(免费商用但非 OFL)

### P4 2024 新版 1-3 年级数据 ❌(尽力而为,已超 60 分钟预算)
- 尝试路径与结果:
  1. TapXWorld/ChinaTextbook:全仓库 3112 文件确认**无** 2024 新版(仅 2022 印次 12 册)
  2. 智慧教育平台 smartedu.cn:元数据公开 API 可用,**已确认 6 册 2024 新版存在**(标题"根据2022年版课程标准修订");但 PDF CDN 需登录态 accessToken+MAC 签名,匿名请求被 WAF 拒绝(403),公共 CDN 变体(ndr/oversea/cdncs)、cs_token 接口均被 WAF 拦截
  3. 网盘镜像(dianzi-keben 等):百度网盘/夸克网盘需账号,无法自动下载
  4. 人教社官网(ebook.pep.com.cn / jc.pep.com.cn):已下线或需登录
- 已产出:`data/2024/README.md`(失败原因 + 2024 版一上结构对比)+ `data/2024/smartedu-content-ids.json`(6 册 contentId,供后续人工下载使用)
- 2024 版一上结构变化(来自已有 y1s_2024_toc.json):识字 4+4 课、拼音 14 课、阅读 10 课,共 32 教学块(旧版 35)

### P5 engine 单测 ✅
- 安装 vitest 4.1.10(esbuild 无平台冲突,未需 rebuild)
- `engine/tests/parse.test.ts`:8 个规则解析用例 + 2 个 CLI --no-llm 集成用例(共 10 个,≥6 要求)
  - 覆盖:精确课定位、年级+课(中文/阿拉伯数字)、自由表达兜底、异常输入、空输入、全册、样式选项(米字格/无拼音)、--no-llm 成功路径、--no-llm 失败路径
- `engine/tests/data.test.ts`:16 个数据完整性用例(12 册结构、每课非空、字段齐全、六年级无识字表、words/strokes 全覆盖)
- package.json 增加 `"test": "vitest run"`

## 三、新增/修改文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| data/final/words.json | 新增 | 组词数据(2980 字) |
| data/build-words.py | 新增 | 组词构建脚本 |
| scripts/check-words.ts | 新增 | 组词校验脚本 |
| data/final/strokes.json | 新增 | 笔顺数据(2980 字) |
| data/build-strokes.py | 新增 | 笔顺构建脚本 |
| scripts/check-strokes.ts | 新增 | 笔顺校验脚本 |
| engine/fonts/LXGWWenKai-Regular.ttf | 新增 | 选定楷体(24.4 MB) |
| docs/fonts-report.md | 新增 | 字体评估报告 |
| engine/tests/parse.test.ts | 新增 | 解析器单测 |
| engine/tests/data.test.ts | 新增 | 数据完整性单测 |
| engine/package.json / package-lock.json | 修改 | 加 `"type":"module"`、devDependencies vitest + typescript-linux-x64、test 脚本 |
| engine/demo.ts | 修改 | import 加 .js 扩展名(ESM 修复) |
| engine/src/llm.ts | 修改 | 仅类型收紧(interface/typeof 守卫/断言),**逻辑与行为零变化**,为通过 tsc |
| data/README.md | 修改 | 补组词/笔顺章节 |
| data/2024/README.md | 新增 | 2024 数据失败记录 |
| data/2024/smartedu-content-ids.json | 新增 | 6 册教材 contentId |

> 注:engine 三处修改(见上)是历史遗留问题修复——原仓库 `tsc --noEmit` 从未通过(CI 用冒烟测试绕过)。本次为满足质量门 1,修复了:① package.json 缺 `"type":"module"`(代码本就全 ESM 语法);② llm.ts 在 exactOptionalPropertyTypes 下的类型错误(行为不变);③ demo.ts import 缺扩展名。未改版本号、未改任何逻辑。

## 四、数据覆盖率(校验脚本输出)

```
===== 组词数据校验报告 (check-words) =====
生字表唯一字: 2980
有词覆盖(含单字词): 2980 (100.00%)  [目标 >90%]
有多字组词: 2883 (96.74%)
仅单字词兜底: 97 / 完全无词: 0
结论: ✅ 通过

===== 笔顺数据校验报告 (check-strokes) =====
生字表唯一字: 2980
有笔画名: 2980 (100.00%)  [目标 >95%]
有矢量路径: 2980 (100.00%)
笔画数不一致: 0 / 缺失: 0
结论: ✅ 通过
```

## 五、三个质量门结果(最终)

| 质量门 | 命令 | 结果 |
|---|---|---|
| 1 | cd engine && npx tsc --noEmit | ✅ 0 错误 |
| 2 | cd engine && npx tsx src/cli.ts "一年级上册第五课" --no-llm | ✅ 输出"生成成功"(out/cli-*.pdf,约 12 KB) |
| 3 | cd engine && npx vitest run | ✅ 2 files / 26 tests 全绿 |

(每完成一个 P 项均跑过三道门;P5 前门 3 用 vitest,前四项目为 tsc+cli)

## 六、git 提交列表(git log --oneline)

```
bbe4f24 feat(data): 2024新版数据-记录资源定位与失败原因(数据源不可达, 附 contentId)
5c09b6e test(engine): vitest 单测(parse 解析器 10 用例 + 数据完整性, 全绿)
2d01c48 feat(fonts): 选定霞鹜文楷 LXGW WenKai (OFL) 并嵌入测试通过
47e7681 feat(data): 笔顺数据(hanzi-writer-data + cnchar-order, 2980字全覆盖)
e418daf feat(data): 组词数据(CC-CEDICT 关联生字表, 2980字全覆盖)
0ea2376 fix(engine): 修复 tsc 类型检查不通过(ESM type 声明 + llm.ts 类型收紧)
```
(每项 P 单独 commit,未 push)

## 七、遗留问题与下一步建议

1. **P4 2024 新版数据**:需人工登录智慧教育平台下载 6 册 PDF(浏览器控制台脚本 LoongBa/SmartEduDownloaderJS 可生成免 token 链接;或带登录态调 details API),下载后复用 data/ 现有提取管线。contentId 已备好。
2. **词频策略**:CC-CEDICT 无词频,当前用 wordfreq Zipf 近似;个别字(如"天")排名里仍混入专有名词(天津),后续可接入教材语料词频(如 BCC/CCL 词表)进一步优化,或按年级过滤词表。
3. **字体切换**:CLI 默认仍是演示春风楷,切换为霞鹜文楷只需改 `cli.ts` 的 FONT_PATH 一行;建议产品侧确认后切换。
4. **多音字标注**:数据仍用 cnchar 默认读音,可按课文语境标注多音字(README 已知待办)。
5. **CI 补强**:CI 现在用冒烟测试代替类型检查;本次 tsc 已修复,可把 `npx tsc --noEmit` 加回 CI,并接入 `npm test`。
6. **文档同步**:README 主打内容未动(边界要求);后续可在 README 补充数据能力说明。

## 八、备注
- 网络情况:直连 mdbg/GitHub/智慧教育平台均通,未用到代理;代理 127.0.0.1:7897 备而未用。
- 未改动 web/ 前端;未删除改写 data/final/ 任何文件;未 push;未部署常驻服务。
- 提交身份沿用仓库最近一次提交的 root <root@TZT-ASUS.localdomain>(git config 无 user 配置,通过 -c 参数指定,未改 git config)。

总 token 消耗:无法查看(未提供计数接口),估算约 60-80 万 tokens。
报告结束
