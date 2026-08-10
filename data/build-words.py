# -*- coding: utf-8 -*-
"""
组词数据构建脚本 (P1)
- 输入: CC-CEDICT (带声调 UTF-8, gzip) + data/final/ 生字表
- 词频: wordfreq 3.1.1 (zh, Zipf 值)
- 输出: data/final/words.json
用法: python3 data/build-words.py <cedict_ts.u8.gz>
"""
import gzip
import json
import re
import sys
from collections import Counter

try:
    from wordfreq import zipf_frequency
except ImportError:
    print("需要 wordfreq: pip install wordfreq jieba")
    sys.exit(1)

VOWELS = {'a': 'āáǎà', 'e': 'ēéěè', 'i': 'īíǐì', 'o': 'ōóǒò', 'u': 'ūúǔù', 'ü': 'ǖǘǚǜ'}

def to_tone(syl: str) -> str:
    """CC-CEDICT 数字声调 → 声调符号, 如 tian1 → tiān"""
    syl = syl.replace('u:', 'ü').replace('v', 'ü')
    m = re.match(r'^(.*?)([1-5])?$', syl)
    body, tone = m.group(1), m.group(2)
    if not tone or tone == '5':
        return body
    t = int(tone)
    for v in ['a', 'e', 'o']:
        if v in body:
            return body.replace(v, VOWELS[v][t - 1], 1)
    idxs = [i for i, ch in enumerate(body) if ch in 'iuü']
    if idxs:
        i = idxs[-1]
        return body[:i] + VOWELS[body[i]][t - 1] + body[i + 1:]
    return body

def pinyin_with_tones(py: str) -> str:
    return ' '.join(to_tone(p) for p in py.strip().split())

def main():
    if len(sys.argv) < 2:
        print("用法: python3 data/build-words.py <cedict_ts.u8.gz>")
        sys.exit(1)
    gz_path = sys.argv[1]
    with gzip.open(gz_path, 'rb') as f:
        content = f.read().decode('utf-8')

    pat = re.compile(r'^(\S+?) (\S+?) \[([^\]]+)\] /(.*)/$')
    entries = []
    for line in content.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        m = pat.match(line)
        if m:
            entries.append(m.groups())

    cjk24 = re.compile(r'^[\u4e00-\u9fff]{2,4}$')
    simp_entries = {}
    single_pinyin = {}
    for trad, simp, pinyin, defs in entries:
        if cjk24.match(simp):
            simp_entries.setdefault(simp, {'simplified': simp, 'pinyin': pinyin, 'defs': defs})
        elif len(simp) == 1 and re.match(r'^[\u4e00-\u9fff]$', simp):
            single_pinyin.setdefault(simp, pinyin_with_tones(pinyin))

    # 词频打分
    prefix = {}
    for w in simp_entries:
        zf = zipf_frequency(w, 'zh')
        prefix.setdefault(w[0], []).append((w, zf))
    print(f"CC-CEDICT 2-4字简体词条: {len(simp_entries)}, 首字覆盖: {len(prefix)}")

    # 收集生字表全部唯一字
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

    # 组词: 词频优先, 专有名词降权, 2字词优先
    words_map = {}
    n_multi = 0
    for ch in chars:
        cands = prefix.get(ch, [])
        cands.sort(key=lambda c: (-c[1], 1 if simp_entries[c[0]]['pinyin'][:1].isupper() else 0, len(c[0])))
        picked = cands[:5]
        lst = []
        for w, zf in picked:
            e = simp_entries[w]
            lst.append({'word': w, 'pinyin': pinyin_with_tones(e['pinyin']), 'zipf': round(zf, 2)})
        if ch in single_pinyin and not any(x['word'] == ch for x in lst):
            lst.append({'word': ch, 'pinyin': single_pinyin[ch], 'zipf': None})
        words_map[ch] = lst
        if any(len(e['word']) > 1 for e in lst):
            n_multi += 1

    out = {
        "version": "1.0",
        "source": "CC-CEDICT (CC BY-SA 4.0), https://www.mdbg.net/chinese/dictionary?page=cc-cedict",
        "frequency": "wordfreq 3.1.1 (zh, Zipf 值, 仅排序用)",
        "note": "每个字取其开头的最多5个常用词(词频降序), 末尾附单字词兜底; 无词的不会出现(全部覆盖)",
        "stats": {"unique_chars": len(chars), "chars_with_multi_words": n_multi,
                  "coverage": round(n_multi / len(chars) * 100, 2)},
        "words": words_map,
    }
    with open('data/final/words.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"已写出 data/final/words.json: {len(words_map)} 字, 多字组词覆盖 {out['stats']['coverage']}%")

if __name__ == '__main__':
    main()
