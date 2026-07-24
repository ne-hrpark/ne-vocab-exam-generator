/* ============================================================
 * ne-export-common.js — 다운로드(DOCX·HWPX) 공용 헬퍼
 * index.html에서 분리 · ES5. downloadDocx·downloadHwpx가 함께 쓰는
 * 전역(SSOT 규칙 + saveBlobCompat)을 window에 노출.
 *
 *  1) 글자크기 × 문항간격 규칙(SSOT): neVocabSize / neVocabGapLevel /
 *     neVocabGapName / neVocabLineSpacing (+ NE_GAP_PX / NE_GAP_NAMES)
 *  2) 다운로드 저장 헬퍼: saveBlobCompat (file:// 환경 data: URI 우회)
 *
 * ※ 반드시 downloadDocx(인라인)·hwpx-export.js보다 먼저 로드할 필요는 없다.
 *   두 다운로드 함수 모두 아래 전역을 '호출 시점'에 참조하므로 페이지 로드
 *   이후 클릭이면 순서 무관. (index.html은 하단에서 로드)
 * ============================================================ */

/* ============================================================
 * 어휘 시험지 '글자크기 × 문항간격' 규칙 — 단일 소스(SSOT)
 * docx/ 폴더의 사전제작 원본(실참조 18개)에서 추출한 값과 1:1 일치.
 * downloadDocx(원본 파일 선택)·downloadHwpx(OWPML 생성)가 함께 사용해
 * 두 포맷이 규칙서(어휘 시험지 워드 파일 규칙.md)에 동일하게 맞도록 한다.
 * ============================================================ */
var NE_GAP_PX    = [11,18,27];                                // 문항간격 슬라이더 px ↔ 3단계 인덱스(좁게/보통/넓게). ★5→3단계 축소(2026-07-22)
var NE_GAP_NAMES = ['좁게','보통','넓게'];                        // 파일명/라벨(공백 없음)
function neVocabSize(qfsPx){ return [9,11,13].reduce(function(a,b){ return Math.abs(b-qfsPx)<Math.abs(a-qfsPx)?b:a; }, 11); }   // --qfs(px) → 9·11·13 중 최근접
function neVocabGapLevel(gapPx){
  gapPx = Math.round(gapPx);
  var gi = NE_GAP_PX.indexOf(gapPx);
  if(gi<0){ var best=1e9; NE_GAP_PX.forEach(function(p,k){ var d=Math.abs(p-gapPx); if(d<best){ best=d; gi=k; } }); }   // 못 맞으면 최근접 단계
  return gi;
}
function neVocabGapName(level){ return NE_GAP_NAMES[level] || '보통'; }
/* 문항 간격 = 줄 간격(한글 PERCENT %, 글자 크기 대비). 5단계.
   ※ 고정pt(FIXED)는 본문 문단에 linesegarray가 없으면 한글이 줄을 겹쳐 렌더하므로 안 씀 → 전부 PERCENT.
   보통=130(워드 single 상당), 매우넓게=200(참고파일과 동일). 매우좁게=100도 겹치지 않음(한글이 글자높이 보장). */
/* 줄간격 % — 3단계(좁게/보통/넓게). level: 0=좁게 1=보통 2=넓게. HWPX(OWPML)의 '실제 줄간격'이자 정본 템플릿 파일명(`…(N%)`) 매칭값.
   ★[2026-07-23] 처음엔 세 엔진 모두 아래 neVocabHwpLineSpacing(.hwp 실측값)으로 통일하려 했으나 HWPX는 원복:
     OWPML PERCENT는 HWPML(.hwp)보다 줄을 촘촘하게 렌더해, 같은 %를 넣으면 HWPX가 .hwp보다 좁아진다(특히 넓게).
     그래서 엔진별로:
       · .hwp  = neVocabHwpLineSpacing 을 cfg.ls로 직접 주입(구형 한글 실측 기준)
       · HWPX = 이 값(neVocabLineSpacing)으로 템플릿 로드 + 본문 paraPr lineSpacing 명시 주입(한글에서 검증된 값 유지)
       · DOCX = item/발문 문단에 w:line(auto)=neVocabHwpLineSpacing×2.4 주입(근사, .hwp에 맞춤)
     값은 기존 30종 템플릿의 좁게/보통/넓게 열 그대로(파일이 실재해야 로드되므로 건드리지 말 것). */
function neVocabLineSpacing(sizePt, level, columns){
  var cols = (columns===2) ? 2 : 1;
  var T = {
    1: { 9:[145,155,170], 11:[150,160,180], 13:[165,170,190] },
    2: { 9:[145,155,170], 11:[150,160,180], 13:[165,170,190] }
  };
  var sz = (sizePt>=13) ? 13 : (sizePt>=11) ? 11 : 9;
  var row = T[cols][sz];
  return (row && row[level]!=null) ? row[level] : 160;
}
/* 줄간격 % 정본(SSOT) — print_sample_0722/print_sample/hwp/1col 실측값(최종). 1·2단 동일.
   level: 0=좁게 1=보통 2=넓게. 폰트 클수록 %가 작다(시각적 줄간격 일정하게).
   ★[2026-07-23] .hwp 전용이었으나 이제 HWPX·DOCX '보이는 줄간격'의 공통 기준값이다(위 neVocabLineSpacing 주석 참고). */
