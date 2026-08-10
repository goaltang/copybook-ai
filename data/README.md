# 部编版小学语文生字数据包(第一版)

## 数据来源与提取方法
- 教材 PDF: TapXWorld/ChinaTextbook (GitHub, 78324★) `小学/语文/统编版/义务教育教科书·语文X年级X册.pdf`
- 提取: pdftotext -layout → 行内 token 流式解析(单双列通吃,整体词匹配"课文/识字/汉语拼音/语文园地N")
- 汉字属性: cnchar 3.2.6 (+radical +order 插件), 拼音(带声调)/笔画数/部首/结构
- 脚本: batch_extract.py(解析) → enrich_all.js(属性补全) → final/*.json

## 版本说明
- 本数据包为统编版(部编版)2022 印次教材(老版)
- 2024 秋季起 1-3 年级换新版教材(课文与生字表有变动),需另行整理新版数据
- 2026 年秋季在读学生: 1-3 年级用新版, 4-6 年级用老版 → 两套都要

## 数据结构
```json
{
  "book": "y一年级上册",
  "tables": {
    "shizi": {  // 识字表(会认), 六年级无
      "lessons": [{"no": 1, "type": "识字|课文|拼音", "chars": [{"char":"天","pinyin":"Tiān","strokes":4,"radical":"大","structure":"上下结构"}, ...]}],
      "gardens": [{"name": "1", "chars": [...]}]  // 语文园地字
    },
    "xiezi": { ... }  // 写字表(会写)
  }
}
```

## 各册字数与官方总数对照
| 册 | 识字表提取 | 写字表提取 | 官方总数(书内"共N个生字") |
|---|---|---|---|
| 一上 | 278+园地=304字次/300唯一 | 100 | 300(识字表) |
| 一下 | 406 | 200 | 400 |
| 二上 | 422+28=450 | 250 | 450 |
| 二下 | 429+21=450 | 250 | 450 |
| 三上 | 273 | 250 | 250 |
| 三下 | 278 | 250 | 250 |
| 四上 | 268 | 250 | 250 |
| 四下 | 261 | 250 | 250 |
| 五上 | 205 | 220 | 200 |
| 五下 | 200 | 180 | 200 |
| 六上 | (无) | 180 | - |
| 六下 | (无) | 120 | - |

## 差值解释(提取 > 官方总数)
- 官方"共N个生字"按"不含多音字"统计(课本附录注明"蓝色的字是多音字,不计入生字总数",文字层无色无法识别)
- 一上额外有 4 个跨课重复字(地/长/数/着),304字次-4重复=300唯一字 与官方吻合
- 数据忠实于课本附录,完整保留多音字 — 产品展示时可按需标注

## 已知待核对项
1. 一上课文10写字表 "自 己 门 衣"(4字) vs 网上资料"自 己 衣"(3字) — 以课本 PDF 为准,待二次核对
2. 一上识字表 4 个跨课重复字确认无误
3. 各册课号: 低年级(1-2)识字表内"课文/识字/拼音"块各自从1编号; 高年级(3-6)全书连续编号(课号=课文序号,识字块并入)

## 组词数据 (words.json, P1)
- 来源: CC-CEDICT (CC BY-SA 4.0, 带声调 UTF-8 版, https://www.mdbg.net/chinese/dictionary?page=cc-cedict)
- 筛选: 仅简体字、长度 2-4 的常用词, 共 104251 条
- 词频: wordfreq 3.1.1 (zh, Zipf 值) 排序, 专有名词(拼音首字母大写)降权, 2字词优先
- 结构: `data/final/words.json` → `{ "words": { "天": [{"word","pinyin","zipf"}, ...] } }`, 每字最多 5 个开头组词 + 单字词兜底
- 覆盖: 2980 个唯一字全部覆盖, 其中 2883 字 (96.74%) 有多字组词
- 构建: `python3 data/build-words.py <cedict_ts.u8.gz>` (需 wordfreq/jieba)
- 校验: `cd engine && npx tsx ../scripts/check-words.ts` (目标覆盖率 >90%, 单字词算覆盖)

## 后续工作
- [ ] 2024 新版 1-3 年级数据(共6册)
- [x] 组词数据接入(CC-CEDICT, CC BY-SA 4.0) → words.json
- [x] 笔顺数据接入(hanzi-writer-data MIT + cnchar-order) → strokes.json
- [ ] 多音字读音按课文语境标注(先用 cnchar 默认读音)

## 笔顺数据 (strokes.json, P2)
- 来源: hanzi-writer-data (MIT, https://github.com/chanind/hanzi-writer-data) + cnchar 3.2.6 cnchar-order (MIT)
- 结构: `data/final/strokes.json` → `{ "strokes": { "天": {"names": ["横","横","撇","捺"], "paths": [每笔SVG], "medians": [每笔折线]} } }`
- names: 按书写顺序的笔画名称; paths/medians: hanzi-writer 矢量笔顺(可做动态笔顺演示)
- 覆盖: 2980 个唯一字 100% 有笔画名与矢量路径, 笔画数与生字表字段 0 不一致
- 构建: `python3 data/build-strokes.py <cnchar-orders.json> <hanzi-writer-data目录>`
  - cnchar-orders 导出: `node -e "const c=require('cnchar');c.use(require('cnchar-order'));require('fs').writeFileSync('orders.json',JSON.stringify(c.order.dict.orders))"`
- 校验: `cd engine && npx tsx ../scripts/check-strokes.ts` (目标覆盖率 >95%)
