# ARCHITECTURE.md — 시험지 다운로드(Export)

> 범위: 다운로드 기능의 시스템 경계. 가이드 §5.4 형식.
> 정밀도 등급: **L1(일부 L0)** — UX 흐름·산출물 검증용 프로토타입. 백엔드 없음.

## 1. Context Diagram

```
사용자(브라우저)
  ↓ 버튼 클릭
index.html (목업 UI · 팀 공동작업)
  ↓ groups + config 전달
다운로드 엔진 (본인 작업)
  ├─ ne-export-common.js  (SSOT 규칙 · 정렬 · 저장)
  ├─ hwpx-tpl-export.js   → HWPX(OWPML zip)
  ├─ docx-tpl-export.js   → DOCX(OOXML zip)
  └─ hwpml-export.js      → HWP(HWPML 단일 XML)
  ↓ 사용
정본 템플릿 자산 (templates.js · docx-templates.js, base64 내장)
외부 라이브러리(CDN): JSZip · docx(UMD)
  ↓
브라우저 다운로드(Blob / file:// 는 data: URI)
```

## 2. Frontend·Backend 책임

| 영역 | 브라우저(현재) | 운영 백엔드(예상) |
|---|---|---|
| 화면·설정 입력 | O | — |
| 문항 데이터 공급 | 정적 샘플(`data.hwp.js`) | API/DB (미정) |
| 파일 생성(hwp/hwpx/docx) | O (클라이언트) | 서버 생성으로 이관 검토 대상(미결정) |
| 파일 저장/보관함 | 없음(즉시 다운로드) | 미정 |

## 3. 외부 시스템 / 라이브러리

- **JSZip 3.10.1** (CDN) — HWPX·DOCX zip 패키징
- **docx 8.5.0 UMD** (CDN) — DOCX 문서 조립 보조
- 정본 템플릿 자산은 저장소 내장(외부 아님)

## 4. 데이터 흐름

```
groups(발문·문항) + config(포맷·단수·크기·간격·표시모드)
  → neReorderFullLast(그룹 재정렬·재번호)
  → 엔진별 본문 생성
     · HWPX/DOCX: 정본 템플릿 로드 → 본문 <p> 교체 → 재패키징
     · HWP: from-scratch HWPML 조립
  → Blob → saveBlobCompat(다운로드)
```

## 5. 인증·권한

해당 없음(클라이언트 전용, 인증 흐름 없음). 운영 시 다운로드 권한 정책 = **미결정**.

## 6. API 계약

현재 **없음**(API 호출 없이 동작). 운영 이관 시 서버 생성 방식이면 OpenAPI 계약 신규 정의 필요(미정).

## 7. Mock 영역 / 8. 실제 연동 영역

| 구분 | 대상 |
|---|---|
| Mock(정적) | 문항 데이터(`data.js`/`data.hwp.js`), 시험지 세션(미저장) |
| 실제 연동 | 없음 |

## 9. 배포 구조

- 정적 호스팅(GitHub Pages) 또는 `file://` 직접 실행. 빌드 파이프라인 없음.
- 데모 URL: `https://ne-hrpark.github.io/ne-vocab-exam-generator/`

## 10. 기술적 미결정 사항 (운영 착수 Gate — 가이드 §19.3)

| # | 항목 | 상태 |
|---|---|---|
| 1 | 파일 생성을 클라이언트 유지 vs 서버 이관 | 미정 |
| 2 | 저장·인쇄·다운로드 결과 차이 정책(§16.1 규칙) | 미정 |
| 3 | 파일명/보관함 정책 | 미정 |
| 4 | 다운로드 권한 규칙 | 미정 |
| 5 | 정본 템플릿 관리 주체·갱신 절차 | 미정 |

## 11. 재사용 등급

[REUSE_MATRIX.md](REUSE_MATRIX.md) 참조. 요약: 엔진·템플릿=**R1**, 목업/샘플데이터=**R0**.

## 12. ADR

별도 ADR 없음. 주요 결정(표 vs 다단, base64 vs 폴더, hwp=HWPML 등)은 상위 저장소 `docs/`·의사결정 기록에 있음(핸드오프 시 링크).
