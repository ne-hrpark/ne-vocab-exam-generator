# ACCEPTANCE_CRITERIA.md — 시험지 다운로드(Export)

> 가이드 §5.5 형식(Given/When/Then). 구현 방법이 아닌 **검증 가능한 결과**를 기술.
> ⚠️ 현재 프로토타입에는 자동 테스트가 없다. 아래 AC는 **운영 이관 시 테스트로 전환할 대상**이며, 지금은 수동 검증 기준으로 쓴다.

## AC 목록

```
AC-EXP-001
Given 발문·문항이 있는 시험지에서
When HWPX 다운로드를 실행하면
Then .hwpx 파일이 생성되고 한글(2014+)에서 레이아웃 깨짐 없이 열려야 한다.
Related: BR-EXP-009, BR-EXP-007

AC-EXP-002
Given 동일 시험지에서
When DOCX 다운로드를 실행하면
Then .docx 파일이 생성되고 워드에서 2단/1단 배치가 유지되어야 한다.
Related: BR-EXP-009, BR-EXP-007

AC-EXP-003
Given 동일 시험지에서
When HWP 다운로드를 실행하면
Then 구버전 한글(2007~2010)에서 열리는 .hwp(HWPML)가 생성되어야 한다.
Related: BR-EXP-001

AC-EXP-004
Given 문장완성·영영풀이(1단) 유형이 앞쪽에 섞여 있는 시험지에서
When 아무 포맷으로 다운로드하면
Then 산출물에서 1단 유형은 항상 2단 유형보다 뒤에 오고 문항 번호가 1부터 연속 재부여되어야 한다.
Related: BR-EXP-005, INV-EXP-002

AC-EXP-005
Given 표시 모드를 '정답'으로 선택한 상태에서
When 다운로드하면
Then 정답이 채워진 산출물이 생성되고 파일명에 '정답' 라벨이 포함되어야 한다.
Related: BR-EXP-006, INV-EXP-001

AC-EXP-006
Given 글자크기 12pt·문항간격 임의값처럼 규칙에 없는 값이 들어와도
When 다운로드하면
Then 글자크기는 9·11·13 중, 문항간격은 좁게·보통·넓게 중 최근접값으로 정규화되어야 한다.
Related: BR-EXP-002, BR-EXP-003

AC-EXP-007
Given 정본 템플릿이 없는 (단수·크기·간격) 조합이 요청되면
When HWPX/DOCX 다운로드를 실행하면
Then 사용자에게 명확한 오류를 알리고 잘못된 파일을 생성하지 않아야 한다.
Related: INV-EXP-003, STATE_MATRIX §2

AC-EXP-008
Given file:// 로 연 페이지에서
When 다운로드하면
Then blob 스킴 거부 환경에서도 data: URI 우회로 저장이 성공해야 한다.
Related: saveBlobCompat, STATE_MATRIX §2
```

## 원칙 준수 체크

- [x] 구현 방법을 쓰지 않음(결과 중심)
- [x] 정상·예외 포함(AC-007 예외, AC-008 환경)
- [ ] 권한 상태 — 프로토타입에 권한 개념 없음(운영 시 추가)
- [ ] 자동 테스트 연결 — **미작성**(운영 이관 시 `*.spec` / E2E로 연결)
