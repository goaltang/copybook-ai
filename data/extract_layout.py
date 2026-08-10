#!/usr/bin/env python3
"""从统编版语文 PDF 附录提取识字表/写字表(pdftotext -layout 模式)
输出: lessons[{no,type,chars}], gardens[{name,chars}]"""
import subprocess, re, json, sys

CN_NUM = {'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10'}

def get_layout_text(pdf_path, first, last):
    r = subprocess.run(['pdftotext', '-layout', '-f', str(first), '-l', str(last),
                        pdf_path, '-'], capture_output=True, text=True)
    return r.stdout

def parse_table(text):
    lessons, gardens = [], []
    cur_type, garden, pending_garden = None, None, None
    for line in text.split('\n'):
        line = line.rstrip()
        if not line.strip():
            continue
        # 标题/区块标记
        m = re.match(r'^\s*(识字|课文|汉语拼音)\s*$', line)
        if m:
            cur_type = m.group(1)
            continue
        m = re.match(r'^\s*语文园地([一二三四五六七八九十]*)', line)
        if m:
            pending_garden = m.group(1) or None
            continue
        # 课号行: 数字开头 + 汉字
        m = re.match(r'^\s*(\d{1,2})\s+(.+)$', line)
        if m and not re.search(r'[a-zA-Z（）(]', line):
            no = int(m.group(1))
            chars = re.findall(r'[\u4e00-\u9fff]', m.group(2))
            if chars:
                if pending_garden is not None:
                    # 园地标记后的课号行: 先处理园地(园地字可能跟在标记后的独立行)
                    pass
                lessons.append({'no': no, 'type': cur_type, 'chars': chars})
                garden = None
                continue
        # 园地字行(标记后的一行或多行汉字)
        if pending_garden is not None or garden is not None:
            chars = re.findall(r'[\u4e00-\u9fff]', line)
            if chars and not re.search(r'[\d]', line.split(chars[0])[0] if chars else ''):
                if garden is None:
                    garden = {'name': CN_NUM.get(pending_garden) or pending_garden, 'chars': []}
                    gardens.append(garden)
                garden['chars'].extend(chars)
                continue
        # 无标记汉字行(如续行)
        chars = re.findall(r'[\u4e00-\u9fff]', line)
        if chars and not re.search(r'[a-zA-Z]|\d', line) and garden is not None:
            garden['chars'].extend(chars)
    return lessons, gardens

if __name__ == '__main__':
    pdf = sys.argv[1] if len(sys.argv) > 1 else 'yuwen1s.pdf'
    # 附录页码映射(一年级上册: 识字表115-117 → PDF页120-122; 写字表118 → 123)
    ranges = [('识字表', 120, 122), ('写字表', 123, 123)]
    result = []
    for label, f, l in ranges:
        text = get_layout_text(pdf, f, l)
        lessons, gardens = parse_table(text)
        result.append({'table': label, 'lessons': lessons, 'gardens': gardens})
    print(json.dumps(result, ensure_ascii=False, indent=1))
