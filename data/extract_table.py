#!/usr/bin/env python3
"""从统编版语文 PDF 附录提取识字表/写字表,按课分组输出 JSON
按坐标还原两列布局,每列流式解析(不聚类行)"""
import pdfplumber, re, json

CN_NUM = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
COL_SPLIT = 240

NOISE = {'写','字','表','识','（','共100个字','共100个生字','100','个','字）','（共100个字）',
         '（共300个生字）','300','生字总数','多音字','不计入','蓝色的字是','汉语拼音','拼音',
         '115','116','117','118','119','120','常用笔画名称表','常用偏旁名称表','（共300个生字）'}

def parse_column(items):
    """items: [(top, x0, text)] 单列词,按视觉顺序排列"""
    lessons, gardens = [], []
    cur_type, cur_lesson, garden = None, None, None
    for top, x0, t in items:
        if re.search(r'[a-zA-Z]', t) or t in NOISE:
            continue
        if t in ('识字','课文'):
            cur_type = t
            continue
        if t in ('语文','园','地','园地'):
            # 园地标记:若当前有未收尾的课,先收尾;开启园地
            garden = {'name': None, 'chars': []}
            gardens.append(garden)
            continue
        if garden is not None and garden['name'] is None and t in CN_NUM:
            garden['name'] = t
            continue
        if t.isdigit():
            n = int(t)
            if 1 <= n <= 30:
                cur_lesson = {'no': n, 'type': cur_type, 'chars': []}
                lessons.append(cur_lesson)
                garden = None
            continue
        if garden is not None:
            garden['chars'].append(t)
        elif cur_lesson is not None:
            cur_lesson['chars'].append(t)
    return lessons, gardens

def extract_table(pdf, page_idx):
    page = pdf.pages[page_idx]
    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
    left, right = [], []
    for w in words:
        item = (w['top'], w['x0'], w['text'].strip())
        (right if w['x0'] >= COL_SPLIT else left).append(item)
    left.sort(key=lambda x: (x[0], x[1]))
    right.sort(key=lambda x: (x[0], x[1]))
    return (parse_column(left), parse_column(right))

def main(path, table_pages):
    pdf = pdfplumber.open(path)
    result = []
    for label, pages in table_pages:
        lessons, gardens = [], []
        for p in pages:
            (ll, lg), (rl, rg) = extract_table(pdf, p)
            lessons.extend(ll); lessons.extend(rl)
            gardens.extend(lg); gardens.extend(rg)
        result.append({'table': label, 'lessons': lessons, 'gardens': gardens})
    return result

if __name__ == '__main__':
    data = main('yuwen1s.pdf', [('识字表', [119, 120, 121]), ('写字表', [122])])
    print(json.dumps(data, ensure_ascii=False, indent=1))
