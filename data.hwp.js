/* ============================================================
 * 한글(HWP)·DB용 문항 데이터 — 레거시 qu_wizard.asp 의 DB 행 형태(평문).
 *
 * 미리보기용 data.js(window.NE_POOL, 렌더 완료 HTML)와 별개.
 * 이 파일은 프레젠테이션 태그(<b>,<span class="wl">,data-ans 등)를 담지 않고,
 * 레거시 DB가 저장하는 "평문 필드"만 담는다. HTML/밑줄/빈칸은 렌더 시점 생성.
 *   → 나중에 DB 연동 시 loadWordbank()가 DB 행을 그대로 반환하면 됨.
 *
 * 행 스키마 (typeno = 레거시 유형번호):
 *   1 우리말 뜻쓰기(영어→뜻)  : {word, mean}            답=mean
 *   2 영어 단어쓰기(뜻→영어)  : {word, mean}            답=word
 *   3 문장 완성              : {word, mean}            word=문장('{답}'로 빈칸 표시), mean=해석
 *   4 음원 듣고 쓰기          : {word, mean}            (현재 시연 데이터엔 mean 없음→'')
 *   5 파생어 쓰기            : {word, ext:[{p,m,w}]}    word=표제어, p=품사, m=뜻, w=답
 *   6 유/반의어 쓰기          : {word, ext:[{m,t,w}]}    t='뜻 (유/반)', w=답
 *   7 영영풀이 보고 쓰기       : {word, exp}             word=답, exp=영영정의
 *
 * ※ 자동 변환 생성물(scratchpad/gen_hwp_data.js). 원본=미리보기 data.js.
 * ============================================================ */
