# BUSINESS_RULES.md — 시험지 다운로드(Export)

> 범위: 다운로드(내보내기) 기능에 적용되는 업무 규칙. 화면과 무관하게 세 엔진(hwp·hwpx·docx)이 공통으로 지킨다.
> 가이드 §5.3 형식. 규칙 유형 중 **출력·다운로드 / 계산 / 노출**에 해당.

## 규칙 표

| Rule ID | 규칙 | 조건 | 결과 | 예외 | 우선순위 | 상태 |
|---|---|---|---|---|---|---|
| BR-EXP-001 | 세 포맷을 뷰어 호환 목적별로 구분 제공 | 다운로드 요청 | hwp=구버전 한글(2007~2010), hwpx=한글 2014+, docx=워드 | 없음 | P0 | 확정 |
| BR-EXP-002 | 글자크기는 9·11·13pt 중 최근접값으로 정규화 | 출력 설정 읽기 | `neVocabSize`로 매핑 | 없음 | P0 | 확정 |
| BR-EXP-003 | 문항간격은 3단계(좁게/보통/넓게)만 허용 | 출력 설정 읽기 | `neVocabGapLevel`로 최근접 매핑 | 없음 | P0 | 확정(★5→3단계 축소, 2026-07-22) |
| BR-EXP-004 | 줄간격 값은 엔진별로 분리 적용 | 파일 생성 | **hwp·hwpx=`neVocabLineSpacing`(한글 검증 %, 동일값)**, docx=`neVocabHwpLineSpacing`×2.4 근사 | 없음 | P0 | 확정(★2026-07-23 .hwp를 print_sample 실측 RATIO 대신 한글 검증 %로 전환 — RATIO를 Percent로 넣으면 더 촘촘해 정본보다 좁아짐) |
| BR-EXP-005 | 1단 유형(문장완성·영영풀이)은 후미배치 후 전체 재번호 | 산출물 그룹 정렬 | `neReorderFullLast`: 2단→1단 순, `_n` 재부여 | 미리보기(화면)엔 미적용 | P0 | 확정 |
| BR-EXP-006 | 표시 모드는 4종이며 파일명에 라벨로 구분 | 파일명 생성 | 문제/정답/문제+정답/문제(스펠링) | 없음 | P1 | 확정 |
| BR-EXP-007 | 문항 유형별 단수 배치 규칙 | 레이아웃 결정 | 뜻·단어·듣기·파생어·유의어=2단, 문장완성·영영풀이=1단 | 없음 | P0 | 확정 |
| BR-EXP-008 | 빈칸(밑줄) 폭 균일화 | 문항 렌더 | 고정폭 밑줄, 정답이 칸 초과 시 2단에서 좌측 흐름/새 줄 | 완전 균일화는 뷰어 한계로 미해결 | P1 | 부분해결·수용 |
| BR-EXP-009 | HWPX/DOCX는 정본 템플릿 본문교체 방식으로 생성 | 파일 생성 | 레이아웃 파일 유지, 본문 문단만 데이터로 재조립 | hwp는 from-scratch(정본 템플릿 없음) | P0 | 확정 |
| BR-EXP-010 | 파일명 규칙 | 파일명 생성 | 제목·단수·크기·간격·표시모드 조합 | — | P2 | 가설(운영 정책 미정) |
| BR-EXP-011 | 서식은 '민무늬'(크기·구조만), 볼드/기울임 미생성 | 파일 생성 | 미리보기만 볼드 유지, 산출물은 미반영 | — | P1 | 확정(의도된 정책) |
| BR-EXP-012 | 헤더와 본문의 출처(정본) 분리 | 파일 생성 | **헤더=코드 재조립**(`print_sample_0722` 참고, 위저드 입력 학원·반·날짜·교재·제목으로 2줄+로고박스+구분선 동적 조립) / **본문(콘텐츠·레이아웃)=정본 템플릿 18종 참고** | 정본 템플릿의 헤더는 코드 재조립본으로 덮어써져 미사용 | P0 | 확정 |

## 규칙 상세 — 계산/우선순위

### BR-EXP-002·003 SSOT (`ne-export-common.js`)
- `neVocabSize(px)` → {9,11,13} 최근접
- `neVocabGapLevel(px)` → {0,1,2} 최근접 (px 후보 = [11,18,27])
- `neVocabGapName(level)` → 좁게/보통/넓게

### BR-EXP-004 줄간격 (엔진별)
- `neVocabLineSpacing(size, level, columns)` — **HWPX·.hwp 공통**(한글에서 검증된 %, 9pt 145/155/170·11pt 150/160/180·13pt 165/170/190). .hwp는 `cfg.ls`로 직접 주입.
- `neVocabHwpLineSpacing(size, level)` — **이제 DOCX 근사(×2.4)에만 사용**. print_sample .hwp 실측값(RATIO 85/100/130 등)의 출처지만, .hwp 본체는 RATIO→Percent 렌더 차 때문에 이 값을 버리고 `neVocabLineSpacing`으로 전환(2026-07-23).
- ⚠️ HWPX는 줄간격 %가 **템플릿 파일명(`…(N%)`) 선택**에도 쓰여, 그 파일이 실재하는 범위 안에서만 값 변경 가능(값 자체는 런타임 주입).

## 코드·테스트 연결

```
BR-EXP-002/003/004  → ne-export-common.js (neVocab*)          [테스트 없음 — R1]
BR-EXP-005          → ne-export-common.js (neReorderFullLast) [테스트 없음 — R1]
BR-EXP-006          → ne-export-common.js (neViewModeLabel)    [테스트 없음 — R1]
BR-EXP-007/009      → hwpx-tpl-export.js / docx-tpl-export.js  [테스트 없음 — R1]
BR-EXP-001/009(hwp) → hwpml-export.js                          [테스트 없음 — R1]
BR-EXP-012(헤더)     → build_header_block()/buildDocxHeader()/addHeader [테스트 없음 — R1]
```

> ⚠️ 현재 프로토타입에는 **자동 테스트가 없다**(가이드 §14 기준 미충족). 운영 이관 시 BR별 spec 작성 필요 → [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) 참조.
