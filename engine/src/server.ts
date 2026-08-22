import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { parse, BOOKS } from './parse.js';
import { llmParse } from './llm.js';
import { resolveChars, buildPdf } from './resolve.js';

const WEB_DIR = path.resolve(import.meta.dirname, '../../web/dist');

const MAX_BODY = 1_000_000;

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

async function handleCopybook(text: string, useLlm: boolean, lastBook?: string): Promise<{ status: number; body: any }> {
  const t0 = Date.now();
  // 会话上下文: 校验并使用前端传来的最近册别(补全"第8课/全册"等缺册别输入)
  const defaultBook = lastBook && (BOOKS as readonly string[]).includes(lastBook) ? lastBook : undefined;

  let parsed = parse(text, { defaultBook });
  let source = '规则';

  if (parsed.error && useLlm) {
    const llmResult = await llmParse(text, defaultBook);
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

  const resolved = resolveChars(parsed);
  if (resolved.error) {
    const elapsed = Date.now() - t0;
    console.log(`[${new Date().toISOString()}] text="${text}" source=${source} 耗时=${elapsed}ms -> 400: ${resolved.error}`);
    return { status: 400, body: { ok: false, error: resolved.error } };
  }
  if (resolved.uncovered && resolved.uncovered.length > 0) {
    console.log(`[${new Date().toISOString()}] ${(parsed.mode ?? 'lesson')}练字: ${resolved.uncovered.length} 字无拼音数据: ${resolved.uncovered.join('')}`);
  }

  const pdf = await buildPdf(parsed, resolved.chars);

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
        practiceCells: parsed.practiceCells ?? 5,
        traceCells: parsed.traceCells ?? 0,
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
        const lastBook = typeof body?.lastBook === 'string' ? body.lastBook : undefined;
        const result = await handleCopybook(text, useLlm, lastBook);
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
    console.log('健康检查: GET /health');
    console.log('生成字帖: POST /api/copybook');
    if (!fs.existsSync(WEB_DIR)) {
      console.log(`静态目录不存在(${WEB_DIR}), GET / 返回提示文本`);
    }
  });
}

main().catch(e => {
  console.error('启动失败:', e);
  process.exit(1);
});