window.NE_WORDBANK = [
  {"typeno":4,"word":"representation","mean":""},
  {"typeno":4,"word":"proposal","mean":""},
  {"typeno":4,"word":"remove","mean":""},
  {"typeno":4,"word":"overwhelm","mean":""},
  {"typeno":4,"word":"income","mean":""},
  {"typeno":4,"word":"misfortune","mean":""},
  {"typeno":4,"word":"propose","mean":""},
  {"typeno":4,"word":"translator","mean":""},
  {"typeno":4,"word":"recycle","mean":""},
  {"typeno":4,"word":"investigate","mean":""},
  {"typeno":1,"word":"representation","mean":"표현, 대표"},
  {"typeno":1,"word":"proposal","mean":"제안"},
  {"typeno":1,"word":"remove","mean":"제거하다"},
  {"typeno":1,"word":"overwhelm","mean":"압도하다"},
  {"typeno":1,"word":"income","mean":"소득, 수입"},
  {"typeno":1,"word":"misfortune","mean":"불운, 불행"},
  {"typeno":1,"word":"propose","mean":"제안하다"},
  {"typeno":1,"word":"translator","mean":"번역가, 통역사"},
  {"typeno":1,"word":"recycle","mean":"재활용하다"},
  {"typeno":1,"word":"investigate","mean":"조사하다"},
  {"typeno":2,"word":"outstanding","mean":"뛰어난, 아주 훌륭한, 두드러진"},
  {"typeno":2,"word":"stay","mean":"머무르다, 체류하다"},
  {"typeno":2,"word":"recycle","mean":"재활용, 재생"},
  {"typeno":2,"word":"extraterrestrial","mean":"지구 밖의, 외계의"},
  {"typeno":2,"word":"strange","mean":"이상한"},
  {"typeno":2,"word":"interpret","mean":"(자기 해석에 따라) 연주[연기]하다"},
  {"typeno":2,"word":"advance","mean":"진보하다, 발전하다"},
  {"typeno":2,"word":"interpretation","mean":"해석, 설명"},
  {"typeno":2,"word":"preview","mean":"미리 보기, 사전 검토"},
  {"typeno":2,"word":"overflow","mean":"넘치다, 범람하다"},
  {"typeno":3,"word":"The advertisement was exaggerated and {misleading}.","mean":"그 광고는 과장되었고 잘못된 정보를 주는 것이었다."},
  {"typeno":3,"word":"Professor Peterson plans to {retire} at the end of the year.","mean":"Peterson 교수는 올해 말에 은퇴할 계획이다."},
  {"typeno":3,"word":"The words that she {utters} are complete and utter nonsense.","mean":"그녀가 하는 말들은 완전히 전적으로 말도 안 되는 소리이다."},
  {"typeno":3,"word":"I saw something fly {overhead}.","mean":"나는 무엇인가가 머리 위로 날아가는 것을 봤다."},
  {"typeno":3,"word":"Can you {translate} this article into English?","mean":"이 기사를 영어로 번역할 수 있습니까?"},
  {"typeno":3,"word":"His writing shows deep {insight} into human relationships.","mean":"그의 글은 인간 관계에 대한 깊은 통찰력을 보여준다."},
  {"typeno":3,"word":"She's going to be {transferred} to the marketing department.","mean":"그녀는 마케팅 부서로 옮겨질 예정이다."},
  {"typeno":3,"word":"In this region, the {dialect} sounds a lot like German.","mean":"이 지역 방언은 독일어와 꽤 유사하게 들린다."},
  {"typeno":3,"word":"Most workers are more {productive} after a break.","mean":"대부분의 근로자들은 휴식 후에 더 생산적이다[일이 더 잘 된다]."},
  {"typeno":3,"word":"Your immune system is working to fight off the {infection}.","mean":"당신의 면역 체계는 감염과 싸우기 위해 작동하고 있다."},
  {"typeno":5,"word":"illustrate","ext":[{"p":"[명사]","m":"삽화, 예시","w":"illustration"}]},
  {"typeno":5,"word":"mislead","ext":[{"p":"[형용사]","m":"잘못된 정보를 주는, 오해의 소지가 있는","w":"misleading"}]},
  {"typeno":5,"word":"external","ext":[{"p":"[부사]","m":"외부적으로, 외부에서","w":"externally"},{"p":"[동사]","m":"표면화 하다","w":"externalize"},{"p":"[명사]","m":"표면화","w":"externalization"}]},
  {"typeno":5,"word":"produce","ext":[{"p":"[명사]","m":"생산자, 제작자","w":"producer"},{"p":"[명사]","m":"생산품, 제품","w":"product"},{"p":"[명사]","m":"생산, 제조","w":"production"},{"p":"[형용사]","m":"생산적인, 결실이 많은; 비옥한","w":"productive"}]},
  {"typeno":5,"word":"predict","ext":[{"p":"[명사]","m":"예언, 예측","w":"prediction"},{"p":"[형용사]","m":"예측 가능한, 뻔한","w":"predictable"}]},
  {"typeno":5,"word":"interfere","ext":[{"p":"[명사]","m":"간섭, 방해","w":"interference"}]},
  {"typeno":5,"word":"inherent","ext":[{"p":"[부사]","m":"본질적으로","w":"inherently"}]},
  {"typeno":5,"word":"revive","ext":[{"p":"[명사]","m":"부활, 되살아남; 재상영, 재상연","w":"revival"}]},
  {"typeno":5,"word":"misbehave","ext":[{"p":"[명사]","m":"나쁜 행실; 비행","w":"misbehavior"}]},
  {"typeno":5,"word":"transform","ext":[{"p":"[명사]","m":"변형, 변화","w":"transformation"}]},
  {"typeno":6,"word":"overseas","ext":[{"m":"","t":"해외로 (유)","w":"abroad"}]},
  {"typeno":6,"word":"producer","ext":[{"m":"","t":"생산자, 제작자 (반)","w":"consumer"}]},
  {"typeno":6,"word":"externally","ext":[{"m":"","t":"외부적으로, 외부에서 (반)","w":"internally"}]},
  {"typeno":6,"word":"overcome","ext":[{"m":"","t":"(곤란, 장애, 적 등을) 극복하다, 이겨내다, 이기다 (유)","w":"conquer"}]},
  {"typeno":6,"word":"product","ext":[{"m":"","t":"생산품, 제품 (유)","w":"goods"}]},
  {"typeno":6,"word":"overtake","ext":[{"m":"","t":"(생산, 득점 등에서) 능가하다; 따라잡다, 추월하다 (유)","w":"surpass"}]},
  {"typeno":6,"word":"foresee","ext":[{"m":"","t":"예견[예지]하다 (유)","w":"predict"},{"m":"","t":"예견[예지]하다 (유)","w":"anticipate"},{"m":"","t":"예견[예지]하다 (유)","w":"forecast"}]},
  {"typeno":6,"word":"prediction","ext":[{"m":"","t":"예언, 예측 (유)","w":"forecast"}]},
  {"typeno":6,"word":"production","ext":[{"m":"","t":"생산, 제조 (반)","w":"consumption"}]},
  {"typeno":6,"word":"predictable","ext":[{"m":"","t":"예측 가능한, 뻔한 (반)","w":"unpredictable"}]},
  {"typeno":7,"word":"revival","exp":"a new production of a play that has not been performed in a long time"},
  {"typeno":7,"word":"represent","exp":"to express what you are thinking and feeling through actions or words"},
  {"typeno":7,"word":"remains","exp":"the parts of something that are left after all the other parts have been removed, used, destroyed, etc; the parts of ancient buildings or objects that have survived and have been discovered recently"},
  {"typeno":7,"word":"remind","exp":"to cause someone to think of something"},
  {"typeno":7,"word":"resemble","exp":"to have some parts that are the same as the parts of something else"},
  {"typeno":7,"word":"translator","exp":"someone whose job is to translate what someone is saying into another language"},
  {"typeno":7,"word":"view","exp":"the view that can be seen from a particular place"},
  {"typeno":7,"word":"outgoing","exp":"confident and outgoing, and enjoying being around others"},
  {"typeno":7,"word":"illustration","exp":"a picture or drawing in a book, magazine, etc. that is used for decoration or to explain something"},
  {"typeno":7,"word":"precaution","exp":"an action taken in advance to prevent harm or to ensure positive results"}
];

