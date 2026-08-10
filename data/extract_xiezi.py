#!/usr/bin/env python3
"""写字表解析 v3: 课号行优先, 园地状态遇课号关闭, 支持'识字 8 早书刀尺本'格式"""
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
        if not line:
            continue
        # 页码/注释过滤
        if line in ('118','119','120','共100个字','（共100个字）','100','（','共100个生字）'):
            continue
        m = re.match(r'^语文园地([一二三四五六七八]*)', line)
        if m:
            garden = {'name': CN_NUM.get(m.group(1)) or m.group(1), 'chars': re.findall(r'[\u4e00-\u9fff]', line[m.end():])}
            gardens.append(garden)
            continue
        # 区块标记 + 课号 同行: "识字 8 早 书 刀 尺 本"
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
        l = line[:42].rstrip()
        r = line[42:].rstrip()
        left.append(l); right.append(r)
    return left, right

if __name__ == '__main__':
    pdf = sys.argv[1] if len(sys.argv) > 1 else 'yuwen1s.pdf'
    text = get_layout_text(pdf, 123, 123)
    left, right = split_columns(text)
    ll, lg = parse_col(left)
    rl, rg = parse_col(right)
    lessons = ll + rl
    gardens = lg + rg
    total = sum(len(l['chars']) for l in lessons) + sum(len(g['chars']) for g in gardens)
    print(f'课数: {len(lessons)}, 总字数(含园地): {total}')
    for l in sorted(lessons, key=lambda x: (x['type'] or 'z', x['no'])):
        print(l['no'], l['type'], ''.join(l['chars']))
    for g in gardens:
        print('园地', g['name'], ''.join(g['chars']))
