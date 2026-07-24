/* ============================================================
 * hwpml-export.js — 한글 '.hwp'(HWPML 2.8 단일 XML) 내보내기
 *
 * 목적: 구버전 한글(2007~2010 등) 사용자용. .hwpx(OWPML zip)는 한글 2014+에서만
 *   안정적으로 열리므로, 구버전에서도 열리는 HWPML 2.8 단일 XML을 '.hwp'로 내보낸다.
 *   (레거시 createHWP.asp가 같은 이유로 HWPML을 썼다 — 확장자만 .hwp, 내용은 XML.)
 *
 * 방식(중요): 정본 템플릿 본문교체(hwpx-tpl-export.js)와 달리 이것은 from-scratch 생성이다.
 *   한글이 저장한 참조 .hml(예: 어휘시험지_2단_11_보통(160%)_hml.hml=Ver2.91, 타사/동아_*.hml=Ver2.8)의
 *   구조(탭정의·RIGHT 정지점 2×컬럼폭=51392 등)를 '설계 참조'로만 쓰고, 런타임엔 .hml을 읽지 않는다
 *   (fetch/loadAsync 없음). 즉 참조 .hml을 편집·치환하는 게 아니라 같은 구조의 HWPML을 코드가 처음부터 찍는다.
 *   ▷ 본문교체용 '정본 30종 세트'는 없어 from-scratch를 택함(=HWPX 방식과의 차이). 참조 .hml 자체는 존재함.
 *   → 레이아웃 품질은 .hwpx(정본 30종)보다 단순하다. 구버전 호환이 우선이라는 결정에 따른 1차선.
 *   품질이 부족하면 방식 B(HWPML 정본 30종 + 본문교체)로 승급.
 *
 * 재사용(SSOT): 데이터·규칙은 HWPX/DOCX와 공유한다.
 *   - readGroupsCompat(): groups 모델 + neReorderFullLast(1단 후미배치)  ← ne-export-common.js
 *   - 글자크기/줄간격: neVocabSize / neVocabGapLevel / neVocabLineSpacing  ← ne-export-common.js
 *   - 저장: saveBlobCompat (file:// data: URI 우회)                       ← ne-export-common.js
 * 신규(HWPML 전용): from-scratch 직렬화기(hml* : v2.2 index.html의 검증 계열을 이식·정리).
 *
 * 답란 밑줄: '밑줄 속성(UNDERLINE) + 공백' 방식. from-scratch에선 폰트 글리프 '_'보다
 *   뷰어·폰트 독립적이라 구버전에서 안전(정본 hwpx의 '맑은고딕 _'는 템플릿 경로 전용).
 *
 * 사용:
 *   <button onclick="return downloadHwpTpl(this)">한글(.hwp) 다운로드</button>
 *   index.html 로드 순서: ne-export-common.js → data.hwp.js → (이 파일)
 *
 * ⚠ 검증 한계: python-hwpx 검증기는 OWPML(zip) 전용이라 HWPML 단일 XML은 검증 못 한다.
 *   여기서 보장하는 것은 'XML well-formed + 구조 무결성'까지이고,
 *   구버전 한글 실열림/레이아웃은 육안 확인이 필요하다.
 * ============================================================ */
