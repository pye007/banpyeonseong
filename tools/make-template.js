// 한글 기본 서식(Normal.hwtx)에서 HWPX 뼈대를 뽑아 src/hwpx-template.js 로 저장
// 사용: node tools/make-template.js
const fs = require('fs');
const path = require('path');
const JSZip = require('../src/lib/jszip.min.js');

const SRC = process.argv[2] ||
  'C:/Program Files (x86)/Hnc/Office 2022/HOffice120/Bin/Shared/HwpTemplate/Doc/ko-KR/Normal.hwtx';

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(SRC));
  const read = n => zip.file(n).async('string');
  const header = await read('Contents/header.xml');
  const section = await read('Contents/section0.xml');
  let hpf = await read('Contents/content.hpf');

  // 스크립트 항목(실제 파일 없음) 제거
  hpf = hpf.replace(/<opf:item id="(headersc|sourcesc)"[^>]*\/>/g, '')
           .replace(/<opf:itemref idref="(headersc|sourcesc)"[^>]*\/>/g, '');

  const secOpen = section.slice(0, section.indexOf('<hp:p '));
  let secPr = section.match(/<hp:secPr[\s\S]*?<\/hp:secPr>/)[0];
  // A4, 여백: 좌우 20mm, 위아래 15mm, 머리말·꼬리말 10mm
  secPr = secPr.replace(/<hp:margin [^>]*\/>/,
    '<hp:margin header="2835" footer="2835" gutter="0" left="5669" right="5669" top="4252" bottom="4252"/>');
  const colPr = section.match(/<hp:ctrl><hp:colPr[\s\S]*?<\/hp:ctrl>/)[0];

  const T = {
    header,
    secOpen,
    secPr,
    colPr,
    contentHpf: hpf,
    version: await read('version.xml'),
    settings: await read('settings.xml'),
    containerXml: await read('META-INF/container.xml'),
    containerRdf: await read('META-INF/container.rdf'),
    manifest: await read('META-INF/manifest.xml'),
  };
  const out = path.join(__dirname, '..', 'src', 'hwpx-template.js');
  fs.writeFileSync(out,
    '// 한글 기본 서식(Normal.hwtx)에서 뽑은 HWPX 뼈대 — tools/make-template.js 로 생성\n' +
    'window.HWPX_TEMPLATE = ' + JSON.stringify(T) + ';\n', 'utf8');
  console.log('written', out, fs.statSync(out).size);
})();
