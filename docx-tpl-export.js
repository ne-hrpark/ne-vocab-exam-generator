/* ============================================================
 * docx-tpl-export.js — 어휘시험지 → DOCX 생성 (샘플 "템플릿" 방식)
 *
 *  hwpx-tpl-export.js 의 DOCX 판(版). 아이디어 동일:
 *    styles.xml·settings.xml·fontTable 등 "레이아웃을 결정하는" 파일은 사전제작 샘플
 *    (docx/{단}/{크기}/*.docx) 그대로 두고, word/document.xml 의 본문만 데이터로 다시 만든다.
 *
 *  단(段) 처리 — 샘플과 동일하게 표(table) 안 씀:
 *    · 좌우 2단 = <w:sectPr><w:cols w:num="2"/> 신문형 다단(연속 섹션브레이크→Word 자동 균등분할)
 *    · 각 문항 = 평문단(<w:p>) + 우측탭(<w:tab w:val="right">)으로 밑줄을 단 오른끝에 정렬
 *      (HWPX의 K앵커 폭계산 불필요 — Word 탭정지가 정렬을 맡음)
 *    · 발문(※)·문장완성·영영풀이 = 전체폭(cols=1) 구간
 *
 *  서식정책: HWPX와 동일 '민무늬' — 글자 크기·구조만. 볼드/기울임 생성 안 함(미리보기만 유지).
 *
 *  브라우저:
 *    <script src="jszip.min.js"></script>
 *    <script src="data.hwp.js"></script>
 *    <script src="docx-tpl-export.js"></script>
 *    <button onclick="return downloadDocxTpl(this)">DOCX 다운로드</button>
 *  템플릿: window.DOCX_TEMPLATES[fname](base64, file://용) 우선, 없으면 fetch(docx/…).
 * ============================================================ */
