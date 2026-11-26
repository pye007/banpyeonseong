// HWPX 생성 시험: node tools/test-hwpx.js out.hwpx
const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.window = global;
global.JSZip = require('../src/lib/jszip.min.js');
for (const f of ['hwpx-template.js', 'hwpx.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8') + '\nglobalThis.DocWriter = typeof DocWriter !== "undefined" ? DocWriter : undefined;', { filename: f });
}
const blocks = [
  { t: 'p', text: '【서식1】', style: 'small' },
  { t: 'p', text: '반편성 기초자료', style: 'title', align: 'center' },
  { t: 'table', cols: [12, 26, 14, 26, 16, 16, 60], headerRows: 2, rows: [
    { h: 9, cells: [{ text: '2026학년도 4학년 1반', cs: 3, bold: true }, { text: '(남:1명 여:1명 계:2명)', cs: 2 }, { text: '담임 홍길동 (인)', cs: 2, align: 'right' }] },
    { h: 10, cells: ['번호', '이름', '성별', '생년월일', '남녀\n순위', '진급반', '특이사항\n(비고)'].map(t => ({ text: t, head: true })) },
    { h: 7.5, cells: [{ text: '1' }, { text: '김가람' }, { text: '남' }, { text: '2016.03.02' }, { text: '1' }, { text: '가' }, { text: '생활지도', align: 'left' }] },
    { h: 7.5, cells: [{ text: '2' }, { text: '이나래' }, { text: '여' }, { text: '2016.07.19' }, { text: '1' }, { text: '나' }, { text: '' }] },
  ] },
  { t: 'p', text: '【서식3】', style: 'small', pageBreak: true },
  { t: 'table', cols: [20, 20, 30, 30, 30, 40], rows: [
    { h: 8, cells: [{ text: '구분', cs: 2, head: true }, { text: '가반', head: true }, { text: '나반', head: true }, { text: '다반', head: true }, { text: '계', head: true }] },
    { h: 8, cells: [{ text: '총계', rs: 3 }, { text: '남' }, { text: '1' }, { text: '0' }, { text: '0' }, { text: '1' }] },
    { h: 8, cells: [{ text: '여' }, { text: '0' }, { text: '1' }, { text: '0' }, { text: '1' }] },
    { h: 8, cells: [{ text: '계' }, { text: '1' }, { text: '1' }, { text: '0' }, { text: '2' }] },
  ] },
];
DocWriter.toHwpxBlob(blocks, '시험', 'nodebuffer').then(buf => {
  const out = process.argv[2] || 'test.hwpx';
  fs.writeFileSync(out, buf);
  console.log('ok', out, buf.length);
});
