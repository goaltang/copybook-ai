import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { parse, type ParseResult } from './parse.js';
import { llmParse } from './llm.js';
import { generateCopybook, type CharSpec } from './index.js';
import { textToChars, unlearnedChars, attachWords } from './text.js';
import { loadStrokeMap } from './strokes.js';

const DATA_DIR = path.resolve(import.meta.dirname, '../../data/final');
const FONT_PATH = path.resolve(import.meta.dirname, '../fonts/LXGWWenKai-Regular.ttf');
const LATIN_FONT_PATH = path.resolve(import.meta.dirname, '../fonts/DejaVuSans.ttf');
const WEB_DIR = path.resolve(import.meta.dirname, '../../web/dist');

const MAX_BODY = 1_000_000;

const bookCache = new Map<string, any>();

function loadBook(book: string): any | null {
  if (bookCache.has(book)) return bookCache.get(book);
  const dataFile = path.join(DATA_DIR, `${book}.json`);
  if (!fs.existsSync(dataFile)) return null;
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  bookCache.set(book, data);
  return data;
}

interface ResolvedLessons {
  chars: CharSpec[];
  desc: string;
  error?: string;
}

function resolveLessons(parsed: ParseResult): ResolvedLessons {
  if (!parsed.book) {
    return { chars: [], desc: '', error: '无法确定册别' };
  }

  const bookData = loadBook(parsed.book);
  if (!bookData) {
    return { chars: [], desc: '', error: `数据文件不存在: ${parsed.book}` };
  }

  const tableName = parsed.table === 'xiezi' ? '写字表' : '识字表';
  const table = bookData.tables?.[parsed.table];
  if (!table) {
    return { chars: [], desc: '', error: `该册没有${tableName}` };
  }

  const toChars = (lessons: any[]): CharSpec[] =>
    lessons.flatMap((l: any) =>
      l.chars.map((c: any) => ({ char: c.char, pinyin: c.pinyin, strokes: c.strokes }))
    );

  let chars: CharSpec[];
  let desc: string;

  if (parsed.lessonFilter === 'ALL') {
    const allLessons = table.lessons;
    chars = toChars(allLessons);
    desc = `全册 ${allLessons.length} 课, ${chars.length} 字`;
  } else {
    const filter = parsed.lessonFilter;
    let matchedLessons: any[] = [];

    if (filter.no !== undefined) {
      const byNo = table.lessons.filter((l: any) => l.no === filter.no);
      if (byNo.length === 0) {
        return { chars: [], desc: '', error: `该册数据中未找到第${filter.no}课` };
      }
      if (filter.type) {
        matchedLessons = byNo.filter((l: any) => l.type === filter.type);
        if (matchedLessons.length === 0) {
          matchedLessons = byNo;
        }
      } else {
        if (byNo.length > 1) {
          const withType = byNo.filter((l: any) => l.type !== null);
          if (withType.length > 0) {
            const keWen = withType.find((l: any) => l.type === '课文');
            matchedLessons = keWen ? [keWen] : [withType[0]];
          } else {
            matchedLessons = [byNo[0]];
          }
        } else {
          matchedLessons = byNo;
        }
      }
    } else if (filter.title) {
      return { chars: [], desc: '', error: `标题匹配"${filter.title}"暂不支持, 请使用课号` };
    } else if (filter.type) {
      matchedLessons = table.lessons.filter((l: any) => l.type === filter.type);
    }

    chars = toChars(matchedLessons);
    const lessonNos = matchedLessons.map((l: any) => l.no);
    const lessonTypes = matchedLessons.map((l: any) => l.type || '默认');
    desc = `第${lessonNos.join(',')}课(${lessonTypes.join(',')}) ${chars.length}字`;
  }

  return { chars, desc };
}

