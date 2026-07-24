# v2.7 — 로컬 CLI HWPX 생성기

v2.6은 **그대로 둠**. v2.7은 문서 구조화 방식을 더 간단하고 백엔드(로컬 CLI, 브라우저 불필요) 친화적으로 재설계한 별도 트랙.
최종 레이아웃은 v2.6과 동일하게 유지.

## 스파이크 결론 (검증 완료)

v2.6은 정본 HWPX **30개**를 base64로 내장(`templates.js`)하고, 브라우저에서 section0 본문을 문자열 교체 + 답란 탭폭 런타임 자기보정 → 무겁고 뷰어 의존적.

30개를 해부한 결과:

| 축 | 값 | 성격 |
|---|---|---|
| 단수 | 1단 / 2단 | **진짜 구조 분기** (header 2132줄 차이: colPr·charPr 세트) |
| 글자크기 | 9 / 11 / 13 | 순수 `height` 숫자 (9pt↔11pt header 정규화 시 2줄 차이) |
| 줄간격 | 5종 | 순수 `lineSpacing` 숫자 (본문 paraPr에만) |

- **section0.xml에는 줄간격이 없음** — 오직 header.xml paraPr. section의 byte 차이는 `<hp:lineseg>` 레이아웃 캐시뿐 (한글이 열 때 재계산).
- 30개는 손 관리하다 표류(drift)가 낌 (예: `2단_13_매우넓게`에만 paraPr 하나 추가돼 이후 id 밀림). 생성 방식이 오히려 더 일관됨.

→ **본질 = 스켈레톤 6개(1단/2단 × 9/11/13) + 줄간격 숫자 주입.**

## 구조

```
v2.7/
  skeletons/          6개 스켈레톤 hwpx (각 계열 '보통' 변형에서 복사)
    skeleton_1단_9.hwpx ... skeleton_2단_13.hwpx
  params.json         계열별: skeleton 파일 / 줄간격 라벨→% / 본문 paraPr id
  build.py            CLI: 스켈레톤 선택 → header 줄간격 주입 → (section0 생성) → rezip
  out/                생성물
  spike/              검증용 임시 (git 무시 대상)
```

`params.json`의 `body_paraPr_ids`는 "모든 줄간격 변형에서 값==% 인 paraPr"만 (엄격) → 손편집 표류 자동 배제.
- 1단: 12–16/17, 2단: 12–21.

## 진행 단계

- [x] **1/2 header 주입** — 6 스켈레톤 + `build.py`. 30조합 전부 실제 정본과 본문 줄간격 **일치 검증 완료**. zip/mimetype 규약 OK.
- [x] **2/2 section0 본문 생성** — `content.json`(NE_POOL 구조) → section0.xml. `gen_section.py`(v2.6 `hwpx-tpl-export.js` 이식).
  - 답란: 정답 길이로 '맑은 고딕' 고정폭 밑줄 **생성 시점 계산**(2단 12칸/1단 20칸, RIGHT 정지점 우측정렬 + hint 재랩).
  - 1단 유형(문장완성·영영풀이) 후미배치 재정렬(`neReorderFullLast`)을 생성기가 데이터 보고 수행.
  - 4개 뷰모드: 문제 / 정답 / 문제(스펠링) / 문제+정답.
  - **검증**: v2.6 검증 JS를 Node 오라클로 돌린 골든과 6단×4뷰모드 = 24 section0 + 6 header **바이트 단위 일치**(30/30). python-hwpx 실로드 통과.

### 이식 검증 방법(재현)

`gen_section.py` 는 v2.6 `hwpx-tpl-export.js` 의 충실 이식. 정확도는 "같은 입력 → 같은 출력" 오라클 diff로 보증한다:
1. v2.6 JS를 Node에서 로드(`module.exports = HwpxTpl`), 동일 `content.json`을 `normalizePool → neReorderFullLast → buildSection0` 태워 스켈레톤에 대한 골든 section0/header 생성.
2. `gen_section.generate_with_pool()` 출력과 바이트 비교.
   (오라클/골든/diff 하니스는 스크래치패드에 보관 — 배포 v2.7은 순수 Python.)

## 사용

```bash
# 스켈레톤 본문 그대로(줄간격만 주입)
python build.py --dan 2단 --size 11 --spacing 매우넓게      # 라벨
python build.py --dan 2단 --size 11 --spacing 200            # 퍼센트
# → out/2단_11_200.hwpx

# content 로 본문 생성(+뷰모드/시험명)
python build.py --dan 2단 --size 11 --spacing 보통 \
  --content content.json --view 문제+정답 --title "중2 어휘 성취도 평가"
# → out/2단_11_160_문제+정답.hwpx
```

`--view`: `문제`(기본) / `정답` / `스펠링` / `문제+정답`.
`--content` 미지정 시 스켈레톤 본문 그대로(1단계 동작).
