// src/ 의 파일을 하나로 묶어 '반편성 도우미.html' 을 만든다 (인터넷 없이 열림)
// 사용: node tools/build.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) =>
  `<style>\n${fs.readFileSync(path.join(SRC, href), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(SRC, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>\n${js}\n</script>`;
});

// 내 컴퓨터에서 더블클릭용 + GitHub Pages 용(index.html)
for (const name of ['반편성 도우미.html', 'index.html']) {
  const out = path.join(ROOT, name);
  fs.writeFileSync(out, html, 'utf8');
  console.log('built', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
}
