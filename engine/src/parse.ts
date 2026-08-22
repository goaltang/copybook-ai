export interface ParseResult {
  book?: string;
  /** lesson=教材课号模式; text=任意文本模式; unlearned=未学字提取模式 */
  mode?: 'lesson' | 'text' | 'unlearned';
  /** text/unlearned 模式下的原始文本 */
  text?: string;
  /** unlearned 模式的已学进度册别(如 y二年级上册) */
  learnedBook?: string;
  table: 'xiezi' | 'shizi';
  lessonFilter: { no?: number; title?: string; type?: '课文' | '识字' | '拼音' } | 'ALL';
  title: string;
  grid: 'tian' | 'mi' | 'plain';
  showPinyin: boolean;
  showStrokeCount: boolean;
  showWords?: boolean;    // 带组词
  showStrokes?: boolean;  // 带笔顺
  practiceCells?: number; // 每个例字后的练习格数(前 traceCells 个描摹, 其余空白), 默认 5
  traceCells?: number;    // 练习格中印浅灰字供描摹的个数, 默认 0
  error?: string;
}

export interface ParseOptions {
  /** 会话上下文: 用户最近使用的册别(如 y二年级上册)。用于补全"第8课/全册"等缺册别输入 */
  defaultBook?: string | undefined;
}

/** 12 册教材数据包名(一上 ~ 六下) */
export const BOOKS = [
  'y一年级上册', 'y一年级下册', 'y二年级上册', 'y二年级下册',
  'y三年级上册', 'y三年级下册', 'y四年级上册', 'y四年级下册',
  'y五年级上册', 'y五年级下册', 'y六年级上册', 'y六年级下册',
] as const;

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

function bookLabel(book: string): string {
  const m = book.match(/^y(.)年级(.)册$/);
  return m ? `${m[1]}年级${m[2]}册` : book;
}

function parseCnNum(s: string): number | undefined {
  if (CN_NUM[s] !== undefined) return CN_NUM[s];
  return undefined;
}

const gradeNames: Record<number, string> = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
const GRADE_TO_NUM: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };

/** 样式/口语词(标题与文本提取前剔除, 避免混入要练的字) */
const STYLE_STRIP_RE =
  /米字格|田字格|无格|方格|不要拼音|无拼音|不带拼音|带拼音|要拼音|不要笔画数|不要笔画|不带笔画|带笔画数|带笔画|要笔画|不要描红|带描红|要描红|描红|不要练习格|不要练习|无练习格|只要例字|不要空格|每\s*个?\s*字\s*写?\s*[0-9一二三四五六七八九十]*\s*(?:个|遍|次|行)?|带组词|要组词|组词|带笔顺|要笔顺|笔顺|练字帖|帮我|请生成|生成|打印|制作|一份|一个|字帖/g;

/** 统一的样式开关解析: 网格/拼音/笔画数/组词/笔顺/练习格/描红 */
function applySwitches(r: ParseResult, raw: string): void {
  if (/米字格/.test(raw)) r.grid = 'mi';
  else if (/田字格/.test(raw)) r.grid = 'tian';
  else if (/无格|方格/.test(raw)) r.grid = 'plain';

  if (/不要拼音|无拼音|不带拼音/.test(raw)) r.showPinyin = false;
  else if (/带拼音|要拼音/.test(raw)) r.showPinyin = true;

  if (/不要笔画|不带笔画|不要笔画数/.test(raw)) r.showStrokeCount = false;
  else if (/带笔画|要笔画|带笔画数/.test(raw)) r.showStrokeCount = true;

  if (/带组词|要组词|组词/.test(raw)) r.showWords = true;
  if (/带笔顺|要笔顺|笔顺/.test(raw)) r.showStrokes = true;

  // 练习格数量: "每字写8个" / "每字5遍"
  const perChar = raw.match(/每\s*个?\s*字\s*写?\s*([0-9一二三四五六七八九十]+)\s*(?:个|遍|次|行)?/);
  if (perChar) {
    const n = parseCnNum(perChar[1]!);
    if (n !== undefined) r.practiceCells = Math.max(0, Math.min(30, n));
  }
  // 描红: 练习格前几个印浅灰字供描写
  if (/不要描红|无描红/.test(raw)) r.traceCells = 0;
  else if (/带描红|要描红|描红/.test(raw)) r.traceCells = Math.min(2, r.practiceCells ?? 5);
  // 只要例字: 关闭全部练习格
  if (/不要练习格|不要练习|无练习格|只要例字|不要空格/.test(raw)) {
    r.practiceCells = 0;
    r.traceCells = 0;
  }
}