function neVocabHwpLineSpacing(sizePt, level){
  // 정본 바이너리(.hwp) 실측 줄간격 %(RATIO). ★[2026-07-23] .hwp(HWPML)는 이 값을 그대로 쓰면 RATIO→Percent
  //  렌더 차로 더 좁아져서 neVocabLineSpacing(한글 검증값)으로 전환함(hwpml-export readConfig 참고). 이제 이 함수는
  //  DOCX(w:line=값×2.4 근사)만 사용. DOCX도 좁게가 답답하면 이 표를 올리거나 DOCX도 neVocabLineSpacing으로 전환 검토.
  var T = { 9:[90,105,135], 11:[85,100,130], 13:[80,95,125] };
  var sz = (sizePt>=13) ? 13 : (sizePt>=11) ? 11 : 9;
  var row = T[sz];
  return (row && row[level]!=null) ? row[level] : 100;
}

/* 시험지 보기 모드 → 파일명 라벨 (HWPX·DOCX 저장명 공용). cfg={qa,ansOnly,spell}
   qa=정답표시시험지(문제+정답) / ansOnly=정답만 / spell=문제(첫글자 힌트) / 그 외=문제.
   ※ spell은 문제의 변형이라 내용이 달라 파일 충돌 방지로 '(스펠링)'을 붙인다. */
function neViewModeLabel(cfg){
  cfg = cfg || {};
  if (cfg.qa)      return '문제+정답';
  if (cfg.ansOnly) return '정답';
  if (cfg.spell)   return '문제(스펠링)';
  return '문제';
}
window.neViewModeLabel = neViewModeLabel;

/* ============================================================
 * [1단 유형 후미배치] (2026-07-16 채택) 그룹 순서 재배열 — HWPX·DOCX 공용
 *  1단(전체폭, full=true) 유형(문장완성·영영풀이)을 항상 맨 뒤로 몰고,
 *  2단(full=false) 유형(듣기·뜻·단어·파생어·유의어)을 앞으로 안정 분할한다.
 *  목적: '전체폭→2단' 경계(hwpx-tpl-export.js:49-55의 ⑴ LOAD-BEARING pageBreak,
 *   페이지 하단 여백·항목 컬럼분할 유발)를 구조적으로 0건으로 만든다.
 *   결과 경계는 '2단→전체폭'(⑵, closeColPara만으로 안전) 1건뿐 + 1단끼리는 전환 없음.
 *  분할 후 항목 번호(_n)를 새 순서로 다시 매긴다(예: 문장완성 31~40 → 51~60).
 *  ※ 미리보기(화면)엔 영향 없음 — 다운로드 산출물의 그룹 순서만 바꾼다.
 *  되돌리려면 readGroups(Compat)에서 이 함수 호출을 빼면 된다.
 * ============================================================ */
function neReorderFullLast(groups){
  if(!groups || !groups.length) return groups;
  var twoCol=[], fullCol=[];
  groups.forEach(function(g){ (g && g.full ? fullCol : twoCol).push(g); });   // 안정 분할(그룹 내 상대순서 유지)
  var ordered = twoCol.concat(fullCol);
  var n=1;
  ordered.forEach(function(g){ (g.items||[]).forEach(function(it){ it._n = n++; }); });   // 새 순서로 재번호
  return ordered;
}
window.neReorderFullLast = neReorderFullLast;

/* ============================================================
 * HWPX 실다운로드 공용 저장 헬퍼 (downloadHwpx에서 사용)
 * blob: 스킴이 막히는 환경 대응 — file://로 연 페이지에서 Chrome/보안정책이
 *   blob: 다운로드를 "허용되지 않은 URL scheme"으로 거부하는 경우, data: URI로 우회 저장
 * ============================================================ */
function saveBlobCompat(blob, filename){
  var a=document.createElement('a'); a.download=filename; document.body.appendChild(a);
  if(typeof location!=='undefined' && location.protocol==='file:' && window.FileReader){
    var fr=new FileReader();
    fr.onload=function(){ a.href=fr.result; a.click(); setTimeout(function(){ a.remove(); },1000); };
    fr.onerror=function(){ a.remove(); alert('다운로드 실패: 파일을 만들지 못했어요.'); };
    fr.readAsDataURL(blob);
  }else{
    var url=URL.createObjectURL(blob); a.href=url; a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },1000);
  }
}
window.saveBlobCompat = saveBlobCompat;
