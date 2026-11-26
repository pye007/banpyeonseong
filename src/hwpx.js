/* 문서 모델 → 한글(HWPX) 파일 / HTML 미리보기
 *
 * 블록 모델
 *   { t:'p', text, style:'title'|'sub'|'normal'|'small', align:'center'|'left'|'right', pageBreak }
 *   { t:'table', cols:[mm...], headerRows, pageBreak,
 *     rows:[ { h:mm, cells:[ { text, cs, rs, head, bold, align } ] } ] }
 *   text 안의 '\n' 은 줄(문단) 바꿈
 */
const DocWriter = (() => {
  const MM = 7200 / 25.4; // 1mm = 283.46 HWPUNIT
  const u = mm => Math.round(mm * MM);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ---------- header.xml: 표 테두리 / 글자 모양 / 문단 모양 추가 ----------
  function buildHeader(T) {
    let h = T.header;
    const ids = {};

    // 테두리·배경
    const bfCnt = +h.match(/<hh:borderFills itemCnt="(\d+)"/)[1];
    const bf = (id, fill) =>
      `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
      `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
      ['left', 'right', 'top', 'bottom'].map(s => `<hh:${s}Border type="SOLID" width="0.12 mm" color="#000000"/>`).join('') +
      `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>` +
      (fill ? `<hc:fillBrush><hc:winBrush faceColor="${fill}" hatchColor="#999999" alpha="0"/></hc:fillBrush>` : '') +
      `</hh:borderFill>`;
    ids.bfLine = bfCnt + 1;
    ids.bfHead = bfCnt + 2;
    h = h.replace(/<hh:borderFills itemCnt="\d+">/, `<hh:borderFills itemCnt="${bfCnt + 2}">`)
         .replace('</hh:borderFills>', bf(ids.bfLine) + bf(ids.bfHead, '#E7E7E7') + '</hh:borderFills>');

    // 글자 모양
    const cpCnt = +h.match(/<hh:charProperties itemCnt="(\d+)"/)[1];
    const cp0 = h.match(/<hh:charPr id="0"[\s\S]*?<\/hh:charPr>/)[0];
    const charDefs = [
      ['title', 1600, true], ['sub', 1200, true], ['normal', 1000, false],
      ['small', 900, false], ['cell', 900, false], ['cellBold', 900, true],
    ];
    let cpXml = '';
    charDefs.forEach(([name, height, bold], i) => {
      const id = cpCnt + i;
      ids['cp_' + name] = id;
      let s = cp0.replace('id="0"', `id="${id}"`).replace(/height="\d+"/, `height="${height}"`);
      if (bold) s = s.replace(/(<hh:offset [^>]*\/>)/, '$1<hh:bold/>');
      cpXml += s;
    });
    h = h.replace(/<hh:charProperties itemCnt="\d+">/, `<hh:charProperties itemCnt="${cpCnt + charDefs.length}">`)
         .replace('</hh:charProperties>', cpXml + '</hh:charProperties>');

    // 문단 모양
    const ppCnt = +h.match(/<hh:paraProperties itemCnt="(\d+)"/)[1];
    const pp0 = h.match(/<hh:paraPr id="0"[\s\S]*?<\/hh:paraPr>/)[0];
    const paraDefs = [['center', 'CENTER', 130], ['left', 'LEFT', 130], ['right', 'RIGHT', 130], ['body', 'JUSTIFY', 160]];
    let ppXml = '';
    paraDefs.forEach(([name, align, ls], i) => {
      const id = ppCnt + i;
      ids['pp_' + name] = id;
      ppXml += pp0.replace('id="0"', `id="${id}"`)
                  .replace(/horizontal="[A-Z]+"/, `horizontal="${align}"`)
                  .replace(/(<hh:lineSpacing type="PERCENT" value=")\d+/g, `$1${ls}`);
    });
    h = h.replace(/<hh:paraProperties itemCnt="\d+">/, `<hh:paraProperties itemCnt="${ppCnt + paraDefs.length}">`)
         .replace('</hh:paraProperties>', ppXml + '</hh:paraProperties>');

    return { xml: h, ids };
  }

  // ---------- section0.xml ----------
  function buildSection(T, ids, blocks) {
    let pid = 1000;
    let tid = 1900000000;
    let z = 0;
    const P = (text, pp, cp, pageBreak, inner) =>
      `<hp:p id="${pid++}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0">` +
      (inner != null ? inner : '') +
      (text ? `<hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>` : (inner != null ? '' : `<hp:run charPrIDRef="${cp}"/>`)) +
      `</hp:p>`;

    const styleCp = { title: ids.cp_title, sub: ids.cp_sub, normal: ids.cp_normal, small: ids.cp_small };
    const alignPp = { center: ids.pp_center, left: ids.pp_left, right: ids.pp_right };

    function table(tb) {
      const C = tb.cols.length, R = tb.rows.length;
      const colW = tb.cols.map(u);
      const rowH = tb.rows.map(r => u(r.h || 7));
      const occ = Array.from({ length: R }, () => new Array(C).fill(false));
      const headerRows = tb.headerRows || 0;
      let rowsXml = '';
      tb.rows.forEach((row, r) => {
        let c = 0, cells = '';
        for (const cell of row.cells) {
          while (c < C && occ[r][c]) c++;
          if (c >= C) break;
          const cs = Math.min(cell.cs || 1, C - c), rs = Math.min(cell.rs || 1, R - r);
          for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) occ[i][j] = true;
          let w = 0, hh = 0;
          for (let j = c; j < c + cs; j++) w += colW[j];
          for (let i = r; i < r + rs; i++) hh += rowH[i];
          const cp = (cell.head || cell.bold) ? ids.cp_cellBold : ids.cp_cell;
          const pp = alignPp[cell.align || 'center'];
          const lines = String(cell.text == null ? '' : cell.text).split('\n');
          const paras = lines.map(l => P(l, pp, cp, false)).join('');
          cells +=
            `<hp:tc name="" header="${r < headerRows ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${cell.head ? ids.bfHead : ids.bfLine}">` +
            `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
            paras + `</hp:subList>` +
            `<hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="${cs}" rowSpan="${rs}"/>` +
            `<hp:cellSz width="${w}" height="${hh}"/><hp:cellMargin left="141" right="141" top="71" bottom="71"/></hp:tc>`;
          c += cs;
        }
        rowsXml += `<hp:tr>${cells}</hp:tr>`;
      });
      const W = colW.reduce((a, b) => a + b, 0), H = rowH.reduce((a, b) => a + b, 0);
      return `<hp:tbl id="${tid++}" zOrder="${z++}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="${headerRows ? 1 : 0}" rowCnt="${R}" colCnt="${C}" cellSpacing="0" borderFillIDRef="${ids.bfLine}" noAdjust="0">` +
        `<hp:sz width="${W}" widthRelTo="ABSOLUTE" height="${H}" heightRelTo="ABSOLUTE" protect="0"/>` +
        `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="CENTER" vertOffset="0" horzOffset="0"/>` +
        `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="141" right="141" top="71" bottom="71"/>` +
        rowsXml + `</hp:tbl>`;
    }

    let body = '';
    let first = true;
    for (const b of blocks) {
      if (first) {
        // 첫 문단에 구역 설정(용지·여백)을 넣는다
        const secRun = `<hp:run charPrIDRef="0">${T.secPr}${T.colPr}</hp:run>`;
        if (b.t === 'p') {
          body += P(b.text, alignPp[b.align || 'left'], styleCp[b.style || 'normal'], false, secRun);
          first = false;
          continue;
        }
        body += P('', ids.pp_left, 0, false, secRun);
        first = false;
      }
      if (b.t === 'p') {
        const lines = String(b.text || '').split('\n');
        lines.forEach((l, i) => {
          body += P(l, alignPp[b.align || 'left'], styleCp[b.style || 'normal'], i === 0 && b.pageBreak);
        });
      } else if (b.t === 'table') {
        body += P('', ids.pp_left, ids.cp_normal, b.pageBreak, `<hp:run charPrIDRef="${ids.cp_cell}">${table(b)}</hp:run>`);
      }
    }
    return T.secOpen + body + '</hs:sec>';
  }

  function plainText(blocks) {
    const out = [];
    for (const b of blocks) {
      if (b.t === 'p') out.push(String(b.text == null ? '' : b.text));
      else if (b.t === 'table') for (const r of b.rows) out.push(r.cells.map(c => String(c.text == null ? '' : c.text).replace(/\n/g, ' ')).join('\t'));
      if (out.join('\n').length > 1000) break;
    }
    return out.join('\r\n').slice(0, 1000);
  }

  async function toHwpxBlob(blocks, title, outType) {
    const T = window.HWPX_TEMPLATE;
    const { xml: header, ids } = buildHeader(T);
    const section = buildSection(T, ids, blocks);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const hpf = T.contentHpf
      .replace('<opf:title/>', `<opf:title>${esc(title || '')}</opf:title>`)
      .replace(/(<opf:meta name="creator" content="text">)[^<]*/, '$1반편성 도우미')
      .replace(/(<opf:meta name="lastsaveby" content="text">)[^<]*/, '$1반편성 도우미')
      .replace(/(<opf:meta name="ModifiedDate" content="text">)[^<]*/, '$1' + now);

    const zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
    zip.file('version.xml', T.version);
    zip.file('Contents/header.xml', header);
    zip.file('Contents/section0.xml', section);
    zip.file('Preview/PrvText.txt', plainText(blocks));
    zip.file('settings.xml', T.settings);
    zip.file('META-INF/container.rdf', T.containerRdf);
    zip.file('Contents/content.hpf', hpf);
    zip.file('META-INF/container.xml', T.containerXml);
    zip.file('META-INF/manifest.xml', T.manifest);
    return zip.generateAsync({ type: outType || 'blob', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });
  }

  // ---------- HTML 미리보기 (A4 쪽 단위) ----------
  function toHtml(blocks) {
    const pages = [[]];
    for (const b of blocks) {
      if (b.pageBreak && pages[pages.length - 1].length) pages.push([]);
      pages[pages.length - 1].push(b);
    }
    const h = s => esc(s).replace(/\n/g, '<br>');
    return pages.map(pg => {
      const inner = pg.map(b => {
        if (b.t === 'p') return `<p class="dp dp-${b.style || 'normal'}" style="text-align:${b.align || 'left'}">${h(b.text || '') || '&nbsp;'}</p>`;
        const cols = b.cols.map(w => `<col style="width:${w}mm">`).join('');
        const rows = b.rows.map(r => `<tr style="height:${r.h || 7}mm">` + r.cells.map(c =>
          `<td${c.cs > 1 ? ` colspan="${c.cs}"` : ''}${c.rs > 1 ? ` rowspan="${c.rs}"` : ''} class="${c.head ? 'dh' : ''}${c.bold ? ' db' : ''}" style="text-align:${c.align || 'center'}">${h(c.text || '')}</td>`
        ).join('') + `</tr>`).join('');
        return `<table class="dt" style="width:${b.cols.reduce((a, x) => a + x, 0)}mm"><colgroup>${cols}</colgroup>${rows}</table>`;
      }).join('');
      return `<div class="a4"><div class="a4-in">${inner}</div></div>`;
    }).join('');
  }

  return { toHwpxBlob, toHtml, _buildHeader: buildHeader, _buildSection: buildSection };
})();