export function parse(input: string, opts: ParseOptions = {}): ParseResult {
  const raw = input.trim();
  if (!raw) return { error: '无法识别的指令: (空)', table: 'xiezi', lessonFilter: { no: 1 }, title: '', grid: 'tian', showPinyin: true, showStrokeCount: true };

  const result: ParseResult = {
    mode: 'lesson',
    table: 'xiezi',
    lessonFilter: {},
    title: '',
    grid: 'tian',
    showPinyin: true,
    showStrokeCount: true,
    showWords: false,
    showStrokes: false,
    practiceCells: 5,
    traceCells: 0,
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
    // 任意文本模式: 无册别/课号, 不含课式关键词(第X课/默写/全册等), 但包含汉字
    const lessonHint = /(第\s*[0-9一二三四五六七八九十]+\s*课|课\s*[0-9一二三四五六七八九十]+|课文|识字表|写字表|园地|单元|全册|全部|默写)/.test(raw);
    if (!lessonHint && /[\u4e00-\u9fff]/.test(raw)) {
      // 文本中带年级(如 "春眠不觉晓 二年级") → 未学字提取模式
      const gradeTerm = raw.match(/([一二三四五六1-6])\s*年级\s*([上下])?\s*(?:册)?/);
      let learnedBook: string | undefined;
      let textForChars = raw;
      if (gradeTerm) {
        const g = parseCnNum(gradeTerm[1]!);
        const t = gradeTerm[2] ?? '上';
        if (g !== undefined) {
          learnedBook = `y${gradeNames[g]}年级${t}册`;
          textForChars = raw.replace(gradeTerm[0], ' '); // 剔除年级短语, 避免"级"字混入
        }
      }
      const textMode: ParseResult = {
        ...result,
        mode: learnedBook ? 'unlearned' : 'text',
        text: textForChars,
        lessonFilter: 'ALL',
      };
      if (learnedBook) textMode.learnedBook = learnedBook;
      applySwitches(textMode, raw);
      const titleText = raw
        .replace(STYLE_STRIP_RE, '')
        .replace(/\s+/g, '')
        .slice(0, 12);
      textMode.title = learnedBook
        ? `${bookLabel(learnedBook)}未学字 练字帖`
        : titleText
          ? `${titleText} 练字帖`
          : '练字帖';
      return textMode;
    }
    // 会话上下文补全: 有课式关键词但缺册别时, 用最近使用的册别继续解析
    const db = opts.defaultBook;
    const dbMatch = db?.match(/^y([一二三四五六])年级([上下])册$/);
    const dbGrade = dbMatch ? GRADE_TO_NUM[dbMatch[1]!] : undefined;
    if (lessonHint && db && dbMatch && dbGrade !== undefined) {
      grade = dbGrade;
      term = dbMatch[2] as '上' | '下';
      result.book = db;
      // remaining 保持不变, 继续走课号/全册解析
    } else {
      return { ...result, error: `无法识别的指令: ${raw}` };
    }
  }

  result.book = `y${gradeNames[grade]}年级${term}册`;

  // 已识别年级+册, 但内容不含课式指令且含汉字 → 未学字模式(如 "二年级下册 春眠不觉晓")
  const styleRemoved = remaining
    .replace(STYLE_STRIP_RE, '')
    .replace(/\s+/g, '');
  if (
    !/课|课文|识字表|写字表|园地|单元|全册|全部|默写|识字/.test(remaining) &&
    /[\u4e00-\u9fff]/.test(styleRemoved) &&
    styleRemoved.length >= 2
  ) {
    const unlearned: ParseResult = { ...result, mode: 'unlearned', text: styleRemoved, lessonFilter: 'ALL' };
    unlearned.learnedBook = result.book;
    applySwitches(unlearned, raw);
    unlearned.title = `${bookLabel(result.book)}未学字 练字帖`;
    return unlearned;
  }

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
    if (lessonNo === undefined) {
      return { ...result, error: `无法识别的课号: ${numStr}` };
    }
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

  applySwitches(result, raw);

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