(function (global) {
  'use strict';

  // ── 설정: #wzSheet + ne-export-common SSOT에서 읽음 (hwpx-tpl-export.readConfig와 동일 규칙) ──
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
    var qa = (view === 'qa');
    var ansOnly = (view === 'ans');
    var spell = !!(sheet && sheet.classList.contains('spell-on')) && view === 'q';
    var cs = sheet ? getComputedStyle(sheet) : null;
    var qfsPx = cs ? (parseFloat(cs.getPropertyValue('--qfs')) || 11) : 11;
    var gapPx = cs ? (parseFloat(cs.getPropertyValue('--wzgap')) || 18) : 18;
    var sizePt = global.neVocabSize ? global.neVocabSize(qfsPx) : Math.round(qfsPx);
    var level = global.neVocabGapLevel ? global.neVocabGapLevel(gapPx) : 2;
    var gapLabel = global.neVocabGapName ? global.neVocabGapName(level) : '보통';
    // .hwp 줄간격 ★[2026-07-23 수정]: 정본 바이너리(.hwp) 실측값 85/100/130(11pt)을 HWPML 'Percent'로 그대로
    //  쓰면 바이너리의 RATIO(글자에 따라)보다 촘촘하게 렌더돼 실제로 더 좁아진다(사용자: 정본 narrow가 생성물보다
    //  넓음). '숫자'를 맞추는 게 아니라 '보이는 줄간격'을 맞춰야 함 → 한글에서 검증된 neVocabLineSpacing(11pt
    //  150/160/180)을 사용(HWPX와 동일 체계). neVocabHwpLineSpacing(바이너리 실측)은 DOCX만 계속 사용.
    var ls = global.neVocabLineSpacing ? global.neVocabLineSpacing(sizePt, level, columns)
           : (global.neVocabHwpLineSpacing ? global.neVocabHwpLineSpacing(sizePt, level) : 160);
    return {
      columns: columns, size: sizePt, gapLabel: gapLabel, ls: ls, qa: qa, spell: spell, ansOnly: ansOnly,
      header: {
        title: textOf('wzTitle') || '어휘시험지', academy: textOf('wzAcad'),
        cls: textOf('wzClass'), book: textOf('wzBook'), date: textOf('wzDate')
      }
    };
  }
  // groups 모델 획득(HWPX/DOCX와 동일 경계) + 1단 후미배치
  function readGroupsCompat() {
    var g;
    if (global.readGroupsForHwpx) g = global.readGroupsForHwpx();
    else if (global.wordbankToPool && global.loadWordbank) g = normalizePool(global.wordbankToPool(global.loadWordbank()));
    else throw new Error('MISSING_DATA_SOURCE: readGroupsForHwpx 또는 wordbankToPool 필요');
    return global.neReorderFullLast ? global.neReorderFullLast(g) : g;
  }
  function normalizePool(pool) {
    return (pool || []).map(function (g) {
      var items = (g.items || []).map(function (it) {
        if (it.ans == null) it.ans = it.aw || it.a || '';
        if (it.fl == null) it.fl = it.ans ? String(it.ans).charAt(0) : '';
        return it;
      });
      return { ask: g.ask, full: !!g.full, items: items };
    });
  }

  // ── 본체: groups + cfg → HWPML 2.8 XML 문자열 ──
  function buildHwpml(groups, cfg) {
    var fontName = '함초롬바탕';               // 한글 출력 표준 글꼴
    var mmToHU = function (mm) { return Math.round(mm * 7200 / 25.4); };
    var pxToHU = function (px) { return Math.round(px * 0.75 * 100); };
    var SIZE = Math.round(cfg.size * 100);     // pt → 1/100pt (CHARSHAPE Height)
    var LSVAL = cfg.ls, LSTYPE = 'Percent';    // 줄간격 % (SSOT)
    var ITEMSP = pxToHU(18);                   // 문항 사이 간격
    var GRPSP = pxToHU(Math.round(18 * 1.8));  // 그룹(유형) 사이 간격
    var ASKSP = Math.round(SIZE * 0.9);        // 발문 뒤 여백
    var CONT = 0;                              // 한 문항 내 줄바꿈 사이(줄간격이 여백 담당)
    // 번호 뒤 LEFT 탭 정지점(=내용 시작 x). 번호("70." 등 볼드) 폭보다 커야 하되, 너무 크면 들여쓰기가 과함.
    //  ≈11mm(3200HU)면 두 자리 번호를 여유 있게 넘기면서 컴팩트. (예전 6000≈21mm은 들여쓰기 심하다 반려.)
    var HANG = Math.max(2800, Math.round(SIZE * 2.9));
    var COLGAP = pxToHU(30);                    // 단 사이 간격
    var UL = function (base) { return Math.max(4, Math.round(base * 1100 / SIZE)); };  // 밑줄 공백 수(크기 반비례)
    var PG = { w: mmToHU(210), h: mmToHU(297), top: mmToHU(10), bottom: mmToHU(12), left: mmToHU(10), right: mmToHU(10) };
    var TXW = PG.w - PG.left - PG.right;
    var COLW = Math.round((TXW - COLGAP) / 2);
    var qa = cfg.qa, spell = cfg.spell, ansOnly = cfg.ansOnly;

    // ── 스타일 딕셔너리(중복 조합은 id 재사용) ──
    var charPrs = [], charKey = {};
    function getCharPr(o) {
      var color = o.color || '#000000';
      var key = [o.size, !!o.bold, !!o.italic, !!o.underline, color].join('|');
      if (charKey[key] != null) return charKey[key];
      var id = charPrs.length; charKey[key] = id;
      charPrs.push({ id: id, size: o.size, bold: !!o.bold, italic: !!o.italic, underline: !!o.underline, color: color });
      return id;
    }
    var paraPrs = [], paraKey = {};
    function getParaPr(o) {
      var next = o.next || 0, prev = o.prev || 0, align = o.align || 'LEFT', border = o.border || 1,
        ls = o.ls || LSVAL, lst = o.lst || LSTYPE, tab = o.tab || 0, keepNext = o.keepNext ? 1 : 0,
        bo = o.bo || 0, left = o.left || 0, intent = o.intent || 0, keepLines = o.keepLines ? 1 : 0;
      var key = [next, prev, align, border, ls, lst, tab, keepNext, bo, left, intent, keepLines].join('|');
      if (paraKey[key] != null) return paraKey[key];
      var id = paraPrs.length; paraKey[key] = id;
      paraPrs.push({ id: id, next: next, prev: prev, align: align, border: border, ls: ls, lst: lst, tab: tab, keepNext: keepNext, bo: bo, left: left, intent: intent, keepLines: keepLines });
      return id;
    }
    // 탭 정지점(TABDEF) 딕셔너리.
    //   ★한글은 Id 0·1·2를 예약(0=정지점 없음, 1=자동왼쪽탭, 2=자동오른쪽탭). 커스텀 정지점을 Id 1에
    //    넣으면 한글이 '자동 왼쪽 탭'으로 처리해 내 정지점을 통째로 무시함(→ 탭이 안 먹었던 진짜 원인).
    //    정본도 항목 탭을 Id 6에 둔다. 따라서 커스텀은 Id 3부터 시작해야 한다.
    var tabPrs = [{}, { autoLeft: true }, { autoRight: true }], tabKey = {};
    // 문항 TabDef = LEFT@HANG(단어 시작) + RIGHT@rightStop(답란 우측정렬). 정본(.hml)과 동일 구조.
    function getItemTab(rightStop) {
      var key = 'I|' + rightStop;
      if (tabKey[key] != null) return tabKey[key];
      var id = tabPrs.length; tabKey[key] = id;
      // LEFT@HANG: left=0 문단에서 번호(0) 뒤 TAB → 내용이 HANG에서 시작. (Left여백은 안 씀 — HWPML서 내어쓰기가 전체를 밀어버림.)
      tabPrs.push({ stops: [{ pos: HANG, type: 'Left' }, { pos: rightStop, type: 'Right' }] });
      return id;
    }
    var BASE_CHAR = getCharPr({ size: SIZE });   // id 0
    var BASE_PARA = getParaPr({});               // id 0 (style '바탕글' 참조)

    // ── 인라인 파서: 문항 HTML(<b>,<i>,<u>,<span class="wl"/hl-*>,<br>) → 세그먼트 ──
    var MARK = ' ';
    var HL = { 'hl-black': '#1a1a1a', 'hl-red': '#e74c3c', 'hl-blue': '#2563eb', 'hl-green': '#16a34a', 'hl-yellow': '#eab308' };
    function parseInline(html) {
      var blankData = [];
      html = (html || '').replace(/<span class="wl"([^>]*)>[\s\S]*?<\/span>/g, function (_m, _a) {
        var fl = (_a.match(/data-fl="([^"]*)"/) || [])[1] || '';
        var ans = (_a.match(/data-ans="([^"]*)"/) || [])[1] || '';
        blankData.push({ fl: fl, ans: ans });   // 정답/첫글자는 인라인에 박지 않고 답란(밑줄)에 실어 → 우측정렬 유지(모든 모드)
        return MARK;                             // 위치만 빈칸 마커
      });
      var segs = [], fmt = { bold: false, italic: false, underline: false, color: null };
      function pushText(raw) {
        raw.split(MARK).forEach(function (p, k) {
          var t = p.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          if (t) segs.push({ type: 'text', text: t, bold: fmt.bold, italic: fmt.italic, underline: fmt.underline, color: fmt.color });
          if (k < raw.split(MARK).length - 1) segs.push({ type: 'blank' });
        });
      }
      var re = /<[^>]+>|[^<]+/g, m;
      while ((m = re.exec(html)) !== null) {
        var tok = m[0];
        if (tok[0] !== '<') { pushText(tok); continue; }
        var low = tok.toLowerCase().replace(/\s+/g, '');
        if (low.indexOf('<br') === 0) segs.push({ type: 'break' });
        else if (low === '<b>') fmt.bold = true; else if (low === '</b>') fmt.bold = false;
        else if (low === '<i>') fmt.italic = true; else if (low === '</i>') fmt.italic = false;
        else if (low === '<u>') fmt.underline = true; else if (low === '</u>') fmt.underline = false;
        else if (low.indexOf('<span') === 0) { var cm = tok.match(/class="(hl-[a-z]+)"/); if (cm) fmt.color = HL[cm[1]] || null; }
        else if (low === '</span>') fmt.color = null;
      }
      var _bi = 0;   // 빈칸 세그먼트에 순서대로 정답/첫글자 부착(생성 순서 = 스팬 순서)
      segs.forEach(function (s) { if (s.type === 'blank') { var d = blankData[_bi++] || {}; s.ans = d.ans || ''; s.fl = d.fl || ''; } });
      return segs;
    }
    var NB = ' ';   // nbsp — 밑줄 답란 채움(공백은 정렬/자간에서 뭉개질 수 있어 정본이 nbsp 사용)
    function fillStr(ans, fl, ulLen) {
      if (qa && ans) return ans + NB.repeat(Math.max(2, ulLen - ans.length));
      if (spell && fl && /[A-Za-z]/.test(fl)) return fl + NB.repeat(Math.max(2, ulLen - fl.length));  // 첫글자 힌트는 영어 답만
      return NB.repeat(ulLen);
    }
    function estW(t) { var w = 0; for (var i = 0; i < t.length; i++) { w += (t.charCodeAt(i) < 0x1100 ? SIZE * 0.5 : SIZE); } return w; }
    // 정답(qa)을 '밑줄 폭(ulLen)' 안에서 가운데: 정답 폭을 nbsp 개수로 환산해 좌우 대칭 패딩. 밑줄 구조·크기는 문제 모드와 동일 유지.
    function centerFill(ans, ulLen) {
      var nbspW = SIZE * 0.32;
      var wUnits = estW(ans) / nbspW;                          // 정답 폭 ≈ nbsp 몇 개
      var pad = Math.max(1, Math.round((ulLen - wUnits) / 2));  // 좌우 각 패딩
      return NB.repeat(pad) + ans + NB.repeat(pad);
    }
    //  내용을 주어진 폭(budget) 안에서 '수동' 줄바꿈(단어 우선, 안 되면 글자 단위). HWPX emitMeaningWrapped 이식.
    //   → 내용이 오른쪽 밑줄 예약영역을 침범하지 않게 왼쪽 영역 안에서만 접힘. (HWPML은 문단 우측여백으로 이걸 못 하므로 직접 계산.)
    function wrapText(text, budget) {
      budget = Math.max(SIZE * 2, budget);
      var toks = String(text == null ? '' : text).split(/(\s+)/);   // 단어/공백 분리(공백 토큰 보존)
      var lines = [], cur = '', curW = 0;
      function hardPush(w) { for (var i = 0; i < w.length; i++) { var cw = estW(w[i]); if (curW + cw > budget && cur.length) { lines.push(cur); cur = ''; curW = 0; } cur += w[i]; curW += cw; } }
      toks.forEach(function (w) {
        if (!w) return;
        var ww = estW(w);
        if (curW + ww > budget && cur.replace(/\s+$/, '').length) { lines.push(cur.replace(/\s+$/, '')); cur = ''; curW = 0; if (/^\s+$/.test(w)) return; }
        if (ww > budget) hardPush(w); else { cur += w; curW += ww; }
      });
      if (cur.replace(/\s+$/, '').length) lines.push(cur.replace(/\s+$/, ''));
      return lines.length ? lines : [''];
    }
    function segLineToRuns(lineSegs) {
      return lineSegs.map(function (s) {
        //  문장 중간 빈칸(문장완성 50번대): qa=정답을 밑줄 폭(8) 안에서 가운데(centerFill, 트레일링 빈칸 유형과 동일). 스펠/문제=fillStr(첫글자·빈칸).
        if (s.type === 'blank') return { charPrId: getCharPr({ size: SIZE, underline: true }), text: (qa && s.ans) ? centerFill(s.ans, 8) : fillStr(s.ans || '', s.fl || '', 8) };
        return { charPrId: getCharPr({ size: SIZE, bold: s.bold, italic: s.italic, underline: s.underline, color: s.color }), text: s.text };
      });
    }

    // ── 한 문항 → 문단 배열. 정본(.hml) 구조 재현하되 정렬 버그 수정.
    //   ★핵심1: <TAB/>는 반드시 <CHAR> 안에. CHAR 밖의 <TEXT><TAB/></TEXT>는 구버전 한글이 못 읽어 ÿ.
    //   ★핵심2: 번호 뒤 LEFT 탭은 두지 않는다 — 번호 폭이 LEFT 정지점을 넘으면 그 탭이 곧장 RIGHT로
    //     튀어 '단어'가 우측정렬되는 버그. 번호 뒤=공백, 단어 뒤 RIGHT 탭 1개로 '밑줄만' 우측정렬.
    //   답란 밑줄은 '정해진 고정 크기'(ulLen)만큼만 — 남는 여백을 채우지 않는다.
    //   단어형: 단어 뒤 RIGHT 탭 1개 → 고정 길이 밑줄이 칸 오른끝에 정렬(단어~밑줄 사이는 빈 값).
    //   ★밑줄은 무조건 한 줄(nbsp=비분리). 내용+밑줄이 칸을 넘으면 밑줄만 '다음 줄에 우측정렬'로 뺀다.
    function buildItem(q, hasBlank, n, isLast, opt) {
      opt = opt || {};
      var ans = opt.ans || '', fl = opt.fl || '', ulLen = opt.ulLen || 24;
      var colW = opt.colW || TXW;             // 실제 칸(컬럼) 폭(밑줄/맞춤 계산용)
      // [정답(ansOnly) 뷰] 번호 + 정답만(문제·밑줄 없음). 레이아웃(단/문단 간격)은 유지 — HWPX buildItem opts.ansOnly와 동일 규칙.
      //  번호 뒤 <TAB/> → LEFT@HANG(다른 뷰와 내용 시작열 통일). 밑줄·우측정렬·줄바꿈 계산은 전부 건너뜀.
      if (ansOnly) {
        var aRuns = [{ charPrId: getCharPr({ size: SIZE, bold: true }), text: n + '.', tabsAfter: 1 }];
        if (ans) aRuns.push({ charPrId: getCharPr({ size: SIZE }), text: ans });
        return [{
          paraPrId: getParaPr({
            next: isLast ? GRPSP : ITEMSP, ls: LSVAL, lst: LSTYPE,
            align: 'LEFT', left: 0, intent: 0, keepLines: 1,
            tab: getItemTab(opt.rightStop || colW)
          }), colChange: null, runs: aRuns
        }];
      }
      //  ★RIGHT 정지점=rightStop(2단은 2×컬럼폭≈전체폭). HWPML 신문형 다단은 탭좌표가 '전체 텍스트폭' 기준이고
      //   한글이 우측탭을 각 컬럼 오른끝에 클램프함 → 컬럼폭(1×)으로 잡으면 우측정렬 실패(정본 .hml=2×컬럼폭=51392).
      var itemTab = getItemTab(opt.rightStop || colW);   // LEFT@HANG(내용 시작열) + RIGHT@rightStop(답란 우측정렬)
      var nbspW = SIZE * 0.32;                 // nbsp 실제 렌더폭 ≈ 0.3em(함초롬바탕). 옛 0.5em은 과대추정→간격/밑줄이 짧아 우측정렬 실패했음.
      var blankW = ulLen * nbspW;              // 고정 밑줄 폭(추정)
      var segs = q ? parseInline(q) : [];
      var lines = [[]]; segs.forEach(function (s) { if (s.type === 'break') lines.push([]); else lines[lines.length - 1].push(s); });
      var out = [];
      lines.forEach(function (lseg, li) {
        var runs = [];
        var isLastLine = li === lines.length - 1;
        var trailingBlank = lseg.length && lseg[lseg.length - 1].type === 'blank';
        var mainSegs = trailingBlank ? lseg.slice(0, -1) : lseg;
        var contentRuns = segLineToRuns(mainSegs);
        var hasWord = mainSegs.some(function (s) { return s.type === 'text' && s.text && s.text.replace(/\s/g, ''); });
        var putBlankHere = (isLastLine && hasBlank) || trailingBlank;
        var itemEndNext = isLast ? GRPSP : ITEMSP;
        var wordW = mainSegs.reduce(function (a, s) { return a + (s.text ? estW(s.text) : 0); }, 0);

        // ── 번호(볼드)·내용을 항상 HANG에서 시작: 번호 뒤 TAB, 파생어 [명사] 등 li>0 줄은 선두 TAB. → 세로 정렬 통일(문제 1·5).
        if (li === 0) runs.push({ charPrId: getCharPr({ size: SIZE, bold: true }), text: n + '.', tabsAfter: 1 });

        // 답란 밑줄 내용(fillStr/centerFill)은 미리 계산(정답=가운데·문제/스펠=우측).
        var tb = trailingBlank ? lseg[lseg.length - 1] : null;
        var srcAns = (tb && tb.ans) ? tb.ans : ans, srcFl = (tb && tb.fl) ? tb.fl : fl;
        var fill = (qa && srcAns) ? centerFill(srcAns, ulLen) : fillStr(srcAns, srcFl, ulLen);

        if (putBlankHere && hasWord) {
          // ── 내용이 오른쪽 밑줄 영역을 침범하지 않게 '왼쪽 영역 폭 안에서' 내용을 수동 줄바꿈(HWPX 방식) ──
          //   reserve=밑줄폭+한 칸을 예약 → 내용은 [HANG, colW−reserve]에만. 마지막 줄 끝에 <TAB/>+밑줄(RIGHT 우측정렬).
          //   ★HWPML은 문단 우측여백으로 내용을 못 가두므로(밑줄까지 밀림) 직접 접는다. 자연 줄바꿈에 맡기면 내용이 전폭을 써 밑줄이 밀려났음.
          var contentText = mainSegs.map(function (s) { return s.text || ''; }).join('');
          // 유의어·반의어: 뜻 끝의 '(유)/(반)' 마커를 분리 → 왼쪽 뜻 접기에서 빼고 밑줄 바로 왼쪽(우측정렬 영역)에 붙인다.
          //  HWPX/DOCX와 동일 규칙(뜻만 왼쪽, '(유) ____'가 함께 오른끝). 마커는 밑줄 없는 평문 run으로 밑줄 앞에.
          var marker = '';
          var mkm = contentText.match(/^([\s\S]*?)(\s*\((?:유|반)(?:의어)?\))\s*$/);
          if (mkm && mkm[1].trim()) { contentText = mkm[1]; marker = mkm[2].trim() + ' '; }
          var markerW = marker ? estW(marker) : 0;
          var reserve = blankW + markerW + SIZE;
          var budget = Math.max(SIZE * 2, colW - HANG - reserve);
          var wlines = wrapText(contentText, budget);
          var contentCP = getCharPr({ size: SIZE });                 // 이 유형들 내용은 평문(볼드/색 없음)
          // [정답 슬롯초과 → 새 줄+우측정렬, HWPX 이식] 정답(qa)이 고정 밑줄칸(blankW)보다 넓으면(여유분 5%)
          //  뜻과 같은 줄에 두지 않고 뜻 뒤에서 <LINEBREAK/>로 줄을 끊고, 답을 '새 줄'로 내린다. 새 줄 첫머리에
          //  선두 <TAB/>(→RIGHT 정지점)를 두면 답이 자기 줄에서 오른끝 우측정렬된다. 구형 한글은 밑줄영역을
          //  자동 줄바꿈하지 않아(특히 공백 없는 영단어) 인라인이면 긴 답이 칸을 넘쳐 흘렀다(HWPX와 동일 대응).
          var ansOverflow = !!(qa && srcAns) && (estW(srcAns) > blankW * 1.05);
          wlines.forEach(function (wtext, wi) {
            var firstVisual = (li === 0 && wi === 0);                // 번호 바로 뒤(번호 tabsAfter로 이미 HANG)
            var lastVisual = (wi === wlines.length - 1);
            var r = { charPrId: contentCP, text: wtext };
            if (!firstVisual) r.tabs = 1;                            // 이어지는 줄·li>0 첫 줄: 선두 <TAB/>→HANG(내어쓰기 정렬)
            if (lastVisual) {
              if (ansOverflow) r.lbAfter = true;                     // 초과: 뜻 뒤에서 줄바꿈(답은 새 줄로 내림)
              else r.tabsAfter = 1;                                  // 정상: 내용<TAB/>→RIGHT 정지점(인라인 우측정렬)
            } else r.lbAfter = true;                                 // 뜻이 여러 줄: 문단내 강제 줄바꿈
            runs.push(r);
          });
          // 새 줄로 내린 경우: 그 줄 첫 run에 선두 <TAB/> ×2 → RIGHT 정지점으로 스냅(마커·밑줄이 함께 오른끝 정렬).
          //  ★탭 2개인 이유: 새 줄은 x=0에서 시작 → 탭 1개면 첫 정지점(LEFT@HANG)에 멈춰 '좌측정렬'된다(구형 한글 확인).
          //   tabPr=LEFT@HANG + RIGHT@rightStop이므로 탭①=HANG 소비, 탭②=RIGHT 정지점 도달 → 뒤 내용이 오른끝 우측정렬.
          //   (인라인 케이스는 뜻이 커서를 HANG 너머로 밀어 탭 1개로 곧장 RIGHT에 감 — 새 줄만 2개 필요.)
          var leadTab = ansOverflow ? 2 : 0;
          if (marker) { runs.push({ charPrId: getCharPr({ size: SIZE }), text: marker, tabs: leadTab }); leadTab = 0; }   // (유)/(반) — 밑줄 앞 = 밑줄과 함께 우측정렬
          runs.push({ charPrId: getCharPr({ size: SIZE, underline: true }), text: fill, tabs: leadTab });   // 밑줄(nbsp만) — 트레일링/선두 TAB이 RIGHT로 밀어 우측정렬
        } else {
          // 내용 emit(블랭크 없는 줄) 또는 듣기(단어 없음, 번호 뒤 인라인 밑줄).
          if (contentRuns.length) {
            if (li > 0) contentRuns[0] = { charPrId: contentRuns[0].charPrId, text: contentRuns[0].text, tabs: 1 };
            runs = runs.concat(contentRuns);
          } else if (li > 0 && putBlankHere) {
            runs.push({ charPrId: BASE_CHAR, text: '', tabs: 1 });   // 내용 없는 답줄: 선두 TAB만
          }
          if (putBlankHere) {
            // 듣기(단어없음): 번호 뒤 TAB(run0.tabsAfter)으로 HANG에서 시작 → 밑줄 인라인.
            runs.push({ charPrId: getCharPr({ size: SIZE, underline: true }), text: fill, tabs: 0 });
          }
        }

        var needTab = runs.some(function (r) { return r.tabs || r.tabsAfter; });
        var contentIsEnd = isLastLine;   // 밑줄이 항상 같은 줄에 있으므로 마지막 줄이 곧 문항 끝
        out.push({
          paraPrId: getParaPr({
            next: contentIsEnd ? itemEndNext : CONT, ls: LSVAL, lst: LSTYPE,
            // left=0, intent=0: 번호는 칸 왼끝(0), 내용은 TAB(LEFT@HANG)로 HANG에서 시작.
            //  ★HWPML은 Left여백/음수 Indent 내어쓰기가 번호까지 통째로 오른쪽으로 밀어버려 못 씀 → 줄바꿈줄 인덴트 포기(수용).
            align: 'LEFT', keepNext: !contentIsEnd, left: 0, intent: 0,
            // ★KeepLines=true: 이 문단의 줄바꿈된 시각적 줄들이 컬럼/페이지 경계에서 안 쪼개지게 → 항목이 통째로 다음 칸으로 밀림(문항 분리 방지).
            keepLines: 1,
            tab: needTab ? itemTab : 0
          }), colChange: null, runs: runs
        });
      });
      return out;
    }

    // ── 본문 조립: 발문(1단) + 문항(2단 신문형/1단) ──
    var paras = [];
    // 헤더 2줄(2026-07-22, print_sample 최종 헤더 반영):
    //  line1 = 학원·반·출제일 날짜[교재]   / line2 = 제목  이름 ____ | 점수 ____
    (function addHeader() {
      var h = cfg.header;
      // 색·크기: 레퍼런스(print_sample_0722 docx) 헤더 값 그대로 이식.
      //  line1=회색 6C6A64·9pt·볼드아님 / 제목=16pt 볼드 / 이름·점수 라벨=검정·10pt / 답란=회색 595959·밑줄.
      var cMeta = getCharPr({ size: 900, color: '#6C6A64' });                        // line1 메타
      var cTitle = getCharPr({ size: 1600, bold: true });                            // 제목
      var cName = getCharPr({ size: 1000, color: '#000000' });                       // 이름/점수 라벨
      var cBlank = getCharPr({ size: 1000, color: '#595959', underline: true });     // 답란(밑줄)
      // 왼쪽 로고 박스: 레퍼런스와 동일하게 20mm 정사각 + 사면 점선 회색(BorderFill id5) + 흰 배경(=페이지색).
      //  ★2026-07-23: 레퍼런스 docx 박스가 cx/cy=720000EMU(=56.7pt=20mm)·점선(sysDash)·#7F7F7F라 그에 맞춤.
      //   20mm 박스는 헤더 글자보다 크지만, 한글이 '전체폭 구분선 문단'을 박스 아래로 자동 배치하므로 발문은
      //   침범받지 않음(원본 스샷에서 확인). 박스↔구분선 간격=OUTSIDEMARGIN Bottom, 구분선↔발문 간격=스페이서 문단.
      var BOXSZ = 5700;   // 1/7200inch ≈ 20mm
      var BOX = '<TABLE BorderFill="1" CellSpacing="0" ColCount="1" PageBreak="Cell" RepeatHeader="false" RowCount="1">'
        + '<SHAPEOBJECT InstId="1" Lock="false" NumberingType="None" TextWrap="Square" ZOrder="0">'
        + '<SIZE Height="' + BOXSZ + '" HeightRelTo="Absolute" Protect="false" Width="' + BOXSZ + '" WidthRelTo="Absolute"/>'
        + '<POSITION AffectLSpacing="false" AllowOverlap="true" FlowWithText="false" HoldAnchorAndSO="false" HorzAlign="Left" HorzOffset="0" HorzRelTo="Column" TreatAsChar="false" VertAlign="Top" VertOffset="0" VertRelTo="Para"/>'
        + '<OUTSIDEMARGIN Bottom="600" Left="0" Right="500" Top="0"/>'
        + '</SHAPEOBJECT>'
        + '<INSIDEMARGIN Bottom="0" Left="0" Right="0" Top="0"/>'
        + '<ROW><CELL BorderFill="5" ColAddr="0" ColSpan="1" Dirty="false" Editable="true" HasMargin="false" Header="false" Height="' + BOXSZ + '" Protect="false" RowAddr="0" RowSpan="1" Width="' + BOXSZ + '">'
        + '<PARALIST LineWrap="Break" LinkListID="0" LinkListIDNext="0" TextDirection="0" VertAlign="Center">'
        + '<P ColumnBreak="false" PageBreak="false" ParaShape="' + BASE_PARA + '" Style="0"><TEXT CharShape="' + BASE_CHAR + '"><CHAR></CHAR></TEXT></P>'
        + '</PARALIST></CELL></ROW></TABLE>';
      var boxRun = { charPrId: BASE_CHAR, rawText: BOX }, boxPlaced = false;
      // 이름/점수 우측정렬용 RIGHT 탭. ★정지점=2×TXW(넉넉히). 한글은 우측탭을 '줄의 실제 오른끝'에 클램프하므로
      //  1×(정확히 오른끝)으로 두면 정렬 실패(=이름/점수가 제목 옆에 붙어버림) — 문항 답란 규칙과 동일(2× 필수).
      //  cf getItemTab의 rightStop=2×colW, 메모 '정답 긴 답 좌측정렬' 참조.
      var hdrRTabId = tabPrs.length; tabPrs.push({ stops: [{ pos: 2 * TXW, type: 'Right' }] });
      // line1: 학원·반·출제일 날짜[교재]
      var parts = [];
      if (h.academy) parts.push(h.academy);
      if (h.cls) parts.push(h.cls);
      if (h.date) parts.push('출제일 ' + h.date);
      var line1 = parts.join('·');
      if (h.book) line1 += '[' + h.book + ']';
      if (line1) { paras.push({ paraPrId: getParaPr({ align: 'LEFT', ls: 150, next: 300 }), colChange: null, runs: [boxRun, { charPrId: cMeta, text: line1 }] }); boxPlaced = true; }
      // line2: 제목(좌) + [RIGHT 탭] + 이름 ____ | 점수 ____ (오른끝 우측정렬). 레퍼런스 P1 구조.
      //  선두 <TAB/>이 RIGHT 정지점(TXW)에 걸려, 그 뒤 '이름…점수 ____'가 통째로 오른끝에 정렬됨.
      paras.push({
        paraPrId: getParaPr({ align: 'LEFT', ls: 150, prev: 300, next: 200, tab: hdrRTabId }), colChange: null, runs: [
          (boxPlaced ? null : boxRun),
          { charPrId: cTitle, text: h.title },
          { charPrId: cName, text: '이름 ', tabs: 1 },
          { charPrId: cBlank, text: '                  ' },
          { charPrId: cName, text: ' | 점수 ' }, { charPrId: cBlank, text: '          ' }
        ].filter(Boolean)
      });
      // 헤더 아래 가로 구분선: 하단선(BorderFill id3=0.4mm).
      //  ★2026-07-23: 박스(20mm=5700HU)가 헤더 글자(제목2줄 ≈13mm)보다 커서, 한글이 구분선을 박스 아래로
      //   자동 배치하지 않고 박스가 선을 뚫고 내려온다(=박스가 헤더라인 벗어남). → 구분선 prev를 크게(≈9mm)
      //   줘서 구분선을 박스 바닥(≈20mm+여백) 아래로 확실히 내림 → 선이 박스 밑에서 끊김 없이 일자로 지나감.
      //   ★prev 2700→3800(2026-07-23): 2700은 구분선이 박스 바닥에 너무 붙음(라인 위 여백 부족) → 더 내려 여백 확보.
      paras.push({ paraPrId: getParaPr({ align: 'LEFT', ls: 100, border: 3, prev: 3800, next: 200 }), colChange: null, runs: [{ charPrId: getCharPr({ size: 200 }), text: ' ' }] });
      // ★구분선 ↔ 발문(※) 사이 여백 문단(레퍼런스 P3 스페이서). 실제 빈 줄(≈10pt)로 확실한 간격 — Next 간격이
      //  렌더에서 뭉개져 '헤더 라인과 발문 사이 여백 없음'으로 보이던 문제를 실제 줄 높이로 회피.
      paras.push({ paraPrId: getParaPr({ align: 'LEFT', ls: 100, next: 0 }), colChange: null, runs: [{ charPrId: getCharPr({ size: 1000 }), text: ' ' }] });
    })();
    // 본문
    (function addBody() {
      var n = 1, curCols = 1;
      function emit(arr, cols) {
        if (!arr.length) return;
        if (cols !== curCols) { arr[0].colChange = cols; curCols = cols; }
        arr.forEach(function (p) { paras.push(p); });
      }
      function askArr(ask, prev) {
        var runs = [{ charPrId: getCharPr({ size: SIZE }), text: '※ ' }];
        parseInline(ask).forEach(function (s) { if (s.type === 'text' && s.text) runs.push({ charPrId: getCharPr({ size: SIZE, bold: s.bold, italic: s.italic, underline: s.underline, color: s.color }), text: s.text }); });
        return [{ paraPrId: getParaPr({ prev: prev || 0, next: ASKSP, ls: LSVAL, lst: LSTYPE, align: 'JUSTIFY', keepNext: 1 }), colChange: null, runs: runs }];
      }
      groups.forEach(function (g, gi) {
        var twocol = !g.full && cfg.columns === 2;
        var anyWord = g.items.some(function (it) { return it.q && it.q.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, '').replace(/ /g, '').trim(); });
        emit(askArr(g.ask, gi === 0 ? 0 : GRPSP), 1);  // 발문 → 1단(전체폭). 첫 발문 빼고 위 여백(prev=GRPSP)으로 앞 유형과 분리(문제 2).
        // 답란 = 고정 밑줄을 nbsp 간격으로 칸 오른끝에 우측정렬(buildItem). colW=실제 칸 폭(2단 COLW, 1단 TXW).
        // 긴 단어라 한 줄에 안 들어가면 밑줄만 다음 줄(문단 Align=Right)로 내림.
        var colW = twocol ? COLW : TXW;
        //  ★RIGHT 정지점=정본 .hml 규칙 그대로 '2×가용폭'. 2단=2×컬럼폭(TabDef6=51392), 1단=2×텍스트폭(TabDef4=107320).
        //   한글이 우측탭을 각 줄(컬럼/텍스트) 실제 오른끝에 클램프하므로 2×로 넉넉히 줘야 함. 1×는 우측정렬 실패(60번대 버그).
        var W = 2 * colW;
        var ul = twocol ? UL(anyWord ? 22 : 20) : UL(34);   // 답란 밑줄 길이(단어형은 다음 줄 우측정렬이라 여유 있게)
        var itemParas = [];
        g.items.forEach(function (it, i) {
          var isL = (i === g.items.length - 1);
          var ans = (it.ans != null) ? it.ans : (it.aw || it.a || '');
          var fl = (it.fl != null && it.fl !== '') ? it.fl : (ans ? String(ans).charAt(0) : '');
          var arr = buildItem(it.q, !!it.wl, n++, isL, { rightStop: W, colW: colW, ans: ans, fl: fl, ulLen: ul });
          itemParas = itemParas.concat(arr);
        });
        emit(itemParas, twocol ? 2 : 1);              // 문항 → 2단(자동 균등) 또는 1단
      });
    })();

    // ── HWPML 2.8 직렬화 ──
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function hmlColor(hex) {
      hex = (hex || '#000000').replace('#', ''); if (hex.length !== 6) return 0;
      var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      return r | (g << 8) | (b << 16);
    }
    var HMLALIGN = { LEFT: 'Left', RIGHT: 'Right', CENTER: 'Center', JUSTIFY: 'Justify' };
    var HMLLANGS = ['Hangul', 'Latin', 'Hanja', 'Japanese', 'Other', 'Symbol', 'User'];
    function hmlFaceList() {
      var one = '<FONT Id="0" Name="' + esc(fontName) + '" Type="ttf"><TYPEINFO ArmStyle="1" Contrast="0" FamilyType="1" Letterform="1" Midline="1" Proportion="1" StrokeVariation="1" Weight="0" XHeight="1"/></FONT>';
      return '<FACENAMELIST>' + HMLLANGS.map(function (l) { return '<FONTFACE Count="1" Lang="' + l + '">' + one + '</FONTFACE>'; }).join('') + '</FACENAMELIST>';
    }
    function hmlBorderFills() {
      // id1=무테 / id2=사면 실선 / id3=하단 굵은 줄 / id4=하단 얇은 줄
      function side(pos, on, w) { return '<' + pos + ' Color="0" Type="' + (on ? 'Solid' : 'None') + '" Width="' + w + '"/>'; }
      function bf(id, l, r, t, b, w) {
        return '<BORDERFILL BackSlash="0" BreakCellSeparateLine="0" CenterLine="0" CounterBackSlash="0" CounterSlash="0" CrookedSlash="0" Id="' + id + '" Shadow="false" Slash="0" ThreeD="false">'
          + side('LEFTBORDER', l, w) + side('RIGHTBORDER', r, w) + side('TOPBORDER', t, w) + side('BOTTOMBORDER', b, w) + '<DIAGONAL Type="Solid" Width="0.1mm"/></BORDERFILL>';
      }
      // id5 = 로고 박스용 사면 점선(회색). 레퍼런스 docx 박스(a:prstDash=sysDash·#7F7F7F·1pt)와 동일 룩.
      //  Color=8355711(=#7F7F7F BGR팩), Type=Dash. 정본 docx의 점선 회색 사각형을 .hwp에서 재현.
      function sideD(pos) { return '<' + pos + ' Color="8355711" Type="Dash" Width="0.4mm"/>'; }
      function bfDash(id) {
        return '<BORDERFILL BackSlash="0" BreakCellSeparateLine="0" CenterLine="0" CounterBackSlash="0" CounterSlash="0" CrookedSlash="0" Id="' + id + '" Shadow="false" Slash="0" ThreeD="false">'
          + sideD('LEFTBORDER') + sideD('RIGHTBORDER') + sideD('TOPBORDER') + sideD('BOTTOMBORDER') + '<DIAGONAL Type="Solid" Width="0.1mm"/></BORDERFILL>';
      }
      return '<BORDERFILLLIST Count="5">'
        + bf(1, false, false, false, false, '0.12mm')
        + bf(2, true, true, true, true, '0.12mm')
        + bf(3, false, false, false, true, '0.4mm')
        + bf(4, false, false, false, true, '0.12mm')
        + bfDash(5)
        + '</BORDERFILLLIST>';
    }
    function hmlCharShape(c) {
      return '<CHARSHAPE BorderFillId="1" Height="' + c.size + '" Id="' + c.id + '" ShadeColor="4294967295" SymMark="0" TextColor="' + hmlColor(c.color) + '" UseFontSpace="false" UseKerning="false">'
        + '<FONTID Hangul="0" Hanja="0" Japanese="0" Latin="0" Other="0" Symbol="0" User="0"/>'
        + '<RATIO Hangul="100" Hanja="100" Japanese="100" Latin="100" Other="100" Symbol="100" User="100"/>'
        + '<CHARSPACING Hangul="0" Hanja="0" Japanese="0" Latin="0" Other="0" Symbol="0" User="0"/>'
        + '<RELSIZE Hangul="100" Hanja="100" Japanese="100" Latin="100" Other="100" Symbol="100" User="100"/>'
        + '<CHAROFFSET Hangul="0" Hanja="0" Japanese="0" Latin="0" Other="0" Symbol="0" User="0"/>'
        + (c.bold ? '<BOLD/>' : '') + (c.italic ? '<ITALIC/>' : '') + (c.underline ? '<UNDERLINE Color="0" Shape="Solid" Type="Bottom"/>' : '')
        + '</CHARSHAPE>';
    }
    // 내어쓰기(Left/Indent)를 실제 반영 — v2.2 HWPML판이 0으로 죽였던 것을 복원(줄바꿈 줄 정렬).
    function hmlParaShape(p) {
      return '<PARASHAPE Align="' + (HMLALIGN[p.align] || 'Left') + '" AutoSpaceEAsianEng="true" AutoSpaceEAsianNum="true" BreakLatinWord="KeepWord" BreakNonLatinWord="true" Condense="0" FontLineHeight="false" HeadingType="None" Id="' + p.id + '" KeepLines="' + (p.keepLines ? 'true' : 'false') + '" KeepWithNext="' + (p.keepNext ? 'true' : 'false') + '" Level="0" LineWrap="Break" PageBreakBefore="false" SnapToGrid="true" TabDef="' + (p.tab || 0) + '" VerAlign="Baseline" WidowOrphan="false">'
        + '<PARAMARGIN Indent="' + (p.intent || 0) + '" Left="' + (p.left || 0) + '" LineSpacing="' + p.ls + '" LineSpacingType="' + (p.lst || 'Percent') + '" Next="' + p.next + '" Prev="' + p.prev + '" Right="0"/>'
        + '<PARABORDER BorderFill="' + (p.border || 1) + '" Connect="false" IgnoreMargin="false" OffsetBottom="' + (p.bo || 0) + '" OffsetLeft="0" OffsetRight="0" OffsetTop="0"/>'
        + '</PARASHAPE>';
    }
    function hmlTabDefList() {
      // tabPrs[] → TABDEFLIST. Id 0·1·2=예약(없음/자동왼쪽/자동오른쪽), Id 3+=커스텀 정지점(정본과 동일).
      return '<TABDEFLIST Count="' + tabPrs.length + '">' + tabPrs.map(function (t, i) {
        var al = t.autoLeft ? 'true' : 'false', ar = t.autoRight ? 'true' : 'false';
        if (!t.stops || !t.stops.length) return '<TABDEF AutoTabLeft="' + al + '" AutoTabRight="' + ar + '" Id="' + i + '"/>';
        var items = t.stops.map(function (s) { return '<TABITEM Leader="None" Pos="' + Math.round(s.pos) + '" Type="' + s.type + '"/>'; }).join('');
        return '<TABDEF AutoTabLeft="' + al + '" AutoTabRight="' + ar + '" Id="' + i + '">' + items + '</TABDEF>';
      }).join('') + '</TABDEFLIST>';
    }
    var PGDEF = { w: PG.w, h: PG.h, top: PG.top, bottom: PG.bottom, left: PG.left, right: PG.right };
    var hmlSecDef = '<SECDEF CharGrid="0" FirstBorder="false" FirstFill="false" LineGrid="0" SpaceColumns="1134" TabStop="8000" TextDirection="0" TextVerticalWidthHead="0">'
      + '<STARTNUMBER Equation="1" Figure="1" Page="0" PageStartsOn="Both" Table="0"/>'
      + '<HIDE Border="false" EmptyLine="false" Fill="false" Footer="false" Header="false" MasterPage="false" PageNumPos="false"/>'
      + '<PAGEDEF GutterType="LeftOnly" Height="' + PGDEF.h + '" Landscape="0" Width="' + PGDEF.w + '"><PAGEMARGIN Bottom="' + PGDEF.bottom + '" Footer="' + mmToHU(5) + '" Gutter="0" Header="' + mmToHU(5) + '" Left="' + PGDEF.left + '" Right="' + PGDEF.right + '" Top="' + PGDEF.top + '"/></PAGEDEF>'
      + '<FOOTNOTESHAPE><AUTONUMFORMAT SuffixChar=")" Superscript="false" Type="Digit"/><NOTELINE Length="5cm" Type="Solid" Width="0.12mm"/><NOTESPACING AboveLine="850" BelowLine="567" BetweenNotes="283"/><NOTENUMBERING NewNumber="1" Type="Continuous"/><NOTEPLACEMENT BeneathText="false" Place="EachColumn"/></FOOTNOTESHAPE>'
      + '<ENDNOTESHAPE><AUTONUMFORMAT SuffixChar=")" Superscript="false" Type="Digit"/><NOTELINE Length="14692344" Type="Solid" Width="0.12mm"/><NOTESPACING AboveLine="850" BelowLine="567" BetweenNotes="0"/><NOTENUMBERING NewNumber="1" Type="Continuous"/><NOTEPLACEMENT BeneathText="false" Place="EndOfDocument"/></ENDNOTESHAPE>'
      + '</SECDEF>';
    function hmlColDef(cols) { return '<COLDEF Count="' + cols + '" Layout="Left" SameGap="' + (cols > 1 ? COLGAP : 0) + '" SameSize="true" Type="Newspaper"/>'; }
    function hmlText(id, body) { return '<TEXT CharShape="' + id + '">' + body + '</TEXT>'; }
    function runCHAR(r) { return esc(r && r.text != null ? r.text : ''); }
    function nTabs(n) { var s = ''; for (var i = 0; i < (n || 0); i++) s += '<TAB/>'; return s; }
    // run → TEXT. <TAB/>는 반드시 <CHAR> 안에(CHAR 밖이면 구버전 한글이 ÿ 렌더).
    //  r.body = 미리 만든 CHAR 내부(번호<TAB>단어<TAB> 통째 — 정본처럼 한 CHAR에 담아야 RIGHT 정지점에 걸림).
    //  아니면 tabs(앞)/tabsAfter(뒤) + 이스케이프 텍스트.
    function runCharBody(r) {
      if (r && r.body != null) return '<CHAR>' + r.body + '</CHAR>';
      //  r.lbAfter = 텍스트 뒤 문단내 강제 줄바꿈(<LINEBREAK/>, 정본에도 있는 요소). 긴 내용→밑줄을 새 줄에 우측정렬용.
      return '<CHAR>' + nTabs(r && r.tabs) + runCHAR(r) + nTabs(r && r.tabsAfter) + (r && r.lbAfter ? '<LINEBREAK/>' : '') + '</CHAR>';
    }
    // r.rawText = TEXT 내부에 CHAR 없이 '원본 컨트롤'(예: TABLE)을 그대로 넣는다(로고박스 등 인라인/플로팅 개체용).
    function runToText(r) {
      if (r && r.rawText != null) return '<TEXT CharShape="' + (r.charPrId || 0) + '">' + r.rawText + '</TEXT>';
      return hmlText(r.charPrId, runCharBody(r));
    }
    function hmlPara(p) {
      var head = (p.colChange != null) ? hmlColDef(p.colChange) : '';
      var texts;
      if (head && p.runs.length) {
        // 첫 run의 TEXT 안에 COLDEF를 함께 담아 다단 전환 지점 표시
        texts = hmlText(p.runs[0].charPrId, head + runCharBody(p.runs[0]))
          + p.runs.slice(1).map(runToText).join('');
      } else if (head) {
        texts = hmlText(BASE_CHAR, head);
      } else {
        texts = p.runs.map(runToText).join('');
      }
      if (!texts) texts = hmlText(BASE_CHAR, '<CHAR></CHAR>');
      return '<P ColumnBreak="false" PageBreak="false" ParaShape="' + p.paraPrId + '" Style="0">' + texts + '</P>';
    }
    var title = cfg.header.title;
    var hmlFirstP = '<P ColumnBreak="false" PageBreak="false" ParaShape="' + BASE_PARA + '" Style="0">' + hmlText(BASE_CHAR, hmlSecDef + hmlColDef(1)) + '</P>';
    var hmlBody = '<BODY><SECTION Id="0">' + hmlFirstP + paras.map(hmlPara).join('') + '</SECTION></BODY>';
    var hmlHead = '<HEAD SecCnt="1">'
      + '<DOCSUMMARY><TITLE>' + esc(title) + '</TITLE><AUTHOR></AUTHOR><DATE></DATE></DOCSUMMARY>'
      + '<DOCSETTING><BEGINNUMBER Endnote="1" Equation="1" Footnote="1" Page="1" Picture="1" Table="1"/><CARETPOS List="0" Para="0" Pos="0"/></DOCSETTING>'
      + '<MAPPINGTABLE>'
      + hmlFaceList()
      + hmlBorderFills()
      + '<CHARSHAPELIST Count="' + charPrs.length + '">' + charPrs.map(hmlCharShape).join('') + '</CHARSHAPELIST>'
      + hmlTabDefList()
      + '<PARASHAPELIST Count="' + paraPrs.length + '">' + paraPrs.map(hmlParaShape).join('') + '</PARASHAPELIST>'
      + '<STYLELIST Count="1"><STYLE CharShape="0" EngName="Normal" Id="0" LangId="1042" LockForm="0" Name="바탕글" NextStyle="0" ParaShape="0" Type="Para"/></STYLELIST>'
      + '</MAPPINGTABLE></HEAD>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
      + '<HWPML Style="embed" SubVersion="8.0.1.0" Version="2.8">' + hmlHead + hmlBody + '<TAIL></TAIL></HWPML>';
  }

  // ── 다운로드 진입점 ──
  async function downloadHwpTpl(btn) {
    var old = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '만드는 중…'; btn.disabled = true; }
    try {
      var cfg = readConfig();
      var groups = readGroupsCompat();
      var doc = buildHwpml(groups, cfg);
      // XML well-formed 가드 — 깨진 XML을 내려받아 "문서를 불러오지 못했습니다"가 되는 것 방지
      if (global.DOMParser) {
        var perr = new global.DOMParser().parseFromString(doc, 'application/xml').getElementsByTagName('parsererror');
        if (perr && perr.length) throw new Error('HWPML XML 파싱 오류(내부 조립 실패)');
      }
      var modeLabel = global.neViewModeLabel ? global.neViewModeLabel(cfg) : '문제';
      var titleName = safeFileTitle(cfg.header && cfg.header.title);   // 파일명 접두 = 시험지명(wzTitle). 비면 '어휘시험지'.
      var saveName = titleName + '_' + modeLabel + '_' + cfg.columns + '단_' + cfg.size + '_' + cfg.gapLabel + '(' + cfg.ls + '%).hwp';
      var blob = new Blob([doc], { type: 'application/octet-stream' });
      (global.saveBlobCompat || saveBlobFallback)(blob, saveName);
    } catch (e) {
      alert('HWP(.hwp) 생성 오류: ' + (e && e.message ? e.message : e));
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

  global.downloadHwpTpl = downloadHwpTpl;
  global.downloadHwp = downloadHwpTpl;   // 별칭
  global.HwpmlExport = { buildHwpml: buildHwpml, readConfig: readConfig, readGroupsCompat: readGroupsCompat };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HwpmlExport;
})(typeof window !== 'undefined' ? window : this);
