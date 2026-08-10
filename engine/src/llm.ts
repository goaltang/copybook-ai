import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import type { ParseResult } from './parse.js';

const API_BASE = 'https://opencode.ai/zen/go/v1';
const MODEL = 'deepseek-v4-flash';
const PROXY_URL = 'http://127.0.0.1:7897';
const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 2;

(globalThis as any).AI_SDK_LOG_WARNINGS = false;

const BOOKS = [
  'y一年级上册',
  'y一年级下册',
  'y二年级上册',
  'y二年级下册',
  'y三年级上册',
  'y三年级下册',
  'y四年级上册',
  'y四年级下册',
  'y五年级上册',
  'y五年级下册',
  'y六年级上册',
  'y六年级下册',
] as const;

const BOOK_NAMES = BOOKS.join('\n');

interface LlmJson {
  book?: string;
  table?: string;
  no?: unknown;
  type?: string | null;
  all?: unknown;
  grid?: string;
  showPinyin?: unknown;
  showStrokeCount?: unknown;
  title?: string | null;
  error?: string | null;
}

function normNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function normBool(v: unknown, dflt: boolean): boolean {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  if (v === null || v === undefined) return dflt;
  return dflt;
}

function normEnum<T extends string>(v: unknown, list: readonly T[], dflt: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : dflt;
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function normalize(data: Record<string, unknown>): LlmJson {
  return {
    book: typeof data.book === 'string' ? data.book : undefined,
    table: normEnum(data.table, ['xiezi', 'shizi'] as const, 'xiezi'),
    no: normNum(data.no),
    type:
      data.type === '课文' || data.type === '识字' || data.type === '拼音'
        ? (data.type as '课文' | '识字' | '拼音')
        : null,
    all: normBool(data.all, false),
    grid: normEnum(data.grid, ['tian', 'mi', 'plain'] as const, 'tian'),
    showPinyin: normBool(data.showPinyin, true),
    showStrokeCount: normBool(data.showStrokeCount, true),
    title: typeof data.title === 'string' && data.title ? data.title : null,
    error: typeof data.error === 'string' && data.error ? data.error : null,
  };
}

function toParseResult(j: LlmJson): ParseResult | null {
  if (j.error) {
    console.log(`LLM: 模型报告无法理解: ${j.error}`);
    return null;
  }
  if (!j.book || !BOOKS.includes(j.book as any)) {
    console.log(`LLM: book 校验失败: ${j.book}`);
    return null;
  }
  if (j.no !== null && (!Number.isInteger(j.no) || j.no < 1 || j.no > 40)) {
    console.log(`LLM: 课号校验失败: ${j.no}`);
    return null;
  }
  const lf: { no?: number; type?: '课文' | '识字' | '拼音' } = {};
  if (j.no !== null) lf.no = j.no;
  if (j.type !== null) lf.type = j.type;
  const result: ParseResult = {
    book: j.book,
    table: j.table as 'xiezi' | 'shizi',
    lessonFilter: j.all || j.no === null ? 'ALL' : lf,
    title: j.title ?? `${j.book}${j.no ? ` 第${j.no}课` : ''}`,
    grid: j.grid as 'tian' | 'mi' | 'plain',
    showPinyin: j.showPinyin ?? true,
    showStrokeCount: j.showStrokeCount ?? true,
  };
  return result;
}

export async function llmParse(input: string): Promise<ParseResult | null> {
  const apiKey = process.env.OPENCODE_GO_API_KEY;
  if (!apiKey) {
    console.log('LLM: 未设置 OPENCODE_GO_API_KEY, 跳过 AI 解析');
    return null;
  }

  const proxyFetch = (async (url: any, init?: any) => {
    const dispatcher = new ProxyAgent(PROXY_URL);
    return undiciFetch(url, {
      ...(init ?? {}),
      dispatcher,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        ...(init?.headers ?? {}),
      },
    });
  }) as unknown as typeof fetch;

  const provider = createOpenAICompatible({
    name: 'opencode-go',
    baseURL: API_BASE,
    apiKey,
    fetch: proxyFetch,
  });

  const systemPrompt = `你是练字帖生成指令解析器。把用户的中文自由表达解析为结构化参数, 只输出一个合法 JSON 对象, 不要使用 markdown 代码块, 不要输出任何其他内容。

可选册别(book 必须严格等于下列某个文件名之一, 直接照抄):
${BOOK_NAMES}

JSON 字段说明:
- book: 上表 12 个文件名之一; 用户没有提到年级/册别时(如"第8课""默写第X课词语""作业"), 默认 "y一年级上册"
- table: 写字表为 "xiezi"(默认), 只有用户明确说"认字/识字/会认字"时才为 "shizi"
- no: 课号 1-40 的整数; 用户没说课号时用 null
- type: "课文" | "识字" | "拼音" | null(用户明确提到才填)
- all: 用户说"全部/全册/所有课"时为 true, 否则 false
- grid: 米字格为 "mi", 田字格为 "tian"(默认), 无格/方格为 "plain"
- showPinyin: 用户说"不要拼音/无拼音/不带拼音"时为 false, 否则 true
- showStrokeCount: 用户说"不要笔画/不带笔画/不要笔画数"时为 false, 否则 true
- title: 给生成的字帖标题(如 "一年级上册 第8课")
- error: 完全无法理解用户意图时填一句中文说明, 其余情况为 null

示例输出: {"book":"y一年级上册","table":"xiezi","no":8,"type":null,"all":false,"grid":"tian","showPinyin":true,"showStrokeCount":true,"title":"一年级上册 第8课"}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { text } = await Promise.race([
        generateText({
          model: provider(MODEL),
          system: systemPrompt,
          prompt: input,
          temperature: 0,
          maxRetries: 0,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM 超时')), TIMEOUT_MS)
        ),
      ]);

      const raw = extractJson(text);
      if (!raw) {
        console.log(`LLM: 第${attempt}次尝试未从响应中解析出 JSON`);
        console.log(`LLM: 原始响应(前300字): ${text.slice(0, 300)}`);
        continue;
      }

      const normalized = normalize(raw);
      console.log('LLM: 模型返回 JSON:');
      console.log(JSON.stringify(normalized, null, 2));

      const result = toParseResult(normalized);
      if (result) return result;
      return null;
    } catch (e: any) {
      console.log(`LLM: 第${attempt}次尝试调用失败: ${e?.message ?? e}`);
    }
  }

  return null;
}
