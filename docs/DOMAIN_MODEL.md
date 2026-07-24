# DOMAIN_MODEL.md — 시험지 다운로드(Export)

> 범위: **어휘 시험지 다운로드(hwp·hwpx·docx) 기능**에 관여하는 도메인만 기술한다.
> 상위 "어휘 문제 마법사" 전체 도메인(Book·Unit·Preset 등)은 팀 공동 산출물이며 여기서는 **Export가 참조하는 범위**만 다룬다.
> 가이드: 「서비스기획자 목업·프로토타이핑 코딩 가이드 v2.0」 §5.2 / §16.1 참조.

## 1. 도메인 용어

| 용어 | 의미 |
|---|---|
| 시험지(Exam) | 한 번의 출제로 만들어진 어휘 문항 묶음 + 출력 설정 |
| 발문 그룹(QuestionGroup) | 같은 유형 문항을 하나의 발문(※…) 아래 묶은 단위 |
| 문항(ExamItem) | 시험지에 실린 개별 문항. 원본 어휘 데이터를 참조 |
| 어휘 원본(WordbankRow) | 레거시 DB 행 형태의 평문 문항 데이터(typeno·word·mean·ext·exp) |
| 표시 모드(ViewMode) | 문제 / 정답 / 문제+정답 / 문제(스펠링) |
| 출력 설정(ExportConfig) | 포맷·단수·글자크기·문항간격·표시모드 등 파일 생성 파라미터 |
| 정본 템플릿(Template) | 레이아웃이 검증된 원본 파일(hwpx 18종 = 단2×크기3×간격3). **본문(콘텐츠)만** 교체해 재사용. 헤더는 정본이 아니라 코드가 재조립(§BR-EXP-012) |
| 산출물(ExportArtifact) | 최종 생성된 파일(Blob + 파일명) |

## 2. Entity

- **Exam** — 식별자: (프로토타입에선 세션 1건, 미저장). 속성: 제목, 출력설정, 발문그룹[]
- **ExamItem** — 시험지 내 문항. 속성: 원본참조, 유형(typeno), 표시순서 `_n`
- **WordbankRow** — 어휘 원본. `window.NE_WORDBANK`의 행

## 3. Value Object (불변)

- **ExportConfig** `{ format, columns(1|2), size(9|11|13pt), gapLevel(0|1|2), viewMode, lineSpacing }`
- **ViewMode** `문제 | 정답 | 문제+정답 | 문제(스펠링)`
- **GenerationFormat** `hwp | hwpx | docx`

## 4. Aggregate

```
Exam (Aggregate Root)
 ├─ ExportConfig      (출력 설정)
 └─ QuestionGroup[]   (발문 그룹)
      └─ ExamItem[]   (문항)
```

- 문항 순서·번호(`_n`)는 **Exam Aggregate 경계 안에서만** 재계산한다(→ [BUSINESS_RULES BR-EXP-005](BUSINESS_RULES.md)).

## 5. 어휘 문항 유형 (typeno) — 단수 배치 기준

| typeno | 유형 | 배치 |
|---|---|---|
| 1 | 우리말 뜻쓰기(영어→뜻) | 2단 |
| 2 | 영어 단어쓰기(뜻→영어) | 2단 |
| 4 | 음원 듣고 쓰기 | 2단 |
| 5 | 파생어 쓰기 | 2단 |
| 6 | 유/반의어 쓰기 | 2단 |
| 3 | 문장 완성 | **1단(전체폭, full)** |
| 7 | 영영풀이 보고 쓰기 | **1단(전체폭, full)** |

## 6. 상태(State)

Export는 **문서 저장 상태를 갖지 않는 무상태 변환**이다. 실행 시점 상태는 [STATE_MATRIX.md](STATE_MATRIX.md) 참조(idle→generating→success/error).

## 7. 불변 조건(Invariants)

```
INV-EXP-001
하나의 다운로드 산출물은 정확히 하나의 표시 모드(문제/정답/문제+정답/스펠링)로 생성된다.

INV-EXP-002
1단 유형(문장완성·영영풀이)은 산출물에서 항상 2단 유형보다 뒤에 배치된다.
상태: 확정 (근거: neReorderFullLast)

INV-EXP-003
정본 템플릿은 (단수 × 글자크기 × 간격레벨) 조합당 1개가 존재해야 한다(HWPX 18종 = 2×3×3).
템플릿이 없는 조합은 생성할 수 없다.
※ 원래 간격 5단계라 30종이었으나 3단계 축소(2026-07-22)로 18종만 참조. HWPX는 백업 12종을 디스크에서도 삭제(2026-07-23), DOCX는 디스크 백업 잔존(30). 줄간격 %는 파일이 아니라 런타임 주입이라 조합에 안 곱함.
```

## 8. 외부 시스템 객체

- **정본 템플릿 자산** — HWPX 18종(`templates.js`), DOCX 18종 실참조(`docx-templates.js`, 디스크엔 백업 30종). base64/텍스트 내장.
- 실제 DB/어휘 원본은 프로토타입에서 **정적 샘플**(`data.hwp.js`)로 대체. 운영 전환 시 `loadWordbank()` 경계로 교체 예정(가설).

## 9. 작성 시 주의 — 미확정 규칙

```
BR-EXP-010  파일명 규칙(제목_단수_크기_간격_표시모드)
상태: 가설
확인 담당: 서비스기획 · AX팀 · 콘텐츠운영
사유: 운영 저장/보관함 연동 시 파일명 정책이 바뀔 수 있음
```
