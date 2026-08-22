<script setup>
import { ref, nextTick, watch } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const messages = ref([]);
const input = ref('');
const sending = ref(false);
const listRef = ref(null);
// 会话上下文: 记住最近使用的册别, 补全"第8课/全册"等缺册别输入
const lastBook = ref(localStorage.getItem('zitie.lastBook') || '');

const CHIPS = ['一年级上册第五课 带描红', '今晚作业默写第8课词语', '春眠不觉晓 米字格', '全册 不要拼音'];

const GRID_NAMES = { tian: '田字格', mi: '米字格', plain: '无格' };

let idSeq = 0;

function scrollToBottom() {
  nextTick(() => {
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

watch(messages, scrollToBottom, { deep: true });

function send(text) {
  const value = (text ?? input.value).trim();
  if (!value || sending.value) return;
  input.value = '';
  messages.value.push({ id: ++idSeq, role: 'user', text: value });
  const loadingId = ++idSeq;
  messages.value.push({ id: loadingId, role: 'loading' });
  sending.value = true;
  requestCopybook(value)
    .then(async (data) => {
      // 首页渲染成图片做预览(移动端 iframe 内嵌 PDF 普遍不可用)
      try {
        const preview = await renderPreview(data.pdfDataUrl);
        data.previewImg = preview.img;
        data.pageCount = preview.pages;
      } catch (e) {
        console.warn('预览渲染失败, 仍可下载:', e);
      }
      if (data.book) {
        lastBook.value = data.book;
        localStorage.setItem('zitie.lastBook', data.book);
      }
      const idx = messages.value.findIndex((m) => m.id === loadingId);
      if (idx !== -1) {
        messages.value.splice(idx, 1, { id: loadingId, role: 'ai', text: value, data });
      }
    })
    .catch((err) => {
      const idx = messages.value.findIndex((m) => m.id === loadingId);
      if (idx !== -1) {
        messages.value.splice(idx, 1, { id: loadingId, role: 'error', text: err.message || String(err) });
      }
    })
    .finally(() => {
      sending.value = false;
    });
}

async function requestCopybook(text) {
  let res;
  try {
    res = await fetch('/api/copybook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, llm: true, lastBook: lastBook.value || undefined }),
    });
  } catch (e) {
    throw new Error('网络错误, 请确认后端服务已启动');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    throw new Error(body?.error || `请求失败 (HTTP ${res.status})`);
  }
  const pdfDataUrl = `data:application/pdf;base64,${body.pdfBase64}`;
  const title = body.parse?.title || body.lessonInfo?.desc || '字帖';
  const filename = `字帖-${title}.pdf`;
  return {
    source: body.source,
    book: body.parse?.book || '',
    title,
    lessonDesc: body.lessonInfo?.desc || '',
    charCount: body.lessonInfo?.charCount ?? 0,
    grid: body.parse?.grid,
    showPinyin: body.parse?.showPinyin,
    showStrokeCount: body.parse?.showStrokeCount,
    pdfDataUrl,
    filename,
  };
}

async function renderPreview(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1.6 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return { img: canvas.toDataURL('image/png'), pages: doc.numPages };
}

function download(m) {
  const a = document.createElement('a');
  a.href = m.data.pdfDataUrl;
  a.download = m.data.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function useChip(c) {
  send(c);
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <h1>练字帖生成器</h1>
      <p>部编版教材同步 · 一句话生成字帖</p>
    </header>

    <main ref="listRef" class="chat-list">
      <div v-if="messages.length === 0" class="welcome">
        <div class="welcome-card">
          <p class="welcome-title">说说你要练什么字</p>
          <p class="welcome-sub">例如「一年级上册第五课 米字格」, 自动生成对应课文的字帖 PDF, 可直接打印。</p>
        </div>
      </div>

      <div
        v-for="m in messages"
        :key="m.id"
        class="msg-row"
        :class="{ 'is-user': m.role === 'user', 'is-ai': m.role === 'ai', 'is-error': m.role === 'error' }"
      >
        <div v-if="m.role === 'user'" class="bubble user-bubble">{{ m.text }}</div>

        <div v-else-if="m.role === 'loading'" class="bubble ai-bubble loading-bubble">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          <span class="loading-text">生成中...</span>
        </div>

        <div v-else-if="m.role === 'error'" class="bubble error-bubble">{{ m.text }}</div>

        <div v-else class="bubble ai-bubble ai-card">
          <div class="ai-meta">
            <span class="source-badge" :class="m.data.source === 'AI' ? 'is-ai' : 'is-rule'">
              {{ m.data.source === 'AI' ? 'AI 解析' : '规则解析' }}
            </span>
            <span class="ai-title">{{ m.data.title }}</span>
          </div>
          <div class="lesson-line">
            {{ m.data.lessonDesc }}
            <span class="dim" v-if="m.data.charCount">· {{ m.data.charCount }} 字</span>
            <span class="dim" v-if="m.data.grid">· {{ GRID_NAMES[m.data.grid] || m.data.grid }}</span>
            <span class="dim" v-if="m.data.showPinyin === false">· 不带拼音</span>
            <span class="dim" v-if="m.data.showStrokeCount === false">· 不带笔画数</span>
          </div>
          <img v-if="m.data.previewImg" class="pdf-preview" :src="m.data.previewImg" alt="字帖预览 第1页" />
          <p v-else class="preview-fallback">本页预览不可用, 请下载 PDF 查看</p>
          <p v-if="m.data.pageCount" class="preview-meta">预览第 1 页 · 共 {{ m.data.pageCount }} 页 · 打印请点下载</p>
          <button class="download-btn" @click="download(m)">下载 PDF</button>
        </div>
      </div>
    </main>

    <footer class="input-area">
      <div class="chips">
        <button v-for="c in CHIPS" :key="c" class="chip" @click="useChip(c)">{{ c }}</button>
      </div>
      <div class="input-row">
        <input
          v-model="input"
          class="text-input"
          type="text"
          placeholder="试试: 一年级上册第五课 米字格"
          :disabled="sending"
          @keyup.enter="send()"
        />
        <button class="send-btn" :disabled="sending || !input.trim()" @click="send()">
          {{ sending ? '生成中' : '发送' }}
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app {
  height: 100dvh;
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  background: #faf7f0;
  box-shadow: 0 0 24px rgba(90, 70, 40, 0.08);
}

.topbar {
  flex: none;
  padding: 16px 16px 12px;
  text-align: center;
  background: linear-gradient(180deg, #f6efe2, #faf7f0);
  border-bottom: 1px solid #e8dfcc;
}

.topbar h1 {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #3a3126;
}

.topbar p {
  margin-top: 4px;
  font-size: 12px;
  color: #9a8c74;
  letter-spacing: 1px;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

.welcome-card {
  background: #fff;
  border: 1px solid #ece2cd;
  border-radius: 14px;
  padding: 20px 18px;
  text-align: center;
  max-width: 340px;
  margin: 24px auto;
}

.welcome-title {
  font-size: 16px;
  font-weight: 600;
  color: #4a4033;
}

.welcome-sub {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: #a2957f;
}

.msg-row {
  display: flex;
  margin-bottom: 14px;
}

.msg-row.is-user {
  justify-content: flex-end;
}

.msg-row.is-ai,
.msg-row.is-error {
  justify-content: flex-start;
}

.bubble {
  max-width: 85%;
  padding: 12px 14px;
  border-radius: 16px;
  font-size: 15px;
  line-height: 1.6;
  word-break: break-word;
}

.user-bubble {
  background: #b04a34;
  color: #fff;
  border-bottom-right-radius: 6px;
}

.ai-bubble {
  background: #fff;
  border: 1px solid #ece2cd;
  border-bottom-left-radius: 6px;
}

.error-bubble {
  background: #fdecec;
  border: 1px solid #f3c4c4;
  color: #b33333;
  font-size: 14px;
}

.loading-bubble {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #a2957f;
  font-size: 14px;
}

.loading-bubble .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d9cdb5;
  animation: blink 1.2s infinite ease-in-out;
}

.loading-bubble .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-bubble .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

.ai-card {
  width: 88%;
  padding: 14px;
}

.ai-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.source-badge {
  flex: none;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
  letter-spacing: 1px;
}

.source-badge.is-rule {
  background: #efe6d2;
  color: #8a6d3b;
}

.source-badge.is-ai {
  background: #d9e8f7;
  color: #1e6fa8;
}

.ai-title {
  font-size: 15px;
  font-weight: 600;
  color: #3a3126;
}

.lesson-line {
  margin-top: 6px;
  font-size: 13px;
  color: #6b5f4d;
}

.lesson-line .dim {
  color: #a2957f;
}

.pdf-preview {
  width: 100%;
  margin-top: 10px;
  border: 1px solid #e8dfcc;
  border-radius: 10px;
  background: #fff;
}

.preview-fallback {
  margin-top: 10px;
  font-size: 13px;
  color: #a2957f;
}

.preview-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #a2957f;
}

.download-btn {
  margin-top: 10px;
  width: 100%;
  padding: 12px 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 2px;
  border-radius: 12px;
  background: #b04a34;
  color: #fff;
}

.download-btn:active {
  background: #963c29;
}

.input-area {
  flex: none;
  padding: 10px 14px calc(14px + env(safe-area-inset-bottom));
  background: #faf7f0;
  border-top: 1px solid #e8dfcc;
}

.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 10px;
  -webkit-overflow-scrolling: touch;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex: none;
  padding: 7px 14px;
  font-size: 13px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e0d5bd;
  color: #6b5f4d;
}

.chip:active {
  background: #f0e7d3;
}

.input-row {
  display: flex;
  gap: 10px;
}

.text-input {
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  font-size: 15px;
  border-radius: 12px;
  border: 1px solid #e0d5bd;
  background: #fff;
  color: #2b2b2b;
  outline: none;
}

.text-input:focus {
  border-color: #b04a34;
}

.text-input:disabled {
  background: #f3efe4;
}

.send-btn {
  flex: none;
  padding: 0 22px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 2px;
  border-radius: 12px;
  background: #b04a34;
  color: #fff;
}

.send-btn:active:not(:disabled) {
  background: #963c29;
}

.send-btn:disabled {
  opacity: 0.5;
}
</style>