(function (global) {
  'use strict';

  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  // 2단 문항 사이 간격(twip) — '간격'(매우좁게~매우넓게) 설정에 연동.
  //  원본은 어휘 문항이 표라 표 사이 '기본 높이 빈 문단'(≈12pt)이 강제로 들어가 문항 간격을 벌린다.
  //  표 없는 평문단 버전에선 빈 문단을 쓰면 자동 단 균등분할 때 오른쪽 단 맨 위에 얹혀 윗공백이
  //  생기므로, 문단 뒤 간격(w:after)으로 준다(단 경계에서 자동 소거).
  //  ※ 종전엔 레벨 무관 상수(240)라 '좁게'로 해도 문항 사이가 안 좁아졌다 → 간격 선택에 연동으로 변경.
  var ITEM_AFTER_BY_GAP = { '매우좁게': 60, '좁게': 100, '보통': 160, '넓게': 220, '매우넓게': 300 };
  function itemAfterFor(gapLabel) {
    var v = ITEM_AFTER_BY_GAP[gapLabel];
    return v == null ? 160 : v;   // 알 수 없는 라벨이면 '보통'(160)
  }
  var ASK_BEFORE = 360;   // 발문(※) 위 여백(twip, 18pt) — 앞 그룹 끝과 붙지 않게 그룹 구분 간격
  // [다줄 유형 1단화] (2026-07-15 채택, HWPX와 동일 정책) 항목이 다줄인 유형(파생어·유의어)은
  //  2단 신문형에서 컬럼 높이균형이 안 맞아 단 하단 여백이 남으므로 전체폭(1단)으로 뺀다.
  //  판정 = 항목의 평균 줄수(<br>+1) ≥ 2. 단어형(1~30, 1줄)은 2단 유지.
  //  [2026-07-15 되돌림] "1단은 안 된다, 최대한 2단으로" → false(전 유형 최대한 2단 + 여백 수용).
  var MULTILINE_GROUPS_TO_FULL = false;
  // [다줄 full 유형 2단화] (2026-07-15 채택, HWPX와 동일) data.full로 1단이던 유형 중 '다줄 구조'
  //  (문장완성: 해석<br>영어문장)는 2단으로. buildItem이 모든 항목에 keepLines를 걸어 워드에서도
  //  항목이 단 경계서 안 갈라짐. '단일 장문'(영영풀이: <br> 없는 긴 정의)은 제외(반폭이면 과하게 접힘).
  //  판정 = groupAvgLines(<br>+1) ≥ 1.5. 효과: 문장완성 2단 → 중간 1단 사라져 파생어 앞 여백도 없어짐.
  //  [2026-07-15 되돌림] 한글에서 문장완성 항목이 좌/우 단 경계서 갈라짐(keepLines가 컬럼분할 못 막음).
  //   → false(문장완성 1단 유지). HWPX와 동일 결정.
  var TWOCOL_MULTILINE_FULL = false;
  function groupAvgLines(g) {   // 항목당 평균 줄수(<br>개수+1). HWPX estItemLines와 같은 분류 결과.
    if (!g.items || !g.items.length) return 1;
    var t = 0;
    for (var i = 0; i < g.items.length; i++) {
      t += (String(g.items[i].q || '').match(/<br\s*\/?>/gi) || []).length + 1;
    }
    return t / g.items.length;
  }

  var TPL = {
    // 파일명: 어휘시험지_{단}단_{크기}_{간격}.docx  (예: 어휘시험지_2단_11_보통.docx)
    fileName: function (cfg) {
      return '어휘시험지_' + cfg.columns + '단_' + cfg.size + '_' + cfg.gapLabel + '.docx';
    },
    // 경로: docx/{단}단/{크기}/{파일명}
    url: function (cfg) {
      return 'docx/' + cfg.columns + '단/' + cfg.size + '/' + TPL.fileName(cfg);
    }
  };
  global.DOCX_TPL = TPL;

  /* ---------- 공용 소도구 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // 앞뒤 공백 보존이 필요한 텍스트 런
  function tRun(rpr, text) {
    return '<w:r>' + (rpr || '') + '<w:t xml:space="preserve">' + text + '</w:t></w:r>';
  }
  function tabRun(szRpr) { return '<w:r>' + (szRpr || '') + '<w:tab/></w:r>'; }
  function brRun(szRpr) { return '<w:r>' + (szRpr || '') + '<w:br/></w:r>'; }

  /* ---------- 세그먼트 파서 (hwpx-tpl-export.parseSegs 이식) ----------
     q(HTML)의 <span class="wl" data-ans data-fl>→blank, <br>→break, 나머지 텍스트→text */
  function parseSegs(html) {
    var MARK = '', NL = '';
    html = String(html || '').replace(/<span class="wl"([^>]*)>[\s\S]*?<\/span>/g, function (_m, at) {
      var ans = (at.match(/data-ans="([^"]*)"/) || [])[1] || '';
      var fl = (at.match(/data-fl="([^"]*)"/) || [])[1] || '';
      return MARK + encodeURIComponent(ans) + '|' + encodeURIComponent(fl) + MARK;
    });
    html = html.replace(/<br\s*\/?>/gi, NL);
    html = html.replace(/<[^>]+>/g, '');
    html = html.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    var segs = [];
    html.split(NL).forEach(function (line, li) {
      if (li > 0) segs.push({ type: 'break' });
      var parts = line.split(MARK);
      for (var i = 0; i < parts.length; i++) {
        if (i % 2 === 1) {
          var kv = parts[i].split('|');
          segs.push({ type: 'blank', ans: decodeURIComponent(kv[0] || ''), fl: decodeURIComponent(kv[1] || '') });
        } else if (parts[i]) {
          segs.push({ type: 'text', text: parts[i] });
        }
      }
    });
    return segs;
  }

  /* ---------- 템플릿 프로파일 추출 ----------
     document.xml 에서 본문 재구성에 필요한 '원자(atoms)'만 뽑는다.
     pPr(문단속성)은 원본 문자열을 그대로 복제해 tabs/ind/spacing/keepLines를 정확히 상속. */
  function firstGroup(re, s) { var m = re.exec(s); return m ? m[1] : null; }

  // sectPr 빈 문단을 '연속 섹션브레이크'로 정규화 — <w:type>을 continuous로(없으면 삽입).
  //  <w:type>은 sectPr의 첫 자식이어야 함(스키마 순서) → 여는 태그 바로 뒤에 삽입.
  function forceContinuous(sectParaXml) {
    if (!sectParaXml) return sectParaXml;
    if (/<w:type\b/.test(sectParaXml)) {
      return sectParaXml.replace(/<w:type w:val="\w+"\s*\/>/, '<w:type w:val="continuous"/>');
    }
    return sectParaXml.replace(/(<w:sectPr\b[^>]*>)/, '$1<w:type w:val="continuous"/>');
  }

  // <w:pPr>에 keepLines(문단의 모든 줄을 같은 페이지/단에 유지)를 보장 — 없으면 삽입.
  //  keepLines가 없으면 여러 줄 문항(문장완성 해석+영문, 파생어 등)이 페이지/단 경계에서 쪼개진다.
  function ensureKeepLines(ppr) {
    if (!ppr || /<w:keepLines\s*\/>/.test(ppr)) return ppr;
    return ppr.replace(/<w:pPr>/, '<w:pPr><w:keepLines/>');
  }

  // <w:pPr>의 문단 뒤 간격(w:after)을 tw(twip)로 설정. spacing 요소가 있으면 after만 교체/추가.
  function setAfter(ppr, tw) {
    if (!ppr) return ppr;
    if (/<w:spacing\b[^>]*\bw:after="/.test(ppr))
      return ppr.replace(/(<w:spacing\b[^>]*\bw:after=")\d+(")/, '$1' + tw + '$2');
    if (/<w:spacing\b/.test(ppr))
      return ppr.replace(/(<w:spacing\b)/, '$1 w:after="' + tw + '"');
    return ppr.replace('</w:pPr>', '<w:spacing w:after="' + tw + '"/></w:pPr>');
  }

  // <w:pPr>의 문단 앞 간격(w:before)을 tw(twip)로 설정. spacing 요소가 있으면 before만 교체/추가.
  function setBefore(ppr, tw) {
    if (!ppr) return ppr;
    if (/<w:spacing\b[^>]*\bw:before="/.test(ppr))
      return ppr.replace(/(<w:spacing\b[^>]*\bw:before=")\d+(")/, '$1' + tw + '$2');
    if (/<w:spacing\b/.test(ppr))
      return ppr.replace(/(<w:spacing\b)/, '$1 w:before="' + tw + '"');
    return ppr.replace('</w:pPr>', '<w:spacing w:before="' + tw + '"/></w:pPr>');
  }
  // [줄간격 통일 2026-07-23] <w:pPr>에 줄간격(w:line, lineRule=auto)을 tw(=%×2.4, 240=1줄=100%)로 설정.
  //  DOCX는 원래 줄간격%를 안 쓰고 문단 뒤 여백(w:after)만으로 간격을 줬으나, .hwp 줄간격에 맞추려 item/발문 문단에 근사 주입.
  //  w:after(기존 리듬)는 유지 — .hwp도 항목에 줄간격(ls)과 문단뒤여백(next)을 함께 쓰므로 모델이 일치. tw<=0이면 미적용.
  function setLine(ppr, tw) {
    if (!ppr || !(tw > 0)) return ppr;
    if (/<w:spacing\b/.test(ppr)) {   // 기존 spacing에 line/lineRule을 새로 갱신(중복 방지 위해 기존 제거 후 추가)
      return ppr.replace(/<w:spacing\b[^>]*?\/>/, function (sp) {
        sp = sp.replace(/\s*\bw:line="[^"]*"/g, '').replace(/\s*\bw:lineRule="[^"]*"/g, '');
        return sp.replace(/\s*\/>$/, ' w:line="' + tw + '" w:lineRule="auto"/>');
      });
    }
    return ppr.replace('</w:pPr>', '<w:spacing w:line="' + tw + '" w:lineRule="auto"/></w:pPr>');
  }
  function lineTwOf(lsHwp) { return (lsHwp > 0) ? Math.round(lsHwp * 2.4) : 0; }   // 줄간격 % → w:line twip(240ths)

  function profileTemplate(documentXml) {
    var prof = {
      titleParas: '',      // 발문 이전(제목/머리글) 문단 원문
      askPara: null,       // 발문 문단 1개(원문 템플릿) — 텍스트만 치환
      fullPPr: null,       // 전체폭 항목 문단의 <w:pPr>…</w:pPr>
      halfPPr: null,       // 2단 반폭 항목 문단의 <w:pPr>…</w:pPr>
      sz: '22',            // 본문 글자크기(half-point) — 9→18, 11→22, 13→26
      szRpr: '',           // 본문 런 rPr(크기만)
      blankRpr: '',        // 밑줄 런 rPr(크기만 — 문제/스펠링용 '_' 연속선, <w:u> 미사용)
      blankRprU: '',       // 정답표시용 rPr(크기+<w:u single>) — 답 위 서식 밑줄
      blankText: new Array(31).join(' '),   // (프로파일 중 '_' 연속선으로 전환됨)
      blankUnits: 30,      // 밑줄 목표 폭(공백환산 단위)
      blankSpacing: 0,     // 문제/스펠링 '_' 자간(twip, 음수 — 촘촘)
      ulUnitEff: 1.58,     // 자간 적용 후 '_' 한 글자 폭(단위)
      sect1: null,         // 전체폭 섹션 종료용 빈 문단(cols=1)
      sect2: null,         // 2단 섹션 종료용 빈 문단(cols=2)
      finalSect: '',       // body 최종 sectPr
      preBody: '',         // <w:document>…<w:body> 앞부분
      postBody: ''         // </w:body>…</w:document>
    };

    // body 앞뒤 보존
    var bm = documentXml.match(/^([\s\S]*?<w:body>)([\s\S]*)(<\/w:body>[\s\S]*)$/);
    if (!bm) throw new Error('DOCX: <w:body> 를 찾지 못했습니다.');
    prof.preBody = bm[1];
    var body = bm[2];
    prof.postBody = bm[3];

    // body 최종 sectPr (마지막 <w:sectPr>…</w:sectPr>, 문단 밖의 것)
    var sects = body.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) || [];
    prof.finalSect = sects.length ? sects[sects.length - 1] : '';

    // 문단 단위 분해
    var paras = body.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    function vis(p) { return (p.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map(function (x) { return x.replace(/<[^>]+>/g, ''); }).join(''); }
    function isAsk(p) { return /※/.test(vis(p)); }
    function isItem(p) { return /^\s*\d+\s*\./.test(vis(p)); }
    function pprOf(p) { var m = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/); return m ? m[0] : ''; }
    function rightTabPos(ppr) { var m = ppr.match(/<w:tab\b[^>]*w:val="right"[^>]*w:pos="(\d+)"/); return m ? +m[1] : -1; }

    // 제목/머리글 = 첫 발문(또는 첫 항목) 이전 문단들
    var firstContent = -1, i;
    for (i = 0; i < paras.length; i++) { if (isAsk(paras[i]) || isItem(paras[i])) { firstContent = i; break; } }
    if (firstContent < 0) firstContent = 0;
    prof.titleParas = paras.slice(0, firstContent).join('');

    // 발문 템플릿
    for (i = firstContent; i < paras.length; i++) { if (isAsk(paras[i])) { prof.askPara = paras[i]; break; } }

    // 항목 문단 pPr — 우측탭 위치로 전체폭/반폭 구분(큰 값=전체폭)
    var maxR = -1, minR = 1e9;
    for (i = firstContent; i < paras.length; i++) {
      if (!isItem(paras[i])) continue;
      var ppr = pprOf(paras[i]); var r = rightTabPos(ppr);
      if (r < 0) continue;
      if (r > maxR) { maxR = r; prof.fullPPr = ppr; }
      if (r < minR) { minR = r; prof.halfPPr = ppr; }
    }
    if (prof.fullPPr && maxR === minR) prof.halfPPr = null;   // 1단: 전체폭만

    // 본문 글자크기·런 rPr — 항목 문단의 첫 '깨끗한'(볼드·밑줄 없는) 텍스트 런 rPr.
    //  ※ <w:r>·<w:rPr>에 rsidRPr 등 속성이 붙는 템플릿(예: 13pt)도 있어 속성 허용 매칭.
    var szRun = null;
    for (i = firstContent; i < paras.length && !szRun; i++) {
      if (!isItem(paras[i])) continue;
      var runRe = /<w:r(?:\s[^>]*)?>\s*(<w:rPr(?:\s[^>]*)?>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr>)/g, rmm;
      while ((rmm = runRe.exec(paras[i]))) {
        if (!/<w:u\b/.test(rmm[1]) && !/<w:b\b/.test(rmm[1])) { szRun = rmm[1]; break; }
      }
    }
    if (szRun) {
      prof.szRpr = szRun;
      var szm = szRun.match(/<w:sz w:val="(\d+)"/); if (szm) prof.sz = szm[1];
    } else {
      prof.szRpr = '<w:rPr><w:sz w:val="' + prof.sz + '"/><w:szCs w:val="' + prof.sz + '"/></w:rPr>';
    }

    // 밑줄 런(underline + 공백) — 속성 붙은 <w:r>/<w:rPr> 허용
    var brun = body.match(/<w:r(?:\s[^>]*)?>\s*(<w:rPr(?:\s[^>]*)?>(?:(?!<\/w:rPr>)[\s\S])*?<w:u w:val="single"\/>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr>)\s*<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>\s*<\/w:r>/);
    if (brun) { prof.blankRpr = brun[1]; if (/^[\s]+$/.test(brun[2]) && brun[2].length) prof.blankText = brun[2]; }
    else prof.blankRpr = '<w:rPr><w:sz w:val="' + prof.sz + '"/><w:szCs w:val="' + prof.sz + '"/></w:rPr>';
    // 밑줄을 '밑줄서식 공백' → '실제 _ 문자 연속선'으로 전환(HWPX 동일 원리).
    //  → 다른 곳에 복사해도 선이 텍스트('_')로 따라온다. 선은 '_' 글리프 자체이므로
    //    밑줄서식(<w:u>)은 제거(겹치면 이중선). 폭은 기존 공백 밑줄과 동일하게 유지.
    prof.blankUnits = widthSp(prof.blankText) || 30;                 // 목표 밑줄 폭(공백환산 단위=원본 공백폭)
    var base = prof.blankRpr.replace(/<w:u\b[^>]*\/>/g, '');          // 크기만(밑줄서식 제거) = 정답표시 답글자용
    // 정답표시용: 크기 rPr + 밑줄서식(<w:u>). 답+공백을 한 런에 담아 틈 없는 밑줄 위에 답(자간 정상).
    prof.blankRprU = base.replace('</w:rPr>', '<w:u w:val="single"/></w:rPr>');
    // 문제/스펠링 '_' 연속선: 자간을 좁혀(촘촘) 글자 사이 틈 제거(A28=-28twip@11pt, 크기 비례).
    //  자간만큼 글자당 폭이 줄므로 '_' 개수를 늘려 물리 길이는 원본과 동일하게 유지.
    var unit = prof.sz * 10 / 3;                                     // 1 widthSp 단위 twip
    prof.blankSpacing = Math.round(-28 * prof.sz / 22);             // '_' 자간(twip, 음수)
    prof.ulUnitEff = Math.max(0.3, widthSp('_') + prof.blankSpacing / unit);  // 자간 적용 후 '_' 폭(단위)
    var ulN = Math.max(1, Math.round(prof.blankUnits / prof.ulUnitEff));
    prof.blankText = new Array(ulN + 1).join('_');
    prof.blankRpr = base.replace('<w:sz ', '<w:spacing w:val="' + prof.blankSpacing + '"/><w:sz ');  // 자간(<w:sz> 앞=스키마 순서)

    // 섹션 종료용 빈 문단(cols=1 / cols=2)
    for (i = 0; i < paras.length; i++) {
      if (paras[i].indexOf('<w:sectPr') < 0) continue;
      var isTwo = /<w:cols\b[^>]*w:num="2"/.test(paras[i]);
      if (isTwo) { if (!prof.sect2) prof.sect2 = paras[i]; }
      else { if (!prof.sect1) prof.sect1 = paras[i]; }
    }
    // 그룹 사이 섹션브레이크는 반드시 '연속(continuous)'이어야 함.
    //  템플릿의 첫 cols=1 sectPr은 머리글 닫기용이라 type이 없거나 nextPage일 수 있는데,
    //  이를 그대로 그룹마다 재사용하면 그룹(발문)마다 새 페이지로 넘어간다 → 강제 continuous.
    prof.sect1 = forceContinuous(prof.sect1);
    prof.sect2 = forceContinuous(prof.sect2);
    return prof;
  }

  /* ---------- 런 생성: 세그먼트 → OOXML 런들 ---------- */
  // 글자 폭을 '공백 몇 칸'으로 추정(밑줄 총폭을 일정하게 유지하기 위함).
  //  hwpx estW와 동일 비율(공백 기준): 한글≈3.0, 라틴≈1.58, 숫자≈1.5, 문장부호≈1.2.
  //  → 밑줄런 = 답 + (baseCount − 답폭)칸 공백 이므로 물리 폭 ≈ baseCount칸으로 거의 고정됨.
  function widthSp(txt) {
    var u = 0, s = String(txt || '');
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 32 || c === 0xa0) u += 1;
      else if (c >= 0x1100 && !(c >= 0x2000 && c < 0x2100)) u += 3.0;   // 한글/CJK 전각
      else if (c >= 48 && c <= 57) u += 1.5;                            // 숫자
      else if (c >= 0x41) u += 1.58;                                   // 라틴/기타
      else u += 1.2;                                                    // 문장부호
    }
    return u;
  }
  // 정답표시 답 폭 추정 — nbsp(=공백) 대비 '물리 폭' 비율(widthSp보다 라틴을 크게).
  //  정답표시 밑줄 = nbsp 채움 + 답. nbsp로 (baseU−답폭)만큼 채우므로, 답폭을 실제 물리폭으로
  //  정확히 재야 (긴 답=긴 밑줄) 계통오차가 사라져 밑줄 길이가 답과 무관하게 균일해진다.
  //  라틴 소문자 advance ≈ 0.5em, nbsp ≈ 0.25em → 라틴/ nbsp ≈ 2.0. 한글=전각(≈4×nbsp).
  function answerWidthNbsp(txt) {
    var u = 0, s = String(txt || '');
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 32 || c === 0xa0) u += 1;
      else if (c >= 0x1100 && !(c >= 0x2000 && c < 0x2100)) u += 4.0;   // 한글/전각
      else if ((c >= 48 && c <= 57) || c >= 0x41) u += 2.0;             // 숫자/라틴
      else u += 1.3;                                                    // 문장부호
    }
    return u;
  }
  // 밑줄('_' 연속선) 위에 글자 얹기(정답표시/스펠링 첫글자).
  //  폭 단위(공백환산)로 계산 → 답 좌우를 '_'로 채워 총폭을 밑줄폭과 동일하게 유지.
  //  count=밑줄 목표폭(단위, 기본 prof.blankUnits).
  function overUnderline(prof, txt, mode, count) {
    var baseU = count || prof.blankUnits || widthSp(prof.blankText);
    var tW = widthSp(txt);                      // 답의 폭(단위)
    if (mode === 'center') {
      // 정답표시(center): 학생이 쓰지 않으므로 복사 불필요 → 서식 밑줄(<w:u>) + 공백 채움.
      //  답+좌우 공백을 한 런에 담아 틈 없는 밑줄 위에 답을 얹는다. 공백 1칸=1단위.
      //  ★ 채움은 nbsp(U+00A0) — 일반 공백은 Word가 줄 끝에서 잘라내(trim) 답이 우측정렬되고
      //     밑줄 길이가 단어마다 달라진다. nbsp는 안 잘려서 밑줄이 우측탭까지 꽉 차 균일해진다.
      function sp(u) { var k = Math.round(u); return k > 0 ? new Array(k + 1).join(' ') : ''; }
      var tWc = answerWidthNbsp(txt);              // 답의 '물리 폭'(nbsp 환산) — 균일 밑줄의 핵심
      var fillU = Math.max(0, baseU - tWc), lu = Math.floor(fillU / 2);
      return '<w:r>' + prof.blankRprU + '<w:t xml:space="preserve">' + sp(lu) + esc(txt) + sp(fillU - lu) + '</w:t></w:r>';
    }
    // 'lead'(스펠링 첫글자): 학생이 나머지를 쓰므로 '_' 연속선 유지(복사 가능, 자간 반영 폭).
    var ulU = prof.ulUnitEff || widthSp('_');
    function ul(u) { var k = Math.round(u / ulU); return k > 0 ? new Array(k + 1).join('_') : ''; }
    var fill2 = Math.max(ulU * 2, baseU - tW);
    return '<w:r>' + prof.blankRpr + '<w:t xml:space="preserve">' + esc(txt) + ul(fill2) + '</w:t></w:r>';
  }
  function blankRun(prof, seg, opts, count) {
    if (opts.qa && seg.ans) return overUnderline(prof, seg.ans, 'center', count || opts._qaTargetU);
    if (opts.spell && seg.fl && /[A-Za-z]/.test(seg.fl.charAt(0))) return overUnderline(prof, seg.fl, 'lead', count);
    return '<w:r>' + prof.blankRpr + '<w:t xml:space="preserve">' + prof.blankText + '</w:t></w:r>';
  }

  /* ---------- 뜻 영역 폭(왼쪽) 산출 + 강제 줄바꿈 ----------
   * 표가 없는 워드에서 뜻이 길면 밑줄(오른쪽) 영역까지 흐르므로,
   * 뜻을 '왼쪽 뜻 영역' 폭 안에서 강제로 접어(<w:br/>) 밑줄 영역을 침범하지 않게 한다.
   * 영역 폭 = (우측탭 위치 − 내용 들여쓰기) − (밑줄폭 + 마커 + 여백).
   * widthSp 단위(공백환산)로 계산 — 1단위 ≈ em/3 twip (한글=3단위=1em). */
  function contentWidthTw(ppr) {
    var r = (ppr.match(/<w:tab\b[^>]*w:val="right"[^>]*w:pos="(\d+)"/) || [])[1];
    if (!r) return -1;
    var l = (ppr.match(/<w:ind\b[^>]*?w:left="(\d+)"/) || [])[1];
    return (+r) - (l ? +l : 0);
  }
  //  hasMarker=true(유의어/반의어)일 때만 (유)/(반) 마커폭을 예약한다.
  //  파생어처럼 마커가 없으면 그만큼 뜻 영역이 넓어져 불필요한 줄바꿈이 준다.
  function meaningBudget(ppr, prof, hasMarker) {
    var w = contentWidthTw(ppr);
    if (w <= 0) return Infinity;
    var unit = prof.sz * 10 / 3;                 // 1 widthSp 단위 ≈ (em twip)/3
    var totalU = w / unit;
    var reserve = (prof.blankUnits || widthSp(prof.blankText || ''))   // 밑줄폭
                + (hasMarker ? 6 : 0)            // (유)/(반) 마커(있을 때만)
                + 1;                             // 뜻·밑줄 사이 최소 여백(작게 → 불필요한 줄바꿈 최소화)
    return Math.max(6, totalU - reserve);        // 뜻 줄 최대폭(단위)
  }
  // 뜻 텍스트를 budget(단위) 이하 줄들로 접기. 한글은 어디서든 끊고, 줄 앞 공백은 버린다.
  function charWrap(text, budget) {
    if (!isFinite(budget)) return [text];
    var lines = [], cur = '', curW = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i), w = widthSp(ch);
      if (curW + w > budget && cur.replace(/^\s+/, '').length) {
        lines.push(cur);
        if (ch === ' ') { cur = ''; curW = 0; } else { cur = ch; curW = w; }
      } else { cur += ch; curW += w; }
    }
    if (cur.length) lines.push(cur);
    return lines.map(function (s, idx) { return idx === 0 ? s : s.replace(/^\s+/, ''); });
  }

  // segs → 항목 문단의 내부 런 문자열. 번호탭 뒤부터.
  //  줄 끝 빈칸 → 우측탭 + (마커) + 밑줄(오른끝 정렬). 문장 중간/내용없는 빈칸 → 제자리 밑줄.
  function segsToRuns(segs, prof, opts, budget) {
    var out = '', lineHasText = false;
    // (유)/(반) 마커를 밑줄 바로 왼쪽으로: text 뒤 blank면 마커 분리
    for (var bi = 0; bi < segs.length; bi++) {
      if (segs[bi].type === 'blank' && bi > 0 && segs[bi - 1].type === 'text') {
        var tm = segs[bi - 1].text.match(/^([\s\S]*?)(\s*\((?:유|반)(?:의어)?\))\s*$/);
        if (tm && tm[1].trim()) {
          segs[bi - 1].text = tm[1];
          segs.splice(bi, 0, { type: 'text', text: tm[2].trim() + ' ', tail: true });
          bi++;
        }
      }
    }
    function lineTrailing(i) {
      for (var j = i + 1; j < segs.length; j++) {
        if (segs[j].type === 'break') return true;
        if (segs[j].type === 'text' && segs[j].text.trim()) return false;
        if (segs[j].type === 'blank') return false;
      }
      return true;
    }
    // 이 text 세그먼트가 놓인 논리줄이 '줄 끝 밑줄(오른쪽 정렬)'로 끝나는가?
    //  → 그렇다면 밑줄 영역 침범을 막기 위해 뜻을 왼쪽 영역 폭 안에서 접는다.
    function meaningLine(i) {
      for (var j = i + 1; j < segs.length; j++) {
        if (segs[j].type === 'break') return false;
        if (segs[j].type === 'blank') return lineTrailing(j);
      }
      return false;
    }
    var pendingTail = '';
    segs.forEach(function (seg, i) {
      if (seg.type === 'text' && seg.tail) { pendingTail += seg.text; return; }
      if (seg.type === 'text') {
        if (isFinite(budget) && meaningLine(i)) {   // 뜻 줄 → 왼쪽 영역 폭 안에서 강제 접기
          var wl = charWrap(seg.text, budget);
          for (var w = 0; w < wl.length; w++) {
            out += tRun(prof.szRpr, esc(wl[w]));
            if (w < wl.length - 1) out += brRun(prof.szRpr);
          }
        } else {
          out += tRun(prof.szRpr, esc(seg.text));
        }
        if (seg.text.trim()) lineHasText = true;
      }
      else if (seg.type === 'break') { out += brRun(prof.szRpr); lineHasText = false; pendingTail = ''; }
      else if (seg.type === 'blank') {
        if (lineTrailing(i) && (lineHasText || pendingTail)) {   // 줄 끝 빈칸 → 우측탭으로 오른끝 정렬
          var _slotU = prof.blankUnits || widthSp(prof.blankText || '');
          var _ansU = (opts.qa && seg.ans) ? answerWidthNbsp(String(seg.ans).replace(/&[a-z]+;/g, ' ')) : 0;
          if (opts.qa && seg.ans && _slotU && _ansU > _slotU * 1.05) { out += brRun(prof.szRpr); }   // 긴 정답 → 새 줄 우측정렬
          out += tabRun(prof.szRpr);
          if (pendingTail) { out += tRun(prof.szRpr, esc(pendingTail)); pendingTail = ''; }
          out += blankRun(prof, seg, opts);
          lineHasText = false;
        } else {                                                 // 문장 중간/듣기 빈칸 → 제자리 밑줄
          if (pendingTail) { out += tRun(prof.szRpr, esc(pendingTail)); pendingTail = ''; }
          out += blankRun(prof, seg, opts);
        }
      }
    });
    return out;
  }

  /* ---------- 항목 문단 생성 ---------- */
  function buildItem(item, n, prof, opts, isFull) {
    var ppr = (isFull || !prof.halfPPr) ? prof.fullPPr : prof.halfPPr;
    if (!ppr) ppr = '<w:pPr><w:ind w:left="600" w:hanging="600"/></w:pPr>';
    ppr = ensureKeepLines(ppr);   // 여러 줄 문항이 페이지/단 경계에서 안 쪼개지게(문장완성·파생어 등)
    // 2단(반폭) 문항은 문항 사이 간격을 원본(표 사이 빈 문단)처럼 벌린다 → 문단 뒤 간격 부여.
    //  (전체폭 유형·1단은 원본이 이미 넉넉한 after를 갖고 있어 건드리지 않음)
    if (!isFull && prof.halfPPr) ppr = setAfter(ppr, itemAfterFor(opts.gapLabel));
    ppr = setLine(ppr, prof.lineTw);   // 줄간격(.hwp 통일) 근사 — w:after(간격)와 함께 적용
    var inner;
    if (opts.ansOnly) {   // 정답만: 번호 + 정답(문제·밑줄 없음)
      inner = tRun(prof.szRpr, esc(n + '.')) + tabRun(prof.szRpr) + tRun(prof.szRpr, esc(item.ans || ''));
      return '<w:p>' + ppr + inner + '</w:p>';
    }
    // 세그먼트 구성
    var segs = parseSegs(item.q || '');
    if (item.wl && !segs.some(function (x) { return x.type === 'blank'; })) {
      segs.push({ type: 'blank', ans: item.ans || '', fl: item.fl || '' });
    }
    // 번호 + 좌측탭 + 내용런 (뜻은 왼쪽 영역 폭 안에서 접기 → 밑줄 영역 침범 방지)
    //  마커((유)/(반))가 있는 유형만 마커폭을 예약 → 파생어는 뜻 영역이 넓어져 덜 접힘.
    var hasMarker = /\((?:유|반)(?:의어)?\)/.test(item.q || '');
    var budget = meaningBudget(ppr, prof, hasMarker);
    inner = tRun(prof.szRpr, esc(n + '.')) + tabRun(prof.szRpr) + segsToRuns(segs, prof, opts, budget);
    return '<w:p>' + ppr + inner + '</w:p>';
  }

  /* ---------- 발문 문단 ---------- */
  function makeAsk(ask, prof) {
    var t = parseSegs(ask).filter(function (x) { return x.type === 'text'; }).map(function (x) { return x.text; }).join('');
    t = t.replace(/^\s*※\s*/, '');
    if (prof.askPara) {   // 템플릿 발문 문단의 텍스트만 치환(pPr·rPr 유지)
      var done = false;
      var p = prof.askPara.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/, function (_m, o, c) {
        if (done) return _m; done = true; return o + '※ ' + esc(t) + c;
      });
      // 발문에 런이 여러 개면 나머지 텍스트 런은 비움(중복 방지)
      var first = true;
      p = p.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/g, function (_m, o, c) {
        if (first) { first = false; return o + '※ ' + esc(t) + c; }
        return o + c;
      });
      // 발문 위 여백 확보 — 앞 그룹 항목과 붙지 않게(pPr 있으면 before 주입, 없으면 pPr 삽입)
      if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(p))
        p = p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, function (ppr) { return setLine(setBefore(ppr, ASK_BEFORE), prof.lineTw); });   // 줄간격(.hwp 통일)도 발문에 적용
      else
        p = p.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr><w:spacing w:before="' + ASK_BEFORE + '"' + (prof.lineTw > 0 ? ' w:line="' + prof.lineTw + '" w:lineRule="auto"' : '') + '/></w:pPr>');
      return p;
    }
    return '<w:p><w:pPr><w:spacing w:before="' + ASK_BEFORE + '" w:after="96"' + (prof.lineTw > 0 ? ' w:line="' + prof.lineTw + '" w:lineRule="auto"' : '') + '/></w:pPr>' + tRun(prof.szRpr, '※ ' + esc(t)) + '</w:p>';
  }

  /* ---------- 헤더(제목/머리글) 재조립 — 레퍼런스(print_sample_0722 docx)와 동일 룩 ----------
     ★2026-07-23: 종전엔 템플릿 titleParas(발문 이전 문단)를 그대로 보존했으나, 3형식(hwp·hwpx·docx)
       헤더를 정본으로 통일하기 위해 코드로 재조립한다. 스펙: 20mm 점선 로고박스(회색 #7F7F7F·sysDash·흰배경)
       + 우측정렬 이름/점수(right tab@10733) + 하단 구분선 + 발문 전 스페이서. HWP(hwpml-export)와 동일 스펙.
       박스 drawing은 레퍼런스 docx의 wps 사각형을 그대로 이식(VML 폴백은 생략 — 현대 Word/한글 임포터는 wps 처리).
       네임스페이스(wp/wp14/wps/a)는 전 템플릿 document.xml에 이미 선언돼 있어 그대로 동작(확인함). */
  // ★박스 크기 504000EMU(=14mm)로 축소(2026-07-23): 20mm(720000)는 헤더 글자(제목 2줄, 날짜 미입력 시 ~13mm)보다
  //  커서 '구분선 full-width'를 만들려면 박스를 넘겨야 하고 그만큼 라인 위 여백이 커졌다(Word 렌더로 확인).
  //  14mm는 헤더 글자 높이에 맞아 박스가 헤더 안에 온전히 들어가고 구분선이 바로 아래 full-width로 붙는다(여백 최소).
  //  날짜 유무(line1 1줄/2줄)와 무관하게 박스 ≤ 헤더 → 항상 full-width. cx/cy(extent)·a:ext 모두 504000.
  var HDR_BOX_DRAWING = '<w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1" wp14:anchorId="1B3113BC" wp14:editId="1B3E88D2"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>14396</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>12833</wp:posOffset></wp:positionV><wp:extent cx="504000" cy="504000"/><wp:effectExtent l="0" t="0" r="17145" b="17145"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="1059801733" name="직사각형 1"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="504000" cy="504000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="7F7F7F"/></a:solidFill><a:prstDash val="sysDash"/></a:ln></wps:spPr><wps:bodyPr rot="0" spcFirstLastPara="0" vertOverflow="overflow" horzOverflow="overflow" vert="horz" wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" numCol="1" spcCol="0" rtlCol="0" fromWordArt="0" anchor="ctr" anchorCtr="0" forceAA="0" compatLnSpc="1"><a:prstTxWarp prst="textNoShape"><a:avLst/></a:prstTxWarp><a:noAutofit/></wps:bodyPr></wps:wsp></a:graphicData></a:graphic><wp14:sizeRelH relativeFrom="margin"><wp14:pctWidth>0</wp14:pctWidth></wp14:sizeRelH><wp14:sizeRelV relativeFrom="margin"><wp14:pctHeight>0</wp14:pctHeight></wp14:sizeRelV></wp:anchor></w:drawing>';
  function buildDocxHeader(h) {
    h = h || {};
    var parts = [];
    if (h.academy) parts.push(h.academy);
    if (h.cls) parts.push(h.cls);
    if (h.date) parts.push('출제일 ' + h.date);
    var line1 = parts.join('·');
    if (h.book) line1 += '[' + h.book + ']';
    var meta = '<w:rPr><w:color w:val="6C6A64"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>';   // line1 회색 9pt
    var title = '<w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>';                     // 제목 16pt 볼드
    var lbl = '<w:rPr><w:color w:val="000000"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';     // 이름/점수 라벨
    var blk = '<w:rPr><w:color w:val="595959"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';     // 답란(회색 밑줄자리)
    var sz20 = '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
    // P0: 로고박스(이 문단에 앵커, positionV=paragraph) + line1. 박스 뒤 텍스트는 오른쪽으로 감쌈(wrapSquare).
    var p0 = '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="10733"/></w:tabs></w:pPr>'
      + '<w:r>' + meta + HDR_BOX_DRAWING + '</w:r>'
      + (line1 ? tRun(meta, esc(line1)) : '') + '</w:p>';
    // P1: 제목(좌) + RIGHT 탭(@10733≈텍스트 오른끝) + 이름 ____ | 점수 ____ (오른끝 우측정렬).
    var p1 = '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="10733"/></w:tabs><w:spacing w:before="60" w:after="40"/></w:pPr>'
      + tRun(title, esc(h.title || '')) + tabRun(sz20)
      + tRun(lbl, '이름') + tRun(blk, ' __________________ ')
      + tRun(lbl, '| 점수') + tRun(blk, ' __________') + '</w:p>';
    // P2: 헤더 하단 구분선. before=200(소): 14mm 박스 바닥 살짝 아래로 구분선을 내려 full-width 보장(작은 여백).
    var p2 = '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="auto"/></w:pBdr><w:spacing w:before="200" w:after="40"/></w:pPr></w:p>';
    var p3 = '<w:p><w:pPr><w:spacing w:after="160" w:line="40" w:lineRule="exact"/></w:pPr></w:p>';
    return p0 + p1 + p2 + p3;
  }

  /* ---------- 본문(document.xml) 재구성 ---------- */
  function buildDocument(documentXml, groups, opts) {
    opts = opts || {};
    var prof = profileTemplate(documentXml);
    prof.lineTw = lineTwOf(opts.lsHwp);   // 줄간격(.hwp 통일) → item/발문 문단 w:line twip. 0이면 미적용.
    var columns = opts.columns || 1;
    var out = [];

    // 헤더 = 코드로 재조립(정본 통일). 종전 prof.titleParas(템플릿 보존) 대신 buildDocxHeader 사용.
    out.push(buildDocxHeader(opts.header));
    // 머리글 구간 종료(cols=1). 재조립 헤더는 sectPr를 포함하지 않으므로 항상 sect1로 종료.
    if (prof.sect1) out.push(prof.sect1);

    groups.forEach(function (g) {
      // isFull(1단) 결정: data.full 중 '단일 장문'(영영풀이)만 1단. '다줄 구조'(문장완성)는 2단으로.
      var full = !!g.full;
      if (full && TWOCOL_MULTILINE_FULL && columns === 2 && groupAvgLines(g) >= 1.5) full = false;   // 문장완성 → 2단
      if (!full && MULTILINE_GROUPS_TO_FULL && columns === 2 && groupAvgLines(g) >= 2) full = true;   // (반대옵션, off)
      var twoCol = (columns === 2) && !full;
      // 정답표시(qa): 이 그룹 정답 밑줄 폭을 '그룹 내 최대 정답폭'으로 통일(짧은 답은 공백으로 채워 동일폭).
      //  정답 문자열 = q의 data-ans(문장중간·파생어·유의어 개별 빈칸) + 끝빈칸 유형(1·2·4·7)은 it.ans 통째(쉼표 그대로).
      opts._qaTargetU = 0;
      if (opts.qa) {
        var mxU = 0, reA = /data-ans="([^"]*)"/g, mA;
        g.items.forEach(function (it) {
          var anss = [], hasSpan = false;
          reA.lastIndex = 0;
          while ((mA = reA.exec(String(it.q || '')))) { anss.push(mA[1]); hasSpan = true; }
          if (!hasSpan && it.ans) anss.push(String(it.ans));
          anss.forEach(function (a) { a = a.replace(/&[a-z]+;/g, ' '); var w = answerWidthNbsp(a); if (w > mxU && w <= (prof.blankUnits || 0) * 1.05) mxU = w; });   // 고정칸 초과 정답은 그룹 통일폭에서 제외(따로 새 줄 처리)
        });
        if (mxU) opts._qaTargetU = Math.max(prof.blankUnits || 0, mxU + 2);
      }
      out.push(makeAsk(g.ask, prof));
      if (twoCol) {
        if (prof.sect1) out.push(prof.sect1);   // 발문 전체폭
        // 문항 사이 간격은 buildItem이 문단 뒤 간격(after)으로 부여(빈 문단 안 씀 → 단 상단 윗공백 없음).
        g.items.forEach(function (it) { out.push(buildItem(it, it._n, prof, opts, false)); });
        if (prof.sect2) out.push(prof.sect2);   // 항목 2단(연속 섹션브레이크→자동 균등분할)
      } else {
        g.items.forEach(function (it) { out.push(buildItem(it, it._n, prof, opts, true)); });
        if (prof.sect1) out.push(prof.sect1);   // 발문+항목 전체폭
      }
    });

    // 마지막: body 최종 sectPr 로 끝(빈 후행 섹션)
    var bodyXml = out.join('') + prof.finalSect;
    return prof.preBody + bodyXml + prof.postBody;
  }
  global.DocxTpl = {
    profileTemplate: profileTemplate,
    buildDocument: buildDocument,
    parseSegs: parseSegs
  };

  /* ---------- zip 재포장 ---------- */
  async function repackage(srcZip, overrides) {
    var names = Object.keys(srcZip.files).filter(function (n) { return !srcZip.files[n].dir; });
    var z = new global.JSZip();
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var content = (overrides[n] != null) ? overrides[n] : await srcZip.file(n).async('uint8array');
      z.file(n, content);
    }
    Object.keys(z.files).forEach(function (k) { if (z.files[k].dir) delete z.files[k]; });
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  }

  /* ---------- 설정·데이터 읽기 (hwpx-tpl-export 와 동일 규칙) ---------- */
  function curViewMode() {
    var r = document.querySelector && document.querySelector('input[name="viewopt"]:checked');
    if (!r) return 'q';
    return r.value === '정답' ? 'ans' : r.value === '정답표시시험지' ? 'qa' : 'q';
  }
  function textOf(id) { var e = document.getElementById(id); return e ? e.textContent.trim() : ''; }
  function readConfig() {
    var sheet = document.getElementById('wzSheet');
    var columns = sheet && sheet.classList.contains('cols2') ? 2 : 1;
    var view = curViewMode();
    var cs = sheet ? getComputedStyle(sheet) : null;
    var qfsPx = cs ? (parseFloat(cs.getPropertyValue('--qfs')) || 11) : 11;
    var gapPx = cs ? (parseFloat(cs.getPropertyValue('--wzgap')) || 18) : 18;
    var size = global.neVocabSize ? global.neVocabSize(qfsPx) : Math.round(qfsPx);
    var level = global.neVocabGapLevel ? global.neVocabGapLevel(gapPx) : 2;
    var gapLabel = global.neVocabGapName ? global.neVocabGapName(level) : '보통';
    var lsHwp = global.neVocabHwpLineSpacing ? global.neVocabHwpLineSpacing(size, level) : 0;   // 줄간격 %(.hwp 통일) → item/발문 w:line 근사에 사용(0이면 미적용)
    return {
      columns: columns, size: size, gapLabel: gapLabel, lsHwp: lsHwp,
      qa: view === 'qa', ansOnly: view === 'ans',
      spell: !!(sheet && sheet.classList.contains('spell-on')) && view === 'q',
      // cls·date 추가(2026-07-23): 헤더를 템플릿 보존이 아니라 코드로 재조립하므로 HWP/HWPX와 동일 필드 필요.
      header: { title: textOf('wzTitle'), academy: textOf('wzAcad'), cls: textOf('wzClass'), book: textOf('wzBook'), date: textOf('wzDate') }
    };
  }
  function normalizePool(pool) {
    var n = 1;
    return (pool || []).map(function (g) {
      var items = (g.items || []).map(function (it) {
        it._n = n++;
        if (it.ans == null) it.ans = it.aw || it.a || '';
        if (it.fl == null) it.fl = it.ans ? String(it.ans).charAt(0) : '';
        return it;
      });
      return { ask: g.ask, full: !!g.full, items: items };
    });
  }
  function readGroups() {
    var g;
    if (global.readGroupsForHwpx) g = global.readGroupsForHwpx();
    else if (global.wordbankToPool && global.loadWordbank) g = normalizePool(global.wordbankToPool(global.loadWordbank()));
    else throw new Error('MISSING_DATA_SOURCE: readGroupsForHwpx 또는 wordbankToPool 필요');
    return global.neReorderFullLast ? global.neReorderFullLast(g) : g;   // 1단 유형(문장완성·영영풀이) 후미배치 + 재번호
  }

  /* ---------- 다운로드 ---------- */
  async function downloadDocxTpl(btn) {
    var old = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '만드는 중…'; btn.disabled = true; }
    try {
      if (!global.JSZip) { alert('JSZip을 못 불러왔습니다.'); return false; }
      var cfg = readConfig();
      var groups = readGroups();
      var fname = TPL.fileName(cfg);
      var zip;
      var tpl = global.DOCX_TEMPLATES && global.DOCX_TEMPLATES[fname];
      if (typeof tpl === 'string') {
        zip = await global.JSZip.loadAsync(tpl, { base64: true });   // file://용 내장 base64
      } else if (tpl && typeof tpl === 'object') {
        zip = new global.JSZip();
        Object.keys(tpl).forEach(function (k) { zip.file(k, tpl[k]); });
      } else {
        var resp = await fetch(encodeURI(TPL.url(cfg)));
        if (!resp.ok) throw new Error('템플릿을 못 찾음: ' + TPL.url(cfg) + ' (HTTP ' + resp.status + ')');
        zip = await global.JSZip.loadAsync(await resp.arrayBuffer());
      }
      var documentXml = await zip.file('word/document.xml').async('string');
      var newDoc = buildDocument(documentXml, groups, {
        columns: cfg.columns, size: cfg.size, gapLabel: cfg.gapLabel, lsHwp: cfg.lsHwp,
        qa: cfg.qa, spell: cfg.spell, ansOnly: cfg.ansOnly, header: cfg.header
      });
      var out = await repackage(zip, { 'word/document.xml': newDoc });
      var modeLabel = global.neViewModeLabel ? global.neViewModeLabel(cfg) : '문제';   // 문제/정답/문제+정답
      var titleName = safeFileTitle(cfg.header && cfg.header.title);   // 파일명 접두 = 시험지명(wzTitle). 비면 '어휘시험지'.
      var saveName = titleName + '_' + modeLabel + '_' + cfg.columns + '단_' + cfg.size + '_' + cfg.gapLabel + '.docx';
      (global.saveBlobCompat || saveBlobFallback)(out, saveName);
    } catch (e) {
      alert('DOCX 생성 오류: ' + (e && e.message ? e.message : e));
    } finally {
      if (btn) { btn.textContent = old; btn.disabled = false; }
    }
    return false;
  }
  function saveBlobFallback(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  // 저장 파일명 접두 = 시험지명(wzTitle). 파일명 금지문자 제거·공백정리 후 비면 '어휘시험지' 폴백.
  function safeFileTitle(t) {
    var s = (t == null ? '' : String(t)).replace(/[\\\/:*?"<>|\r\n\t]/g, '').replace(/\s+/g, ' ').trim();
    return s || '어휘시험지';
  }

  global.downloadDocxTpl = downloadDocxTpl;
  global.downloadDocx = downloadDocxTpl;   // 기존 버튼 onclick="downloadDocx(this)" 호환
  if (typeof module !== 'undefined' && module.exports) module.exports = global.DocxTpl;
})(typeof window !== 'undefined' ? window : globalThis);
