export interface ParseResult {
  book?: string;
  table: 'xiezi' | 'shizi';
  lessonFilter: { no?: number; title?: string; type?: '课文' | '识字' | '拼音' } | 'ALL';
  title: string;
  grid: 'tian' | 'mi' | 'plain';
  showPinyin: boolean;
  showStrokeCount: boolean;
  error?: string;
}

const CN_NUM: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  '11': 11, '12': 12, '13': 13, '14': 14, '15': 15,
  '16': 16, '17': 17, '18': 18, '19': 19, '20': 20,
};

const TERM_MAP: Record<string, '上' | '下'> = {
  '上': '上', '下': '下',
};

function parseCnNum(s: string): number | undefined {
  if (CN_NUM[s] !== undefined) return CN_NUM[s];
  return undefined;
}

export function parse(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) return { error: '无法识别的指令: (空)', table: 'xiezi', lessonFilter: { no: 1 }, title: '', grid: 'tian', showPinyin: true, showStrokeCount: true };

  const result: ParseResult = {
    table: 'xiezi',
    lessonFilter: {},
    title: '',
    grid: 'tian',
    showPinyin: true,
    showStrokeCount: true,
  };

  let remaining = raw;

  remaining = remaining.replace(/\s+/g, ' ');

  const isAll = /全册|全部|所有课/.test(remaining);

  const gradeTermMatch = remaining.match(
    /([一二三四五六1-6])\s*(?:年级)?\s*([上下])\s*(?:册)?/
  );
  const shortGradeTermMatch = remaining.match(
    /^([一二三四五六1-6])([上下])/
  );

  let grade: number | undefined;
  let term: '上' | '下' | undefined;

  if (gradeTermMatch) {
    grade = parseCnNum(gradeTermMatch[1]!);
    term = TERM_MAP[gradeTermMatch[2]!];
    remaining = remaining.replace(gradeTermMatch[0], ' ').trim();
  } else if (shortGradeTermMatch) {
    grade = parseCnNum(shortGradeTermMatch[1]!);
    term = TERM_MAP[shortGradeTermMatch[2]!];
    remaining = remaining.replace(shortGradeTermMatch[0], ' ').trim();
  }

  if (grade === undefined || term === undefined) {
    return { ...result, error: `无法识别的指令: ${raw}` };
  }

  const gradeNames: Record<number, string> = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
  result.book = `y${gradeNames[grade]}年级${term}册`;

  const tableMatch = remaining.match(/(识字表|写字表|识字|写字)/);
  if (tableMatch) {
    const t = tableMatch[1]!;
    if (t === '识字表' || t === '识字') {
      if (!remaining.match(/^(识字)\s*\d/)) {
        result.table = 'shizi';
        remaining = remaining.replace(tableMatch[0], ' ').trim();
      }
    } else if (t === '写字表' || t === '写字') {
      result.table = 'xiezi';
      remaining = remaining.replace(tableMatch[0], ' ').trim();
    }
  }

  if (grade >= 6) {
    result.table = 'xiezi';
  }

  const typePrefixMatch = remaining.match(/^(课文|识字|拼音)\s*/);
  let parsedType: '课文' | '识字' | '拼音' | undefined;
  if (typePrefixMatch) {
    parsedType = typePrefixMatch[1] as '课文' | '识字' | '拼音';
    remaining = remaining.slice(typePrefixMatch[0].length).trim();
  }

  const lessonNoMatch = remaining.match(
    /(?:第\s*([一二三四五六七八九十\d]+)\s*课|课\s*([一二三四五六七八九十\d]+)|([一二三四五六七八九十\d]+)\s*课)/
  );

  let lessonNo: number | undefined;
  if (lessonNoMatch) {
    const numStr = lessonNoMatch[1] || lessonNoMatch[2] || lessonNoMatch[3];
    lessonNo = parseCnNum(numStr!);
    remaining = remaining.replace(lessonNoMatch[0], ' ').trim();
  } else if (parsedType) {
    const bareNumMatch = remaining.match(/^([一二三四五六七八九十\d]+)\s*/);
    if (bareNumMatch) {
      lessonNo = parseCnNum(bareNumMatch[1]!);
      if (lessonNo !== undefined) {
        remaining = remaining.replace(bareNumMatch[0], ' ').trim();
      }
    }
  }

  if (isAll || (grade !== undefined && !lessonNoMatch && !typePrefixMatch)) {
    if (isAll || /全部|全册|所有/.test(raw)) {
      result.lessonFilter = 'ALL';
    }
  }

  if (lessonNo !== undefined) {
    const lf: { no?: number; title?: string; type?: '课文' | '识字' | '拼音' } = { no: lessonNo };
    if (parsedType) {
      lf.type = parsedType;
    }
    result.lessonFilter = lf;
  } else if (result.lessonFilter !== 'ALL') {
    const titleCandidate = remaining.replace(/\s+/g, '').trim();
    if (titleCandidate && !/^(米字格|田字格|无格|方格|拼音|不要拼音|无拼音|笔画|不要笔画|带拼音|不带拼音|带笔画|不带笔画|不要笔画数|带笔画数)$/.test(titleCandidate)) {
      const lf: { no?: number; title?: string; type?: '课文' | '识字' | '拼音' } = {};
      if (parsedType) lf.type = parsedType;
      lf.title = titleCandidate;
      result.lessonFilter = lf;
    } else if (parsedType) {
      result.lessonFilter = { type: parsedType };
    } else {
      result.lessonFilter = 'ALL';
    }
  }

  if (/米字格/.test(raw)) result.grid = 'mi';
  else if (/田字格/.test(raw)) result.grid = 'tian';
  else if (/无格|方格/.test(raw)) result.grid = 'plain';

  if (/不要拼音|无拼音|不带拼音/.test(raw)) result.showPinyin = false;
  else if (/带拼音|要拼音/.test(raw)) result.showPinyin = true;

  if (/不要笔画|不带笔画|不要笔画数/.test(raw)) result.showStrokeCount = false;
  else if (/带笔画|要笔画|带笔画数/.test(raw)) result.showStrokeCount = true;

  const bookTitle = `${gradeNames[grade]}年级${term}册`;
  if (result.lessonFilter === 'ALL') {
    result.title = `${bookTitle} 全部 ${result.table === 'xiezi' ? '会写字' : '会认字'}`;
  } else if (typeof result.lessonFilter === 'object' && result.lessonFilter.no !== undefined) {
    const typeStr = result.lessonFilter.type ? `${result.lessonFilter.type} ` : '';
    result.title = `${bookTitle} ${typeStr}第${result.lessonFilter.no}课`;
  } else if (typeof result.lessonFilter === 'object' && result.lessonFilter.title) {
    result.title = `${bookTitle} ${result.lessonFilter.title}`;
  } else {
    result.title = bookTitle;
  }

  return result;
}
