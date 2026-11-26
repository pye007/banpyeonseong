# 반편성 도우미

초등학교 학급 편성(반편성)을 돕는 웹앱입니다. 학급 명단 엑셀을 올리고, 남녀 따로 학습정도·지도곤란도 순위를 정한 뒤, ㄹ자 배치와 점수 재배분으로 반을 나누고, 교사가 직접 조정해서 학급편성 계획의 붙임 서식(서식1·2·3)을 한글 파일(.hwpx)로 저장합니다.

## 쓰는 순서

1. **명단 올리기** — 학급 명단 엑셀을 올립니다. 여러 반 파일을 한꺼번에 올려도 됩니다. ‘빈 명단 양식 내려받기’로 양식을 받을 수 있고, `예시 자료` 폴더의 가짜 명단으로 연습할 수 있습니다.
2. **순위·특이사항** — 반마다 남학생·여학생을 따로, 학습정도 순위와 지도곤란도 순위를 정합니다. 특이사항(생활지도·학습부진·특수학급·쌍둥이·다문화·전출예정)을 표시합니다.
3. **반 배정·조정** — ① ㄹ자 배치 → ② 점수로 재배분 → ③ 학생 카드를 끌어서 교사가 조정합니다. ‘다른 반/같은 반’ 관계와 📌고정을 정할 수 있습니다.
4. **서식 저장** — 【서식1】 반편성 기초자료, 【서식2】 반편성 내역(남자 앞번호·여자 뒷번호), 【서식3】 반편성 현황을 한글 파일로 저장합니다.

## 학생 정보는 어디에 저장되나요?

모든 계산과 저장은 **선생님 컴퓨터의 브라우저 안에서만** 이루어집니다. 이 웹페이지는 앱 화면만 내려보낼 뿐, 올린 명단이나 순위가 인터넷으로 전송되지 않습니다.

- 다른 컴퓨터에서 이어서 하려면 ‘작업 파일 저장’ 파일을 옮기세요.
- 담임선생님은 ‘학급 자료 내보내기’ 엑셀을 학년부장에게 보내고, 학년부장은 받은 파일들을 한꺼번에 올려서 합칩니다.

## 고치는 방법 (개발용)

- `src/` — 앱 원본 (`app.js`, `app.css`, `hwpx.js`, `index.html`)
- `node tools/build.js` — `src/`를 하나로 묶어 `index.html`과 `반편성 도우미.html`을 만듭니다.
- `node tools/dev-server.js` — 개발용 서버 (http://localhost:5178)
- `node tools/make-template.js` — 한글 기본 서식에서 HWPX 뼈대(`src/hwpx-template.js`)를 다시 만듭니다.

## 배포 주소

- Cloudflare Pages: https://banpyeonseong.pages.dev/
- GitHub Pages: https://pye007.github.io/banpyeonseong/

고친 뒤 다시 배포하기:

1. `node tools/build.js`
2. GitHub Pages — 바뀐 `index.html`을 커밋해서 `main`에 올리면 반영됩니다.
3. Cloudflare Pages — `index.html`을 `dist/`에 복사한 뒤 `npx wrangler pages deploy dist --project-name banpyeonseong --branch main`

사용한 라이브러리: [SheetJS](https://sheetjs.com) (Apache-2.0), [JSZip](https://stuk.github.io/jszip/) (MIT)
