'use strict';
/* 반편성 도우미 — 학급 명단(엑셀) → 순위·특이사항 → ㄹ자 배치 → 점수 재배분 → 교사 조정 → 서식 저장 */

// ================= 상수 =================
const CLASS_NAMES = '가나다라마바사아자차카타파하'.split('');
const TAGS = [
  { key: '생활지도', label: '생활지도 곤란', short: '생', cls: 't-life' },
  { key: '학습부진', label: '학습부진', short: '부', cls: 't-learn' },
  { key: '특수학급', label: '특수학급', short: '특', cls: 't-sped' },
  { key: '쌍둥이', label: '쌍둥이', short: '쌍', cls: 't-twin' },
  { key: '다문화', label: '다문화', short: '다', cls: 't-multi' },
  { key: '전출예정', label: '전출예정', short: '전', cls: 't-move' },
];
const TAG = Object.fromEntries(TAGS.map(t => [t.key, t]));
const BAL_TAGS = ['생활지도', '학습부진', '특수학급', '다문화', '전출예정'];
const GENDERS = ['남', '여'];
const STORE_KEY = 'banpyeon-helper-v1';
const BIG = 1e6;

// ================= 도우미 =================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
const num = v => { const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : null; };

function defaultState() {
  const now = new Date();
  const y = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
  return {
    v: 1,
    settings: {
      curYear: y, curGrade: 4, newYear: y + 1, newGrade: 5, numClasses: 4,
      snakeBasis: 'combined', snakeMode: 'continue', boysFirst: true,
      wLearn: 3, wDiff: 3, wTag: 3, wOld: 2, wMove: 1, leaderName: '',
    },
    teachers: {},
    students: [],
    relations: [],
    defaulted: {},
    lastMsg: '',
  };
}
let S = defaultState();
const UI = { tab: 'roster', rankClass: null, boardSort: 'name', preview: 'f1', history: [] };

function className(i) { return i == null ? '' : (CLASS_NAMES[i] || String(i + 1)); }
function classList() { return Array.from({ length: S.settings.numClasses }, (_, i) => i); }
function oldClasses() { return [...new Set(S.students.map(s => s.oldClass))].sort((a, b) => a - b); }
function stuMap() { return new Map(S.students.map(s => [s.id, s])); }
function group(cls, g) { return S.students.filter(s => s.oldClass === cls && s.gender === g); }

// ================= 저장소(이 컴퓨터의 브라우저) =================
let saveTimer = null;
function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* 저장 불가 환경 */ } }
function commit(opts = {}) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 250);
  if (!opts.silent) render();
}
function restore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return false;
    adoptState(d);
    return S.students.length > 0;
  } catch (e) { return false; }
}
function adoptState(d) {
  const base = defaultState();
  S = Object.assign(base, d);
  S.settings = Object.assign(defaultState().settings, d.settings || {});
  S.students = (d.students || []).map(s => Object.assign({ tags: [], nation: '', phone: '', memo: '', newClass: null, snakeClass: null, locked: false }, s));
  S.relations = d.relations || [];
  S.teachers = d.teachers || {};
  S.defaulted = d.defaulted || {};
}

// ================= 순위 · 점수 =================
function normGroup(cls, g, key) {
  const list = group(cls, g);
  const ok = v => Number.isFinite(v) && v > 0;
  const missing = list.some(s => !ok(s[key]));
  list.sort((a, b) => {
    const ra = ok(a[key]) ? a[key] : Infinity, rb = ok(b[key]) ? b[key] : Infinity;
    if (ra !== rb) return ra - rb;
    return (a.oldNo || 0) - (b.oldNo || 0);
  });
  list.forEach((s, i) => { s[key] = i + 1; });
  return missing;
}
function normAll(markDefault) {
  for (const cls of oldClasses()) for (const g of GENDERS) for (const key of ['learnRank', 'diffRank']) {
    const missing = normGroup(cls, g, key);
    if (missing && markDefault) S.defaulted[`${cls}|${g}|${key}`] = true;
  }
}
// 학습점수 L: 1위=100 … 꼴찌=0 / 곤란점수 D: 1위(지도가 가장 어려움)=100 … 0
function refreshScores() {
  const cnt = {};
  for (const s of S.students) { const k = s.oldClass + '|' + s.gender; cnt[k] = (cnt[k] || 0) + 1; }
  const wl = S.settings.wLearn, wd = S.settings.wDiff;
  for (const s of S.students) {
    const n = cnt[s.oldClass + '|' + s.gender] || 1;
    s._L = n > 1 ? Math.round((n - s.learnRank) / (n - 1) * 100) : 50;
    s._D = n > 1 ? Math.round((n - s.diffRank) / (n - 1) * 100) : 50;
    if (!Number.isFinite(s._L)) s._L = 50;
    if (!Number.isFinite(s._D)) s._D = 50;
    s._C = (wl + wd) > 0 ? (wl * s._L + wd * (100 - s._D)) / (wl + wd) : s._L;
  }
}
function snakeOrder(cls, g) {
  const list = group(cls, g);
  const b = S.settings.snakeBasis;
  if (b === 'learn') list.sort((x, y) => x.learnRank - y.learnRank);
  else if (b === 'diff') list.sort((x, y) => x.diffRank - y.diffRank);
  else list.sort((x, y) => (y._C - x._C) || (x.learnRank - y.learnRank));
  return list;
}
function genderRanks() {
  refreshScores();
  const m = {};
  for (const cls of oldClasses()) for (const g of GENDERS) snakeOrder(cls, g).forEach((s, i) => { m[s.id] = i + 1; });
  return m;
}

// ================= 엑셀 읽기 =================
const COLS = [
  ['name', /^(이름|성명|학생명|학생이름|학생성명)$/],
  ['gender', /^(성별|남녀|성)$/],
  ['oldClass', /^(반|학급|현재반|이전반|반명|학반)$/],
  ['grade', /^(학년|현재학년)$/],
  ['oldNo', /^(번호|출석번호|번|학생번호)$/],
  ['birth', /(생년월일|생일|출생)/],
  ['learnRank', /학습/],
  ['diffRank', /곤란/],
  ['note', /(특이|비고)/],
  ['nation', /국적/],
  ['phone', /(연락처|전화|휴대)/],
  ['memo', /메모/],
];
function mapHeader(row) {
  const map = {};
  row.forEach((cell, i) => {
    const h = String(cell == null ? '' : cell).replace(/\s|\(.*?\)/g, '');
    if (!h) return;
    for (const [key, re] of COLS) {
      if (map[key] != null) continue;
      if (key === 'oldClass' && /진급/.test(h)) continue;
      if (re.test(h)) { map[key] = i; break; }
    }
  });
  return map;
}
function normGender(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (/^(남|남자|m|male|1|boy)$/.test(s) || s.startsWith('남')) return '남';
  if (/^(여|여자|f|female|2|girl)$/.test(s) || s.startsWith('여')) return '여';
  return '';
}
function normBirth(v) {
  if (v == null || v === '') return '';
  const pad = n => String(n).padStart(2, '0');
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}.${pad(v.getMonth() + 1)}.${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  m = s.match(/^(\d{2,4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) { let y = m[1]; if (y.length === 2) y = '20' + y; return `${y}.${pad(m[2])}.${pad(m[3])}`; }
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) return `20${m[1]}.${m[2]}.${m[3]}`;
  return s;
}
// '다문화(베트남), 수줍음 많음' → tags + nation + memo
function parseNote(text) {
  let s = String(text == null ? '' : text);
  const tags = [];
  let nation = '';
  const rules = [
    ['생활지도', /생활\s*지도(\s*곤란)?|지도\s*곤란/],
    ['학습부진', /학습\s*부진|부진/],
    ['특수학급', /특수\s*(학급|교육)?|통합\s*학급/],
    ['쌍둥이', /쌍둥이|쌍생아/],
    ['다문화', /다문화(\s*\(([^)]*)\))?/],
    ['전출예정', /전출\s*예정|전출|정원\s*외/],
  ];
  for (const [key, re] of rules) {
    const m = s.match(re);
    if (m) {
      tags.push(key);
      if (key === '다문화' && m[2]) nation = m[2].trim();
      s = s.replace(re, ' ');
    }
  }
  const memo = s.replace(/\s+/g, ' ').replace(/(\s*[,/·;]\s*)+/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '');
  return { tags, nation, memo };
}
function rowsFromSheet(ws, sheetName, fileName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  let hi = -1, map = null;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const m = mapHeader(rows[i]);
    if (m.name != null) { hi = i; map = m; break; }
  }
  if (hi < 0) return { students: [], skipped: true };
  const guessCls = (() => {
    const m = String(sheetName).match(/(\d+)\s*반/) || String(sheetName).match(/^\s*(\d+)\s*$/) || String(fileName).match(/(\d+)\s*반/);
    return m ? +m[1] : null;
  })();
  const out = [];
  let auto = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[map.name] == null ? '' : r[map.name]).trim();
    if (!name || /^(이름|성명)$/.test(name)) continue;
    const get = k => (map[k] != null ? r[map[k]] : '');
    const note = parseNote(get('note'));
    const nation = String(get('nation') || '').trim() || note.nation;
    let oldClass = num(get('oldClass'));
    if (oldClass == null) oldClass = guessCls;
    auto++;
    out.push({
      id: uid(),
      oldClass,
      oldNo: num(get('oldNo')) || auto,
      name,
      gender: normGender(get('gender')),
      birth: normBirth(get('birth')),
      learnRank: num(get('learnRank')),
      diffRank: num(get('diffRank')),
      tags: note.tags,
      nation,
      phone: String(get('phone') || '').trim(),
      memo: [note.memo, String(get('memo') || '').trim()].filter(Boolean).join(' / '),
      newClass: null, snakeClass: null, locked: false,
    });
  }
  return { students: out, grade: map.grade != null ? num(rows[hi + 1] && rows[hi + 1][map.grade]) : null };
}