function json(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string): void {
  if (!fs.existsSync(WEB_DIR)) {
    if (urlPath === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('字帖引擎 HTTP 服务运行中。POST /api/copybook 生成字帖 PDF。');
      return;
    }
    json(res, 404, { ok: false, error: 'Not Found' });
    return;
  }

  let rel: string;
  try {
    rel = decodeURIComponent(urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
  } catch {
    json(res, 400, { ok: false, error: 'Bad Request' });
    return;
  }

  const filePath = path.resolve(WEB_DIR, rel);
  if (filePath !== WEB_DIR && !filePath.startsWith(WEB_DIR + path.sep)) {
    json(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      json(res, 404, { ok: false, error: 'Not Found' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function handleCopybook(text: string, useLlm: boolean): Promise<{ status: number; body: any }> {
  const t0 = Date.now();

  let parsed = parse(text);
  let source = '规则';

  if (parsed.error && useLlm) {
    const llmResult = await llmParse(text);
    if (llmResult) {
      parsed = llmResult;
      source = 'AI';
    }
  }

  if (parsed.error) {
    const elapsed = Date.now() - t0;
    console.log(`[${new Date().toISOString()}] text="${text}" source=${source} 耗时=${elapsed}ms -> 400: ${parsed.error}`);
    return { status: 400, body: { ok: false, error: parsed.error } };
  }

  let resolved: ResolvedLessons;
  if (parsed.mode === 'text' || parsed.mode === 'unlearned') {
    let chars;
    let repeats;
    let uncovered;
    let learnedCount: number | undefined;
    if (parsed.mode === 'unlearned' && parsed.learnedBook) {
      const r = unlearnedChars(parsed.text ?? '', parsed.learnedBook);
      chars = r.chars; repeats = r.repeats; uncovered = r.uncovered; learnedCount = r.learnedCount;
    } else {
      const r = textToChars(parsed.text ?? '');
      chars = r.chars; repeats = r.repeats; uncovered = r.uncovered;
    }
    const repeatDesc = Object.entries(repeats)
      .filter(([, n]) => (n as number) > 1)
      .map(([c, n]) => `${c}×${n}`)
      .join(' ');
    const desc = parsed.mode === 'unlearned'
      ? `未学字 ${chars.length} 字 (已学集合 ${learnedCount ?? 0} 字)${repeatDesc ? ` (重复: ${repeatDesc})` : ''}`
      : `${chars.length} 字${repeatDesc ? ` (重复: ${repeatDesc})` : ''}`;
    if (uncovered.length > 0) {
      console.log(`[${new Date().toISOString()}] ${parsed.mode}练字: ${uncovered.length} 字无拼音数据: ${uncovered.join('')}`);
    }
    if (chars.length === 0) {
      resolved = { chars, desc: '', error: '没有找到要生成的字' };
    } else {
      resolved = { chars, desc: parsed.mode === 'unlearned' ? desc : `文本练字 ${desc}` };
    }
  } else {
    resolved = resolveLessons(parsed);
  }
  if (resolved.error) {
    const elapsed = Date.now() - t0;
    console.log(`[${new Date().toISOString()}] text="${text}" source=${source} 耗时=${elapsed}ms -> 400: ${resolved.error}`);
    return { status: 400, body: { ok: false, error: resolved.error } };
  }

  if (resolved.chars.length === 0) {
    const elapsed = Date.now() - t0;
    console.log(`[${new Date().toISOString()}] text="${text}" source=${source} 耗时=${elapsed}ms -> 400: 没有找到要生成的字`);
    return { status: 400, body: { ok: false, error: '没有找到要生成的字' } };
  }

  const pdf = await generateCopybook({
    title: parsed.title,
    chars: parsed.showWords ? attachWords(resolved.chars) : resolved.chars,
    grid: parsed.grid,
    showPinyin: parsed.showPinyin,
    showStrokeCount: parsed.showStrokeCount,
    showWords: parsed.showWords === true,
    ...(parsed.showStrokes === true ? { showStrokes: true, strokes: loadStrokeMap() } : {}),
    fontPath: FONT_PATH,
    latinFontPath: LATIN_FONT_PATH,
  });

  const elapsed = Date.now() - t0;
  console.log(`[${new Date().toISOString()}] text="${text}" source=${source} 耗时=${elapsed}ms chars=${resolved.chars.length}`);

  return {
    status: 200,
    body: {
      ok: true,
      source,
      parse: {
        mode: parsed.mode ?? 'lesson',
        book: parsed.book,
        title: parsed.title,
        grid: parsed.grid,
        showPinyin: parsed.showPinyin,
        showStrokeCount: parsed.showStrokeCount,
        lessonFilter: parsed.lessonFilter,
      },
      lessonInfo: { desc: resolved.desc, charCount: resolved.chars.length },
      pdfBase64: Buffer.from(pdf).toString('base64'),
    },
  };
}

async function main() {
  const port = Number(process.env.PORT || 8787);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/copybook') {
        const raw = await readBody(req);
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          json(res, 400, { ok: false, error: '无效的 JSON 请求体' });
          return;
        }
        const text = typeof body?.text === 'string' ? body.text : '';
        if (!text.trim()) {
          json(res, 400, { ok: false, error: '缺少 text 字段' });
          return;
        }
        const useLlm = body.llm !== false;
        const result = await handleCopybook(text, useLlm);
        json(res, result.status, result.body);
        return;
      }

      if (req.method === 'GET') {
        serveStatic(req, res, url.pathname);
        return;
      }

      json(res, 404, { ok: false, error: 'Not Found' });
    } catch (e: any) {
      console.error('请求处理出错:', e?.message ?? e);
      json(res, 500, { ok: false, error: `服务器内部错误: ${e?.message ?? e}` });
    }
  });

  server.listen(port, () => {
    console.log(`字帖引擎 HTTP 服务已启动: http://127.0.0.1:${port}`);
    console.log(`健康检查: GET /health`);
    console.log(`生成字帖: POST /api/copybook`);
    if (!fs.existsSync(WEB_DIR)) {
      console.log(`静态目录不存在(${WEB_DIR}), GET / 返回提示文本`);
    }
  });
}

main().catch(e => {
  console.error('启动失败:', e);
  process.exit(1);
});
