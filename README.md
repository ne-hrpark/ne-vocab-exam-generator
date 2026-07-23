# ne-vocab-exam-generator

어휘 시험지를 **HWP · HWPX · DOCX** 파일로 내보내는 브라우저용(클라이언트 사이드) 생성 엔진입니다.
서버·플러그인 없이 순수 JavaScript(ES5)로 한글(hwp/hwpx)·워드(docx) 문서를 만들어 다운로드합니다.

> **기여 범위 안내**
> 어휘 시험지 빌더 전체의 **UI/화면 목업은 팀 공동 작업**이며,
> 이 저장소에 담긴 **시험지 파일 다운로드(hwp·hwpx·docx) 기능은 본인(@ne-hrpark)이 개발**한 부분만 추려낸 것입니다.

## 구성 파일

**다운로드 엔진 (본인 작업)**

| 파일 | 역할 |
|---|---|
| `ne-export-common.js` | 3개 엔진이 공유하는 공용 헬퍼. 글자크기 × 문항간격 규칙(SSOT: `neVocab*`), 1단 유형 후미배치(`neReorderFullLast`), `file://`에서도 동작하는 저장 헬퍼(`saveBlobCompat`) |
| `hwpx-tpl-export.js` | **HWPX** 생성 — 정본 샘플의 레이아웃(header/스타일/다단)은 그대로 두고 `Contents/section0.xml` 본문만 데이터로 재조립하는 "템플릿 본문교체" 방식. "열리지만 깨지는" 문제 제거 |
| `docx-tpl-export.js` | **DOCX** 생성 — HWPX와 동일 아이디어의 워드 판(版). 표 없이 신문형 다단(`<w:cols>`) + 우측탭 밑줄 정렬 |
| `hwpml-export.js` | **HWP** 생성 — 구버전 한글(2007~2010) 호환용 HWPML 2.8 단일 XML(from-scratch). `.hwpx`(OWPML)는 한글 2014+ 전용이라 그 이전 버전용 fallback |

**프론트 / 데이터 (엔진 호출부)**

| 파일 | 역할 |
|---|---|
| `index.html` | 시험지 화면 + 다운로드 버튼. 엔진을 어떻게 로드·호출하는지 보여주는 실제 프론트. **UI/화면은 팀 공동 작업**이며, 하단 스크립트 로딩부와 `download*()` 호출부가 위 엔진과 연결되는 지점 |
| `data.js` | 문항 데이터 모델(SSOT). `loadPool()` 경계로 접근 — 나중에 DB 전환 시 이 파일만 교체 |
| `data.hwp.js` | hwp/hwpx/docx 생성용 `groups` 데이터(엔진이 읽는 형식) |

## 설계 개요

- **하나의 데이터 모델 → 3포맷 공통 생성.** 문항 데이터(`groups`)와 서식 규칙(글자크기/줄간격/문항간격)을 `ne-export-common.js`에 SSOT로 두고 세 엔진이 공유합니다.
- **템플릿 본문교체 방식(HWPX/DOCX).** 레이아웃을 코드로 처음부터 조립하지 않고, 검증된 정본 샘플의 스타일·다단 정의를 추출·재사용하고 본문 문단만 데이터로 교체합니다. → 뷰어 호환성과 레이아웃 안정성 확보.
- **뷰어 호환.** 한글(HWP Office)에서 2단 다단·밑줄 연속선·헤더 점선박스가 안정적으로 렌더되도록 맞춤.

## 실행에 필요한 것 (이 저장소에 포함되지 않음)

경량화를 위해 **템플릿 데이터는 제외**했습니다. `index.html`을 열어 화면·엔진 연결 구조는 볼 수 있지만, **실제 파일 생성(다운로드)까지 돌리려면 아래가 추가로 필요**합니다.

1. **정본 템플릿** — HWPX/DOCX 엔진은 정본 샘플을 읽어 스타일을 재사용합니다.
   - `HWPX_TEMPLATES` / `DOCX_TEMPLATES` 전역(base64 내장, `file://`용)이 있으면 그것을 우선 사용하고,
   - 없으면 `templates/*.hwpx` · `docx/*.docx`를 `fetch`로 읽습니다(HTTP 서빙 필요).
   - 이 저장소에는 둘 다 없으므로, 다운로드를 실행하려면 원본(v2.6)의 `templates.js`·`docx-templates.js`를 함께 두거나 `templates/`·`docx/` 폴더를 채워야 합니다.
2. **외부 라이브러리(CDN)**
   ```html
   <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
   <script src="https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js"></script>
   ```

## 사용법

```html
<!-- 라이브러리 -->
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js"></script>

<!-- 공용 헬퍼 먼저, 이후 엔진 (호출 시점 참조라 로드 순서는 페이지 로드 후 클릭이면 무관) -->
<script src="ne-export-common.js"></script>
<script src="hwpx-tpl-export.js"></script>
<script src="docx-tpl-export.js"></script>
<script src="hwpml-export.js"></script>

<button onclick="return downloadHwpx(this)">HWPX 다운로드</button>
<button onclick="return downloadDocx(this)">DOCX 다운로드</button>
<button onclick="return downloadHwp(this)">HWP 다운로드</button>
```

각 `download*()`는 페이지의 문항 데이터를 `groups` 모델로 읽어 해당 포맷 파일을 생성·다운로드합니다.

## 라이선스

사내(능률교육) 프로젝트에서 분리한 개인 아카이브입니다. 별도 명시 전까지 무단 재배포·상업적 사용을 제한합니다.