async function importFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  let incoming = [];
  const notes = [];
  for (const f of files) {
    try {
      if (/\.json$/i.test(f.name)) {
        const d = JSON.parse(await f.text());
        const st = d.state || d;
        if (!st.students) throw new Error('작업 파일 형식이 아닙니다');
        if (!S.students.length && files.length === 1) {
          adoptState(st);
          UI.history = [];
          toast(`작업 파일을 불러왔습니다 (${S.students.length}명)`);
          commit();
          return;
        }
        incoming.push(...st.students.map(s => Object.assign({}, s, { id: uid(), newClass: null, snakeClass: null, locked: false })));
        continue;
      }
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      let got = 0;
      for (const sn of wb.SheetNames) {
        const r = rowsFromSheet(wb.Sheets[sn], sn, f.name);
        if (r.grade && !S.students.length && !incoming.length) {
          S.settings.curGrade = r.grade;
          S.settings.newGrade = Math.min(6, r.grade + 1);
        }
        incoming.push(...r.students);
        got += r.students.length;
      }
      if (!got) notes.push(`${f.name}: '이름' 칸을 찾지 못했습니다`);
    } catch (e) {
      notes.push(`${f.name}: 읽지 못했습니다 (${e.message})`);
    }
  }
  // 반 번호 없는 학생
  const noCls = incoming.filter(s => s.oldClass == null);
  if (noCls.length) {
    const ans = prompt(`반 번호를 알 수 없는 학생이 ${noCls.length}명 있습니다.\n몇 반 학생인가요? (숫자)`, String((oldClasses().slice(-1)[0] || 0) + 1));
    const c = num(ans);
    if (c == null) { incoming = incoming.filter(s => s.oldClass != null); notes.push('반 번호가 없는 학생은 빼고 올렸습니다'); }
    else noCls.forEach(s => { s.oldClass = c; });
  }
  if (!incoming.length) { toast(notes.join('\n') || '올릴 학생이 없습니다', true); return; }

  const incomingCls = [...new Set(incoming.map(s => s.oldClass))].sort((a, b) => a - b);
  const exist = incomingCls.filter(c => S.students.some(s => s.oldClass === c));
  if (exist.length) {
    const ok = confirm(`${exist.join(', ')}반 자료가 이미 있습니다.\n새로 올린 자료로 바꿀까요?\n(취소를 누르면 이 반들은 건너뜁니다)`);
    if (ok) {
      const gone = new Set(S.students.filter(s => exist.includes(s.oldClass)).map(s => s.id));
      S.students = S.students.filter(s => !gone.has(s.id));
      S.relations = S.relations.filter(r => !gone.has(r.a) && !gone.has(r.b));
    } else incoming = incoming.filter(s => !exist.includes(s.oldClass));
  }
  for (const c of incomingCls) for (const g of GENDERS) for (const k of ['learnRank', 'diffRank']) delete S.defaulted[`${c}|${g}|${k}`];
  S.students.push(...incoming);
  normAll(true);
  const noG = incoming.filter(s => !s.gender).length;
  if (noG) notes.push(`성별을 알 수 없는 학생 ${noG}명 — 2단계에서 성별을 골라 주세요`);
  if (!UI.rankClass || !oldClasses().includes(UI.rankClass)) UI.rankClass = oldClasses()[0];
  toast(`${[...new Set(incoming.map(s => s.oldClass))].length}개 반, ${incoming.length}명을 올렸습니다` + (notes.length ? '\n' + notes.join('\n') : ''));
  commit();
}

