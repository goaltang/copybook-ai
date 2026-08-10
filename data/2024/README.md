# 2024 新版语文 1-3 年级数据(P4)— 状态:未完成(数据源不可达)

## 目标
2024 秋季起,1-3 年级启用新版统编教材(根据 2022 年版课程标准修订)。需按 data/final/ 老数据结构
产出 data/2024/ 下 6 册生字表(y一年级上册…y三年级下册,与老数据并行,不覆盖)。

## 结论(❌ 未能产出生字表 JSON)
整晚尝试后,2024 新版教材 PDF **未能下载成功**,生字表数据未产出。原因如下:

1. **TapXWorld/ChinaTextbook**:全仓库(3112 个文件)确认无 2024 新版,只有 2022 印次 12 册。
2. **国家中小学智慧教育平台 (basic.smartedu.cn)**:元数据公开可查(已确认 6 册 2024 新版存在,
   见 smartedu-content-ids.json),但 PDF 文件 CDN(r1/r2/r3-ndr.ykt.cbern.com.cn)需要登录态
   accessToken + MAC 签名;匿名请求被 WAF 拒绝(403/WAF/ACCESS_DENIED),公共 CDN 变体
   (ndr/oversea/cdncs)同样 403。浏览器内可看但无法脚本化下载。
3. **网盘镜像**(zhongyuanqi/dianzi-keben 等):PDF 存于百度网盘/夸克网盘,需要账号,无法自动下载。
4. **人教社官网**(ebook.pep.com.cn / jc.pep.com.cn):已下线或需登录。

## 已有中间产物(下一步可直接用)
| 文件 | 说明 |
|---|---|
| `data/2024/smartedu-content-ids.json` | 6 册 2024 新版教材的智慧教育平台 contentId + 标题(已确认存在) |
| `data/y1s_2024_toc.json` | 一年级上册 2024 版目录(44 条:单元/课号/页码,来自网络资料),非生字表 |
| `data/` 下老提取脚本 | extract_layout.py / extract_shizi.py / enrich_all.js 可直接复用 |

## 2024 版一年级上册结构变化(对比 2022 印次,来自 y1s_2024_toc.json)
- 识字(第一组):4 课 — 天地人 / 金木水火土 / 口耳目手足 / 日月山川(旧版 5 课含"对韵歌")
- 汉语拼音:14 课(a o e 起,新增 n/ng 合并课,旧版 13 课)
- 阅读:10 课(秋天/江南/雪地里的小画家/四季/小小的船/影子/两件宝/比尾巴/乌鸦喝水/雨点儿;旧版含"青蛙写诗"等,新版删减)
- 识字(第二组):4 课 — 对韵歌 / 日月明 / 小书包 / 升国旗
- 合计 32 个教学块(旧版 35)

## 下一步建议
1. 人工登录 basic.smartedu.cn 后,用浏览器控制台脚本(如 LoongBa/SmartEduDownloaderJS)下载 6 册 PDF;
   或使用带登录态的 accessToken 调 `https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/{contentId}.json`
   拿文件地址后下载。
2. 下载后:pdftotext -layout 提取附录识字表/写字表 → 复用 data/extract_layout.py 解析 →
   enrich_all.js 补属性 → 输出 data/2024/y*.json。
3. 二、三年级 2024 版(2025 秋起使用)同样按上述流程处理。
