// 批量 enrich: all_books.mid.json → 每册最终 JSON(补拼音/笔画/部首/结构)
const fs = require('fs');
const cnchar = require('/tmp/cnchar-test/node_modules/cnchar');
cnchar.use(require('/tmp/cnchar-test/node_modules/cnchar-radical'));
cnchar.use(require('/tmp/cnchar-test/node_modules/cnchar-order'));

const mid = JSON.parse(fs.readFileSync('all_books.mid.json', 'utf-8'));
const outDir = 'final';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

function enrich(ch) {
  const radical = cnchar.radical(ch);
  return {
    char: ch,
    pinyin: cnchar.spell(ch, 'tone'),
    strokes: cnchar.stroke(ch, 'count'),
    radical: radical && radical[0] ? radical[0].radical : null,
    structure: radical && radical[0] ? radical[0].struct : null,
  };
}

let totalChars = 0;
for (const [book, data] of Object.entries(mid)) {
  const out = { book, tables: {} };
  for (const [tbl, t] of Object.entries(data)) {
    const lessons = t.lessons.map(l => ({ no: l.no, type: l.type, chars: l.chars.map(enrich) }));
    const gardens = t.gardens.map(g => ({ name: g.name, chars: g.chars.map(enrich) }));
    out.tables[tbl] = { lessons, gardens };
    totalChars += t.lessons.reduce((s, l) => s + l.chars.length, 0) + t.gardens.reduce((s, g) => s + g.chars.length, 0);
  }
  fs.writeFileSync(`${outDir}/${book}.json`, JSON.stringify(out, null, 1));
  console.log(book, Object.keys(data).join('+'), '→', outDir);
}
console.log('total chars enriched:', totalChars);
