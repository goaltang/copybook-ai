#!/usr/bin/env python3
"""识字表解析(列切分版): 120-122 页, 左右列独立解析"""
import subprocess, re, json, sys

CN_NUM = {'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10'}

def get_layout_text(pdf_path, first, last):
    r = subprocess.run(['pdftotext', '-layout', '-f', str(first), '-l', str(last),
                        pdf_path, '-'], capture_output=True, text=True)
    return r.stdout

def parse_col(lines):
    lessons, gardens = [], []
    cur_type, garden = None, None
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if line in ('识字', '课文', '汉语拼音', '拼音'):
            cur_type = line
            continue
        m = re.match(r'^语文园地([一二三四五六七八九十]*)', line)
        if m:
            garden = {'name': CN_NUM.get(m.group(1)) or m.group(1), 'chars': re.findall(r'[\u4e00-\u9fff]', line[m.end():])}
            gardens.append(garden)
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

if __name__ == '__main__':
    pdf = sys.argv[1] if len(sys.argv) > 1 else 'yuwen1s.pdf'
    lessons, gardens = [], []
    for p in (120, 121, 122):
        text = get_layout_text(pdf, p, p)
        left, right = split_columns(text)
        ll, lg = parse_col(left)
        rl, rg = parse_col(right)
        lessons.extend(ll); lessons.extend(rl)
        gardens.extend(lg); gardens.extend(rg)
    total = sum(len(l['chars']) for l in lessons) + sum(len(g['chars']) for g in gardens)
    print(f'课数: {len(lessons)}, 总字数(含园地): {total}')
    for l in sorted(lessons, key=lambda x: (x['type'] or '', x['no'])):
        print(l['no'], l['type'], ''.join(l['chars']))
    for g in gardens:
        print('园地', g['name'], ''.join(g['chars']))
