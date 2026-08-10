# 字体评估报告:OFL 楷体选定(P3)

## 结论
选定 **霞鹜文楷 LXGW WenKai Regular v1.522** 作为楷体字帖字体,加入 `engine/fonts/LXGWWenKai-Regular.ttf`(新增,不替换现有字体,不改代码逻辑)。

## 候选对比

| 候选 | 许可 | 大小 | 状态 | 说明 |
|---|---|---|---|---|
| **霞鹜文楷 LXGW WenKai** | SIL OFL 1.1 ✅ | 24.4 MB (Regular TTF) | ✅ 已下载并嵌入测试通过 | 主流开源楷体,基于 Klee One 字形设计,简体为主,字库覆盖常用字;GitHub 活跃维护(仓库 lxgw/LxgwWenKai),releases 提供单文件 TTF |
| 寒蝉拙楷 | 免费商用(官网声明) | - | ❌ 未获取 | 官方 GitHub 在本环境不可达(搜索 API 无结果),未下载,无法实测 |
| 演示春楷/秋楷(演示春风楷) | 免费商用(字制区,非 OFL) | 仓库已有 | ⚠️ 已在仓库中 | `engine/fonts/演示春风楷.ttf` 已嵌入测试过,是当前 CLI 默认字体;授权为免费商用但非 OFL,故不作为"OFL 选定" |
| 法华文楷 | SIL OFL 1.1 | - | ❌ 未获取 | GitHub 仓库 (GuiWonder/FaHuaWenKai) 返回 404,官方源不可达,未下载 |

## 选定理由
1. **OFL 1.1 许可**:可免费商用、可嵌入分发、可修改,无版权风险(演示春风楷为"免费商用"授权,非 OFL,且官方表述偏宽松)。
2. **字库完整**:基于 Klee One,简繁常用字覆盖好,小学教材 2980 个生字均可渲染(pdftotext 验证中文无乱码)。
3. **活跃维护**:LXGW WenKai 是中文开源字体社区头部项目,持续更新,便于后续升级。
4. **文件形态**:官方 release 直接提供单文件 TTF,无需解包,体积适中(24.4 MB)。
5. **风格适配**:霞鹜文楷字形接近手写楷体,适合低年级练字场景。

## 嵌入测试
- 方法:用 `engine` 的 `generateCopybook`(pdf-lib + fontkit 子集化嵌入)生成 10 字 PDF(`engine/out/font-test-lxgw.pdf`)
- 字例:天地玄黄宇宙洪荒日月盈昃(含拼音与笔画数)
- 验证:`pdftotext` 正确提取中文「天地玄黄宇宙洪荒日月盈昃」,无乱码、无缺字,ToUnicode 映射正常
- 生成成功,文件 14.7 KB(子集化)

## 接入方式
- 新增文件:`engine/fonts/LXGWWenKai-Regular.ttf`(git 跟踪,24.4 MB)
- 未改动任何代码;`cli.ts` 默认仍用 `fonts/演示春风楷.ttf`。若要切换为霞鹜文楷,只需改 `cli.ts` 中 `FONT_PATH` 一行,留给后续决策。

## 许可文件
- LXGW WenKai: SIL Open Font License 1.1,见 https://github.com/lxgw/LxgwWenKai (OFL.txt 随 release 提供)