// ================= 엑셀 쓰기 =================
const TEMPLATE_HEAD = ['반', '번호', '이름', '성별', '생년월일', '학습순위', '지도곤란순위', '특이사항', '메모(특이사항 내용)', '국적', '학부모연락처'];
const TEMPLATE_W = [6, 6, 12, 6, 12, 9, 12, 26, 28, 10, 16];
function setCols(ws, widths) { ws['!cols'] = widths.map(w => ({ wch: w })); }
function noteText(s, withMemo = true) {
  const t = TAGS.filter(t => s.tags.includes(t.key)).map(t => t.key === '다문화' && s.nation ? `다문화(${s.nation})` : t.key);
  if (withMemo && s.memo) t.push(s.memo);
  return t.join(', ');
}
function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEAD]);
  setCols(ws, TEMPLATE_W);
  XLSX.utils.book_append_sheet(wb, ws, '학급명단');
  const guide = XLSX.utils.aoa_to_sheet([
    ['반편성 도우미 — 명단 양식 안내'],
    [],
    ['칸', '필수', '설명'],
    ['반', '○', '현재 반 번호 (숫자). 시트 이름을 "1반"처럼 지으면 이 칸은 비워도 됩니다.'],
    ['번호', '○', '현재 출석 번호'],
    ['이름', '○', '외국인은 김나영(JIN NAYING)처럼 한국어 이름 뒤 괄호에 영문'],
    ['성별', '○', '남 / 여'],
    ['생년월일', '', '2016.03.05 또는 20160305'],
    ['학습순위', '', '같은 반·같은 성별 안에서 학습정도 순위 (1 = 가장 잘함). 비우면 앱에서 정합니다.'],
    ['지도곤란순위', '', '같은 반·같은 성별 안에서 지도곤란도 순위 (1 = 지도가 가장 어려움). 비우면 앱에서 정합니다.'],
    ['특이사항', '', '생활지도 / 학습부진 / 특수학급 / 쌍둥이 / 다문화 / 전출예정 (여러 개면 쉼표로)'],
    ['메모(특이사항 내용)', '', '서식의 특이사항(비고) 칸에 함께 적을 내용'],
    ['국적', '', '다문화 학생의 국적'],
    ['학부모연락처', '', '서식2 비고(학부모연락처)에 들어갑니다'],
    [],
    ['여러 반을 한 시트에 써도 되고, 반마다 시트를 나눠도 됩니다.'],
  ]);
  setCols(guide, [14, 6, 80]);
  XLSX.utils.book_append_sheet(wb, guide, '작성 안내');
  XLSX.writeFile(wb, '반편성 명단 양식.xlsx');
}
function classRows(cls) {
  return S.students.filter(s => s.oldClass === cls).sort((a, b) => a.oldNo - b.oldNo)
    .map(s => [s.oldClass, s.oldNo, s.name, s.gender, s.birth, s.learnRank, s.diffRank,
      TAGS.filter(t => s.tags.includes(t.key)).map(t => t.key).join(', '), s.memo, s.nation, s.phone]);
}
function exportClass(cls) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEAD, ...classRows(cls)]);
  setCols(ws, TEMPLATE_W);
  XLSX.utils.book_append_sheet(wb, ws, `${cls}반`);
  const name = `${S.settings.curYear} ${S.settings.curGrade}학년 ${cls}반 반편성 자료.xlsx`;
  writeWb(wb, name);
}
function writeWb(wb, name) {
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
}
function exportResult() {
  if (!S.students.length) return toast('먼저 명단을 올려 주세요', true);
  const set = S.settings;
  const head = ['진급학년', '진급반', '번호', '이름', '성별', '생년월일', '이전학년', '이전반', '이전번호', '남녀순위', '학습순위', '지도곤란순위', '특이사항', '학부모연락처'];
  const rk = genderRanks();
  const rows = [];
  for (const c of classList()) for (const r of newRoster(c)) {
    const s = r.s;
    rows.push([set.newGrade, className(c), r.no, s.name, s.gender, s.birth, set.curGrade, s.oldClass, s.oldNo, rk[s.id], s.learnRank, s.diffRank, noteText(s), s.phone]);
  }
  for (const s of S.students.filter(s => s.newClass == null)) rows.push([set.newGrade, '미배정', '', s.name, s.gender, s.birth, set.curGrade, s.oldClass, s.oldNo, rk[s.id], s.learnRank, s.diffRank, noteText(s), s.phone]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
  setCols(ws, [8, 7, 6, 12, 6, 12, 8, 7, 8, 8, 8, 11, 30, 16]);
  XLSX.utils.book_append_sheet(wb, ws, '진급반 기준');
  const rows2 = [...S.students].sort((a, b) => a.oldClass - b.oldClass || a.oldNo - b.oldNo)
    .map(s => [set.curGrade, s.oldClass, s.oldNo, s.name, s.gender, className(s.newClass) || '미배정', rk[s.id], noteText(s)]);
  const ws2 = XLSX.utils.aoa_to_sheet([['학년', '반', '번호', '이름', '성별', '진급반', '남녀순위', '특이사항'], ...rows2]);
  setCols(ws2, [6, 6, 6, 12, 6, 8, 8, 30]);
  XLSX.utils.book_append_sheet(wb, ws2, '이전반 기준');
  writeWb(wb, `${set.newYear}학년도 ${set.newGrade}학년 반편성 결과.xlsx`);
}
function saveWork() {
  const blob = new Blob([JSON.stringify({ app: '반편성 도우미', savedAt: new Date().toISOString(), state: S }, null, 1)], { type: 'application/json' });
  const d = new Date();
  const stamp = `${d.getMonth() + 1}월${d.getDate()}일 ${d.getHours()}시${String(d.getMinutes()).padStart(2, '0')}분`;
  download(blob, `반편성 작업 ${S.settings.curGrade}학년 (${stamp}).json`);
}
function download(blob, name) {
  if (typeof window.__captureDownload === 'function') { window.__captureDownload(blob, name); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast(`저장했습니다: ${name}`);
}

// ================= 예시 자료 =================
function makeSample() {
  let seed = 20261126;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const sur = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허남심노하곽성차주우구민유나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경'.slice(0, 30).split('');
  const boy = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '지후', '준우', '준서', '건우', '도현', '현우', '우진', '선우', '서진', '민재', '유준', '연우', '정우', '승우', '시윤', '이준', '은우', '지환', '승현', '윤우', '민성', '준혁', '태윤', '로운'];
  const girl = ['서연', '서윤', '지우', '서현', '민서', '하은', '하윤', '윤서', '지유', '지민', '채원', '수아', '지아', '다은', '은서', '예은', '수빈', '소율', '예린', '지원', '유나', '시은', '아린', '하린', '다인', '채은', '유진', '서아', '나은', '예서', '라희', '가온'];
  const used = new Set();
  const nameOf = g => { for (;;) { const n = pick(sur) + pick(g === '남' ? boy : girl); if (!used.has(n)) { used.add(n); return n; } } };
  const students = [];
  const sizes = [25, 24, 26, 25];
  sizes.forEach((size, ci) => {
    const cls = ci + 1;
    const list = [];
    const nb = Math.round(size / 2 + (rnd() - .5) * 3);
    for (let i = 0; i < size; i++) {
      const g = i < nb ? '남' : '여';
      const mm = 1 + Math.floor(rnd() * 12), dd = 1 + Math.floor(rnd() * 28);
      list.push({ name: nameOf(g), gender: g, birth: `2016.${String(mm).padStart(2, '0')}.${String(dd).padStart(2, '0')}` });
    }
    list.sort(byName);
    list.forEach((s, i) => {
      students.push(Object.assign(s, {
        id: uid(), oldClass: cls, oldNo: i + 1, learnRank: null, diffRank: null,
        tags: [], nation: '', phone: `010-0000-${String(cls * 100 + i + 1).padStart(4, '0')}`, memo: '',
        newClass: null, snakeClass: null, locked: false,
      }));
    });
  });
  // 순위: 같은 반·같은 성별 안에서 무작위
  for (let c = 1; c <= sizes.length; c++) for (const g of GENDERS) {
    const grp = students.filter(s => s.oldClass === c && s.gender === g);
    const a = grp.map((s, i) => [s, rnd()]).sort((x, y) => x[1] - y[1]);
    a.forEach(([s], i) => { s.learnRank = i + 1; });
    const b = grp.map(s => [s, rnd() + (s.learnRank > grp.length * .7 ? -.35 : 0)]).sort((x, y) => x[1] - y[1]);
    b.forEach(([s], i) => { s.diffRank = i + 1; });
  }
  // 특이사항
  const bySpec = (c, g, cond) => students.filter(s => s.oldClass === c && s.gender === g).sort(cond)[0];
  for (let c = 1; c <= sizes.length; c++) {
    bySpec(c, '남', (a, b) => a.diffRank - b.diffRank).tags.push('생활지도');
    if (c % 2) bySpec(c, '여', (a, b) => a.diffRank - b.diffRank).tags.push('생활지도');
    bySpec(c, c % 2 ? '남' : '여', (a, b) => b.learnRank - a.learnRank).tags.push('학습부진');
  }
  const sp = students.find(s => s.oldClass === 2 && s.gender === '남' && !s.tags.length);
  sp.tags.push('특수학급'); sp.memo = '특수학급 선생님과 협의 완료';
  const mc = students.find(s => s.oldClass === 3 && s.gender === '여' && !s.tags.length);
  mc.name = '김나영(JIN NAYING)'; mc.tags.push('다문화'); mc.nation = '중국';
  const mv = students.find(s => s.oldClass === 4 && !s.tags.length);
  mv.tags.push('전출예정'); mv.memo = '2월 이사 예정';
  // 쌍둥이(1반·2반) 와 동명이인(1반·3반)
  const t1 = students.find(s => s.oldClass === 1 && s.gender === '남' && !s.tags.length);
  const t2 = students.find(s => s.oldClass === 2 && s.gender === '여' && !s.tags.length);
  t2.name = t1.name.slice(0, 1) + '서윤';
  t1.tags.push('쌍둥이'); t2.tags.push('쌍둥이'); t1.memo = `쌍둥이(${t2.name})`; t2.memo = `쌍둥이(${t1.name})`;
  const d1 = students.find(s => s.oldClass === 1 && s.gender === '여' && !s.tags.length);
  const d3 = students.find(s => s.oldClass === 3 && s.gender === '여' && !s.tags.length && s !== mc);
  d3.name = d1.name;
  // 번호 다시 (가나다순)
  for (let c = 1; c <= sizes.length; c++) students.filter(s => s.oldClass === c).sort(byName).forEach((s, i) => { s.oldNo = i + 1; });
  return { students, twins: [t1.id, t2.id] };
}
function loadSample() {
  if (S.students.length && !confirm('지금 올린 명단을 지우고 예시 자료를 불러올까요?')) return;
  const keep = S.settings;
  S = defaultState();
  S.settings = Object.assign(S.settings, { curYear: keep.curYear, newYear: keep.newYear, curGrade: 4, newGrade: 5, numClasses: 4 });
  const { students, twins } = makeSample();
  S.students = students;
  S.teachers = { 1: '', 2: '', 3: '', 4: '' };
  S.relations.push({ id: uid(), a: twins[0], b: twins[1], type: 'apart', memo: '쌍둥이 — 학부모가 다른 반 희망' });
  normAll(true);
  UI.rankClass = 1;
  UI.history = [];
  toast('예시 자료(4개 반, 100명)를 불러왔습니다. 실제 학생이 아닙니다.');
  commit();
}

// ================= 배정 모델 =================
function buildModel() {
  refreshScores();
  const set = S.settings, N = set.numClasses;
  const st = S.students.filter(s => s.gender);
  const n = st.length;
  const idx = new Map(st.map((s, i) => [s.id, i]));
  const olds = oldClasses();
  const oIdx = new Map(olds.map((c, i) => [c, i]));
  const G = st.map(s => s.gender === '남' ? 0 : 1);
  const L = st.map(s => s._L), D = st.map(s => s._D);
  const T = st.map(s => BAL_TAGS.map(t => s.tags.includes(t) ? 1 : 0));
  const HI = st.map(s => s._D >= 75 ? 1 : 0), LO = st.map(s => s._L <= 25 ? 1 : 0);
  const O = st.map(s => oIdx.get(s.oldClass));
  const cls = st.map(s => (s.newClass != null && s.newClass < N) ? s.newClass : null);
  const snake = st.map(s => s.snakeClass);
  const locked = st.map(s => !!s.locked);
  const partners = st.map(() => []);
  const addPair = (a, b, type) => { if (a == null || b == null || a === b) return; partners[a].push([b, type]); partners[b].push([a, type]); };
  for (const r of S.relations) addPair(idx.get(r.a), idx.get(r.b), r.type);
  if (N >= 2) {
    const nm = {};
    st.forEach((s, i) => { const k = s.name.replace(/\(.*\)/, '').trim(); (nm[k] = nm[k] || []).push(i); });
    for (const k in nm) { const a = nm[k]; for (let x = 0; x < a.length; x++) for (let y = x + 1; y < a.length; y++) addPair(a[x], a[y], 'apart'); }
  }
  const meanL = [0, 0], meanD = [0, 0], gc = [0, 0];
  for (let i = 0; i < n; i++) { gc[G[i]]++; meanL[G[i]] += L[i]; meanD[G[i]] += D[i]; }
  for (const g of [0, 1]) { meanL[g] = gc[g] ? meanL[g] / gc[g] : 50; meanD[g] = gc[g] ? meanD[g] / gc[g] : 50; }
  const totT = BAL_TAGS.map((_, t) => T.reduce((a, r) => a + r[t], 0));
  const totHi = HI.reduce((a, b) => a + b, 0), totLo = LO.reduce((a, b) => a + b, 0);
  const totO = olds.map((_, o) => O.filter(x => x === o).length);
  const agg = Array.from({ length: N }, () => ({ cnt: [0, 0], sL: [0, 0], sD: [0, 0], tag: BAL_TAGS.map(() => 0), hi: 0, lo: 0, old: olds.map(() => 0) }));
  const add = (i, c, sign) => {
    if (c == null) return;
    const a = agg[c], g = G[i];
    a.cnt[g] += sign; a.sL[g] += sign * L[i]; a.sD[g] += sign * D[i];
    for (let t = 0; t < BAL_TAGS.length; t++) a.tag[t] += sign * T[i][t];
    a.hi += sign * HI[i]; a.lo += sign * LO[i]; a.old[O[i]] += sign;
  };
  for (let i = 0; i < n; i++) add(i, cls[i], 1);
  const wL = set.wLearn, wD = set.wDiff, wT = set.wTag, wO = set.wOld, wM = set.wMove;
  function classCost(c) {
    const a = agg[c];
    let cost = 0;
    for (const g of [0, 1]) if (a.cnt[g] > 0) {
      const dl = a.sL[g] / a.cnt[g] - meanL[g], dd = a.sD[g] / a.cnt[g] - meanD[g];
      cost += 0.1 * (wL * dl * dl + wD * dd * dd);
    }
    for (let t = 0; t < BAL_TAGS.length; t++) { const d = a.tag[t] - totT[t] / N; cost += 4 * wT * d * d; }
    const dh = a.hi - totHi / N, dlo = a.lo - totLo / N;
    cost += 3 * (wD * dh * dh + wL * dlo * dlo);
    for (let o = 0; o < olds.length; o++) { const d = a.old[o] - totO[o] / N; cost += wO * d * d; }
    return cost;
  }
  function pairCost(i) {
    let c = 0;
    for (const [j, type] of partners[i]) {
      if (cls[i] == null || cls[j] == null) continue;
      if (type === 'apart' && cls[i] === cls[j]) c += BIG;
      if (type === 'together' && cls[i] !== cls[j]) c += BIG;
    }
    return c;
  }
  const moveCost = i => (snake[i] != null && cls[i] !== snake[i]) ? 0.5 * wM : 0;
  function total() {
    let t = 0;
    for (let c = 0; c < N; c++) t += classCost(c);
    for (let i = 0; i < n; i++) t += pairCost(i) / 2 + moveCost(i);
    return t;
  }
  function setCls(i, c) { add(i, cls[i], -1); cls[i] = c; add(i, c, 1); }
  function local(i, j, a, b) {
    let t = classCost(a) + (b !== a ? classCost(b) : 0) + pairCost(i) + moveCost(i);
    if (j != null) t += pairCost(j) + moveCost(j);
    return t;
  }
  function swapDelta(i, j) {
    const a = cls[i], b = cls[j];
    const before = local(i, j, a, b);
    setCls(i, b); setCls(j, a);
    const after = local(i, j, a, b);
    setCls(i, a); setCls(j, b);
    return after - before;
  }
  function moveDelta(i, c) {
    const a = cls[i];
    const before = local(i, null, a, c);
    setCls(i, c);
    const after = local(i, null, a, c);
    setCls(i, a);
    return after - before;
  }
  function writeBack() { st.forEach((s, i) => { s.newClass = cls[i]; }); }
  return { st, n, N, G, cls, locked, agg, setCls, swapDelta, moveDelta, total, writeBack, partners };
}

// 인원 맞추기: 성별·학급 인원이 1명 넘게 차이 나지 않도록 옮긴다
function balanceSizes(M) {
  let moves = 0;
  for (let guard = 0; guard < 2000; guard++) {
    let best = null;
    const size = c => M.agg[c].cnt[0] + M.agg[c].cnt[1];
    for (let i = 0; i < M.n; i++) {
      if (M.locked[i] || M.cls[i] == null) continue;
      const a = M.cls[i], g = M.G[i];
      for (let c = 0; c < M.N; c++) {
        if (c === a) continue;
        const dm = 2 * (M.agg[c].cnt[g] - M.agg[a].cnt[g] + 1) + 2 * (size(c) - size(a) + 1);
        if (dm >= 0) continue;
        const dc = M.moveDelta(i, c);
        if (!best || dm < best.dm || (dm === best.dm && dc < best.dc)) best = { i, c, dm, dc };
      }
    }
    if (!best) break;
    M.setCls(best.i, best.c);
    moves++;
  }
  return moves;
}

function pushHistory(label) {
  UI.history.push({ label, a: S.students.map(s => [s.id, s.newClass, s.snakeClass]), msg: S.lastMsg });
  if (UI.history.length > 60) UI.history.shift();
}
function undo() {
  const h = UI.history.pop();
  if (!h) return toast('되돌릴 작업이 없습니다');
  const m = stuMap();
  for (const [id, nc, sc] of h.a) { const s = m.get(id); if (s) { s.newClass = nc; s.snakeClass = sc; } }
  S.lastMsg = h.msg;
  toast(`되돌렸습니다: ${h.label}`);
  commit();
}

function checkReady() {
  if (!S.students.length) { toast('먼저 1단계에서 명단을 올려 주세요', true); return false; }
  const noG = S.students.filter(s => !s.gender);
  if (noG.length) { toast(`성별이 비어 있는 학생이 있습니다: ${noG.slice(0, 5).map(s => s.name).join(', ')}`, true); return false; }
  return true;
}
function runSnake() {
  if (!checkReady()) return;
  normAll(false);
  refreshScores();
  pushHistory('ㄹ자 배치');
  const set = S.settings, N = set.numClasses;
  const counter = { 남: 0, 여: 0 };
  for (const cls of oldClasses()) {
    for (const g of GENDERS) {
      const list = snakeOrder(cls, g).filter(s => !s.locked);
      const start = g === '남' ? 0 : (N > 1 ? 1 : 0);
      list.forEach((s, k0) => {
        const k = set.snakeMode === 'continue' ? counter[g] + k0 : k0;
        const round = Math.floor(k / N), pos = k % N;
        const ix = round % 2 === 0 ? pos : N - 1 - pos;
        s.newClass = (ix + start) % N;
      });
      counter[g] += list.length;
    }
  }
  S.students.forEach(s => { s.snakeClass = s.newClass; });
  const M = buildModel();
  const moved = balanceSizes(M);
  M.writeBack();
  const basis = { combined: '학습정도·지도곤란도 종합', learn: '학습정도', diff: '지도곤란도' }[set.snakeBasis];
  S.lastMsg = `ㄹ자 배치 완료 (기준: ${basis}, ${set.snakeMode === 'continue' ? '반 사이 이어서' : '반마다 남1등 가반·여1등 나반'})` +
    (moved ? ` · 반별 인원을 맞추려고 ${moved}명을 옮겼습니다` : '') + '. 이어서 ② 재배분을 누르면 점수로 균형을 맞춥니다.';
  toast('ㄹ자 배치를 마쳤습니다');
  commit();
}
function runRebalance() {
  if (!checkReady()) return;
  normAll(false);
  pushHistory('점수로 재배분');
  const prev = new Map(S.students.map(s => [s.id, s.newClass]));
  const M = buildModel();
  // 배정 안 된 학생은 먼저 인원이 적은 반에
  for (let i = 0; i < M.n; i++) if (M.cls[i] == null) {
    let best = 0, bc = Infinity;
    for (let c = 0; c < M.N; c++) { const v = M.agg[c].cnt[M.G[i]] * 100 + M.agg[c].cnt[0] + M.agg[c].cnt[1]; if (v < bc) { bc = v; best = c; } }
    M.setCls(i, best);
  }
  balanceSizes(M);
  const before = M.total();
  let swaps = 0;
  for (let sweep = 0; sweep < 60; sweep++) {
    let improved = false;
    for (let i = 0; i < M.n; i++) {
      if (M.locked[i]) continue;
      let bj = -1, bd = -1e-6;
      for (let j = 0; j < M.n; j++) {
        if (j === i || M.locked[j] || M.G[j] !== M.G[i] || M.cls[j] === M.cls[i]) continue;
        const d = M.swapDelta(i, j);
        if (d < bd) { bd = d; bj = j; }
      }
      if (bj >= 0) { const a = M.cls[i]; M.setCls(i, M.cls[bj]); M.setCls(bj, a); swaps++; improved = true; }
    }
    if (!improved) break;
  }
  const after = M.total();
  M.writeBack();
  const movedN = S.students.filter(s => prev.get(s.id) !== s.newClass).length;
  const fmt = v => v >= BIG ? `${Math.round(v / BIG)}건 위반` : Math.round(v);
  S.lastMsg = `점수로 재배분 완료 · ${movedN}명의 반이 바뀌었습니다 (불균형 점수 ${fmt(before)} → ${fmt(after)}, 낮을수록 고름).` +
    (after >= BIG ? ' 지켜지지 않은 조건이 있습니다 — 아래 확인할 점을 보세요.' : '');
  toast('재배분을 마쳤습니다');
  commit();
}

// ================= 확인할 점 =================
function warnings() {
  const out = [];
  const N = S.settings.numClasses;
  const m = stuMap();
  const un = S.students.filter(s => s.newClass == null || s.newClass >= N);
  if (un.length && S.students.some(s => s.newClass != null)) out.push({ lv: 'err', t: `아직 반이 정해지지 않은 학생 ${un.length}명: ${un.slice(0, 8).map(s => s.name).join(', ')}${un.length > 8 ? ' …' : ''}` });
  if (N >= 2) {
    const seen = {};
    for (const s of S.students) if (s.newClass != null) { const k = s.newClass + '|' + s.name.replace(/\(.*\)/, '').trim(); (seen[k] = seen[k] || []).push(s); }
    for (const k in seen) if (seen[k].length > 1) out.push({ lv: 'err', t: `동명이인이 같은 반(${className(seen[k][0].newClass)}반)에 있습니다: ${seen[k].map(s => `${s.name}(${s.oldClass}반)`).join(', ')}`, ids: seen[k].map(s => s.id) });
  }
  for (const r of S.relations) {
    const a = m.get(r.a), b = m.get(r.b);
    if (!a || !b || a.newClass == null || b.newClass == null) continue;
    if (r.type === 'apart' && a.newClass === b.newClass) out.push({ lv: 'err', t: `'다른 반' 조건이 지켜지지 않았습니다: ${a.name} · ${b.name} (${className(a.newClass)}반)`, ids: [a.id, b.id] });
    if (r.type === 'together' && a.newClass !== b.newClass) out.push({ lv: 'err', t: `'같은 반' 조건이 지켜지지 않았습니다: ${a.name}(${className(a.newClass)}반) · ${b.name}(${className(b.newClass)}반)`, ids: [a.id, b.id] });
  }
  if (S.students.some(s => s.newClass != null)) {
    const sizes = classList().map(c => S.students.filter(s => s.newClass === c).length);
    if (Math.max(...sizes) - Math.min(...sizes) > 1) out.push({ lv: 'warn', t: `반별 인원 차이가 ${Math.max(...sizes) - Math.min(...sizes)}명입니다 (${sizes.map((v, c) => className(c) + v).join(' · ')})` });
    for (const g of GENDERS) {
      const gs = classList().map(c => S.students.filter(s => s.newClass === c && s.gender === g).length);
      if (Math.max(...gs) - Math.min(...gs) > 2) out.push({ lv: 'warn', t: `${g}학생 수가 반마다 ${Math.max(...gs) - Math.min(...gs)}명까지 차이 납니다 (${gs.map((v, c) => className(c) + v).join(' · ')})` });
    }
  }
  const twins = S.students.filter(s => s.tags.includes('쌍둥이') && !S.relations.some(r => r.a === s.id || r.b === s.id));
  if (twins.length) out.push({ lv: 'info', t: `쌍둥이 학생 ${twins.map(s => s.name).join(', ')} — 학부모 의견에 따라 '같은 반/다른 반' 관계를 정해 주세요`, act: 'relations' });
  return out;
}
function badIds() {
  const set = new Set();
  for (const w of warnings()) if (w.lv === 'err' && w.ids) w.ids.forEach(i => set.add(i));
  return set;
}

// ================= 서식 만들기 =================
function newRoster(c) {
  const list = S.students.filter(s => s.newClass === c);
  const leave = s => s.tags.includes('전출예정');
  const order = arr => S.settings.boysFirst
    ? [...arr.filter(s => s.gender === '남').sort(byName), ...arr.filter(s => s.gender !== '남').sort(byName)]
    : [...arr].sort(byName);
  return [...order(list.filter(s => !leave(s))), ...order(list.filter(leave))].map((s, i) => ({ s, no: i + 1 }));
}
function form1Blocks(cls, pageBreak) {
  const set = S.settings;
  const list = S.students.filter(s => s.oldClass === cls).sort((a, b) => a.oldNo - b.oldNo);
  const rk = genderRanks();
  const m = list.filter(s => s.gender === '남').length, f = list.filter(s => s.gender === '여').length;
  const rows = [
    { h: 9, cells: [
      { text: `${set.curYear}학년도  ${set.curGrade}학년 ${cls}반`, cs: 3, bold: true },
      { text: `(남:${m}명  여:${f}명  계:${list.length}명)`, cs: 2 },
      { text: `담임  ${S.teachers[cls] || '　　　'}  (인)`, cs: 2, align: 'right' }] },
    { h: 10, cells: ['번호', '이름', '성별', '생년월일', '남녀\n순위', '진급반', '특이사항\n(비고)'].map(t => ({ text: t, head: true })) },
    ...list.map(s => ({ h: 7.5, cells: [
      { text: s.oldNo }, { text: s.name }, { text: s.gender }, { text: s.birth }, { text: rk[s.id] || '' },
      { text: className(s.newClass) }, { text: noteText(s), align: 'left' }] })),
  ];
  return [
    { t: 'p', text: '【서식1】 반편성 기초자료', style: 'small', pageBreak },
    { t: 'p', text: '반편성 기초자료', style: 'title', align: 'center' },
    { t: 'table', cols: [12, 26, 14, 26, 16, 16, 60], headerRows: 2, rows },
  ];
}
function form2Blocks(c, pageBreak) {
  const set = S.settings;
  const ro = newRoster(c);
  const m = ro.filter(r => r.s.gender === '남').length, f = ro.length - m;
  const rows = [
    { h: 9, cells: [
      { text: `${set.newYear}학년도`, cs: 3, bold: true },
      { text: `(남:${m}명  여:${f}명  계:${ro.length}명)`, cs: 4 },
      { text: `${set.newGrade}학년 ${className(c)}반   담임　　　　(인)`, cs: 3, align: 'right' }] },
    { h: 7, cells: [
      { text: '학년', rs: 2, head: true }, { text: '반', rs: 2, head: true }, { text: '번호', rs: 2, head: true },
      { text: '이름', rs: 2, head: true }, { text: '성별', rs: 2, head: true }, { text: '이전학적', cs: 3, head: true },
      { text: '비고', head: true }, { text: '비고', head: true }] },
    { h: 7, cells: [{ text: '학년', head: true }, { text: '반', head: true }, { text: '번호', head: true }, { text: '(학부모연락처)', head: true }, { text: '특이사항', head: true }] },
    ...ro.map(({ s, no }) => ({ h: 7.5, cells: [
      { text: set.newGrade }, { text: className(c) }, { text: no }, { text: s.name }, { text: s.gender },
      { text: set.curGrade }, { text: s.oldClass }, { text: s.oldNo }, { text: s.phone }, { text: noteText(s), align: 'left' }] })),
  ];
  return [
    { t: 'p', text: '【서식2】 진급반 반편성 내역', style: 'small', pageBreak },
    { t: 'p', text: '반편성 내역 [진급반 기준]', style: 'title', align: 'center' },
    { t: 'table', cols: [10, 10, 10, 24, 11, 11, 10, 11, 30, 43], headerRows: 3, rows },
  ];
}
function form3Blocks(pageBreak) {
  const set = S.settings, N = set.numClasses, cl = classList();
  const w = +((170 - 46) / (N + 1)).toFixed(2);
  const cols = [20, 26, ...Array(N + 1).fill(w)];
  const inC = (c, f) => S.students.filter(s => s.newClass === c && f(s)).length;
  const rowOf = (label, f, extra) => {
    const v = cl.map(c => inC(c, f));
    return { h: 7.5, cells: [...extra, { text: label }, ...v.map(x => ({ text: x })), { text: v.reduce((a, b) => a + b, 0), bold: true }] };
  };
  const headRow = first => ({ h: 9, cells: [...first, ...cl.map(c => ({ text: className(c) + '반', head: true })), { text: '계', head: true }] });
  const tA = { t: 'table', cols, rows: [
    headRow([{ text: `( ${set.newGrade} )학년`, head: true }, { text: `${set.newYear}학년도`, head: true }]),
    rowOf('남', s => s.gender === '남', [{ text: '총계', rs: 3, bold: true }]),
    rowOf('여', s => s.gender === '여', []),
    rowOf('계', () => true, []),
  ] };
  const tagRows = TAGS.map((t, i) => rowOf(t.label, s => s.tags.includes(t.key), i === 0 ? [{ text: '특이\n사항', rs: TAGS.length + 1, bold: true }] : []));
  const tagSum = cl.map(c => TAGS.reduce((a, t) => a + inC(c, s => s.tags.includes(t.key)), 0));
  tagRows.push({ h: 7.5, cells: [{ text: '계' }, ...tagSum.map(x => ({ text: x })), { text: tagSum.reduce((a, b) => a + b, 0), bold: true }] });
  const tB = { t: 'table', cols, rows: [headRow([{ text: '구분', cs: 2, head: true }]), ...tagRows] };
  const cRows = [headRow([{ text: '진급반\n이전반', cs: 2, head: true }])];
  for (const o of oldClasses()) {
    cRows.push(rowOf('남', s => s.oldClass === o && s.gender === '남', [{ text: `${o}반`, rs: 3, bold: true }]));
    cRows.push(rowOf('여', s => s.oldClass === o && s.gender === '여', []));
    cRows.push(rowOf('계', s => s.oldClass === o, []));
  }
  const tC = { t: 'table', cols, headerRows: 1, rows: cRows };
  return [
    { t: 'p', text: `【서식3】 ${set.newYear}학년도 반편성 현황`, style: 'small', pageBreak },
    { t: 'p', text: `${set.newYear}학년도 반편성 현황`, style: 'title', align: 'center' },
    { t: 'table', cols: [56, 57, 57], rows: [{ h: 10, cells: [
      { text: `${set.newYear}학년도`, bold: true }, { text: `( ${set.newGrade} )학년` }, { text: `학년부장  ${set.leaderName || '　　　'}  (인)`, align: 'right' }] }] },
    { t: 'p', text: '' }, tA, { t: 'p', text: '' }, tB, { t: 'p', text: '' }, tC,
  ];
}
function blocksFor(kind) {
  if (kind === 'f1') return oldClasses().flatMap((c, i) => form1Blocks(c, i > 0));
  if (kind === 'f2') return classList().flatMap((c, i) => form2Blocks(c, i > 0));
  if (kind === 'f3') return form3Blocks(false);
  return [...blocksFor('f1'), ...classList().flatMap(c => form2Blocks(c, true)), ...form3Blocks(true)];
}
async function saveHwpx(kind) {
  if (!S.students.length) return toast('먼저 명단을 올려 주세요', true);
  const set = S.settings;
  const un = S.students.filter(s => s.newClass == null).length;
  if (un && kind !== 'f1' && !confirm(`아직 반이 정해지지 않은 학생이 ${un}명 있습니다. 그래도 저장할까요?`)) return;
  const names = {
    f1: `${set.curYear}학년도 ${set.curGrade}학년 반편성 기초자료(서식1).hwpx`,
    f2: `${set.newYear}학년도 ${set.newGrade}학년 반편성 내역(서식2).hwpx`,
    f3: `${set.newYear}학년도 ${set.newGrade}학년 반편성 현황(서식3).hwpx`,
    all: `${set.newYear}학년도 ${set.newGrade}학년 반편성 서식1-3.hwpx`,
  };
  try {
    const blob = await DocWriter.toHwpxBlob(blocksFor(kind), names[kind].replace(/\.hwpx$/, ''));
    download(blob, names[kind]);
  } catch (e) {
    console.error(e);
    toast('한글 파일을 만들지 못했습니다: ' + e.message, true);
  }
}

// ================= 그리기 =================
function render() {
  const set = S.settings;
  $('#subline').textContent = `${set.curYear}학년도 ${set.curGrade}학년 → ${set.newYear}학년도 ${set.newGrade}학년 · ${set.numClasses}학급` + (S.students.length ? ` · ${S.students.length}명` : '');
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  $$('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + UI.tab));
  ({ roster: renderRoster, rank: renderRank, board: renderBoard, save: renderSave })[UI.tab]();
}
const sel = (opts, v) => opts.map(([val, label]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(label)}</option>`).join('');
const tagBadges = s => TAGS.filter(t => s.tags.includes(t.key)).map(t => `<span class="tg ${t.cls}" title="${esc(t.key === '다문화' && s.nation ? `다문화(${s.nation})` : t.label)}">${t.short}</span>`).join('');

function renderRoster() {
  const set = S.settings;
  const grades = [1, 2, 3, 4, 5, 6].map(g => [g, g + '학년']);
  const olds = oldClasses();
  const rows = olds.map(c => {
    const st = S.students.filter(s => s.oldClass === c);
    const m = st.filter(s => s.gender === '남').length, f = st.filter(s => s.gender === '여').length, x = st.length - m - f;
    const pend = GENDERS.flatMap(g => ['learnRank', 'diffRank'].filter(k => S.defaulted[`${c}|${g}|${k}`] && group(c, g).length > 1));
    const tagN = st.filter(s => s.tags.length).length;
    return `<tr>
      <td><b>${c}반</b></td>
      <td><input data-teacher="${c}" value="${esc(S.teachers[c] || '')}" placeholder="담임 이름" style="max-width:130px"></td>
      <td class="num">${m}</td><td class="num">${f}</td><td class="num"><b>${st.length}</b>${x ? ` <span class="badge b-warn">성별 ${x}명 없음</span>` : ''}</td>
      <td>${pend.length ? `<span class="badge b-warn">순위 정하기 필요</span>` : `<span class="badge b-ok">순위 있음</span>`}</td>
      <td class="num">${tagN}명</td>
      <td><div class="btn-row" style="justify-content:center">
        <button data-act="goto-rank" data-cls="${c}">순위·특이사항</button>
        <button data-act="export-class" data-cls="${c}" title="담임선생님이 학년부장에게 보낼 파일">학급 자료 내보내기</button>
        <button class="danger" data-act="del-class" data-cls="${c}">지우기</button></div></td></tr>`;
  }).join('');
  const tm = S.students.filter(s => s.gender === '남').length, tf = S.students.filter(s => s.gender === '여').length;
  $('#tab-roster').innerHTML = `
  <div class="grid2">
    <div class="panel">
      <h2>1. 기본 설정</h2>
      <div class="form-grid">
        <label>현재 학년도<input type="number" data-set="curYear" value="${set.curYear}"></label>
        <label>현재 학년<select data-set="curGrade">${sel(grades, set.curGrade)}</select></label>
        <label>진급 학년도<input type="number" data-set="newYear" value="${set.newYear}"></label>
        <label>진급 학년<select data-set="newGrade">${sel(grades, set.newGrade)}</select></label>
        <label>진급 학급 수 (설정한 학급 수)<input type="number" min="1" max="14" data-set="numClasses" value="${set.numClasses}"></label>
        <label>진급반 번호 매기기<select data-set="boysFirst">${sel([[true, '남자 앞번호, 여자 뒷번호'], [false, '남녀 구분 없이 가나다순']], set.boysFirst)}</select></label>
      </div>
      <div class="hint">진급 학급 이름: <span class="chips" style="display:inline-flex">${classList().map(c => `<span class="chip">${className(c)}반</span>`).join('')}</span></div>
      <div class="hint">전출예정 학생은 진급반 명단의 맨 아래 번호로 들어갑니다.</div>
    </div>
    <div class="panel">
      <h2>2. 학급 명단 엑셀 올리기</h2>
      <div class="drop" id="dropzone">
        <b>엑셀 파일을 여기로 끌어다 놓으세요</b>
        여러 반 파일을 한꺼번에 올려도 됩니다 · <button class="primary" data-act="pick-files">파일 고르기</button>
      </div>
      <p class="hint">담임선생님들이 <b>‘학급 자료 내보내기’</b>로 보낸 엑셀 파일들도 여기에 한꺼번에 올리면 학년 전체로 합쳐집니다. 저장해 둔 작업 파일(.json)도 올릴 수 있습니다.</p>
      <div class="btn-row">
        <button data-act="template">빈 명단 양식 내려받기</button>
        <button data-act="sample">예시 자료로 연습하기</button>
      </div>
      <details style="margin-top:10px"><summary class="hint" style="cursor:pointer">엑셀에 들어갈 칸 보기</summary>
        <table class="t" style="margin-top:6px"><tr><th>반</th><th>번호</th><th>이름</th><th>성별</th><th>생년월일</th><th>학습순위</th><th>지도곤란순위</th><th>특이사항</th><th>메모</th><th>국적</th><th>학부모연락처</th></tr>
        <tr><td>1</td><td>3</td><td>김민준</td><td>남</td><td>2016.03.05</td><td>2</td><td>10</td><td>생활지도</td><td>쉬는 시간 다툼 잦음</td><td></td><td>010-…</td></tr></table>
        <p class="hint">반·번호·이름·성별만 있어도 됩니다. 칸 순서는 달라도 되고, 첫 줄(제목 줄)의 이름으로 칸을 찾습니다. 나이스에서 내려받은 명단도 ‘성명/성별/생년월일’ 칸을 알아봅니다.</p>
      </details>
    </div>
  </div>
  <div class="panel">
    <div class="btn-row" style="margin-bottom:10px"><h2 style="margin:0">3. 불러온 학급</h2><span class="spacer"></span>
      ${S.students.length ? `<button class="danger" data-act="reset-all">모두 지우고 새로 시작</button>` : ''}</div>
    ${olds.length ? `<div class="scroll"><table class="t"><thead><tr><th>반</th><th>담임 (서식1 ‘(인)’ 칸)</th><th>남</th><th>여</th><th>계</th><th>순위</th><th>특이사항</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>합계</th><th></th><th>${tm}</th><th>${tf}</th><th>${S.students.length}</th><th></th><th></th><th></th></tr></tfoot></table></div>
      <p class="hint">반 평균 인원: ${set.numClasses}학급 기준 ${(S.students.length / set.numClasses).toFixed(1)}명 (남 ${(tm / set.numClasses).toFixed(1)}, 여 ${(tf / set.numClasses).toFixed(1)})</p>`
      : `<div class="empty"><b>아직 올린 명단이 없습니다</b>엑셀 명단을 올리거나 ‘예시 자료로 연습하기’를 눌러 보세요.<br>입력한 자료는 이 컴퓨터의 브라우저에만 저장되고 인터넷으로 보내지지 않습니다.</div>`}
  </div>`;
  bindDrop();
}

function renderRank() {
  const olds = oldClasses();
  const el = $('#tab-rank');
  if (!olds.length) { el.innerHTML = `<div class="panel"><div class="empty"><b>먼저 1단계에서 명단을 올려 주세요</b></div></div>`; return; }
  if (!olds.includes(UI.rankClass)) UI.rankClass = olds[0];
  const c = UI.rankClass;
  const done = cl => !GENDERS.some(g => group(cl, g).length > 1 && ['learnRank', 'diffRank'].some(k => S.defaulted[`${cl}|${g}|${k}`]));
  const pills = olds.map(cl => `<button class="${cl === c ? 'on' : ''}" data-act="rank-class" data-cls="${cl}">${cl}반${done(cl) ? '<span class="ck">✓</span>' : ''}</button>`).join('');
  const list = (g, key) => group(c, g).sort((a, b) => a[key] - b[key]).map(s => `
    <li draggable="true" data-id="${s.id}"><span class="grip">⋮⋮</span><b class="rk">${s[key]}</b><span class="nm">${esc(s.name)}</span>${tagBadges(s)}<span class="no">${s.oldNo}번</span>
    <span class="mv"><button data-act="rk-move" data-dir="-1" data-key="${key}" data-id="${s.id}" title="한 칸 위로">▲</button><button data-act="rk-move" data-dir="1" data-key="${key}" data-id="${s.id}" title="한 칸 아래로">▼</button></span></li>`).join('');
  const panel = g => {
    const n = group(c, g).length;
    const dflt = k => S.defaulted[`${c}|${g}|${k}`] && n > 1 ? `<div class="notice">엑셀에 순위가 없어 번호순으로 임시로 놓았습니다. 끌어서 순위를 정해 주세요. <button class="ghost" data-act="rk-confirm" data-g="${g}" data-key="${k}">이대로 확정</button></div>` : '';
    return `<div class="rank-gender ${g === '남' ? 'm' : 'f'}">
      <h3><span class="badge ${g === '남' ? 'b-m' : 'b-f'}">${g}학생</span> ${n}명</h3>
      ${n ? `<div class="rank-lists">
        <div><h4>학습정도 순위<small>1위 = 학습정도가 가장 높음</small></h4>${dflt('learnRank')}<ol class="rlist" data-group="${c}|${g}|learnRank">${list(g, 'learnRank')}</ol></div>
        <div><h4>지도곤란도 순위<small>1위 = 지도가 가장 어려움</small></h4>${dflt('diffRank')}<ol class="rlist" data-group="${c}|${g}|diffRank">${list(g, 'diffRank')}</ol></div>
      </div>` : '<div class="hint">학생이 없습니다</div>'}</div>`;
  };
  const st = S.students.filter(s => s.oldClass === c).sort((a, b) => a.oldNo - b.oldNo);
  const rowsHtml = st.map(s => `<tr data-id="${s.id}">
    <td style="width:56px"><input type="number" data-f="oldNo" value="${s.oldNo}"></td>
    <td class="l" style="min-width:110px"><input data-f="name" value="${esc(s.name)}"></td>
    <td style="width:66px"><select data-f="gender">${sel([['', '?'], ['남', '남'], ['여', '여']], s.gender)}</select></td>
    <td style="width:110px"><input data-f="birth" value="${esc(s.birth)}" placeholder="2016.03.05"></td>
    <td style="width:62px"><input type="number" min="1" data-f="learnRank" value="${s.learnRank || ''}" title="학습정도 순위"></td>
    <td style="width:62px"><input type="number" min="1" data-f="diffRank" value="${s.diffRank || ''}" title="지도곤란도 순위"></td>
    <td><div class="tagtoggle">${TAGS.map(t => `<button class="${s.tags.includes(t.key) ? 'on ' + t.cls : ''}" data-act="tag" data-tag="${t.key}" data-id="${s.id}">${t.label}</button>`).join('')}</div></td>
    <td style="width:90px">${s.tags.includes('다문화') ? `<input data-f="nation" value="${esc(s.nation)}" placeholder="국적">` : ''}</td>
    <td class="l" style="min-width:150px"><input data-f="memo" value="${esc(s.memo)}" placeholder="특이사항 내용"></td>
    <td style="width:130px"><input data-f="phone" value="${esc(s.phone)}" placeholder="010-"></td>
    <td><button class="ghost danger" data-act="del-student" data-id="${s.id}" title="학생 빼기">✕</button></td></tr>`).join('');
  el.innerHTML = `
  <div class="panel">
    <div class="pills">${pills}</div>
    <div class="btn-row" style="margin-bottom:10px"><h2 style="margin:0">${c}반 순위 정하기</h2><span class="spacer"></span>
      <span class="hint">남학생·여학생을 따로, 이름을 끌어서 순서를 바꾸세요.</span>
      <button data-act="export-class" data-cls="${c}">학급 자료 내보내기 (학년부장에게 보낼 엑셀)</button></div>
    <div class="rank-grid">${panel('남')}${panel('여')}</div>
  </div>
  <div class="panel">
    <div class="btn-row" style="margin-bottom:8px"><h2 style="margin:0">${c}반 학생 정보 · 특이사항</h2><span class="spacer"></span>
      <button data-act="add-student" data-cls="${c}">+ 학생 추가</button></div>
    <p class="hint">특이사항 단추를 눌러 켜고 끕니다. ‘특이사항 내용’에 적은 글은 서식의 특이사항(비고) 칸에 함께 들어갑니다.</p>
    <div class="scroll"><table class="t"><thead><tr><th>번호</th><th class="l">이름</th><th>성별</th><th>생년월일</th><th>학습<br>순위</th><th>곤란<br>순위</th><th>특이사항</th><th>국적</th><th class="l">특이사항 내용</th><th>학부모 연락처</th><th></th></tr></thead>
    <tbody>${rowsHtml}</tbody></table></div>
  </div>`;
  bindRankDnD();
}

function renderBoard() {
  const el = $('#tab-board');
  if (!S.students.length) { el.innerHTML = `<div class="panel"><div class="empty"><b>먼저 1단계에서 명단을 올려 주세요</b></div></div>`; return; }
  refreshScores();
  const set = S.settings, N = set.numClasses, cl = classList();
  const assigned = S.students.some(s => s.newClass != null);
  const slider = (key, label) => `<label>${label}<span style="display:flex;gap:4px;align-items:center"><input type="range" min="0" max="5" step="1" data-set="${key}" value="${set[key]}"><output>${set[key]}</output></span></label>`;
  const bad = badIds();
  const rk = genderRanks();
  const sorter = {
    name: (a, b) => (a.gender === b.gender ? byName(a, b) : a.gender === '남' ? -1 : 1),
    learn: (a, b) => (a.gender === b.gender ? b._L - a._L : a.gender === '남' ? -1 : 1),
    diff: (a, b) => (a.gender === b.gender ? b._D - a._D : a.gender === '남' ? -1 : 1),
    old: (a, b) => a.oldClass - b.oldClass || a.oldNo - b.oldNo,
  }[UI.boardSort];
  const card = s => `<div class="card ${s.gender === '여' ? 'f' : ''} ${bad.has(s.id) ? 'bad' : ''}" draggable="true" data-id="${s.id}" title="${esc(s.name)} · ${s.oldClass}반 ${s.oldNo}번 · 남녀순위 ${rk[s.id]} · 학습 ${s.learnRank}위 · 곤란 ${s.diffRank}위${s.memo ? '\n' + esc(s.memo) : ''}">
      <div class="r1"><span class="cn">${esc(s.name)}</span>${s.locked ? '<span class="pin" title="고정됨 — 재배분 때 옮기지 않음">📌</span>' : ''}<span class="co">${s.oldClass}-${s.oldNo}</span></div>
      <div class="r2"><span class="mini l" title="학습점수 ${s._L}">학<i><b style="width:${s._L}%"></b></i></span><span class="mini d" title="곤란점수 ${s._D}">곤<i><b style="width:${s._D}%"></b></i></span>${tagBadges(s)}${s.snakeClass != null && s.newClass !== s.snakeClass ? `<span class="moved" title="ㄹ자 배치 때는 ${className(s.snakeClass)}반이었고 지금은 ${className(s.newClass) || '미배정'}">${className(s.snakeClass)}→${className(s.newClass) || '?'}</span>` : ''}</div></div>`;
  const stat = list => {
    const avg = (arr, k) => arr.length ? Math.round(arr.reduce((a, s) => a + s[k], 0) / arr.length) : '-';
    return { m: list.filter(s => s.gender === '남').length, f: list.filter(s => s.gender === '여').length, L: avg(list, '_L'), D: avg(list, '_D') };
  };
  const col = (c, list, label, extraCls) => {
    const t = stat(list);
    return `<div class="col ${extraCls || ''}" data-cls="${c == null ? '' : c}">
      <div class="col-h"><div class="nm2">${label} <span class="cnt">${list.length}명</span></div>
      <div class="cnt"><span class="badge b-m">남 ${t.m}</span> <span class="badge b-f">여 ${t.f}</span></div>
      <div class="stat">학습 평균 ${t.L} · 곤란 평균 ${t.D}</div>
      <div class="stat">${TAGS.map(tg => { const k = list.filter(s => s.tags.includes(tg.key)).length; return k ? `<span class="tg ${tg.cls}">${tg.short}${k}</span>` : ''; }).join(' ')}</div></div>
      ${list.sort(sorter).map(card).join('')}</div>`;
  };
  const un = S.students.filter(s => s.newClass == null || s.newClass >= N);
  const cols = (un.length ? [col(null, un, '미배정', 'unassigned')] : []).concat(cl.map(c => col(c, S.students.filter(s => s.newClass === c), className(c) + '반')));

  // 균형 표
  const allStat = stat(S.students);
  const meanG = g => { const a = S.students.filter(s => s.gender === g); return { L: a.length ? a.reduce((x, s) => x + s._L, 0) / a.length : 50, D: a.length ? a.reduce((x, s) => x + s._D, 0) / a.length : 50 }; };
  const mg = { 남: meanG('남'), 여: meanG('여') };
  const cellAvg = (list, k, g) => {
    const a = list.filter(s => s.gender === g);
    if (!a.length) return '<td>-</td>';
    const v = a.reduce((x, s) => x + s[k], 0) / a.length;
    const d = v - mg[g][k === '_L' ? 'L' : 'D'];
    return `<td class="num ${d > 8 ? 'hi' : d < -8 ? 'lo' : ''}">${Math.round(v)}</td>`;
  };
  const olds = oldClasses();
  const balRows = cl.map(c => {
    const list = S.students.filter(s => s.newClass === c);
    return `<tr><td><b>${className(c)}반</b></td><td class="num">${list.filter(s => s.gender === '남').length}</td><td class="num">${list.filter(s => s.gender === '여').length}</td><td class="num"><b>${list.length}</b></td>
      ${cellAvg(list, '_L', '남')}${cellAvg(list, '_L', '여')}${cellAvg(list, '_D', '남')}${cellAvg(list, '_D', '여')}
      ${BAL_TAGS.map(t => `<td class="num">${list.filter(s => s.tags.includes(t)).length || ''}</td>`).join('')}
      <td class="l" style="font-size:12px">${olds.map(o => `${o}반 ${list.filter(s => s.oldClass === o).length}`).join(' · ')}</td></tr>`;
  }).join('');
  const ws = warnings();
  el.innerHTML = `
  <div class="panel">
    <div class="toolbar">
      <div class="step"><b>① ㄹ자 배치</b>
        <div class="row">
          <label>순서 기준<select data-set="snakeBasis">${sel([['combined', '학습정도·지도곤란도 종합'], ['learn', '학습정도 순위'], ['diff', '지도곤란도 순위']], set.snakeBasis)}</select></label>
          <label>배치 방식<select data-set="snakeMode">${sel([['continue', '반 사이 이어서 (인원 고르게)'], ['reset', '반마다 남1등 가반·여1등 나반']], set.snakeMode)}</select></label>
        </div>
        <div class="row"><button class="primary" data-act="snake">ㄹ자 배치하기</button><span class="hint">남·여 따로, ${N}개 반에 가→${className(N - 1)}, ${className(N - 1)}→가 순서로</span></div>
      </div>
      <div class="step"><b>② 점수로 재배분</b>
        <div class="sliders">${slider('wLearn', '학습정도 고르게')}${slider('wDiff', '지도곤란도 고르게')}${slider('wTag', '특이사항 고르게')}${slider('wOld', '이전반 고르게')}${slider('wMove', 'ㄹ자 결과 유지')}</div>
        <div class="row"><button class="primary" data-act="rebalance" ${assigned ? '' : 'disabled'}>점수로 재배분하기</button><span class="hint">같은 성별끼리 맞바꿔서 반별 점수를 고르게 합니다. 📌고정한 학생은 옮기지 않습니다.</span></div>
      </div>
      <div class="step"><b>③ 교사 조정</b>
        <div class="hint" style="margin:0">학생 카드를 다른 반으로 끌어다 놓으면 옮겨지고, 다른 학생 카드 위에 놓으면 서로 바뀝니다. 카드를 누르면 자세히 볼 수 있습니다.</div>
        <div class="row">
          <button data-act="relations">학생 관계 설정 (${S.relations.length})</button>
          <button data-act="undo" ${UI.history.length ? '' : 'disabled'}>↶ 되돌리기${UI.history.length ? ` (${UI.history.length})` : ''}</button>
          <label>카드 정렬<select data-ui="boardSort">${sel([['name', '남→여, 이름순'], ['learn', '남→여, 학습점수순'], ['diff', '남→여, 곤란점수순'], ['old', '이전반·번호순']], UI.boardSort)}</select></label>
        </div>
      </div>
    </div>
    ${S.lastMsg ? `<div class="lastmsg">${esc(S.lastMsg)}</div>` : ''}
  </div>
  ${ws.length ? `<div class="panel"><h3>확인할 점</h3><div class="warns">${ws.map(w => `<div class="notice ${w.lv === 'err' ? 'err' : w.lv === 'info' ? 'info' : ''}">${esc(w.t)}${w.act ? ` <button data-act="${w.act}">관계 설정</button>` : ''}</div>`).join('')}</div></div>` : ''}
  ${assigned ? `<div class="panel"><h3>반별 균형</h3>
    <div class="scroll"><table class="t balance"><thead><tr><th>반</th><th>남</th><th>여</th><th>계</th><th>학습<br>평균(남)</th><th>학습<br>평균(여)</th><th>곤란<br>평균(남)</th><th>곤란<br>평균(여)</th>${BAL_TAGS.map(t => `<th>${TAG[t].label.replace(' 곤란', '')}</th>`).join('')}<th class="l">이전반에서 온 학생</th></tr></thead>
    <tbody>${balRows}</tbody></table></div>
    <p class="hint">학습·곤란 점수는 같은 반·같은 성별 안의 순위를 0~100으로 바꾼 값입니다 (1위 = 100). 학년 평균보다 8점 넘게 높으면 <span class="badge" style="background:#fff0e6;color:#a53a12">주황</span>, 낮으면 <span class="badge" style="background:#eef3ff;color:#1f4fae">파랑</span>으로 표시합니다. 전체 평균: 학습 ${allStat.L} · 곤란 ${allStat.D}</p></div>` : ''}
  ${assigned ? `<div class="board" style="--n:${cols.length}">${cols.join('')}</div>`
    : `<div class="panel"><div class="empty"><b>아직 반을 나누지 않았습니다</b>순위를 다 정했으면 위의 ‘① ㄹ자 배치하기’를 눌러 시작하세요.<br>학생 ${S.students.length}명 · ${N}개 반</div></div>`}`;
  bindBoardDnD();
}

function renderSave() {
  const set = S.settings;
  const el = $('#tab-save');
  const has = S.students.length > 0;
  const kinds = [['f1', '서식1 반편성 기초자료'], ['f2', '서식2 반편성 내역'], ['f3', '서식3 반편성 현황']];
  el.innerHTML = `
  <div class="panel">
    <h2>서식 저장 — 학급편성 계획 붙임 서식</h2>
    <div class="save-grid">
      <button data-act="hwp-f1" ${has ? '' : 'disabled'}><b>【서식1】 반편성 기초자료</b><span>이전반(현재 반)마다 한 쪽 · 남녀순위·진급반·특이사항</span></button>
      <button data-act="hwp-f2" ${has ? '' : 'disabled'}><b>【서식2】 반편성 내역</b><span>진급반마다 한 쪽 · ${set.boysFirst ? '남자 앞번호, 여자 뒷번호' : '가나다순 번호'} · 이전학적·연락처</span></button>
      <button data-act="hwp-f3" ${has ? '' : 'disabled'}><b>【서식3】 반편성 현황</b><span>학년 1부 · 남녀 총계, 특이사항, 이전반별 인원</span></button>
      <button class="primary" data-act="hwp-all" ${has ? '' : 'disabled'}><b>서식1·2·3 한 파일로</b><span style="color:#dfe8fb">한글(.hwpx) 한 파일에 모두</span></button>
    </div>
    <div class="btn-row">
      <label class="lbl" style="flex-direction:row;align-items:center">서식3 학년부장 이름 <input data-set="leaderName" value="${esc(set.leaderName)}" placeholder="이름" style="width:120px"></label>
      <span class="spacer"></span>
      <button data-act="xlsx-result" ${has ? '' : 'disabled'}>반편성 결과 명단 (엑셀)</button>
      <button data-act="work-save" ${has ? '' : 'disabled'}>작업 파일 저장</button>
      <button data-act="work-load">작업 파일 불러오기</button>
      <button data-act="print" ${has ? '' : 'disabled'}>🖨 인쇄</button>
    </div>
    <p class="hint">한글 파일은 .hwpx 형식입니다. 한글 2014 이상에서 바로 열립니다. 서식1의 담임 이름은 1단계 ‘불러온 학급’ 표에서 적을 수 있습니다.</p>
  </div>
  <div class="panel">
    <div class="seg">${kinds.map(([k, l]) => `<button class="${UI.preview === k ? 'on' : ''}" data-act="preview" data-kind="${k}">${l}</button>`).join('')}</div>
    <div class="preview">${has ? DocWriter.toHtml(blocksFor(UI.preview)) : '<div class="empty"><b>미리볼 자료가 없습니다</b></div>'}</div>
  </div>`;
}

// ================= 끌어 놓기 =================
function bindDrop() {
  const dz = $('#dropzone');
  if (!dz) return;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); importFiles(e.dataTransfer.files); });
}
function bindRankDnD() {
  let dragId = null, dragGroup = null;
  $$('ol.rlist').forEach(ol => {
    ol.addEventListener('dragstart', e => {
      const li = e.target.closest('li'); if (!li) return;
      dragId = li.dataset.id; dragGroup = ol.dataset.group;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    ol.addEventListener('dragend', e => { const li = e.target.closest('li'); if (li) li.classList.remove('dragging'); clearMarks(); });
    ol.addEventListener('dragover', e => {
      if (ol.dataset.group !== dragGroup) return;
      e.preventDefault();
      const li = e.target.closest('li');
      clearMarks();
      if (!li || li.dataset.id === dragId) return;
      const r = li.getBoundingClientRect();
      li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    ol.addEventListener('drop', e => {
      if (ol.dataset.group !== dragGroup) return;
      e.preventDefault();
      const li = e.target.closest('li');
      const ids = $$('li', ol).map(x => x.dataset.id).filter(id => id !== dragId);
      let at = ids.length;
      if (li && li.dataset.id !== dragId) {
        const r = li.getBoundingClientRect();
        at = ids.indexOf(li.dataset.id) + (e.clientY < r.top + r.height / 2 ? 0 : 1);
      }
      ids.splice(at, 0, dragId);
      applyOrder(ol.dataset.group, ids);
    });
  });
  function clearMarks() { $$('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); }
}
function applyOrder(groupKey, ids) {
  const key = groupKey.split('|')[2];
  const m = stuMap();
  ids.forEach((id, i) => { const s = m.get(id); if (s) s[key] = i + 1; });
  delete S.defaulted[groupKey];
  commit();
}
function bindBoardDnD() {
  let dragId = null;
  const board = $('.board');
  if (!board) return;
  board.addEventListener('dragstart', e => {
    const c = e.target.closest('.card'); if (!c) return;
    dragId = c.dataset.id; c.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  board.addEventListener('dragend', () => { $$('.dragging,.over,.dropswap').forEach(x => x.classList.remove('dragging', 'over', 'dropswap')); });
  board.addEventListener('dragover', e => {
    const col = e.target.closest('.col'); if (!col || !dragId) return;
    e.preventDefault();
    $$('.col.over,.card.dropswap').forEach(x => x.classList.remove('over', 'dropswap'));
    const c = e.target.closest('.card');
    if (c && c.dataset.id !== dragId) c.classList.add('dropswap'); else col.classList.add('over');
  });
  board.addEventListener('drop', e => {
    const col = e.target.closest('.col'); if (!col || !dragId) return;
    e.preventDefault();
    const m = stuMap();
    const s = m.get(dragId);
    const c = e.target.closest('.card');
    const target = col.dataset.cls === '' ? null : +col.dataset.cls;
    if (c && c.dataset.id !== dragId) {
      const o = m.get(c.dataset.id);
      if (o.newClass === s.newClass) return;
      pushHistory(`${s.name} ↔ ${o.name}`);
      [s.newClass, o.newClass] = [o.newClass, s.newClass];
      S.lastMsg = `${s.name}(${className(s.newClass) || '미배정'}) ↔ ${o.name}(${className(o.newClass) || '미배정'}) 맞바꿈`;
    } else {
      if (s.newClass === target) return;
      pushHistory(`${s.name} 옮김`);
      s.newClass = target;
      S.lastMsg = `${s.name}을(를) ${target == null ? '미배정' : className(target) + '반'}으로 옮겼습니다`;
    }
    dragId = null;
    commit();
  });
}

// ================= 대화상자 =================
function openModal(title, body, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="backdrop"><div class="modal" role="dialog" aria-modal="true"><div class="modal-h"><h3>${title}</h3><button class="ghost" data-act="close-modal" aria-label="닫기">✕</button></div><div class="modal-b">${body}</div></div></div>`;
  root.querySelector('.backdrop').addEventListener('mousedown', e => { if (e.target.classList.contains('backdrop')) closeModal(); });
  if (onMount) onMount(root.querySelector('.modal'));
}
function closeModal() { $('#modal-root').innerHTML = ''; if (UI.tab === 'board') render(); }
function studentOptions(excludeId) {
  return S.students.filter(s => s.id !== excludeId).sort((a, b) => a.oldClass - b.oldClass || a.oldNo - b.oldNo)
    .map(s => `<option value="${s.id}">${esc(s.name)} (${s.oldClass}반 ${s.oldNo}번${s.newClass != null ? ' → ' + className(s.newClass) + '반' : ''})</option>`).join('');
}
function relationRows(filterId) {
  const m = stuMap();
  const list = S.relations.filter(r => !filterId || r.a === filterId || r.b === filterId);
  if (!list.length) return '<p class="hint">설정한 관계가 없습니다.</p>';
  return `<table class="t"><thead><tr><th class="l">학생</th><th>조건</th><th class="l">메모</th><th>지금</th><th></th></tr></thead><tbody>${list.map(r => {
    const a = m.get(r.a), b = m.get(r.b);
    if (!a || !b) return '';
    const ok = a.newClass == null || b.newClass == null ? '-' : (r.type === 'apart' ? a.newClass !== b.newClass : a.newClass === b.newClass) ? '<span class="badge b-ok">지킴</span>' : '<span class="badge b-warn">안 지켜짐</span>';
    return `<tr><td class="l">${esc(a.name)} (${a.oldClass}반) · ${esc(b.name)} (${b.oldClass}반)</td><td>${r.type === 'apart' ? '다른 반' : '같은 반'}</td><td class="l">${esc(r.memo || '')}</td><td>${ok}</td><td><button class="ghost danger" data-act="del-rel" data-id="${r.id}">✕</button></td></tr>`;
  }).join('')}</tbody></table>`;
}
function openRelations(prefA) {
  openModal('학생 관계 설정', `
    <p class="hint" style="margin-top:0">사이가 안 좋은 학생은 ‘다른 반’, 함께 있어야 하는 학생은 ‘같은 반’으로 정하세요. 재배분 때 꼭 지키고, 지켜지지 않으면 ‘확인할 점’에 빨갛게 나옵니다. 동명이인은 따로 정하지 않아도 다른 반으로 나눕니다.</p>
    <div class="form-grid">
      <label>학생 1<select id="rel-a">${studentOptions()}</select></label>
      <label>학생 2<select id="rel-b">${studentOptions()}</select></label>
      <label>조건<select id="rel-t"><option value="apart">다른 반으로</option><option value="together">같은 반으로</option></select></label>
      <label>메모 (서식에는 나오지 않음)<input id="rel-m" placeholder="예: 다툼이 잦음"></label>
    </div>
    <div class="btn-row" style="margin-bottom:14px"><button class="primary" data-act="add-rel">관계 추가</button></div>
    <div id="rel-list">${relationRows()}</div>`, m => { if (prefA) m.querySelector('#rel-a').value = prefA; });
}
function openStudent(id) {
  const s = stuMap().get(id);
  if (!s) return;
  refreshScores();
  const rk = genderRanks();
  openModal(esc(s.name), `
    <div class="form-grid">
      <div class="lbl">이전 학적<span style="font-weight:400;color:var(--ink)">${S.settings.curGrade}학년 ${s.oldClass}반 ${s.oldNo}번 · ${s.gender} · ${esc(s.birth)}</span></div>
      <div class="lbl">순위<span style="font-weight:400;color:var(--ink)">남녀순위 ${rk[s.id]} · 학습 ${s.learnRank}위 (${s._L}점) · 곤란 ${s.diffRank}위 (${s._D}점)</span></div>
      <label>진급반<select data-stu="${s.id}" data-sf="newClass">${sel([['', '미배정'], ...classList().map(c => [c, className(c) + '반'])], s.newClass == null ? '' : s.newClass)}</select></label>
      <label>재배분 때<select data-stu="${s.id}" data-sf="locked">${sel([[false, '옮겨도 됨'], [true, '📌 이 반에 고정']], s.locked)}</select></label>
    </div>
    <div class="lbl" style="margin-bottom:12px">특이사항<span style="font-weight:400;color:var(--ink)">${esc(noteText(s)) || '없음'}</span></div>
    <h3>관계</h3>
    <div id="rel-list">${relationRows(s.id)}</div>
    <div class="btn-row" style="margin-top:10px">
      <select id="rel-b" style="flex:1">${studentOptions(s.id)}</select>
      <select id="rel-t"><option value="apart">다른 반으로</option><option value="together">같은 반으로</option></select>
      <input type="hidden" id="rel-a" value="${s.id}"><input id="rel-m" placeholder="메모" style="width:120px">
      <button class="primary" data-act="add-rel" data-from="${s.id}">추가</button>
    </div>`);
}

// ================= 알림 =================
function toast(msg, err) {
  const d = document.createElement('div');
  if (err) d.className = 'err';
  d.style.whiteSpace = 'pre-line';
  d.textContent = msg;
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), err ? 6000 : 3500);
}

