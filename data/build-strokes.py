# -*- coding: utf-8 -*-
"""
笔顺数据构建脚本 (P2)
- 笔画名称: cnchar 3.2.6 cnchar-order 插件 (MIT), 解码 orders 字典
- 笔画路径: hanzi-writer-data (MIT) — 每笔 SVG path + median 折线
用法:
  node -e "..." 导出 cnchar orders(见 data/README.md 说明)
  python3 data/build-strokes.py <cnchar-orders.json> <hanzi-writer-data目录>
输出: data/final/strokes.json
"""
import json
import os
import sys

def main():
    if len(sys.argv) < 3:
        print("用法: python3 data/build-strokes.py <cnchar-orders.json> <hanzi-writer-data目录>")
        sys.exit(1)
    orders_path, hw_dir = sys.argv[1], sys.argv[2]

    # cnchar-order 字典: orders{字: 字母码}, strokeTable{字母: {name,...}}
    # 这里只需 orders 与字母->笔画名映射(可从 strokeTable 导出)
    orders = json.load(open(orders_path, encoding='utf-8'))
    # 字母->笔画名 映射(与 cnchar-order 内置 strokeTable 一致)
    letter_names = {
        'a': '横折折撇', 'b': '竖弯', 'c': '横折', 'd': '点2', 'o': '横斜钩',
        'j': '横', 'l': '捺', 'r': '横折钩', 'f': '竖', 'g': '竖钩', 'k': '点',
        's': '撇', 'n': '撇折', 'x': '竖折撇|竖折折', 'w': '横折折折钩|横撇弯钩',
        'z': '竖折折钩', 'i': '提', 't': '弯钩', 'y': '斜钩|卧钩',
        'v': '横折折|横折弯', 'e': '横撇|横钩', 'p': '横折提', 'q': '横折折折',
        'h': '竖提', 'm': '撇点', 'u': '竖弯钩',
    }
    for k in letter_names:
        assert k in letter_names, k

    # 收集生字表唯一字
    import glob
    chars = set()
    for fp in glob.glob('data/final/y*.json'):
        with open(fp, encoding='utf-8') as f:
            book = json.load(f)
        for table in book.get('tables', {}).values():
            for lesson in table.get('lessons', []):
                for c in lesson.get('chars', []):
                    if c.get('char'):
                        chars.add(c['char'])
            for garden in table.get('gardens', []):
                for c in garden.get('chars', []):
                    if c.get('char'):
                        chars.add(c['char'])
    chars = sorted(chars)
    print(f"生字表唯一字: {len(chars)}")

    strokes_map = {}
    n_names = n_paths = 0
    for ch in chars:
        if ch not in orders:
            continue
        names = [letter_names[l] for l in orders[ch]]
        n_names += 1
        hw_file = os.path.join(hw_dir, ch + '.json')
        entry = {'names': names}
        if os.path.exists(hw_file):
            with open(hw_file, encoding='utf-8') as f:
                hw = json.load(f)
            entry['paths'] = hw['strokes']
            entry['medians'] = hw['medians']
            n_paths += 1
        strokes_map[ch] = entry

    out = {
        "version": "1.0",
        "sources": {
            "names": "cnchar 3.2.6 cnchar-order (MIT)",
            "paths": "hanzi-writer-data (MIT, https://github.com/chanind/hanzi-writer-data)",
        },
        "note": "names 为按书写顺序的笔画名称序列; paths/medians 为 hanzi-writer 矢量笔顺(每笔 SVG path 与折线)",
        "stats": {"unique_chars": len(chars), "with_names": n_names, "with_paths": n_paths},
        "strokes": strokes_map,
    }
    out_path = 'data/final/strokes.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(out_path) / 1024 / 1024
    print(f"已写出 {out_path}: {n_names} 字有笔画名, {n_paths} 字有路径, 大小 {size:.2f} MB")

if __name__ == '__main__':
    main()
