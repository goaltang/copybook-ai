#!/usr/bin/env python3
"""生成一年级上册写字表最终 JSON + cnchar 补全汉字属性"""
import subprocess, re, json, sys

CN_NUM = {'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8'}

def get_layout_text(pdf_path, first, last):
    r = subprocess.run(['pdftotext', '-layout', '-f', str(first), '-l', str(last),
                        pdf_path, '-'], capture_output=True, text=True)
    return r.stdout

def parse_col(lines):
    lessons, gardens = [], []
    cur_type, garden = None, None
    for raw in lines:
        line = raw.strip()
        if not line or line in ('118','119','120','共100个字','（共100个字）','100','（','共100个生字）'):
            continue
        m = re.match(r'^语文园地([一二三四五六七八]*)', line)
        if m:
            garden = {'name': CN_NUM.get(m.group(1)) or m.group(1), 'chars': re.findall(r'[\u4e00-\u9fff]', line[m.end():])}
            gardens.append(garden)
            continue
        m = re.match(r'^(识字|课文)\s+(\d{1,2})\s+(.+)$', line)
        if m:
            cur_type = m.group(1)
            no = int(m.group(2))
            chars = re.findall(r'[\u4e00-\u9fff]', m.group(3))
            if chars:
                lessons.append({'no': no, 'type': cur_type, 'chars': chars})
                garden = None
            continue
        if line in ('识字', '课文'):
            cur_type = line
            continue
        m = re.match(r'^(\d{1,2})\s+(.+)$', line)
        if m and not re.search(r'[a-zA-Z]', line):
            no = int(m.group(1))
            chars = re.findall(r'[\u4e00-\u9fff]', m.group(2))
            if chars:
                lessons.append({'no': no, 'type': cur_type, 'chars': chars})
                garden = None
            continue
        chars = re.findall(r'[\u4e00-\u9fff]', line)
        if chars and not re.search(r'[a-zA-Z]|\d', line):
            if garden is not None:
                garden['chars'].extend(chars)
            elif lessons:
                lessons[-1]['chars'].extend(chars)
    return lessons, gardens

def split_columns(text):
    left, right = [], []
    for line in text.split('\n'):
        left.append(line[:42].rstrip())
        right.append(line[42:].rstrip())
    return left, right

def main():
    pdf = 'yuwen1s.pdf'
    text = get_layout_text(pdf, 123, 123)
    left, right = split_columns(text)
    ll, lg = parse_col(left)
    rl, rg = parse_col(right)
    lessons = ll + rl
    gardens = lg + rg

    # ---- 人工修正(基于核对) ----
    type_map = {8: '识字', 9: '识字', 10: '识字'}
    for l in lessons:
        if l['no'] in type_map:
            l['type'] = type_map[l['no']]
    # 课14 末尾的"工"归园地八(工厂)
    for l in lessons:
        if l['no'] == 14 and l['chars'] and l['chars'][-1] == '工':
            l['chars'].pop()
    for g in gardens:
        if g['name'] == '8' and '工' not in g['chars']:
            g['chars'].insert(0, '工')

    # ---- cnchar 补全 ----
    sys.path.insert(0, '/tmp/cnchar-test/node_modules')
    cnchar = __import__('cnchar')
    cnchar.use(__import__('cnchar-radical'))
    cnchar.use(__import__('cnchar-order'))

    def enrich(char):
        info = cnchar.stroke(char, 'count')
        radical = cnchar.radical(char)
        return {
            'char': char,
            'pinyin': cnchar.spell(char, 'tone'),
            'strokes': info,
            'radical': radical[0]['radical'] if radical else None,
            'structure': radical[0]['struct'] if radical else None,
        }

    out = {
        'version': '统编版(部编版)2022印次',
        'grade': 1, 'term': '上',
        'table': '写字表',
        'total': 100,
        'lessons': [
            {'no': l['no'], 'type': l['type'], 'chars': [enrich(c) for c in l['chars']]}
            for l in sorted(lessons, key=lambda x: x['no'])
        ],
        'gardens': [
            {'name': g['name'], 'chars': [enrich(c) for c in g['chars']]}
            for g in gardens if g['name']
        ],
    }
    json.dump(out, open('y1s_xiezi.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('saved y1s_xiezi.json')
    # 打印第一课样例
    first = out['lessons'][0]
    print(json.dumps(first, ensure_ascii=False, indent=1))

if __name__ == '__main__':
    main()