// ================= 이벤트 =================
document.addEventListener('click', e => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { UI.tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const menu = $('#save-menu');
  if (!e.target.closest('.dd')) menu.hidden = true;
  const card = e.target.closest('.card');
  if (card && !e.target.closest('[data-act]')) { openStudent(card.dataset.id); return; }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  const cls = b.dataset.cls != null ? +b.dataset.cls : null;
  const m = stuMap();
  switch (act) {
    case 'toggle-save-menu': menu.hidden = !menu.hidden; return;
    case 'pick-files': $('#file-input').click(); return;
    case 'template': downloadTemplate(); return;
    case 'sample': loadSample(); return;
    case 'goto-rank': UI.rankClass = cls; UI.tab = 'rank'; render(); window.scrollTo(0, 0); return;
    case 'export-class': exportClass(cls); return;
    case 'del-class': {
      if (!confirm(`${cls}반 학생 ${S.students.filter(s => s.oldClass === cls).length}명을 목록에서 지울까요?`)) return;
      const gone = new Set(S.students.filter(s => s.oldClass === cls).map(s => s.id));
      S.students = S.students.filter(s => !gone.has(s.id));
      S.relations = S.relations.filter(r => !gone.has(r.a) && !gone.has(r.b));
      commit(); return;
    }
    case 'reset-all':
      if (!confirm('올린 명단과 순위, 배정 결과를 모두 지웁니다. 계속할까요?\n(필요하면 먼저 ‘작업 파일 저장’을 하세요)')) return;
      { const keep = S.settings; S = defaultState(); Object.assign(S.settings, { curYear: keep.curYear, newYear: keep.newYear, curGrade: keep.curGrade, newGrade: keep.newGrade, numClasses: keep.numClasses }); UI.history = []; }
      commit(); return;
    case 'rank-class': UI.rankClass = cls; render(); return;
    case 'rk-move': {
      const s = m.get(b.dataset.id), key = b.dataset.key, d = +b.dataset.dir;
      const list = group(s.oldClass, s.gender).sort((x, y) => x[key] - y[key]);
      const i = list.indexOf(s), j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      applyOrder(`${s.oldClass}|${s.gender}|${key}`, list.map(x => x.id));
      return;
    }
    case 'rk-confirm': delete S.defaulted[`${UI.rankClass}|${b.dataset.g}|${b.dataset.key}`]; commit(); return;
    case 'tag': {
      const s = m.get(b.dataset.id), t = b.dataset.tag;
      s.tags = s.tags.includes(t) ? s.tags.filter(x => x !== t) : [...s.tags, t];
      commit(); return;
    }
    case 'add-student': {
      const list = S.students.filter(s => s.oldClass === cls);
      const no = list.reduce((a, s) => Math.max(a, s.oldNo || 0), 0) + 1;
      S.students.push({ id: uid(), oldClass: cls, oldNo: no, name: '새 학생', gender: '', birth: '', learnRank: null, diffRank: null, tags: [], nation: '', phone: '', memo: '', newClass: null, snakeClass: null, locked: false });
      commit(); toast('맨 아래에 학생을 추가했습니다. 이름과 성별을 적어 주세요.'); return;
    }
    case 'del-student': {
      const s = m.get(b.dataset.id);
      if (!confirm(`${s.name} 학생을 목록에서 뺄까요?`)) return;
      S.students = S.students.filter(x => x.id !== s.id);
      S.relations = S.relations.filter(r => r.a !== s.id && r.b !== s.id);
      normAll(false); commit(); return;
    }
    case 'snake': runSnake(); return;
    case 'rebalance': runRebalance(); return;
    case 'undo': undo(); return;
    case 'relations': openRelations(); return;
    case 'add-rel': {
      const a = $('#rel-a').value, bb = $('#rel-b').value;
      if (!a || !bb || a === bb) return toast('서로 다른 두 학생을 골라 주세요', true);
      if (S.relations.some(r => (r.a === a && r.b === bb) || (r.a === bb && r.b === a))) return toast('이미 관계가 있는 두 학생입니다', true);
      S.relations.push({ id: uid(), a, b: bb, type: $('#rel-t').value, memo: $('#rel-m').value.trim() });
      commit({ silent: true });
      $('#rel-list').innerHTML = relationRows(b.dataset.from || null);
      $('#rel-m').value = '';
      toast('관계를 추가했습니다');
      return;
    }
    case 'del-rel': {
      S.relations = S.relations.filter(r => r.id !== b.dataset.id);
      commit({ silent: true });
      const from = $('#modal-root #rel-a[type=hidden]');
      $('#rel-list').innerHTML = relationRows(from ? from.value : null);
      return;
    }
    case 'close-modal': closeModal(); return;
    case 'hwp-f1': case 'hwp-f2': case 'hwp-f3': case 'hwp-all': menu.hidden = true; saveHwpx(act.slice(4)); return;
    case 'xlsx-result': menu.hidden = true; exportResult(); return;
    case 'work-save': menu.hidden = true; if (!S.students.length) return toast('저장할 자료가 없습니다', true); saveWork(); return;
    case 'work-load': $('#work-input').click(); return;
    case 'preview': UI.preview = b.dataset.kind; render(); return;
    case 'print': window.print(); return;
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'file-input') { importFiles(t.files).finally(() => { t.value = ''; }); return; }
  if (t.id === 'work-input') {
    const f = t.files[0]; t.value = '';
    if (!f) return;
    if (S.students.length && !confirm('지금 작업을 이 작업 파일로 바꿀까요?')) return;
    f.text().then(txt => {
      const d = JSON.parse(txt); const st = d.state || d;
      if (!st.students) throw new Error('작업 파일 형식이 아닙니다');
      adoptState(st); UI.history = []; toast(`작업 파일을 불러왔습니다 (${S.students.length}명)`); commit();
    }).catch(err => toast('불러오지 못했습니다: ' + err.message, true));
    return;
  }
  if (t.dataset.set) {
    const k = t.dataset.set, set = S.settings;
    let v = t.value;
    if (['curYear', 'newYear', 'curGrade', 'newGrade', 'numClasses', 'wLearn', 'wDiff', 'wTag', 'wOld', 'wMove'].includes(k)) v = num(v) || 0;
    if (k === 'boysFirst') v = v === 'true';
    if (k === 'numClasses') {
      v = Math.max(1, Math.min(14, v || 1));
      const over = S.students.filter(s => s.newClass != null && s.newClass >= v).length;
      if (over) { S.students.forEach(s => { if (s.newClass != null && s.newClass >= v) s.newClass = null; }); toast(`없어진 반에 있던 ${over}명을 ‘미배정’으로 돌렸습니다`); }
    }
    if (k === 'curYear' && set.newYear === set.curYear + 1) set.newYear = v + 1;
    if (k === 'curGrade' && set.newGrade === Math.min(6, set.curGrade + 1)) set.newGrade = Math.min(6, v + 1);
    set[k] = v;
    commit();
    return;
  }
  if (t.dataset.ui) { UI[t.dataset.ui] = t.value; render(); return; }
  if (t.dataset.teacher) { S.teachers[t.dataset.teacher] = t.value.trim(); commit({ silent: true }); return; }
  if (t.dataset.stu) {
    const s = stuMap().get(t.dataset.stu);
    if (t.dataset.sf === 'newClass') { pushHistory(`${s.name} 옮김`); s.newClass = t.value === '' ? null : +t.value; S.lastMsg = `${s.name}을(를) ${t.value === '' ? '미배정' : className(s.newClass) + '반'}으로 옮겼습니다`; }
    if (t.dataset.sf === 'locked') s.locked = t.value === 'true';
    commit({ silent: true });
    return;
  }
  const tr = t.closest('tr[data-id]');
  if (tr && t.dataset.f) {
    const s = stuMap().get(tr.dataset.id), f = t.dataset.f;
    if (f === 'oldNo') { s.oldNo = num(t.value) || s.oldNo; commit(); return; }
    if (f === 'gender') { s.gender = t.value; s.learnRank = null; s.diffRank = null; normAll(true); commit(); return; }
    if (f === 'learnRank' || f === 'diffRank') {
      const v = num(t.value);
      if (v == null) return;
      const cur = s[f];
      s[f] = v < cur ? v - 0.5 : v + 0.5;
      normGroup(s.oldClass, s.gender, f);
      delete S.defaulted[`${s.oldClass}|${s.gender}|${f}`];
      commit(); return;
    }
    if (f === 'birth') { s.birth = normBirth(t.value); t.value = s.birth; }
    else s[f] = t.value.trim();
    commit({ silent: f !== 'name' });
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.type === 'range' && t.dataset.set) {
    S.settings[t.dataset.set] = +t.value;
    const o = t.parentElement.querySelector('output'); if (o) o.textContent = t.value;
    commit({ silent: true });
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal(); });
window.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
window.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length && !e.target.closest('#dropzone')) { e.preventDefault(); importFiles(e.dataTransfer.files); } });

// ================= 시작 =================
if (restore()) {
  UI.rankClass = oldClasses()[0];
  setTimeout(() => toast(`지난번 작업을 이어서 불러왔습니다 (${S.students.length}명)`), 300);
}
render();
