// 读中间 JSON(课+字串),cnchar 补全属性,输出最终 JSON
const fs = require('fs');
const cnchar = require('/tmp/cnchar-test/node_modules/cnchar');
cnchar.use(require('/tmp/cnchar-test/node_modules/cnchar-radical'));
cnchar.use(require('/tmp/cnchar-test/node_modules/cnchar-order'));

const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
const out = process.argv[3];

function enrich(char) {
  const info = cnchar.stroke(char, 'count');
  const radical = cnchar.radical(char);
  return {
    char,
    pinyin: cnchar.spell(char, 'tone'),
    strokes: info,
    radical: radical && radical[0] ? radical[0].radical : null,
    structure: radical && radical[0] ? radical[0].struct : null,
  };
}

for (const l of input.lessons) l.chars = l.chars.map(enrich);
for (const g of input.gardens) g.chars = g.chars.map(enrich);
fs.writeFileSync(out, JSON.stringify(input, null, 1));
console.log('saved', out);
console.log(JSON.stringify(input.lessons[0], null, 1));
