/* ============================================================
 * hwpx-tpl-export.js — 어휘시험지 → HWPX 생성 (샘플 "템플릿" 방식)
 *
 *  아이디어: header.xml·mimetype·container 등 "레이아웃을 결정하는" 파일은 정본 샘플
 *  그대로 두고, Contents/section0.xml 의 본문 <hp:p> 만 데이터로 다시 만든다.
 *  스타일(글자/문단 ID, 탭폭, colPr)은 새로 정의하지 않고 샘플 section0에서 자동 추출해
 *  재사용하므로 "열리지만 레이아웃이 깨지는" 문제가 사라진다.
 *
 *  브라우저:
 *    <script src="jszip.min.js"></script>
 *    <script src="data.hwp.js"></script>
 *    <script src="hwpx-tpl-export.js"></script>
 *    <button onclick="return downloadHwpxTpl(this)">HWPX 다운로드</button>
 *  템플릿 위치: HWPX_TPL.baseUrl + HWPX_TPL.fileName(cfg)
 * ============================================================ */
(function (global) {
  'use strict';

  var TPL = {
    baseUrl: 'templates/',
    fileName: function (cfg) {
      return '어휘시험지_' + cfg.columns + '단_' + cfg.size + '_' + cfg.gapLabel + '(' + cfg.ls + '%).hwpx';
    }
  };
  global.HWPX_TPL = TPL;

  var LB = '<hp:lineBreak/>';
  // 헤더 로고 박스(hp:rect) — 정본 HWPX(print_sample_0722/…/vocab_1col_11_normal.hwp.hwpx)에서 추출.
  //  20mm 정사각(5670HWPUNIT), 사면 점선 회색(lineShape style=DOT #7F7F7F width=100), 흰 배경.
  //  색·좌표 전부 인라인 → self-contained(폰트/스타일 참조 없음). 첫 헤더 문단 run0의 secPr·ctrl 뒤에 주입(정본 자식순서 동일).
  // ★박스 14mm(3969HWPUNIT)로 통일(2026-07-23): 20mm(5670)이면 제목(16pt)이 큰 병합줄까지 합쳐 세로로
  //  ~16mm까지 내려가는데, 그 아래 놓이는 구분선(HDR_DIVIDER)이 20mm 박스 세로범위(16~20mm)와 겹쳐 SQUARE
  //  텍스트감싸기가 구분선을 박스 오른쪽으로 밀어 '라인이 짤려' 보였다(사용자 지적). 14mm면 박스 하단이
  //  구분선 위에서 끝나 전체폭 실선이 온전. DOCX(504000EMU=14mm)와도 크기 통일. center=반(1985).
  var HDR_RECT = '<hp:rect id="72242362" zOrder="1" numberingType="PICTURE" textWrap="SQUARE" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="72242362" ratio="0"><hp:sz width="3969" widthRelTo="ABSOLUTE" height="3969" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="99" horzOffset="116"/><hp:outMargin left="905" right="1500" top="0" bottom="0"/><hp:offset x="0" y="0"/><hp:orgSz width="3969" height="3969"/><hp:curSz width="3969" height="3969"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="1985" centerY="1985" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="-0" e3="0" e4="0" e5="1" e6="-0"/></hp:renderingInfo><hp:lineShape color="#7F7F7F" width="100" style="DOT" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/><hc:fillBrush><hc:winBrush faceColor="#FFFFFF" hatchColor="#FF000000" alpha="0"/></hc:fillBrush><hp:shadow type="NONE" color="#C0C0C0" offsetX="0" offsetY="0" alpha="0"/><hc:pt0 x="0" y="0"/><hc:pt1 x="3969" y="0"/><hc:pt2 x="3969" y="3969"/><hc:pt3 x="0" y="3969"/></hp:rect>';
  var TAB2 = '<hp:tab width="1000" leader="0" type="2"/>';   // fallback only(앵커 없을 때)
  var MINTAB = 300;                                          // 이보다 좁으면 내용이 길다 → 줄바꿈
  // [실험] 정답표시(qa) 답란의 (유)/(반) 마커를 '고정 왼쪽 열'에 정렬(우측정렬 대신). 마커 시작 x 통일용.
  //  기본 false = 현행 우측정렬(밑줄 오른끝 고정, 마커 시작은 밑줄폭 정수패딩 오차만큼 흔들림).
  //  true면 마커를 markerCol(=오른끝-마커폭-밑줄목표폭)에 왼쪽탭으로 붙임 → 마커 시작 통일(대신 오른끝은 흔들림).
  //  긴 답란(뜻쓰기·파생어) 영향 확인용. global.NE_QA_MARKER_LEFT_ALIGN로 켬.
  var QA_MARKER_LEFT_ALIGN = !!(global && global.NE_QA_MARKER_LEFT_ALIGN);
  var ANS_FRAC = 0.44;                                       // 2단 답란 공통 시작열 = 항목폭의 44% 지점
  var UL_SPACING = 0;                                        // 밑줄 '_' 자간=0(정본 참조파일과 동일). 음수면 맑은고딕 '_'가 겹쳐 선이 진해짐(2026-07-15). ulCP 식별은 폰트기반(findUnderlineCP).
  var UL_FILL = '_';                                         // 밑줄 채움 문자 = '_'(맑은 고딕). 맑은고딕 '_'는 글자폭을 꽉 채워 이어져 한글·웨일 모두 연속 실선(테두리 불필요). 복사시 밑줄 유지. (2026-07-15)
  // [DEAD/이력보존] default→case 정규화: header의 모든 <hp:switch>에서 <hp:default>를 <hp:case>로 덮어씀.
  //  ▷ 호환 대상이 '한글 프로그램 하나'로 축소됨(웨일 무시, 2026-07-20). 한글은 hp:case를 읽으므로
  //    이 정규화는 한글 렌더에 아무 영향이 없다(원래 웨일 여백을 노린 실험이었고, 그마저 실패 확정).
  //  ▷ 반드시 false로 유지: true면 정본 header의 default 바이트를 바꿔 '정본 그대로' 원칙을 깬다.
  //    한글 이득 0 + 정본 훼손 → 켤 이유가 없음. (함수 normalizeDefaultToCase는 이력용으로만 보존.)
  var NORMALIZE_DEFAULT_TO_CASE = false;
  // [실험] 한 페이지(2단)를 넘길 것으로 추정되는 큰 2단 그룹은 강제 columnBreak를 빼서 HWP 자연 흐름에 맡긴다.
  //  (columnBreak는 '한 페이지에서 5/5' 전제라, 여러 페이지로 넘치는 그룹에선 페이지별 재균형과 충돌해 붕괴 유발)
  //  작은 그룹(한 페이지 이내)은 기존 5/5 높이균형 유지. 끄려면 false.
  var CB_SKIP_MULTIPAGE = true;
  // [경계 pageBreak] 전체폭↔2단 경계에서 뒷 그룹 발문을 새 페이지에서 시작할지. 두 경계는 성격이 다르다:
  //  ⑴ 전체폭→2단 (예: 문장완성→파생어): pageBreak 필수 = LOAD-BEARING. ★한글 자체 요구, 웨일과 무관★
  //     없으면 한글에서 2단 발문이 앞 전체폭 영역에 갇혀 '발문이 2단으로' 나오고 항목이 컬럼 경계서 쪼개짐.
  //     (2026-07-15: 이를 웨일 전용으로 오판해 끄면서 한글 회귀 발생 → 다시 켬. 대가=문장완성 페이지 하단 여백.)
  //     ⚠ '웨일 무시'(2026-07-20)를 이유로 이걸 웨일 잔재로 착각해 끄지 말 것 — 같은 회귀 재발.
  //  ⑵ 2단→전체폭 (예: 뜻쓰기→문장완성): pageBreak 불필요. 전체폭 발문은 컬럼 닫기(closeColPara)만으로 정상.
  //     여기에 pageBreak를 넣으면 직전 2단 페이지 하단에 큰 여백만 생김(사용자 지적 '31번 앞 여백') → 끔.
  var EDGE_PB_FULL_TO_TWOCOL = true;    // ⑴ 유지(발문 전체폭 보장)
  var EDGE_PB_TWOCOL_TO_FULL = false;   // ⑵ 끔(여백 제거)
  // [다줄 유형 1단화] (2026-07-15 채택) 항목이 다줄·가변높이인 유형(파생어·유의어, 평균 ≥2줄)은
  //  2단 신문형에서 컬럼 높이균형이 안 맞아 단 하단/마지막 조각에 여백이 남는다(구조적 한계).
  //  → 이런 그룹만 전체폭(1단)으로 흘려 단 여백을 제거한다. 단어형(1줄 균일, 1~30)은 그대로 2단 유지.
  //  대가: 파생어·유의어가 2단이 아니게 됨. → [2026-07-15 되돌림] "1단은 안 된다, 최대한 2단으로" →
  //  false로 끔(전 유형 최대한 2단 + 단 하단 여백 수용). true면 다줄 유형만 1단화(단 여백 제거).
  var MULTILINE_GROUPS_TO_FULL = false;
  // [다줄 full 유형 2단화] (2026-07-15 채택) data.full로 1단이던 유형 중 '다줄 구조'(문장완성:
  //  해석<br>영어문장)는 2단으로 흘린다. keepLines가 항목을 통째로 지켜 컬럼 경계서 안 갈라짐(뷰어 확인).
  //  '단일 장문'(영영풀이: <br> 없는 긴 영어 정의 한 줄)은 제외 — 반폭이면 과하게 접히고 웨일서 우측 잘림.
  //  구분 기준은 estItemLines(줄바꿈 후 줄수, 장문을 다줄로 오판)가 아니라 <br> 기반 '구조적 줄수'.
  //  효과: 문장완성이 2단이 되며 중간 1단이 사라져 파생어 앞 페이지 여백도 없어짐. 끄려면 false.
  //  [2026-07-15 되돌림] 한글에서 문장완성 40번이 좌/우 단 경계서 '갈라짐'(한글해석 왼단, 영어 오른단).
  //   keepLines는 페이지넘김만 막고 컬럼분할은 못 막아, 키 큰 문장완성 항목은 자연흐름·강제분할 어느
  //   쪽이든 경계서 쪼개진다(파생어·유의어는 항목이 작아 안 걸렸을 뿐). → false로 끔(문장완성 1단 유지).
  //   대가 = 파생어 앞 경계 페이지 여백 복귀(항목 갈라짐보다 나음). true면 갈라짐 재발.
  var TWOCOL_MULTILINE_FULL = false;
  // [유형 사이 여백] 그룹(발문) 사이 여백을 '빈 문단'이 아니라 발문 문단의 '위 간격(문단 앞 여백)'으로 준다.
  //  이유: 경계에 놓인 빈 문단은 지우는 순간 단(칼럼) 구역 경계를 건드려 2단 레이아웃이 깨진다(undo도 안 됨).
  //   → 빈 문단을 아예 안 만들고, 발문 paraPr에 space-before만 준다. 지울 빈 줄이 없으니 깨질 일도 없다.
  //   여백 조절은 편집기 '문단 모양 > 위 간격'에서(한글이 정상 처리). 0으로 두면 여백 없음.
  //  ASK_GAP_BEFORE: 발문 위 간격(HWPUNIT). 1400≈14pt(한 줄 남짓). 좁게/넓게 하려면 이 값만 조정.
  var ASK_GAP_BEFORE = 1400;
  // 2단 답란 시작 열 X(공통 탭 정지점, case값). stops={left,right}
  function answerCol(stops) { return Math.round(stops.left + (stops.right - stops.left) * ANS_FRAC); }

  // 글자 폭 추정(HWPUNIT). em=글자높이(pt*100). 한글=1em, 라틴/숫자≈0.5, 공백≈0.33, 문장부호≈0.4.
  // ※ 정확한 글리프 폭이 아니라 '상대 폭'만 맞으면 됨(K 앵커가 절대 오프셋을 흡수).
  function estW(t, em) {
    em = em || 1100; var u = 0, s = String(t || '');
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 32 || c === 0xa0) u += 0.33;
      else if (c >= 0x1100 && !(c >= 0x2000 && c < 0x2100)) u += 1.0;   // 한글/CJK 전각
      else if (c >= 48 && c <= 57) u += 0.5;                            // 숫자
      else if (c >= 0x41) u += 0.52;                                    // 라틴/기타
      else u += 0.4;                                                    // 문장부호
    }
    return u * em;
  }
  // 마지막 줄(마지막 lineBreak 이후) 텍스트만 = 답란 앞 내용 폭 계산 대상
  function lastLineText(segs) {
    var buf = '';
    (segs || []).forEach(function (s) {
      if (s.type === 'break') buf = '';
      else if (s.type === 'text') buf += s.text;
    });
    return buf;
  }
  function mkTab2(width) { return '<hp:tab width="' + Math.max(1, Math.round(width)) + '" leader="0" type="2"/>'; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function attrOf(tag, name) { var m = tag.match(new RegExp('\\b' + name + '="([^"]*)"')); return m ? m[1] : null; }

  function splitSection(section0) {
    var i = section0.indexOf('<hp:p');
    var k = section0.lastIndexOf('</hp:p>');
    var j = (k < 0) ? section0.length : k + '</hp:p>'.length;
    return { prefix: section0.slice(0, i), body: section0.slice(i, j), suffix: section0.slice(j) };
  }
  function splitParas(body) { return body.match(/<hp:p\b[\s\S]*?<\/hp:p>/g) || []; }
  function stripLineseg(p) { return p.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, ''); }
  function firstText(p) {
    var m = p.match(/<hp:t>([\s\S]*?)<\/hp:t>/);
    if (!m) return '';
    return m[1].replace(/<hp:tab[^>]*\/>/g, ' ').replace(/<hp:lineBreak\/>/g, ' ').replace(/<[^>]+>/g, '');
  }
  function isAsk(p) { return /^\s*※/.test(firstText(p)); }
  function isItem(p) { return /^\s*\d+\s*\./.test(firstText(p)); }
  function isEmptyPara(p) {
    var t = stripLineseg(p).replace(/<hp:tab[^>]*\/>/g, '').replace(/<[^>]+>/g, '');
    return t.trim() === '';
  }
  function colPrBlock(p) { var m = p.match(/<hp:ctrl><hp:colPr[\s\S]*?<\/hp:colPr><\/hp:ctrl>/); return m ? m[0] : null; }
  function colCountOf(b) { if (!b) return null; var m = b.match(/colCount="(\d+)"/); return m ? +m[1] : null; }
  function blankRunOf(p) {
    var runs = p.match(/<hp:run\b[\s\S]*?<\/hp:run>/g) || [];
    for (var i = runs.length - 1; i >= 0; i--) {
      var tm = runs[i].match(/<hp:t>([\s\S]*?)<\/hp:t>/);
      if (tm && tm[1].length && /^[\s ]+$/.test(tm[1])) return runs[i];
    }
    return null;
  }

  // 번호항목 첫 run에서 (번호탭 뒤 내용, 답란 우측탭 width) 추출 → K 앵커 계산용.
  //   K = tab2width + estW(content) = RIGHTSTOP − leftStop − 밑줄폭 (내용폭 추정오차는 상쇄).
  function anchorOf(p) {
    var m = p.match(/<hp:t>([\s\S]*?)<\/hp:t>/); if (!m) return null;
    var seg = m[1];
    var i2 = seg.indexOf('type="2"'); if (i2 < 0) return null;   // 우측탭(답란) 없으면 앵커 못 씀
    var tabStart = seg.lastIndexOf('<hp:tab', i2);
    var tabEl = seg.slice(tabStart, seg.indexOf('/>', i2) + 2);
    var wm = tabEl.match(/width="(\d+)"/); if (!wm) return null;
    var i1 = seg.indexOf('type="1"');
    var afterTab1 = (i1 >= 0) ? seg.indexOf('/>', i1) + 2 : 0;
    var content = seg.slice(afterTab1, tabStart).replace(/<[^>]+>/g, '');
    return { text: content, tab: +wm[1] };
  }

  // header.xml에서 paraPr → tabPr → (LEFT/RIGHT 탭 정지점) 파싱. 신형(HwpUnitChar case) 좌표 우선.
  function tabStops(headerXml, ppId) {
    if (!headerXml || ppId == null) return null;
    var pm = headerXml.match(new RegExp('<hh:paraPr id="' + ppId + '"[^>]*?tabPrIDRef="(\\d+)"'));
    if (!pm) return null;
    var tm = headerXml.match(new RegExp('<hh:tabPr id="' + pm[1] + '"[\\s\\S]*?</hh:tabPr>'));
    if (!tm) return null;                                   // 정지점 없는 tabPr(자체닫힘) → null
    var caseM = tm[0].match(/<hp:case[^>]*HwpUnitChar[\s\S]*?<\/hp:case>/g);
    var scope = caseM ? caseM.join('') : tm[0];
    var L = scope.match(/pos="(\d+)"[^>]*type="LEFT"/);
    var R = scope.match(/pos="(\d+)"[^>]*type="RIGHT"/);
    return { left: L ? +L[1] : 0, right: R ? +R[1] : 0 };
  }
  // blankRun 안 밑줄 텍스트(공백 N개) 추출 — 밑줄 폭 추정용
  function blankTextOf(blankRun) { var m = (blankRun || '').match(/<hp:t>([\s\S]*?)<\/hp:t>/); return m ? m[1] : new Array(31).join(' '); }
  // 검정(#000000)·하단밑줄(BOTTOM) charPr id 찾기 — 유채색 답란을 검정으로 교체할 때 사용
  function blackUnderlineCharPr(headerXml) {
    var re = /<hh:charPr id="(\d+)"[\s\S]*?<\/hh:charPr>/g, m;
    while ((m = re.exec(headerXml))) {
      if (/textColor="#0{6}"/i.test(m[0]) && /<hh:underline type="BOTTOM"/.test(m[0])) return m[1];
    }
    return null;
  }
  // header 폰트표에서 '맑은 고딕'(Malgun Gothic) 폰트 id 찾기 — 밑줄 '_'용.
  //  영문 이름 "Malgun Gothic"을 '우선' — 우리 폰트 엔트리엔 대체글꼴(substFont)이 없어서, 한글 이름 "맑은 고딕"을
  //  Polaris가 자기 폰트로 못 찾고 엉뚱하게 대체(→ '_'가 점선)한다. 영문 이름은 Polaris가 실제 Malgun Gothic으로
  //  직접 인식하므로 세 뷰어 모두 연속선. (2026-07-15, Polaris 점선 이슈)
  function findMalgunFontId(headerXml) {
    if (!headerXml) return null;
    var re = /<hh:font id="(\d+)" face="([^"]*)"/g, m, byName = {};
    while ((m = re.exec(headerXml))) { if (!(m[2] in byName)) byName[m[2]] = m[1]; }
    var k;
    for (k in byName) { if (/malgun/i.test(k)) return byName[k]; }        // 영문 이름 우선(Polaris 인식)
    for (k in byName) { if (/맑은\s*고딕/.test(k)) return byName[k]; }   // 한글 이름 폴백
    return null;
  }
  // 밑줄 '_' 연속선용 charPr — 항목 charPr 복제 + 폰트를 '맑은 고딕'으로 교체(+검정). latin 자간 음수는 ulCP 식별 시그니처.
  //  (2026-07-15 결정) 정본 참조파일(reference/…Tab구성…260220.hwp) 분석: 답란 '_'를 '맑은 고딕'으로 찍으면 '_'
  //  글리프가 글자폭을 꽉 채워 이어져 한글·폴라리스·웨일 모두 연속 실선이 된다(테두리 불필요). 함초롬바탕 '_'는
  //  좌우 여백이 있어 틈이 생겼던 것. 테두리 없음 → 웨일 이중선 없음, '_' 실제글자 → 드래그 복사시 밑줄 유지.
  //  → 세 조건(한글연속·웨일단선·복사유지) 동시 충족. (앞선 07-15 BOTTOM 테두리안은 웨일 이중선으로 폐기.)
  function addUnderlineCharPr(headerXml, baseCpId, spacing) {
    if (!headerXml || baseCpId == null) return headerXml;
    var m = headerXml.match(new RegExp('<hh:charPr id="' + baseCpId + '"[\\s\\S]*?</hh:charPr>'));
    if (!m) return headerXml;
    var ids = [], re = /<hh:charPr id="(\d+)"/g, mm;
    while ((mm = re.exec(headerXml))) ids.push(+mm[1]);
    var newId = Math.max.apply(null, ids) + 1;
    var fid = findMalgunFontId(headerXml);
    var clone = m[0]
      .replace(/\bid="\d+"/, 'id="' + newId + '"')
      .replace(/\btextColor="[^"]*"/, 'textColor="#000000"')
      .replace(/<hh:spacing\b[^>]*\/>/, '<hh:spacing hangul="0" latin="' + spacing + '" hanja="0" japanese="0" other="0" symbol="0" user="0"/>')
      .replace(/<hh:underline\b[^>]*\/>/, '<hh:underline type="NONE" shape="SOLID" color="#000000"/>');
    if (fid != null) clone = clone.replace(/<hh:fontRef\b[^>]*\/>/, '<hh:fontRef hangul="' + fid + '" latin="' + fid + '" hanja="' + fid + '" japanese="' + fid + '" other="' + fid + '" symbol="' + fid + '" user="' + fid + '"/>');
    headerXml = headerXml.replace(/<\/hh:charPr>(\s*<\/hh:charProperties>)/, '</hh:charPr>' + clone + '$1');
    headerXml = headerXml.replace(/(<hh:charProperties itemCnt=")(\d+)(")/, function (_x, a, n, b) { return a + (+n + 1) + b; });
    return headerXml;
  }
  // addUnderlineCharPr가 추가한 밑줄용 charPr id 찾기 — 'latin이 맑은고딕 && underline=none' 중 최대 id.
  //  (ulCP는 항상 마지막에 append되므로, 템플릿에 원래 있던 맑은고딕 charPr보다 id가 크다. borderCP는 BOTTOM이라 제외됨.)
  //  자간 시그니처는 폐기: 자간 0이라야 '_'가 안 겹쳐 선이 진해지지 않음(2026-07-15).
  function findUnderlineCP(headerXml) {
    if (!headerXml) return null;
    var fid = findMalgunFontId(headerXml);
    if (fid == null) return null;
    var fontRe = new RegExp('<hh:fontRef\\b[^>]*\\blatin="' + fid + '"');
    var re = /<hh:charPr id="(\d+)"[\s\S]*?<\/hh:charPr>/g, m, best = null, bestId = -1;
    while ((m = re.exec(headerXml))) {
      if (fontRe.test(m[0]) && /<hh:underline type="NONE"/.test(m[0]) && +m[1] > bestId) { bestId = +m[1]; best = m[1]; }
    }
    return best;
  }
  // 정답표시(qa) 정답용 밑줄 charPr — 항목 charPr(itemCP, 문서 크기 그대로) 복제 + 하단 테두리(BOTTOM) + 검정.
  //  템플릿 답란 charPr(예: id6)이 11pt로 고정돼 있어 13pt 문서에서도 정답이 11pt로 나오던 문제 해결:
  //  itemCP를 복제하므로 정답이 문항 글자와 '같은 크기'로 나온다. 자간은 0(정답은 실제 글자라 붙일 필요 없음).
  function addAnswerBorderCharPr(headerXml, baseCpId) {
    if (!headerXml || baseCpId == null) return headerXml;
    var m = headerXml.match(new RegExp('<hh:charPr id="' + baseCpId + '"[\\s\\S]*?</hh:charPr>'));
    if (!m) return headerXml;
    var ids = [], re = /<hh:charPr id="(\d+)"/g, mm;
    while ((mm = re.exec(headerXml))) ids.push(+mm[1]);
    var newId = Math.max.apply(null, ids) + 1;
    var clone = m[0]
      .replace(/\bid="\d+"/, 'id="' + newId + '"')
      .replace(/\btextColor="[^"]*"/, 'textColor="#000000"')
      .replace(/<hh:underline\b[^>]*\/>/, '<hh:underline type="BOTTOM" shape="SOLID" color="#000000"/>');
    // 밑줄 태그가 아예 없던 경우 대비: strikeout 앞에 삽입
    if (!/<hh:underline\b/.test(clone)) clone = clone.replace(/(<hh:strikeout\b)/, '<hh:underline type="BOTTOM" shape="SOLID" color="#000000"/>$1');
    headerXml = headerXml.replace(/<\/hh:charPr>(\s*<\/hh:charProperties>)/, '</hh:charPr>' + clone + '$1');
    headerXml = headerXml.replace(/(<hh:charProperties itemCnt=")(\d+)(")/, function (_x, a, n, b) { return a + (+n + 1) + b; });
    return headerXml;
  }
  // addAnswerBorderCharPr가 추가한 정답 밑줄 charPr id 찾기 — 하단테두리(BOTTOM) charPr 중 '가장 큰 id'(마지막 append).
  function findAnswerBorderCP(headerXml) {
    if (!headerXml) return null;
    var re = /<hh:charPr id="(\d+)"[\s\S]*?<\/hh:charPr>/g, m, best = null, bestId = -1;
    while ((m = re.exec(headerXml))) {
      if (/<hh:underline type="BOTTOM"/.test(m[0]) && +m[1] > bestId) { bestId = +m[1]; best = m[1]; }
    }
    return best;
  }


  // 전체폭 답란 문단 찾기 — RIGHT 탭 정지점이 '가장 오른쪽'이면서 내어쓰기(intent=-LEFT)인 paraPr.
  //  (템플릿의 첫 전체폭 항목 paraPr이 RIGHT 정지점 없는 걸 고를 수 있어, header에서 제대로 된 걸 재선정)
  function findFullPP(headerXml) {
    if (!headerXml) return null;
    var re = /<hh:paraPr id="(\d+)"[^>]*?tabPrIDRef="(\d+)"[\s\S]*?<\/hh:paraPr>/g, m, best = null, bestR = -1;
    while ((m = re.exec(headerXml))) {
      var st = tabStops(headerXml, m[1]);
      if (!st || !st.right) continue;
      var im = m[0].match(/HwpUnitChar[\s\S]*?<hc:intent value="(-?\d+)"/);
      var hanging = im && (+im[1] === -st.left);   // 번호 뒤 내어쓰기 답란
      if (hanging && st.right > bestR) { bestR = st.right; best = m[1]; }
    }
    return best;
  }

  // 전체폭 답란 문단 확정: 감지된 fullPP에 RIGHT 정지점이 이미 있으면 그대로(1단·정상),
  //  없을 때만(2단 영영: paraPr16→tabPr3에 RIGHT 없음) header에서 RIGHT 있는 문단으로 재선정.
  function resolveFullPP(headerXml, detected) {
    var fs = tabStops(headerXml, detected);
    if (fs && fs.right) return detected;
    return findFullPP(headerXml) || detected;
  }

  // tabPr에 LEFT 정지점(posC 케이스/posD 기본) 추가 — RIGHT 스위치 앞(또는 끝)에 삽입해 정렬 유지.
  function addLeftStop(h, tid, posC, posD) {
    var re = new RegExp('(<hh:tabPr id="' + tid + '"[^>]*>)([\\s\\S]*?)(</hh:tabPr>)');
    return h.replace(re, function (_all, open, body, closeTag) {
      var sw = '<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:tabItem pos="' + posC + '" type="LEFT" leader="NONE" unit="HWPUNIT"/></hp:case><hp:default><hh:tabItem pos="' + posD + '" type="LEFT" leader="NONE"/></hp:default></hp:switch>';
      var idx = body.indexOf('type="RIGHT"');
      if (idx >= 0) { var sp = body.lastIndexOf('<hp:switch>', idx); body = body.slice(0, sp) + sw + body.slice(sp); }
      else { body += sw; }
      return open + body + closeTag;
    });
  }

  // 다운로드 직전 header 최소 보정(사용자 승인):
  //  (1) keepLines=1 — 여러 줄 항목이 단(열) 경계에서 쪼개지지 않게
  //  (2) [2단 전용] 전체폭 답란 문단(영영·문장완성)의 번호탭을 2단 항목(3000)과 동일하게 → 번호 뒤 여백 통일.
  //  (3) [2단 전용] 2단 항목 tabPr에 답란 공통 시작열(X) LEFT 정지점 추가 → (유)/(반)·밑줄 시작점 통일.
  //      1단은 모든 항목이 전체폭이라 (2)(3) 불필요 → 건드리지 않음.
  // [B/실험] 모든 hp:switch의 hp:default 내용을 hp:case 내용과 동일하게 만든다(중첩 switch 없음 전제).
  //  hp:case는 그대로 두므로 Polaris/한글 렌더는 바이트 단위로 불변. Whale(default 사용)만 값이 바뀐다.
  function normalizeDefaultToCase(h) {
    return h.replace(/<hp:switch>([\s\S]*?)<\/hp:switch>/g, function (all, inner) {
      var cm = inner.match(/<hp:case\b[^>]*>([\s\S]*?)<\/hp:case>/);
      var dm = inner.match(/<hp:default>[\s\S]*?<\/hp:default>/);
      if (!cm || !dm) return all;
      var newInner = inner.replace(/<hp:default>[\s\S]*?<\/hp:default>/, '<hp:default>' + cm[1] + '</hp:default>');
      return '<hp:switch>' + newInner + '</hp:switch>';
    });
  }

  // [유형 사이 여백] 발문용 paraPr 복제 + '위 간격(space-before)'만 넣은 새 paraPr 추가.
  //  발문 문단이 이걸 쓰면, 앞에 빈 문단 없이도 유형 사이에 한 줄 남짓 여백이 생긴다.
  //  (원본 askPP은 건드리지 않는다 — 템플릿 다른 문단이 같은 id를 쓸 수 있으므로 복제로 분리.)
  function addAskGapParaPr(headerXml, askPpId, gap) {
    if (!headerXml || askPpId == null) return headerXml;
    var m = headerXml.match(new RegExp('<hh:paraPr id="' + askPpId + '"[\\s\\S]*?</hh:paraPr>'));
    if (!m) return headerXml;
    var ids = [], re = /<hh:paraPr id="(\d+)"/g, mm;
    while ((mm = re.exec(headerXml))) ids.push(+mm[1]);
    var newId = Math.max.apply(null, ids) + 1;
    var clone = m[0].replace(/\bid="\d+"/, 'id="' + newId + '"')
                    .replace(/<hc:prev value="\d+" unit="HWPUNIT"\/>/g, '<hc:prev value="' + gap + '" unit="HWPUNIT"/>');   // case/default 둘 다
    headerXml = headerXml.replace(/<\/hh:paraPr>(\s*<\/hh:paraProperties>)/, '</hh:paraPr>' + clone + '$1');
    headerXml = headerXml.replace(/(<hh:paraProperties itemCnt=")(\d+)(")/, function (_x, a, n, b) { return a + (+n + 1) + b; });
    return headerXml;
  }
  // addAskGapParaPr가 추가한 발문-여백 paraPr id 찾기 — space-before(prev=gap) 보유 + '가장 큰 id'(마지막 append).
  function findAskGapPP(headerXml, gap) {
    if (!headerXml) return null;
    var re = /<hh:paraPr id="(\d+)"[\s\S]*?<\/hh:paraPr>/g, m, best = null, bestId = -1;
    var sig = new RegExp('<hc:prev value="' + gap + '" unit="HWPUNIT"/>');
    while ((m = re.exec(headerXml))) { if (sig.test(m[0]) && +m[1] > bestId) { bestId = +m[1]; best = m[1]; } }
    return best;
  }
  // [이름/점수 우측정렬 2026-07-23] basePP(전체폭 답란 문단)를 복제하되, tabPr을 'RIGHT 정지점만 있는'
  //  새 tabPr로 바꾼 paraPr을 추가하고 그 id를 돌려준다. basePP의 tabPr(예:id2)은 RIGHT 앞에 LEFT 정지점
  //  (4670·9340)이 있어 인라인 type="2"(우측) 탭이 그 LEFT에 먼저 걸린다 → 이름/점수가 좌측에 머묾(2026-07-23 사용자 지적).
  //  LEFT 스위치를 뺀 RIGHT-단독 tabPr을 쓰면 탭이 오른끝(RIGHT@53660)에 스냅된다. basePP는 item 답란 공용이라 불변(복제만).
  function addNsRightTabParaPr(headerXml, basePP) {
    if (!headerXml || basePP == null) return null;
    var pm = headerXml.match(new RegExp('<hh:paraPr id="' + basePP + '"[\\s\\S]*?</hh:paraPr>'));
    if (!pm) return null;
    var baseTabId = (pm[0].match(/tabPrIDRef="(\d+)"/) || [null, null])[1];
    // basePP tabPr에서 RIGHT 정지점을 가진 <hp:switch>만 추출(LEFT 스위치는 버림). 없으면 기본 53660/107320.
    var rightSwitch = '<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:tabItem pos="53660" type="RIGHT" leader="NONE" unit="HWPUNIT"/></hp:case><hp:default><hh:tabItem pos="107320" type="RIGHT" leader="NONE"/></hp:default></hp:switch>';
    if (baseTabId != null) {
      var tm = headerXml.match(new RegExp('<hh:tabPr id="' + baseTabId + '"[\\s\\S]*?</hh:tabPr>'));
      if (tm) {
        var sw = (tm[0].match(/<hp:switch>[\s\S]*?<\/hp:switch>/g) || []).filter(function (s) { return s.indexOf('type="RIGHT"') >= 0; });
        if (sw.length) rightSwitch = sw.join('');
      }
    }
    var tabIds = [], tr = /<hh:tabPr id="(\d+)"/g, tmm;
    while ((tmm = tr.exec(headerXml))) tabIds.push(+tmm[1]);
    var newTabId = (tabIds.length ? Math.max.apply(null, tabIds) : 0) + 1;
    var newTab = '<hh:tabPr id="' + newTabId + '" autoTabLeft="0" autoTabRight="0">' + rightSwitch + '</hh:tabPr>';
    headerXml = headerXml.replace(/(\s*<\/hh:tabProperties>)/, newTab + '$1');
    headerXml = headerXml.replace(/(<hh:tabProperties itemCnt=")(\d+)(")/, function (_x, a, n, b) { return a + (+n + 1) + b; });

    var ppIds = [], pr = /<hh:paraPr id="(\d+)"/g, pmm;
    while ((pmm = pr.exec(headerXml))) ppIds.push(+pmm[1]);
    var newPPId = Math.max.apply(null, ppIds) + 1;
    var clone = pm[0].replace(/^(<hh:paraPr )id="\d+"/, '$1id="' + newPPId + '"')
                     .replace(/tabPrIDRef="\d+"/, 'tabPrIDRef="' + newTabId + '"');
    headerXml = headerXml.replace(/(<\/hh:paraPr>)(\s*<\/hh:paraProperties>)/, '$1' + clone + '$2');
    headerXml = headerXml.replace(/(<hh:paraProperties itemCnt=")(\d+)(")/, function (_x, a, n, b) { return a + (+n + 1) + b; });
    return { header: headerXml, ppId: newPPId };
  }

  // 헤더 구분선(하단 실선) paraPr 추가 — HWP·DOCX·정본 헤더엔 있는데 HWPX만 없어 '헤더 아래 라인'이 빠져
  //  보였다(2026-07-23 사용자 지적). basePP(스페이서 등 빈 문단 스타일) 복제 + 새 borderFill(하단 SOLID)로
  //  교체 + 탭/걸개들여쓰기 제거 → 빈 문단에 걸면 전체폭 하단 실선(구분선)이 된다. 정본 bf는 하단 0.5mm.
  function addDividerParaPr(headerXml, basePP) {
    if (!headerXml || basePP == null) return null;
    var pm = headerXml.match(new RegExp('<hh:paraPr id="' + basePP + '"[\\s\\S]*?</hh:paraPr>'));
    if (!pm) return null;
    // 새 borderFill: 하단만 SOLID(구분선). bf3 구조를 그대로 따르되 bottomBorder만 SOLID.
    var bfIds = [], bfr = /<hh:borderFill id="(\d+)"/g, bfm;
    while ((bfm = bfr.exec(headerXml))) bfIds.push(+bfm[1]);
    var newBf = (bfIds.length ? Math.max.apply(null, bfIds) : 0) + 1;
    var bfXml = '<hh:borderFill id="' + newBf + '" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
      + '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
      + '<hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>'
      + '<hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.4 mm" color="#000000"/>'
      + '<hh:diagonal type="NONE" width="0.1 mm" color="none"/></hh:borderFill>';
    headerXml = headerXml.replace(/(\s*<\/hh:borderFills>)/, bfXml + '$1');
    headerXml = headerXml.replace(/(<hh:borderFills itemCnt=")(\d+)(")/, function (_x, a, n, b) { return a + (+n + 1) + b; });
    // basePP 복제 → 구분선 paraPr: border=newBf, 탭 없음, 걸개들여쓰기(intent) 0.
    var ppIds = [], pr = /<hh:paraPr id="(\d+)"/g, pmm;
    while ((pmm = pr.exec(headerXml))) ppIds.push(+pmm[1]);
    var newPP = Math.max.apply(null, ppIds) + 1;
    var clone = pm[0].replace(/^(<hh:paraPr )id="\d+"/, '$1id="' + newPP + '"')
                     .replace(/tabPrIDRef="\d+"/, 'tabPrIDRef="0"')
                     .replace(/<hc:intent value="-?\d+"/g, '<hc:intent value="0"');
    if (/<hh:border borderFillIDRef="\d+"/.test(clone)) {
      clone = clone.replace(/(<hh:border borderFillIDRef=")\d+(")/, '$1' + newBf + '$2');
    } else {
      clone = clone.replace(/<\/hh:paraPr>$/, '<hh:border borderFillIDRef="' + newBf + '" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>');
    }
    headerXml = headerXml.replace(/(<\/hh:paraPr>)(\s*<\/hh:paraProperties>)/, '$1' + clone + '$2');
    headerXml = headerXml.replace(/(<hh:paraProperties itemCnt=")(\d+)(")/, function (_x, a, n, b) { return a + (+n + 1) + b; });
    return { header: headerXml, ppId: newPP };
  }

  function normalizeHeader(headerXml, cfg) {
    cfg = cfg || {};
    var h = headerXml.replace(/keepLines="0"/g, 'keepLines="1"');
    // Polaris의 .hwpx 렌더러는 snapToGrid="1"이면 라틴 글자('_')를 격자 칸에 벌려 앉혀 밑줄이 벌어진다(.hwp 경로는 정상).
    //  격자 치수(charGrid/lineGrid)가 0이라 한글·웨일 렌더에는 영향 없음 → 전 문단 snapToGrid=0으로 꺼서 Polaris 밑줄 틈 해결. (2026-07-15)
    h = h.replace(/snapToGrid="1"/g, 'snapToGrid="0"');
    // 번호탭 여백 축소(LEFT 4670→3000, intent도 쌍으로): 2단 전체폭 유형뿐 아니라 1단 항목에도 적용.
    //  (1단 번호 뒤 여백이 넓다는 지적 — 2026-07-22. 1단은 itemPP=fullPP라 fullPP만 고치면 전 항목 반영.)
    if (cfg.fullPP) {
      var fpp = cfg.fullPP;
      var tm = h.match(new RegExp('<hh:paraPr id="' + fpp + '"[^>]*?tabPrIDRef="(\\d+)"'));
      h = h.replace(new RegExp('<hh:paraPr id="' + fpp + '"[\\s\\S]*?</hh:paraPr>'), function (m) {
        return m.replace(/<hc:intent value="-4670"/g, '<hc:intent value="-3000"')
                .replace(/<hc:intent value="-9340"/g, '<hc:intent value="-6000"');
      });
      if (tm) {
        h = h.replace(new RegExp('<hh:tabPr id="' + tm[1] + '"[\\s\\S]*?</hh:tabPr>'), function (m) {
          return m.replace(/pos="4670" type="LEFT"/g, 'pos="3000" type="LEFT"')
                  .replace(/pos="9340" type="LEFT"/g, 'pos="6000" type="LEFT"');
        });
      }
    }
    // (폐기) 2단 항목 답란 44% 시작열 LEFT 정지점 추가 — 옛 fs2(공통 시작열) 방식의 잔재였다.
    //  B(우측정렬)에서는 이 중간 LEFT 정지점이 type=2 탭의 RIGHT 정지점 스냅을 방해해 20번대·40번대(긴 내용)
    //  답란이 우측정렬되지 않는 원인이 됐다. → 추가하지 않는다. tabPr는 원본 그대로(LEFT 3000 + RIGHT 25695).
    if (cfg.itemCP != null) h = addUnderlineCharPr(h, cfg.itemCP, UL_SPACING);   // 밑줄 '_' 연속선용 charPr
    if (cfg.itemCP != null) h = addAnswerBorderCharPr(h, cfg.itemCP);            // 정답표시용 크기-정확 밑줄 charPr(13pt 등)
    if (cfg.askPP != null && ASK_GAP_BEFORE > 0) h = addAskGapParaPr(h, cfg.askPP, ASK_GAP_BEFORE);   // 유형 사이 여백용 발문 paraPr(위 간격)
    if (NORMALIZE_DEFAULT_TO_CASE) h = normalizeDefaultToCase(h);   // [DEAD] 항상 false(한글 이득 0, 정본 훼손). 이력용.
    return h;
  }

  // 답란 우측탭 폭 상수 K 계산: tab = K − 내용폭.  K = RIGHTSTOP − LEFTSTOP − 밑줄폭.
  //  - 해당 종류(항목/전체폭)에 앵커(실제 항목의 word+tab)가 있으면 K = anchor.tab + estW(word) (추정오차 상쇄, 정확).
  //  - 앵커가 없으면(전체폭에 끝빈칸 항목이 템플릿에 없을 때 등) tabPr 정지점 + (항목앵커로 역산한 밑줄폭)으로 유도.
  function computeK(anchor, stops, em, ulW, fallback) {
    if (anchor) return anchor.tab + estW(anchor.text, em);
    if (stops && stops.right) return stops.right - stops.left - ulW;
    return fallback;
  }

  function profileTemplate(section0) {
    var sp = splitSection(section0);
    var paras = splitParas(sp.body).map(stripLineseg);

    var firstAskIdx = -1, i;
    for (i = 0; i < paras.length; i++) { if (isAsk(paras[i])) { firstAskIdx = i; break; } }
    if (firstAskIdx < 0) firstAskIdx = Math.min(paras.length, 5);

    var prof = {
      prefix: sp.prefix, suffix: sp.suffix,
      header: paras.slice(0, firstAskIdx),
      askPP: '0', askCP: '0',
      itemPP: null, itemCP: null, fullPP: null, fullCP: null,
      tab1: '<hp:tab width="1440" leader="0" type="1"/>',
      colPr2: null, colPr1: null, blankRun: null, blankPara: null,
      itemAnchor: null, fullAnchor: null   // {text,tab} — 답란 우측탭 폭 자기보정(K)
    };

    for (i = firstAskIdx; i < paras.length; i++) {
      if (isAsk(paras[i])) {
        prof.askPP = attrOf(paras[i], 'paraPrIDRef') || '0';
        var rm = paras[i].match(/<hp:run charPrIDRef="(\d+)"/);
        prof.askCP = rm ? rm[1] : '0';
        break;
      }
    }

    var firstItemPP = null, firstItemCP = null;
    for (i = 0; i < paras.length; i++) {
      if (!isItem(paras[i])) continue;
      var cb = colPrBlock(paras[i]), cc = colCountOf(cb);
      var pp = attrOf(paras[i], 'paraPrIDRef') || '0';
      var cpm = paras[i].match(/<hp:run charPrIDRef="(\d+)"/); var cp = cpm ? cpm[1] : '0';
      var t1 = paras[i].match(/<hp:tab[^>]*type="1"\/>/);
      var br = blankRunOf(paras[i]);
      if (firstItemPP == null) {
        firstItemPP = pp; firstItemCP = cp;
        if (t1) prof.tab1 = t1[0];
        if (br) prof.blankRun = br;
        if (!prof.itemAnchor) prof.itemAnchor = anchorOf(paras[i]);
      }
      if (cc === 2 && !prof.itemPP) {
        prof.itemPP = pp; prof.itemCP = cp;
        if (t1) prof.tab1 = t1[0];
        if (cb) prof.colPr2 = cb;
        if (br) prof.blankRun = br;
        var a2 = anchorOf(paras[i]); if (a2) prof.itemAnchor = a2;   // 2단 항목 앵커 우선
      }
    }
    if (prof.itemPP) {
      for (i = 0; i < paras.length; i++) {
        if (!isItem(paras[i])) continue;
        var ppx = attrOf(paras[i], 'paraPrIDRef') || '0';
        if (ppx !== prof.itemPP) {
          prof.fullPP = ppx;
          var mfx = paras[i].match(/<hp:run charPrIDRef="(\d+)"/);
          prof.fullCP = mfx ? mfx[1] : prof.itemCP;
          prof.fullAnchor = anchorOf(paras[i]);   // 전체폭 항목(문장/영영) 앵커
          break;
        }
      }
    } else {
      prof.itemPP = firstItemPP; prof.itemCP = firstItemCP;
    }

    for (i = 0; i < paras.length; i++) {
      var b = colPrBlock(paras[i]);
      if (b && colCountOf(b) === 1) { prof.colPr1 = b; break; }
    }
    for (i = firstAskIdx; i < paras.length; i++) {
      if (isEmptyPara(paras[i]) && !colPrBlock(paras[i])) { prof.blankPara = paras[i]; break; }
    }

    if (prof.fullPP == null) { prof.fullPP = prof.itemPP; prof.fullCP = prof.itemCP; }
    if (prof.itemPP == null) { prof.itemPP = prof.fullPP = '0'; prof.itemCP = prof.fullCP = '0'; }
    if (!prof.blankRun) {
      prof.blankRun = '<hp:run charPrIDRef="' + prof.itemCP + '"><hp:t>' + new Array(31).join(' ') + '</hp:t></hp:run>';
    }
    if (!prof.blankPara) {
      prof.blankPara = mkP(prof.askPP, '<hp:run charPrIDRef="' + prof.itemCP + '"><hp:t/></hp:run>');
    }
    return prof;
  }

  function mkP(pp, inner, colBreak, pageBreak) {
    return '<hp:p id="0" paraPrIDRef="' + pp + '" styleIDRef="0" pageBreak="' + (pageBreak ? 1 : 0) + '" columnBreak="' + (colBreak ? 1 : 0) + '" merged="0">' + inner + '</hp:p>';
  }
  function runT(cp, t) { return '<hp:run charPrIDRef="' + cp + '"><hp:t>' + t + '</hp:t></hp:run>'; }

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

  //  각 '줄 끝' 빈칸마다 그 줄 내용폭으로 우측탭을 계산해 밑줄을 단 오른끝에 정렬.
  //  (파생어·유의어처럼 한 항목에 줄마다 빈칸이 있으면 줄별로 각각 우측정렬)
  //  문장 중간 빈칸(뒤에 같은 줄 텍스트가 더 있음)은 그 자리에 밑줄만(우측탭 없음).
  function segsToRuns(segs, cp, head, prof, opts, K, em, fs2, stops) {
    var s = '<hp:run charPrIDRef="' + cp + '">' + (head || '') + '<hp:t>';
    var open = true, lineText = '';
    var baseUlW = estW(blankTextOf(prof.blankRun), em);   // 기준 밑줄(빈 30칸) 폭 — 탭 보정 기준
    var fillW = estW('_', em) || 1;   // 밑줄 채움 문자('_') 폭 — 밑줄 칸수 계산 기준(nbsp가 아닌 '_' 폭으로 계산해야 오른끝 정렬 유지)
    var ulFillW = fillW * (1 + UL_SPACING / 100);   // 음수 자간 반영한 '_' 실제 폭(우측정렬 폭 계산용)
    var nbspW0 = estW(String.fromCharCode(0xA0), em) || 1;
    // 정답표시(qa) 정답 밑줄 목표폭 = 그룹 최대 정답폭 + 여유 2칸 → 정답 길이와 무관하게 밑줄폭을 '동일'하게.
    //  (opts._qaTargetW는 buildSection0이 그룹마다 미리 계산해 넣음. 없으면 0 → 기존 고정폭 동작)
    var qaTgt = (opts.qa && opts._qaTargetW) ? (opts._qaTargetW + 2 * nbspW0) : 0;
    var rightStop = (stops && stops.right) || (fs2 && fs2.right) || 0;   // 답란 우측정렬 기준(RIGHT 정지점 = 단 오른끝)
    var leftStop = (stops && stops.left) || 3000;                        // 첫 줄 내용 시작(번호탭 뒤 LEFT 정지점)
    var curLineStart = leftStop;    // 현재 줄 내용 시작 x. 첫 줄=leftStop(번호탭 뒤). break 후 연속 줄=0(문단 왼쪽).
    function close() { if (open) { s += '</hp:t></hp:run>'; open = false; } }
    function reopen() { if (!open) { s += '<hp:run charPrIDRef="' + cp + '"><hp:t>'; open = true; } }
    // txt를 밑줄 런(charPr) 위에 얹음. count=밑줄 총 칸수(생략 시 기준 30칸).
    //  mode 'center'=좌우 공백으로 감싸 가운데(전부 밑줄). 'lead'=첫글자를 밑줄 맨 앞에 얹고 밑줄 연속.
    function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
    // 밑줄 = ulCP('맑은 고딕', 테두리 없음) 위에 '_' 문자를 찍는다. 맑은고딕 '_'는 글자폭을 꽉 채워 이어지므로
    //  한글·폴라리스·웨일 모두 연속 실선이 된다(정본 참조파일과 동일 방식). 테두리가 없어 웨일 이중선도 없고,
    //  '_'가 실제 글자라 드래그 복사시 밑줄도 유지된다. (2026-07-15 결정, addUnderlineCharPr/findMalgunFontId 참고)
    function ulRun(inner) { return '<hp:run charPrIDRef="' + (prof.ulCP || cp) + '"><hp:t>' + inner + '</hp:t></hp:run>'; }
    function overUnderline(txt, mode, count) {
      var baseCount = count || 20;                          // 밑줄 칸 수
      var tW = Math.round(estW(txt, em) / fillW);           // txt를 밑줄 칸('_') 수로 환산
      if (mode === 'center') {
        // 정답표시(qa): 정답 아래 '일정한 폭' 서식(하단 테두리) 밑줄. 정답 길이와 무관하게 목표폭(targetW)으로 통일
        //  — 짧으면 nbsp로 채워 같은 폭, 정답이 targetW보다 길면 그만큼만(불가피). '_' 글리프 없어 이중선·틈 걱정 없고
        //  복사 불필요(정답이 이미 텍스트). 정답은 밑줄 위 가운데.
        // 정답 밑줄은 밑줄 문자속성(<hh:underline type="BOTTOM">) 위에 정답을 얹는다. 한글은 이 밑줄을
        //  공백(nbsp·일반공백 모두) 아래엔 안 그리므로(2026-07-20 A/B 테스트 확정) nbsp 여백으로 목표폭을
        //  맞춰도 '보이는' 선은 글자 밑에만 생긴다 → 폭 균일화 불가(§5.2 수용된 한계). nbsp 유지.
        var NB = String.fromCharCode(0xA0);
        var targetW = baseCount * fillW;   // 문제(q) 빈칸과 '동일한 폭(N칸)'. qaTgt(그룹최대)로 넓히지 않음 → 넓은 밑줄이 뜻을 밀어 줄바꿈되던 것 방지(q와 동일 레이아웃).
        var nbspW = estW(NB, em) || 1;
        var pad = Math.max(2, Math.round((targetW - estW(txt, em)) / nbspW));
        var lp = Math.floor(pad / 2), rp = pad - lp;
        var bcp = prof.borderCP || prof.ulCP || cp;
        return '<hp:run charPrIDRef="' + bcp + '"><hp:t>' + rep(NB, lp) + txt + rep(NB, rp) + '</hp:t></hp:run>';
      }
      // 'lead': 첫글자 뒤로 '_' 연속(스펠링 힌트)
      var fill2 = Math.max(2, baseCount - tW);
      return ulRun(txt + rep('_', fill2));
    }
    // 지정 칸수(count)의 '_' 밑줄(모드별)
    function fillBlank(seg, count) {
      if (opts.qa && seg.ans) return overUnderline(esc(seg.ans), 'center', count);
      if (opts.spell && seg.fl && /[A-Za-z]/.test(seg.fl.charAt(0))) return overUnderline(esc(seg.fl), 'lead', count);
      return ulRun(rep('_', count || 20));
    }
    function blankRun(seg) {
      if (opts.qa && seg.ans) return overUnderline(esc(seg.ans), 'center');   // 정답표시 시험지: 정답이 밑줄 위 가운데
      // 스펠링 첫글자는 영문 답에만 표시(한글 뜻은 힌트 없이 빈 밑줄만)
      if (opts.spell && seg.fl && /[A-Za-z]/.test(seg.fl.charAt(0))) return overUnderline(esc(seg.fl), 'lead');
      return prof.blankRun;
    }
    function lineTrailing(i) {   // i번째 빈칸이 그 줄 끝인가(다음 break 전에 텍스트/다른 빈칸 없음)
      for (var j = i + 1; j < segs.length; j++) {
        if (segs[j].type === 'break') return true;
        if (segs[j].type === 'text' && segs[j].text.trim()) return false;
        if (segs[j].type === 'blank') return false;
      }
      return true;
    }
    // 이 text 세그먼트가 놓인 논리줄이 '줄 끝 밑줄(우측정렬)'로 끝나는가? → 뜻을 왼쪽 영역에 가둔다.
    function meaningLineH(i) {
      for (var j = i + 1; j < segs.length; j++) {
        if (segs[j].type === 'break') return false;
        if (segs[j].type === 'blank') return lineTrailing(j);
      }
      return false;
    }
    function lineMkW(i) {   // 이 줄의 마커((유)/(반)) 폭(HWP단위) — 다음 break/blank 전 tail 텍스트
      var w = 0;
      for (var j = i + 1; j < segs.length; j++) {
        if (segs[j].type === 'break' || segs[j].type === 'blank') break;
        if (segs[j].type === 'text' && segs[j].tail) w += estW(segs[j].text, em);
      }
      return w;
    }
    var ulN2 = fs2 ? 12 : 20;                    // 밑줄 고정 칸수(2단 12 / 전체폭 20) — 뜻 폭 예약용
    // 뜻(문자열)을 왼쪽 영역 폭 안에서 LB로 접기. reserve=밑줄+마커+MINTAB(답란 최소 확보).
    //  줄 시작 x(curLineStart)는 첫 조각=현재값, 이후 조각=0(문단 왼쪽). 밑줄 영역 침범 방지.
    function emitMeaningWrapped(text, mkW) {
      // 여백은 MINTAB(≈0.3글자)이 아니라 ~2글자로 크게 잡는다 — estW 추정오차가 모자랄 때도
      //  뜻이 밑줄 영역을 넘지 않도록(revive처럼 경계에서 안 접혀 위로 흐르던 것 방지).
      // qa(정답표시)도 문제(q)와 '동일한' 밑줄폭(N칸)을 예약한다 → 뜻이 q와 똑같이 접혀, 답이 q 빈칸과
      //  같은 자리에 인라인 우측정렬(정답이라고 줄바꿈되지 않음). 예전 qaTgt(그룹최대) 확대·§5.3 새줄 로직 제거.
      var reserve = ulN2 * ulFillW + mkW + Math.max(MINTAB, estW('가가', em));
      var cur = '', curW = 0;
      for (var ci = 0; ci < text.length; ci++) {
        var ch = text.charAt(ci), cw = estW(ch, em);
        var budget = Math.max(estW('가', em) * 2, rightStop - curLineStart - reserve);
        if (curW + cw > budget && cur.replace(/^\s+/, '').length) {
          s += esc(cur); lineText += cur;         // 현재 조각 emit
          s += LB; lineText = ''; curLineStart = 0; meaningWrapped = true; // 강제 줄바꿈(연속 줄=x0). 접힘=긴 뜻 신호
          if (ch === ' ') { cur = ''; curW = 0; } else { cur = ch; curW = cw; }
        } else { cur += ch; curW += cw; }
      }
      if (cur.length) { s += esc(cur); lineText += cur; }
    }
    var pendingTail = '';   // 밑줄 바로 왼쪽에 붙일 마커((유)/(반)) — 탭 뒤에 emit
    var meaningWrapped = false;   // 현재 논리줄의 뜻이 emitMeaningWrapped로 접혔는가(긴 뜻 = estW 부정확 신호)
    segs.forEach(function (seg, i) {
      if (seg.type === 'text' && seg.tail) { pendingTail += seg.text; return; }   // 마커 보류
      if (seg.type === 'text') {
        reopen();
        if (meaningLineH(i)) emitMeaningWrapped(seg.text, lineMkW(i));   // 뜻 → 왼쪽 영역 안에서 접기
        else { s += esc(seg.text); lineText += seg.text; }
      }
      else if (seg.type === 'break') { reopen(); s += LB; lineText = ''; pendingTail = ''; curLineStart = 0; meaningWrapped = false; }   // 연속 줄은 문단 왼쪽(x=0)에서 시작
      else if (seg.type === 'blank') {
        // B(2026-07-14): 고정길이 '_' 밑줄을 paraPr tabPr의 RIGHT 정지점에 '우측정렬'.
        //  정본과 같은 구조 — type=2 탭 뒤 내용은 RIGHT 정지점에 끝을 맞춘다. 폭 추정은 안 함(밑줄 '칸수'가
        //  고정 N이고, 정렬은 정지점이 담당). 탭 width는 캐시 힌트일 뿐 → 한글/Polaris는 정지점으로 정렬,
        //  추정오차가 정렬·줄끊김을 만들지 않는다. 밑줄은 밑줄서식 없는 cp의 '_'(이중선 방지). 마커는 밑줄 왼쪽.
        var trailing = lineTrailing(i);
        var N = fs2 ? 12 : 20;                                  // 밑줄 고정 칸수(2단 좁은 칸 12 / 전체폭·1단 20)
        if (trailing && (lineText.trim() || pendingTail) && rightStop) {
          // 한글은 type=2 탭의 'width'로 정렬하므로(정본 확인: 줄마다 width 다름) width를 정확히 계산해야 한다.
          //  width = 오른끝(RIGHT) − 그 줄 내용 시작(curLineStart: 첫 줄 3000 / 연속 줄 0) − 내용폭 − 마커폭 − 밑줄폭.
          //  연속 줄(파생어 2번째 줄~)을 leftStop(3000)으로 잡으면 3000 어긋나 우측정렬이 깨졌었다. 강제 줄바꿈 안 함.
          var mkW = pendingTail ? estW(pendingTail, em) : 0;
          // qa/q 동일 밑줄폭(N칸) → 답이 문제 빈칸과 같은 자리에 우측정렬(정답이라고 줄바꿈되지 않음).
          var blankW = N * ulFillW;
          if (QA_MARKER_LEFT_ALIGN && opts.qa && seg.ans && pendingTail) {
            // [실험] 마커((유)/(반))를 고정 왼쪽 열(markerCol)에 왼쪽탭으로 붙여 시작 x 통일.
            //  markerCol = 오른끝 − 마커폭 − 밑줄목표폭. 왼쪽탭 width = markerCol − 그 줄 내용 시작 − 내용폭.
            var markerCol = rightStop - mkW - blankW;
            var leftW = markerCol - curLineStart - estW(lineText, em);
            reopen();
            s += '<hp:tab width="' + Math.max(MINTAB, Math.round(leftW)) + '" leader="0" type="1"/>';
            s += esc(pendingTail); pendingTail = '';
            close();
            s += fillBlank(seg, N);
            lineText = '';
          } else {
          // [정답 슬롯초과 → 새 줄+우측정렬] qa(정답표시)에서 정답 실제폭(ansW)이 고정 밑줄칸(blankW)보다
          //  넓으면(2단 좁은 칸에서 긴 정답: counterrevolutionary 등) 슬롯 기준 우측정렬이 오른끝을 넘겨
          //  → 다음 줄 '왼쪽'으로 접혀 흐른다(좌측정렬 증상). 이때는 예약폭을 실제 정답폭(eff)으로 잡아
          //  아래 hint/새줄 로직이 정답 오른끝을 rightStop에 맞추게 한다. ansW=estW(seg.ans,em)라 폰트 크기
          //  반영(em 기반) — 과거 고정 임계값 폐기 사유 회피. 여유분 5%: 아슬아슬(≤5% 초과)은 인라인 유지.
          var ansW = (opts.qa && seg.ans) ? estW(seg.ans, em) : 0;
          var overflow = ansW > blankW * 1.05;
          var eff = Math.max(blankW, ansW);                                          // 예약폭(슬롯 vs 실제 정답폭)
          var hint = rightStop - curLineStart - estW(lineText, em) - mkW - eff;      // type=2 탭 width
          // qa(정답표시)는 q(문제)와 동일 경로 — 밑줄폭·뜻 접기·탭 위치가 같아 답이 q 빈칸과 같은 자리에
          //  인라인 우측정렬된다. 정답이라고 새 줄로 내리지 않는다(§5.3 새줄 로직 제거).
          // [줄끝 빈칸 우측정렬 보정 — hwp 방식 이식] 뜻이 한 줄을 거의 채우면 hint(type=2 탭 width)가
          //  빈칸폭(blankW)보다 작아진다. 한글은 이때 빈칸을 다음 줄로 흘리는데, '그 작은 width'로 다음 줄
          //  '왼쪽'에 붙여버린다(우측정렬 실패 = 65번 증상). estW 추정오차가 경계에서 이걸 촉발한다.
          //  hwp는 RIGHT 탭 '정지점'(절대 오른끝)을 써서 답이 줄바꿈돼도 늘 오른끝에 우측정렬된다.
          //  → 같은 결과가 되도록, 빈칸이 인라인에 못 들어갈 만큼 hint가 작으면(또는 정답이 슬롯을 넘치면)
          //    우리가 먼저 새 줄로 내리고 (x=0) width를 오른끝까지 다시 계산한다. 단독 줄이라 estW 오차와
          //    무관하게 우측정렬 보장. 짧은 뜻(hint 충분·비초과)은 인라인 유지 → 불필요한 줄바꿈 없음.
          if ((overflow || hint < blankW * 0.5) && (lineText.trim() || pendingTail)) {
            s += LB; lineText = ''; curLineStart = 0;
            hint = rightStop - curLineStart - mkW - eff;   // 새 줄 기준 재계산(오른끝까지 = 큰 값, eff=실제 정답폭)
          }
          reopen();
          s += mkTab2(Math.max(MINTAB, hint));
          if (pendingTail) { s += esc(pendingTail); pendingTail = ''; }   // 마커((유)/(반)) — 탭 뒤 = 밑줄과 함께 우측정렬
          close();
          s += fillBlank(seg, N);
          lineText = '';
          }
        } else {                                     // 문장 중간 빈칸 / 내용 없는 빈칸(듣기) → 제자리 인라인 밑줄
          if (pendingTail) { reopen(); s += esc(pendingTail); pendingTail = ''; }
          close(); s += fillBlank(seg, trailing ? N : 12);
        }
      }
    });
    close();
    return s;
  }

  function buildItem(item, n, prof, opts, colPre, isFull, colBreak) {
    var cp = isFull ? prof.fullCP : prof.itemCP;
    var pp = isFull ? prof.fullPP : prof.itemPP;
    if (opts.ansOnly) {   // 정답만 표시: 번호 + 정답(문제·밑줄 없음), 레이아웃(단/문단)은 유지
      var ansText = esc(item.ans || '');
      var runA = '<hp:run charPrIDRef="' + cp + '">' + (colPre || '') + '<hp:t>' + n + '.' + prof.tab1 + ansText + '</hp:t></hp:run>';
      return mkP(pp, runA, colBreak);
    }
    var em = (opts.size || 11) * 100;
    var K = isFull ? prof.KFull : prof.KItem;
    if (K == null) K = isFull ? 39000 : 13000;
    var segs;
    if (item.drow) {
      segs = [];
      var headSegs = item.head ? parseSegs(item.head).filter(function (x) { return x.type === 'text'; }) : [];
      headSegs.forEach(function (x) { segs.push(x); });
      var hadHead = headSegs.length > 0;
      (item.rows || []).forEach(function (r, ri) {
        if (hadHead || ri > 0) segs.push({ type: 'break' });
        parseSegs(r.text || '').forEach(function (x) { if (x.type === 'text') segs.push(x); });
        if (r.mark) segs.push({ type: 'text', text: r.mark });
        segs.push({ type: 'blank', ans: r.ans || '', fl: r.fl || '' });
      });
    } else {
      segs = parseSegs(item.q || '');
      if (item.wl && !segs.some(function (x) { return x.type === 'blank'; })) {
        segs.push({ type: 'blank', ans: item.ans || '', fl: item.fl || '' });
      }
    }
    // 유의어·반의어: 줄 끝 '(유)/(반)' 마커를 밑줄 바로 왼쪽으로 → 뜻만 왼쪽, '(유) ____'가 함께 오른쪽
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
    // 2단 항목(전체폭 아님): 답란을 공통 시작열(prof.ansCol)에서 시작 — (유)/(반)·밑줄 시작점 통일
    var fs2 = (opts.columns === 2 && !isFull && prof.ansCol)
      ? { col: prof.ansCol, numTab: prof.itemLeft, right: prof.itemRight } : null;
    var stops = tabStops(opts.headerXml, pp);   // 답란 우측정렬용 RIGHT 정지점(+LEFT) — B 방식
    var runStr = segsToRuns(segs, cp, colPre || '', prof, opts, K, em, fs2, stops);
    runStr = runStr.replace('<hp:t>', '<hp:t>' + n + '.' + prof.tab1);
    return mkP(pp, runStr, colBreak);
  }

  // withCol1: 발문 문단 자체에 colCount=1(전체폭) colPr을 명시. 앞의 빈 closeColPara에만 의존하지 않고
  //  발문에서 단일단 영역을 직접 시작 → 발문이 확실히 100% 폭으로 렌더된다. 한글에서도 belt-and-suspenders로
  //  전체폭을 보장(정본 그대로라 무해). 유지.
  function makeAsk(ask, prof, withCol1, pageBreak) {
    var t = parseSegs(ask).filter(function (x) { return x.type === 'text'; }).map(function (x) { return x.text; }).join('');
    t = t.replace(/^\s*※\s*/, '');
    var pp = prof.askGapPP || prof.askPP;   // 발문 위 간격(space-before) 있는 paraPr → 유형 사이 여백. 없으면 발문 기본.
    if (withCol1) {
      var col1 = prof.colPr1 || '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"><hp:colLine type="NONE" width="0.1 mm" color="#000000"/></hp:colPr></hp:ctrl>';
      return mkP(pp, '<hp:run charPrIDRef="' + prof.askCP + '">' + col1 + '<hp:t>※ ' + esc(t) + '</hp:t></hp:run>', false, pageBreak);
    }
    return mkP(pp, runT(prof.askCP, '※ ' + esc(t)), false, pageBreak);
  }
  function closeColPara(prof) {
    var col1 = prof.colPr1 || '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"><hp:colLine type="NONE" width="0.1 mm" color="#000000"/></hp:colPr></hp:ctrl>';
    return mkP(prof.askPP, '<hp:run charPrIDRef="' + prof.askCP + '">' + col1 + '<hp:t/></hp:run>');
  }
  function substHeader(h, hd, titleCP) {
    if (hd && hd.title && titleCP) {
      var cm = h.match(/<hp:run charPrIDRef="(\d+)"/);
      if (cm && cm[1] === titleCP) h = h.replace(/<hp:t>[^<]*<\/hp:t>/, '<hp:t>' + esc(hd.title) + '</hp:t>');
    }
    return h;
  }

  // 항목의 대략 줄 수 추정(2단 열 나눔 높이균형용). q의 <br>로 논리줄 분리 후
  //  각 줄 (번호탭+내용)폭을 항목폭(colW)으로 나눠 랩(줄바꿈) 수 근사. 답란 밑줄은 무시(상대비교라 무방).
  function estItemLines(item, prof, em) {
    var colW = (prof.itemRight && prof.itemLeft && prof.itemRight > prof.itemLeft)
      ? (prof.itemRight - prof.itemLeft) : 25000;
    var numTab = prof.itemLeft || 3000;
    // 뜻(밑줄로 끝나는 줄)은 emitMeaningWrapped가 '밑줄 예약분'만큼 좁은 폭에서 접으므로,
    //  높이 추정도 그 좁은 폭(meaningColW)을 써야 실제 줄 수와 맞아 2단 분할점이 정확해진다.
    var fillW = estW('_', em) || 1;
    var ulFillW = fillW * (1 + UL_SPACING / 100);
    var reserve = 12 * ulFillW + estW('가가', em);          // 밑줄(2단 12칸)+안전여백(≈emitMeaningWrapped)
    var meaningColW = Math.max(colW * 0.35, colW - reserve);
    var segs = String(item.q || '').split(/<br\s*\/?>/i);
    var lines = 0;
    for (var i = 0; i < segs.length; i++) {
      var hasBlank = /class="wl"/.test(segs[i]);            // 줄 끝 밑줄이 있는 뜻 줄인가
      var txt = segs[i].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ');
      var w = hasBlank ? meaningColW : colW;
      var start = (i === 0) ? numTab : 0;                  // 첫 줄만 번호탭 뒤에서 시작
      lines += Math.max(1, Math.ceil((start + estW(txt, em)) / w));
    }
    return Math.max(1, lines);
  }

  // 항목 문단 줄간격(%) — 없으면 160. 페이지 용량(한 단 줄수) 계산용.
  function itemSpacingPct(headerXml, ppId) {
    if (!headerXml || ppId == null) return 160;
    var m = headerXml.match(new RegExp('<hh:paraPr id="' + ppId + '"[\\s\\S]*?</hh:paraPr>'));
    if (!m) return 160;
    var sm = m[0].match(/lineSpacing type="PERCENT" value="(\d+)"/);
    return sm ? +sm[1] : 160;
  }
  // [줄간격 통일 2026-07-23] 지정한 paraPr id들의 lineSpacing(%)만 pct로 덮어쓴다(구조용 문단은 불변).
  //  정본 템플릿 파일명 %(예: 160)는 그대로 두고 '보이는 줄간격'만 .hwp값(neVocabHwpLineSpacing)으로 통일.
  //  대상 = 본문 항목/발문 문단(itemPP·fullPP·askPP) — .hwp(hwpml-export)가 LSVAL을 주는 문단과 동일 범위.
  //  ※ v2.7 build.py inject_line_spacing 과 같은 규칙. 반드시 buildSection0 전에 호출(용량계산 itemSpacingPct가 새 값을 읽게).
  function overrideBodyLineSpacing(headerXml, ids, pct) {
    if (!headerXml || pct == null) return headerXml;
    var seen = {};
    (ids || []).forEach(function (id) {
      if (id == null || seen[id]) return;
      seen[id] = 1;
      var re = new RegExp('(<hh:paraPr id="' + id + '"[\\s\\S]*?</hh:paraPr>)');
      headerXml = headerXml.replace(re, function (block) {
        return block.replace(/(<hh:lineSpacing type="PERCENT" value=")\d+(")/, '$1' + pct + '$2');
      });
    });
    return headerXml;
  }
  // 본문 세로 가용 높이(HWPUNIT) = 용지높이 − 위/아래/머리말/꼬리말 여백. secPr(pagePr/margin)에서 파싱.
  function pageTextHeight(section0) {
    var pg = section0.match(/<hp:pagePr[^>]*height="(\d+)"/);
    if (!pg) return 75000;
    var g = (section0.match(/<hp:margin\b[^>]*\/>/) || [''])[0];
    function a(n) { var x = g.match(new RegExp('\\b' + n + '="(\\d+)"')); return x ? +x[1] : 0; }
    return +pg[1] - a('top') - a('bottom') - a('header') - a('footer');
  }

  function buildSection0(templateSection0, groups, opts) {
    opts = opts || {};
    var prof = profileTemplate(templateSection0);
    prof.ulCP = findUnderlineCP(opts.headerXml);   // 밑줄 '_' 연속선용 charPr(음수 자간). 없으면 항목 charPr로 폴백
    prof.askGapPP = (ASK_GAP_BEFORE > 0) ? findAskGapPP(opts.headerXml, ASK_GAP_BEFORE) : null;   // 발문 위 간격 paraPr(없으면 askPP 폴백)

    // 전체폭 답란 문단 확정: RIGHT 정지점 없을 때만(2단 영영) 재선정. 1단은 이미 있어 그대로.
    prof.fullPP = resolveFullPP(opts.headerXml, prof.fullPP);

    // 답란 밑줄 색은 검정이어야 함 — 템플릿 blankRun이 유채색(1단: 빨강 charPr9)이면 검정 밑줄 charPr로 교체
    var blankCid = (prof.blankRun.match(/charPrIDRef="(\d+)"/) || [])[1];
    if (blankCid && opts.headerXml) {
      var ccm = opts.headerXml.match(new RegExp('<hh:charPr id="' + blankCid + '"[\\s\\S]*?</hh:charPr>'));
      if (ccm && !/textColor="#0{6}"/i.test(ccm[0])) {   // 답란 charPr이 유채색
        var blk = blackUnderlineCharPr(opts.headerXml);
        if (blk) prof.blankRun = prof.blankRun.replace(/charPrIDRef="\d+"/, 'charPrIDRef="' + blk + '"');
      }
    }
    // 하단 테두리(서식) 밑줄 charPr id — 정답표시(qa)에서 정답 아래 연속 밑줄용(복사 불필요하므로 '_' 대신 서식 밑줄).
    //  normalizeHeader가 추가한 '크기-정확 정답 밑줄 charPr'(itemCP 크기 + BOTTOM 테두리)을 우선 사용 →
    //  13pt 문서에서 정답이 13pt로 나옴(옛 방식은 템플릿 답란 charPr=11pt 고정이라 정답이 11pt로 나오던 버그).
    prof.borderCP = findAnswerBorderCP(opts.headerXml) || (prof.blankRun.match(/charPrIDRef="(\d+)"/) || [])[1] || prof.itemCP;

    // 답란 밑줄 채움 문자 = nbsp/공백 → '_'(밑줄문자). 정본 템플릿은 nbsp(U+00A0)로 채워져 있으나,
    //  HWP에서 드래그 복사 시 공백류(nbsp)는 줄끝에서 잘리고 밑줄 서식도 안 따라와 밑줄이 사라진다.
    //  '_'는 실제 글자라 복사되고, 하단밑줄 charPr을 그대로 유지해 연속 실선처럼 보인다.
    //  (개수는 그대로 두고 글자만 교체 — 폭 차이는 fillW('_' 폭) 기준 밑줄칸 계산으로 흡수)
    prof.blankRun = prof.blankRun.replace(/(<hp:t>)([\s\S]*?)(<\/hp:t>)/,
      function (_m, o, t, c) { return o + t.replace(/[\s ]/g, '_') + c; });

    // 답란 우측탭 폭 상수 K(항목/전체폭) 확정 — tabPr 정지점 + 앵커 자기보정
    var em = (opts.size || 11) * 100;
    var ulW = estW(blankTextOf(prof.blankRun), em);
    var itemStops = tabStops(opts.headerXml, prof.itemPP);
    var fullStops = tabStops(opts.headerXml, prof.fullPP);
    prof.KItem = computeK(prof.itemAnchor, itemStops, em, ulW, 25695 - 3000 - ulW);
    // 밑줄 실제폭을 항목 앵커로 역산해 전체폭 K에도 동일 적용(항목/전체폭 정렬 일관)
    var ulW2 = (prof.itemAnchor && itemStops && itemStops.right) ? (itemStops.right - itemStops.left - prof.KItem) : ulW;
    prof.KFull = computeK(prof.fullAnchor, fullStops, em, ulW2, 53660 - 3000 - ulW2);   // 번호탭 4670→3000 축소와 일관(폴백)

    // 2단 답란 공통 시작열(X) — 항목 tabPr에 추가된 LEFT 정지점과 일치(normalizeHeader와 동일 계산)
    if ((opts.columns || 1) === 2 && itemStops && itemStops.right) {
      prof.ansCol = answerCol(itemStops);
      prof.itemLeft = itemStops.left;
      prof.itemRight = itemStops.right;
    }

    // 한 페이지(2단) 수용 줄수 추정 — 큰 그룹의 columnBreak 생략 판단용
    var lineHUnit = em * (itemSpacingPct(opts.headerXml, prof.itemPP) / 100);
    var linesPerCol = lineHUnit > 0 ? (pageTextHeight(templateSection0) / lineHUnit) : 30;
    var pageCapLines = Math.max(4, Math.floor(2 * linesPerCol) - 3);   // 발문 등 여유 3줄

    var out = [];
    var titleCP = null;
    if (opts.headerXml && opts.header && opts.header.title) {
      var H = {}, re = /<hh:charPr\b[^>]*\bid="(\d+)"[^>]*\bheight="(\d+)"/g, mm, best = -1;
      while ((mm = re.exec(opts.headerXml))) H[mm[1]] = +mm[2];
      prof.header.forEach(function (h) {
        var cm = h.match(/<hp:run charPrIDRef="(\d+)"/);
        if (cm && H[cm[1]] != null && H[cm[1]] > best) { best = H[cm[1]]; titleCP = cm[1]; }
      });
    }
    // 상단 제목 블록: 제목 뒤 '완전 빈' 문단(엔터)만 제거(사용자 요청: 맨 위 엔터 2번→1번).
    //  주의: '이름___ 점수___' 아래의 가로선은 밑줄 charPr을 건 '공백 문단'이라 텍스트가 비어 보여도
    //  글자(공백)가 있는 라인이다 → 지우면 안 됨. 그래서 hp:t에 글자가 '하나도 없는'(공백조차 없는)
    //  문단만 엔터로 보고 제거한다. 첫 발문 앞에는 그룹 루프가 구분 빈 문단을 1개 넣으므로 최종 1줄.
    function isBlankEnter(p) {
      if (colPrBlock(p)) return false;
      var t = stripLineseg(p);
      var joined = (t.match(/<hp:t>([\s\S]*?)<\/hp:t>/g) || [])
        .map(function (m) { return m.replace(/<\/?hp:t>/g, ''); }).join('');
      return joined.length === 0;   // 공백 1개라도 있으면(밑줄 라인) 보존
    }
    var hdr = prof.header.slice();
    var emptyRun = 0;
    for (var hi = hdr.length - 1; hi >= 0; hi--) {
      if (isBlankEnter(hdr[hi])) emptyRun++; else break;
    }
    if (emptyRun > 0) hdr = hdr.slice(0, hdr.length - emptyRun);   // 제목 뒤 완전 빈 문단만 제거(라인 보존)
    // [line1 입력값 재조립 2026-07-23] 템플릿의 line1(학원·반…출제일)·교재줄은 '박힌 텍스트'라 입력이 반영 안 됐다.
    //  → HWP/DOCX와 동일 규칙으로 재조립: line1 = 학원·반·출제일 날짜[교재]. 템플릿은 교재를 별도 문단(p1)에 두므로
    //  교재를 line1에 접고(=[교재]) 교재 문단은 제거한다(3형식 동일 룩). paraPr/charPr(스타일)은 템플릿 것 유지.
    if (opts.header) {
      var hd = opts.header, p1 = [];
      if (hd.academy) p1.push(hd.academy);
      if (hd.cls) p1.push(hd.cls);
      if (hd.date) p1.push('출제일 ' + hd.date);
      var line1 = p1.join('·');
      if (hd.book) line1 += '[' + hd.book + ']';
      var line1Idx = -1;
      for (var li = 0; li < hdr.length; li++) { if (hdr[li].indexOf('출제일') >= 0) { line1Idx = li; break; } }
      if (line1Idx < 0 && hdr.length) line1Idx = 0;   // fallback: 첫 헤더 문단
      if (line1Idx >= 0) {
        var metaCP = (hdr[line1Idx].match(/charPrIDRef="(\d+)"/) || [null, null])[1];
        var wroteL1 = false;
        hdr[line1Idx] = hdr[line1Idx].replace(/<hp:t>[\s\S]*?<\/hp:t>/g, function (m) {
          if (!wroteL1) { wroteL1 = true; return '<hp:t>' + esc(line1) + '</hp:t>'; }
          return '<hp:t></hp:t>';   // 여러 hp:t였다면 나머지는 비움(옛 날짜 잔존 방지)
        });
        // 교재 문단 = line1과 같은 charPr(meta)인 다른 문단(제목·이름/점수 아님) → 제거(교재는 line1 [교재]로 접힘)
        if (metaCP != null) {
          for (var bi = 0; bi < hdr.length; bi++) {
            if (bi === line1Idx) continue;
            if (hdr[bi].indexOf('charPrIDRef="' + metaCP + '"') >= 0 &&
                hdr[bi].indexOf('출제일') < 0 && hdr[bi].indexOf('이름') < 0) { hdr.splice(bi, 1); break; }
          }
        }
      }
    }
    // 로고 박스 주입: 첫 헤더 문단 run0의 secPr·ctrl 뒤(=첫 </hp:run> 직전)에 rect를 넣는다.
    //  정본 HWPX와 동일 위치(run0 자식순서 secPr→ctrl→rect). 1단계=박스만(텍스트/우측정렬/구분선/스페이서는 다음 단계).
    if (hdr.length && hdr[0].indexOf('</hp:run>') >= 0) {
      hdr[0] = hdr[0].replace('</hp:run>', HDR_RECT + '</hp:run>');
    }
    // 제목+이름/점수 '한 줄' 통일(2026-07-23): 이름·점수를 별도 문단이 아니라 제목 문단 끝에
    //  우측탭 1개로 붙여 '제목(좌) …… 이름/점수(우)'를 한 줄에 둔다. 정본 HWPX·생성 .hwp·.docx 헤더가
    //  모두 이 한 줄 형태다. 별도 줄이면 이름/점수가 로고 박스 아래로 처져 좌하단 여백이 커진다(사용자 지적).
    //  ★한 줄 우측정렬 원리: 제목 문단이 **RIGHT 정지점을 가진 tabPr**을 참조해야 탭이 오른끝에 스냅된다.
    //   ★함정(2026-07-23): 병합 문단을 fullPP(pp=13)로 바꿔도 그 tabPr(id=2)은 RIGHT@53660 앞에
    //    LEFT@4670·9340 정지점이 있어 인라인 type="2"(우측) 탭이 첫 LEFT에 걸려 이름/점수가 좌측에 머물렀다.
    //    → opts.nsPP = 'RIGHT 정지점만 있는' 복제 paraPr(addNsRightTabParaPr)로 교체해야 오른끝에 스냅된다.
    var nsStop = (fullStops && fullStops.right) || (itemStops && itemStops.right) || 53660;
    var nsPP = (opts.nsPP != null) ? opts.nsPP : prof.fullPP;
    var nsIdx = -1, titleIdx = -1;
    for (var ni = 0; ni < hdr.length; ni++) {
      if (nsIdx < 0 && hdr[ni].indexOf('이름') >= 0 && hdr[ni].indexOf('점수') >= 0) nsIdx = ni;
      if (titleCP && hdr[ni].indexOf('charPrIDRef="' + titleCP + '"') >= 0) titleIdx = ni;
    }
    if (nsIdx >= 0 && titleIdx >= 0 && titleIdx !== nsIdx && nsPP != null) {
      var nsRun = '';
      hdr[nsIdx].replace(/(<hp:run charPrIDRef="\d+"><hp:t>)([\s\S]*?)(<\/hp:t><\/hp:run>)/,
        function (_m, o, inner, c) {
          if (inner.indexOf('이름') < 0) return _m;                         // 이름 없는 run은 건너뜀
          var txt = inner.replace(/<hp:tab[^>]*\/>/g, ' | ');               // 내부 좌측탭 → ' | '
          var vis = txt.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ');
          var titleVis = (hdr[titleIdx].match(/<hp:t>([\s\S]*?)<\/hp:t>/) || ['', ''])[1]
            .replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ');
          var w = Math.max(300, Math.round(nsStop - estW(titleVis, em) - estW(vis, em)));   // 탭폭 힌트(실제 위치는 RIGHT 정지점이 결정)
          nsRun = o + '<hp:tab width="' + w + '" leader="0" type="2"/>' + txt + c;
          return _m;
        });
      if (nsRun) {
        // 제목 문단 paraPr → RIGHT 정지점만 있는 복제 paraPr(nsPP)로 교체(첫 <hp:p>의 paraPrIDRef만)
        hdr[titleIdx] = hdr[titleIdx].replace(/^(<hp:p\b[^>]*\bparaPrIDRef=")\d+(")/, '$1' + nsPP + '$2');
        hdr[titleIdx] = hdr[titleIdx].replace(/<\/hp:p>\s*$/, nsRun + '</hp:p>');   // 제목 문단 끝에 이름/점수 run 삽입 → 한 줄
        hdr.splice(nsIdx, 1);                                                       // 비게 된 이름/점수 문단 제거
      }
    }
    // [구분선 삽입 2026-07-23] 병합 제목줄(titleIdx) 바로 아래에 '하단 실선' 빈 문단 삽입 → 헤더/본문 사이 전체폭 라인.
    //  HWP·DOCX·정본 헤더엔 있는데 HWPX만 없어 '헤더 아래 라인'이 빠져 보였다(사용자 지적). 박스 14mm라 라인과 안 겹침.
    if (opts.dividerPP != null && titleIdx >= 0) {
      // ★divider run charPr는 titleCP가 아니어야 한다: substHeader가 '첫 run charPr==titleCP'면 빈 <hp:t>에도
      //  제목을 넣어버려 구분선 문단에 제목이 중복 인쇄됨. → 제목 아닌 문단(스페이서/line1)의 charPr을 쓴다.
      var divCP = null;
      for (var di = hdr.length - 1; di >= 0; di--) {
        if (di === titleIdx) continue;
        var dcm = hdr[di].match(/charPrIDRef="(\d+)"/);
        if (dcm && dcm[1] !== titleCP) { divCP = dcm[1]; break; }
      }
      if (divCP == null) divCP = '0';
      var divP = '<hp:p id="0" paraPrIDRef="' + opts.dividerPP + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="' + divCP + '"><hp:t></hp:t></hp:run></hp:p>';
      hdr.splice(titleIdx + 1, 0, divP);
    }
    hdr.forEach(function (h) { out.push(substHeader(h, opts.header, titleCP)); });
    var columns = opts.columns || 1;
    var curCols = 1;
    var prevFull = false;   // 직전 그룹이 전체폭(문장완성·영영)이었는지 — 전체폭↔2단 경계에 pageBreak 넣기용
    var hadPrev = false;    // 직전 그룹이 존재했는지(첫 그룹엔 pageBreak 금지)
    groups.forEach(function (g) {
      // 항목 줄수 두 가지: avgLines=estItemLines(줄바꿈 후 실제 줄수, 컬럼분할 생략 판단용),
      //  structLines=<br> 기반 '구조적 줄수'(full 그룹 2단화 판단용 — 장문을 다줄로 오판 안 하게).
      var lc = g.items.map(function (it) { return estItemLines(it, prof, em); });
      var total = lc.reduce(function (a, b) { return a + b; }, 0);
      var avgLines = g.items.length ? (total / g.items.length) : 1;
      var structLines = 0;
      for (var _si = 0; _si < g.items.length; _si++) {
        structLines += (String(g.items[_si].q || '').match(/<br\s*\/?>/gi) || []).length + 1;
      }
      structLines = g.items.length ? structLines / g.items.length : 1;
      // isFull(1단) 결정: data.full 유형 중 '단일 장문'(영영풀이, structLines<1.5)만 1단 유지.
      //  '다줄 구조'(문장완성)는 2단으로(keepLines가 항목 통째 유지 → 안 갈라짐).
      var isFull = !!g.full;
      if (isFull && TWOCOL_MULTILINE_FULL && columns === 2 && structLines >= 1.5) isFull = false;   // 문장완성 → 2단
      // (반대 옵션) 다줄 비-full 그룹(파생어·유의어) 1단화 — "최대한 2단" 방침으로 꺼둠(기본 false).
      if (!isFull && MULTILINE_GROUPS_TO_FULL && columns === 2 && avgLines >= 2) isFull = true;
      var twocol = !isFull && columns === 2;   // 영영풀이(단일 장문)만 1단, 나머지 전부 2단.
      // [경계 pageBreak] 전체폭↔2단이 바뀌는 경계의 뒷 그룹을 새 페이지에서 시작(발문에 pageBreak).
      //  ⑴ 전체폭→2단(EDGE_PB_FULL_TO_TWOCOL=true): ★한글 필수★. 없으면 한글이 2단 발문을 앞 전체폭
      //     영역에 가둬 발문이 2단으로 나오고 항목이 컬럼 경계서 쪼개짐. 대가=경계 하단 여백(수용).
      //  ⑵ 2단→전체폭(EDGE_PB_TWOCOL_TO_FULL=false): 불필요. 전체폭 발문은 closeColPara만으로 정상,
      //     pageBreak 넣으면 앞 페이지 하단 여백만 생김 → 끔.
      //  (과거 이 블록을 '웨일 흡수 방지'로 적었으나, 실제 살아있는 ⑴은 한글 자체 요구다. 웨일은 무시.)
      var askPageBreak = columns === 2 && hadPrev && (
        (EDGE_PB_FULL_TO_TWOCOL && twocol && prevFull) ||   // 전체폭→2단 (한글 발문 전체폭 보장, 필수)
        (EDGE_PB_TWOCOL_TO_FULL && isFull && !prevFull)     // 2단→전체폭 (여백 원인, 끔)
      );
      // 발문(ask)은 항상 전체폭이어야 함. 유형 사이 여백은 '빈 문단'이 아니라 발문 문단의 '위 간격'(makeAsk의
      //  askGapPP)으로 준다 → 경계에 지울 빈 줄이 없으니 지워도 2단이 안 깨진다. 단 전환(2단 닫기·전체폭
      //  시작)은 발문 자신의 colCount=1(makeAsk withCol1)이 담당한다. curCols만 1로 리셋(다음 항목이 colPr2 재삽입).
      if (columns === 2) curCols = 1;
      out.push(makeAsk(g.ask, prof, columns === 2, askPageBreak));
      prevFull = isFull; hadPrev = true;
      // 2단 열 나눔: 높이(줄 수) 기준으로 좌우가 균형되게 분할점 선택 → 파생어·유의어처럼
      //  항목마다 높이가 다른 유형도 좌우 높이가 비슷하게 나뉨. 균일한 단어형은 자연히 5/5(홀수 5/4).
      //  분할점(splitAt)=왼쪽 항목 수. 그 항목에 columnBreak를 넣어 오른쪽 단 시작을 고정.
      var splitAt = -1;
      if (twocol) {
        // 강제 columnBreak(5/5) 생략 조건 — 생략 시 splitAt=-1로 HWP 자연 흐름(신문형)에 맡긴다.
        //  ⑴ 한 페이지(2단)를 넘길 큰 그룹: 강제 break가 페이지 재균형과 충돌해 붕괴.
        //  ⑵ 다줄 우세 그룹(항목 평균 ≥2줄 = 파생어·유의어): 강제 5/5는 키 큰 항목을 컬럼 경계에서
        //     '쪼갬'(예: 단어는 왼단, 뜻·빈칸은 오른단). 강제 break를 빼면 HWP가 항목을 통째로
        //     다음 단으로 흘려 쪼개짐이 사라진다(대가=단 하단 여백). keepLines는 페이지넘김만 막고
        //     컬럼분할은 못 막으므로 이 가드가 필수.
        //  (MULTILINE_GROUPS_TO_FULL=true면 다줄 그룹은 위에서 1단으로 빠져 여기 안 옴 → 가드 무해.)
        if (!(CB_SKIP_MULTIPAGE && (total > pageCapLines || avgLines >= 2))) {
          var acc = 0, best = Infinity;
          for (var k = 1; k < g.items.length; k++) {
            acc += lc[k - 1];
            var diff = Math.abs(2 * acc - total);   // |왼쪽 - 오른쪽|
            //  동률이면 '왼쪽을 더 얹지 않는다'(< 사용) → 왼쪽 ≤ 오른쪽. 한글 신문형 다단의
            //  자동 높이균형(왼쪽을 반 넘기지 않게 채움)과 일치시켜 columnBreak 충돌·순서 꼬임 방지.
            if (diff < best) { best = diff; splitAt = k; }
          }
        }
      }
      // 정답표시(qa): 이 그룹 정답 밑줄 폭을 '그룹 내 최대 정답폭'으로 통일(짧은 답은 nbsp로 채워 같은 폭).
      //  정답 문자열 = 문항 q의 data-ans(문장중간·파생어·유의어 빈칸) + it.ans(끝빈칸 유형, 쉼표분리).
      opts._qaTargetW = 0;
      if (opts.qa) {
        var mxA = 0, reA = /data-ans="([^"]*)"/g, mA;
        g.items.forEach(function (it) {
          var anss = [], hasSpan = false;
          reA.lastIndex = 0;
          while ((mA = reA.exec(String(it.q || '')))) { anss.push(mA[1]); hasSpan = true; }   // 문장중간·파생어·유의어: 빈칸별 개별 정답
          if (!hasSpan && it.ans) anss.push(String(it.ans));   // 끝빈칸 유형(1·2·4·7): it.ans 통째(쉼표 포함 그대로 렌더됨)
          anss.forEach(function (a) { a = a.replace(/&[a-z]+;/g, ' '); var w = estW(a, em); if (w > mxA) mxA = w; });
        });
        opts._qaTargetW = mxA;
      }
      g.items.forEach(function (it, i) {
        var colPre = null;
        if (twocol && curCols !== 2) { colPre = prof.colPr2; curCols = 2; }
        var colBreak = twocol && i === splitAt;
        out.push(buildItem(it, it._n, prof, opts, colPre, !twocol, colBreak));
        // 항목 사이 빈 문단(엔터) 없음 — 모든 유형(전체폭 포함)에서 엔터 없이 이어지고
        //  간격은 줄간격 %로만 준다. (사용자 요청: 문장완성·영영 30/60번대 엔터도 제거)
      });
    });
    if (curCols === 2) out.push(closeColPara(prof));
    return prof.prefix + out.join('') + prof.suffix;
  }

  global.HwpxTpl = {
    profileTemplate: profileTemplate,
    buildSection0: buildSection0,
    splitSection: splitSection,
    repackage: repackage,
    normalizeHeader: normalizeHeader,
    findFullPP: findFullPP,
    resolveFullPP: resolveFullPP,
    tabStops: tabStops,
    addNsRightTabParaPr: addNsRightTabParaPr,
    addDividerParaPr: addDividerParaPr,
    _internal: { splitParas: splitParas, stripLineseg: stripLineseg, parseSegs: parseSegs, normalizePool: normalizePool, estW: estW }
  };

  async function downloadHwpxTpl(btn) {
    var old = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '만드는 중…'; btn.disabled = true; }
    try {
      if (!global.JSZip) { alert('JSZip을 못 불러왔습니다.'); return false; }
      var cfg = readConfig();
      var groups = readGroupsCompat();
      var fname = TPL.fileName(cfg);
      var zip;
      var tpl = global.HWPX_TEMPLATES && global.HWPX_TEMPLATES[fname];
      if (tpl && typeof tpl === 'object') {
        // templates.js(신형): 내부 파일을 XML '텍스트 그대로' 담은 객체 → zip을 즉석 구성. file:// 에서도 동작.
        zip = new global.JSZip();
        Object.keys(tpl).forEach(function (k) { zip.file(k, tpl[k]); });
      } else if (typeof tpl === 'string') {
        // templates.js(구형): base64 문자열(하위호환)
        zip = await global.JSZip.loadAsync(tpl, { base64: true });
      } else {
        // 파일명에 '%'(예: (160%))·한글·괄호가 있어 fetch URL로 인코딩 필요('%'는 잘못된 퍼센트인코딩이 됨)
        var url = TPL.baseUrl + encodeURIComponent(fname);
        var resp = await fetch(url);
        if (!resp.ok) throw new Error('템플릿을 못 찾음: ' + TPL.baseUrl + fname + ' (HTTP ' + resp.status + ')');
        zip = await global.JSZip.loadAsync(await resp.arrayBuffer());
      }
      var section0 = await zip.file('Contents/section0.xml').async('string');
      var headerXml = await zip.file('Contents/header.xml').async('string');
      var prof0 = profileTemplate(section0);
      var fullPP = resolveFullPP(headerXml, prof0.fullPP);   // 전체폭 답란 문단
      // [줄간격] 본문 항목/발문 문단의 lineSpacing을 정본 템플릿/OWPML 값(cfg.ls = neVocabLineSpacing)으로 명시 주입 — normalizeHeader 전(askGap·fullPP 클론이 새 값 상속)이자 buildSection0 전(용량계산 반영).
      //  ★[2026-07-23] HWPX는 .hwp의 퍼센트를 그대로 쓰지 않는다: OWPML PERCENT는 HWPML보다 촘촘하게 렌더돼 같은 130%도 .hwp보다 좁아진다.
      //   그래서 HWP·DOCX만 neVocabHwpLineSpacing(.hwp 실측값)으로 통일하고, HWPX는 한글에서 검증된 템플릿 값(9:145/155/170·11:150/160/180·13:165/170/190)을 유지한다.
      headerXml = overrideBodyLineSpacing(headerXml, [prof0.itemPP, prof0.fullPP, fullPP, prof0.askPP], cfg.ls);
      var newHeader = normalizeHeader(headerXml, { columns: cfg.columns, fullPP: fullPP, itemPP: prof0.itemPP, itemCP: prof0.itemCP, askPP: prof0.askPP });   // keepLines + (2단)번호탭 통일 + 밑줄 charPr + 발문 위 간격 paraPr
      // [이름/점수 우측정렬] RIGHT-단독 tabPr paraPr을 추가(fullPP 복제) → 제목+이름/점수 병합 문단에 사용. normalizeHeader 뒤라 줄간격 등 상속.
      var nsPP = fullPP;
      var addNs = addNsRightTabParaPr(newHeader, fullPP);
      if (addNs) { newHeader = addNs.header; nsPP = addNs.ppId; }
      // [구분선] ★2026-07-23: HWPX 생성기는 구분선을 '이미' 그리는 경로가 있어(사용자 화면 '구분선 두개') 여기서
      //  추가하면 중복된다. addDividerParaPr(정의는 유지)를 호출하지 않는다. 헤더 아래 라인은 기존 경로가 담당.
      var dividerPP = null;
      var newSection = buildSection0(section0, groups, { columns: cfg.columns, size: cfg.size, qa: cfg.qa, spell: cfg.spell, ansOnly: cfg.ansOnly, header: cfg.header, headerXml: newHeader, nsPP: nsPP, dividerPP: dividerPP });
      var out = await repackage(zip, { 'Contents/section0.xml': newSection, 'Contents/header.xml': newHeader });
      var modeLabel = global.neViewModeLabel ? global.neViewModeLabel(cfg) : '문제';   // 문제/정답/문제+정답
      var titleName = safeFileTitle(cfg.header && cfg.header.title);   // 파일명 접두 = 시험지명(wzTitle). 비면 '어휘시험지'.
      var saveName = titleName + '_' + modeLabel + '_' + cfg.columns + '단_' + cfg.size + '_' + cfg.gapLabel + '(' + cfg.ls + '%).hwpx';   // 라벨=실제 렌더 줄간격(=템플릿 OWPML 값). 템플릿 로드도 cfg.ls로 일치.
      (global.saveBlobCompat || saveBlobFallback)(out, saveName);
    } catch (e) {
      alert('HWPX 생성 오류: ' + (e && e.message ? e.message : e));
    } finally {
      if (btn) { btn.textContent = old; btn.disabled = false; }
    }
    return false;
  }

  async function repackage(srcZip, overrides, outType) {
    var names = Object.keys(srcZip.files).filter(function (n) { return !srcZip.files[n].dir; });
    names.sort(function (a, b) { return a === 'mimetype' ? -1 : b === 'mimetype' ? 1 : 0; });
    var z = new global.JSZip();
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var content = (overrides[n] != null) ? overrides[n] : await srcZip.file(n).async('uint8array');
      if (n === 'mimetype') z.file(n, content, { compression: 'STORE' });
      else z.file(n, content);
    }
    Object.keys(z.files).forEach(function(k){ if(z.files[k].dir) delete z.files[k]; }); // 폴더 항목 제거
    return z.generateAsync({ type: outType || 'blob', mimeType: 'application/octet-stream', compression: 'DEFLATE' });
  }

  // 저장 파일명 접두 = 시험지명(wzTitle). 파일명 금지문자 제거·공백정리 후 비면 '어휘시험지' 폴백.
  function safeFileTitle(t) {
    var s = (t == null ? '' : String(t)).replace(/[\\\/:*?"<>|\r\n\t]/g, '').replace(/\s+/g, ' ').trim();
    return s || '어휘시험지';
  }

  // 설정 → 템플릿 파일명 토큰. gapLabel·ls는 SSOT(ne-export-common.js)로 계산해
  //   실제 정본 18개 파일명(어휘시험지_{단}단_{크기}_{간격}({줄간격}%).hwpx)과 정확히 일치시킨다.
  // 시험지 보기 옵션(미리보기 라디오와 동일): '문제'=q / '정답'=ans(정답만) / '정답표시시험지'=qa
  function curViewMode() {
    var r = document.querySelector && document.querySelector('input[name="viewopt"]:checked');
    if (!r) return 'q';
    return r.value === '정답' ? 'ans' : r.value === '정답표시시험지' ? 'qa' : 'q';
  }
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
    var ls = global.neVocabLineSpacing ? global.neVocabLineSpacing(sizePt, level, columns) : 160;   // 템플릿 파일명 매칭 전용(옛 145~190%)
    // ※ HWPX는 .hwp값(neVocabHwpLineSpacing)을 쓰지 않는다 — OWPML/HWPML PERCENT 기준이 달라 그대로 쓰면 좁아짐. cfg.ls(=neVocabLineSpacing) 유지. (HWP·DOCX만 .hwp값 사용)
    return {
      columns: columns, size: sizePt, gapLabel: gapLabel, ls: ls, qa: qa, spell: spell, ansOnly: ansOnly,
      // cls·date 추가(2026-07-23): line1(학원·반·출제일[교재]) 입력값 재조립용. HWP/DOCX와 동일 필드.
      header: { title: textOf('wzTitle'), academy: textOf('wzAcad'), cls: textOf('wzClass'), book: textOf('wzBook'), date: textOf('wzDate') }
    };
  }
  function textOf(id) { var e = document.getElementById(id); return e ? e.textContent.trim() : ''; }
  function readGroupsCompat() {
    var g;
    if (global.readGroupsForHwpx) g = global.readGroupsForHwpx();
    else if (global.wordbankToPool && global.loadWordbank) g = normalizePool(global.wordbankToPool(global.loadWordbank()));
    else throw new Error('MISSING_DATA_SOURCE: readGroupsForHwpx 또는 wordbankToPool 필요');
    return global.neReorderFullLast ? global.neReorderFullLast(g) : g;   // 1단 유형(문장완성·영영풀이) 후미배치 + 재번호
  }
  function normalizePool(pool) {
    var n = 1;
    return (pool || []).map(function (g) {
      var items = (g.items || []).map(function (it) {
        it._n = n++;
        // wordbankToPool 항목은 정답을 a(뜻)·aw(단어)로 둔다 → buildItem이 읽는 ans/fl로 매핑
        //   (끝빈칸 유형 1·2·4·7. 문장 중간 빈칸은 <span data-ans/-fl>에서 별도로 읽음)
        if (it.ans == null) it.ans = it.aw || it.a || '';
        if (it.fl == null) it.fl = it.ans ? String(it.ans).charAt(0) : '';
        return it;
      });
      return { ask: g.ask, full: !!g.full, items: items };
    });
  }
  function saveBlobFallback(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  global.downloadHwpxTpl = downloadHwpxTpl;
  global.downloadHwpx = downloadHwpxTpl;   // 기존 버튼 onclick="return downloadHwpx(this)" 호환 별칭
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HwpxTpl;
})(typeof window !== 'undefined' ? window : globalThis);