/* 데이터 접근 경계 — DB 연동 시 이 함수만 async/fetch로 교체 */
window.loadWordbank = function(){ return window.NE_WORDBANK; };

/* ============================================================
 * wordbankToPool — 평문 wordbank(위 NE_WORDBANK)를 미리보기 렌더러가 쓰는
 * POOL 형태(렌더 완료 직전 HTML)로 복원한다. HWPX 생성기가 이 결과를
 * 미리보기 렌더러(renderWzSheet→readGroups)에 태워 .hwpx를 만든다.
 *   → 즉 "한글(HWPX) 출력이 data.hwp.js(평문/DB형)에서 생성"되도록 연결하는 어댑터.
 *   → 레거시 qu_wizard.asp의 setPaper()가 DB행으로 시험지 HTML을 조립하던 것과 동일 역할.
 * 밑줄/빈칸/발문/강조 태그는 전부 여기서 생성(= DB엔 없음).
 * ============================================================ */
window.wordbankToPool = (function(){
  var ASK = {
    1:'주어진 영어 단어를 보고 알맞은 우리말 뜻을 쓰시오.',
    2:'주어진 우리말 뜻을 보고 알맞은 영어 단어를 쓰시오.',
    3:'주어진 해석을 보고 문장을 완성하시오.',
    4:'다음을 듣고 알맞은 영어 단어와 우리말 뜻을 쓰시오.',
    5:'주어진 단어와 뜻을 참고하여 알맞은 파생어를 쓰시오.',
    6:'주어진 단어의 유의어나 반의어를 쓰시오.',
    7:'다음 영어 의미를 보고 알맞은 단어를 쓰시오.'
  };
  var FULL = { 3:true, 7:true };   // 2단에서도 전체폭(문장완성·영영풀이)
  function blank(w){ return '<span class="wl" data-fl="'+w.charAt(0)+'" data-ans="'+w+'">&nbsp;</span>'; }
  return function(rows){
    var groups=[], cur=null;
    (rows||[]).forEach(function(r){
      if(!cur || cur._t!==r.typeno){ cur={ _t:r.typeno, ask:ASK[r.typeno], items:[] }; if(FULL[r.typeno]) cur.full=true; groups.push(cur); }
      var t=r.typeno;
      // ※ HWPX는 민무늬(글자서식 없음): 표제어 볼드(<b>)·예문 기울임(<i>) 생성 안 함. 크기만 반영.
      if(t===4)      cur.items.push({ wl:true, aw:r.word });                                   // 듣기: 밑줄만
      else if(t===1) cur.items.push({ q:r.word, wl:true, a:r.mean });                          // 영어→뜻
      else if(t===2) cur.items.push({ q:r.mean, wl:true, aw:r.word });                         // 뜻→영어
      else if(t===3){                                                                          // 문장완성: {답}→빈칸
        var sent = r.word.replace(/\{([^}]*)\}/g, function(_m,a){ return blank(a); });
        var ans  = (r.word.match(/\{([^}]*)\}/g)||[]).map(function(x){ return x.slice(1,-1); }).join(', ');
        cur.items.push({ q:r.mean+'<br>'+sent, a:ans });
      }
      else if(t===5){                                                                          // 파생어: 줄마다 [품사] 뜻 + 빈칸
        var q5=r.word+r.ext.map(function(e){ return '<br>'+e.p+' '+e.m+' '+blank(e.w); }).join('');
        cur.items.push({ q:q5, a:r.ext.map(function(e){ return e.w; }).join(', ') });
      }
      else if(t===6){                                                                          // 유/반의어: 줄마다 '뜻 (유/반)' + 빈칸
        var q6=r.word+r.ext.map(function(e){ return '<br>'+e.t+' '+blank(e.w); }).join('');
        cur.items.push({ q:q6, a:r.ext.map(function(e){ return e.w; }).join(', ') });
      }
      else if(t===7) cur.items.push({ q:r.exp+' :', wl:true, aw:r.word });                     // 영영풀이
    });
    groups.forEach(function(g){ delete g._t; });
    return groups;
  };
})();
