#!/usr/bin/env python3
"""批量提取 12 册识字表/写字表 v2: 行内 token 流式(单双列通吃)"""
import subprocess, re, json, os, sys

CN_NUM = {'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10'}

def norm(s):
    # 特殊空格统一为普通空格
    return re.sub(r'[\u2000-\u200a\u202f\u205f\u3000\xa0]', ' ', s)

def pdf_text(pdf_path):
    r = subprocess.run(['pdftotext', '-layout', pdf_path, '-'], capture_output=True, text=True)
    return norm(r.stdout)

def find_appendix(pages_text):
    shizi_pages, xiezi_pages = [], []
    for i, p in enumerate(pages_text):
        head = p[:300]
        if re.search(r'识\s*字\s*表', head):
            shizi_pages.append(i)
        if re.search(r'写\s*字\s*表', head):
            xiezi_pages.append(i)
    if not xiezi_pages:
        return None, None
    x_start = xiezi_pages[-1]
    s_start = shizi_pages[-1] if shizi_pages and shizi_pages[-1] < x_start else None
    return s_start, x_start

def parse_tokens(tokens):
    """token 流: 数字=新课号, 汉字=入当前课/园地, 标记=区块类型"""
    lessons, gardens = [], []
    cur_type, garden = None, None
    for t in tokens:
        if not t:
            continue
        if t in ('识字', '课文', '汉语拼音', '拼音'):
            cur_type = t
            continue
        m = re.match(r'^语文园地([一二三四五六七八九十]*)$', t)
        if m:
            garden = {'name': CN_NUM.get(m.group(1)) or m.group(1), 'chars': []}
            gardens.append(garden)
            continue
        if re.fullmatch(r'[一二三四五六七八九十]', t) and garden is not None and garden['name'] is None:
            garden['name'] = CN_NUM[t]
            continue
        if t.isdigit():
            no = int(t)
            if 1 <= no <= 40:
                lessons.append({'no': no, 'type': cur_type, 'chars': []})
                garden = None
            continue
        if re.fullmatch(r'[\u4e00-\u9fff]', t):
            if garden is not None:
                garden['chars'].append(t)
            elif lessons:
                lessons[-1]['chars'].append(t)
    return lessons, gardens

def page_tokens(line):
    """行 → token 列表: 整体标记词/数字/中文数字/单字, 保持行内顺序"""
    pattern = re.compile(
        r'语文园地[一二三四五六七八九十]?|课文|识字|汉语拼音|拼音|'
        r'\d{1,3}|[一二三四五六七八九十]|[\u4e00-\u9fff]')
    return [m.group(0) for m in pattern.finditer(line)]

def parse_pages(pages_text, start, end, stop_titles):
    """解析 [start, end) 页, 遇到 stop_titles 标题页停止; 返回 lessons, gardens"""
    lessons, gardens = [], []
    for i in range(start, end):
        if i >= len(pages_text):
            break
        p = pages_text[i]
        head = p[:300]
        # 遇到其他附录标题页停止
        if any(re.search(t, head) for t in stop_titles):
            break
        for line in p.split('\n'):
            line = line.strip()
            if not line:
                continue
            if re.search(r'[a-zA-Z]', line):
                continue  # 拼音行
            if re.fullmatch(r'\d{2,3}', line):
                continue  # 页码
            if re.search(r'共\s*\d+\s*个?生?字?', line):
                continue
            if re.search(r'多音字|不计入|蓝色的字|常用笔画名称表|常用偏旁名称表', line):
                continue
            toks = page_tokens(line)
            if toks:
                l2, g2 = parse_tokens(toks)
                lessons.extend(l2); gardens.extend(g2)
    return lessons, gardens

def extract_book(pdf_path):
    full = pdf_text(pdf_path)
    pages_text = full.split('\f')
    s_start, x_start = find_appendix(pages_text)
    if x_start is None:
        return None
    result = {}
    stop = [r'常用笔画名称表', r'常用偏旁名称表', r'后\s*记', r'词\s*语\s*表']
    if s_start is not None:
        # 识字表: 标题页起, 到写字表标题页前
        ls, gs = parse_pages(pages_text, s_start, x_start, stop + [r'写\s*字\s*表'])
        result['shizi'] = {'pages': [s_start, x_start - 1], 'lessons': ls, 'gardens': gs}
    # 写字表: 标题页起, 到识字表标题/笔画表/书末
    stop2 = stop + ([r'识\s*字\s*表'] if s_start is not None else [])
    lx, gx = parse_pages(pages_text, x_start, len(pages_text), stop2)
    result['xiezi'] = {'pages': [x_start, x_start + 5], 'lessons': lx, 'gardens': gx}
    return result

if __name__ == '__main__':
    pdfs_dir = sys.argv[1] if len(sys.argv) > 1 else 'pdfs'
    result = {}
    for fn in sorted(os.listdir(pdfs_dir)):
        if not fn.endswith('.pdf'):
            continue
        path = os.path.join(pdfs_dir, fn)
        data = extract_book(path)
        key = fn.replace('.pdf', '')
        if data is None:
            print(f'{key}: !! 定位失败', file=sys.stderr)
            continue
        result[key] = data
        line = f'{key}: '
        for tbl in ('shizi', 'xiezi'):
            if tbl in data:
                t = data[tbl]
                total = sum(len(l['chars']) for l in t['lessons']) + sum(len(g['chars']) for g in t['gardens'])
                line += f'{tbl}={len(t["lessons"])}课/{total}字 '
        print(line, file=sys.stderr)
    json.dump(result, open('all_books.mid.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('saved all_books.mid.json')
