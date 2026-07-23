# HANDOFF.md — 시험지 다운로드(Export) 개발 핸드오프

> 「서비스기획자 목업·프로토타이핑 코딩 가이드 v2.0」 §17.2 형식.
> 대상 서비스: **어휘 문제 마법사(§16.1)** 중 **시험지 다운로드(hwp·hwpx·docx)** 기능.

## 1. 목적
어휘 시험지를 한글(.hwp/.hwpx)·워드(.docx) 파일로 내보내는 기능의 동작·규칙·산출물을 AX팀에 전달한다. 미리보기 화면과 동일한 레이아웃으로, 세 뷰어 환경에서 열리는 파일을 생성하는 것이 목표다.

## 2. 정밀도 등급
**L1 (일부 L0)** — UX 흐름·산출물 검증용. 백엔드/자동 테스트 없음. (가이드 §3)

## 3. 기준 문서 버전
- 코딩 가이드 v2.0 (Confluence, 2026-06-17)
- 원본 프로토타입: `ne-vocabulary-test-builder v2.6`

## 4. 구현 범위
- HWPX 생성(정본 템플릿 30종 본문교체) · DOCX 생성(동방식) · HWP 생성(HWPML from-scratch, 구버전 호환)
- 표시 모드 4종(문제/정답/문제+정답/스펠링)
- 글자크기 3종 × 문항간격 3단계 × 단수(1·2단) SSOT 규칙
- 1단 유형 후미배치·재번호, 밑줄 균일화, 뷰어 호환 처리
- `file://`·GitHub Pages 양쪽 동작(템플릿 base64 내장)

## 5. 미구현 범위
- 백엔드/서버 생성, API, 인증·권한
- 시험지 저장·보관함, 파일명 운영 정책
- 자동 테스트(단위·E2E), 회귀 검증
- 완전한 밑줄 균일화(뷰어 한계로 부분 해결)

## 6. Domain 요약
Exam → QuestionGroup → ExamItem(→ WordbankRow). Export 설정은 ExportConfig(VO). → [DOMAIN_MODEL.md](DOMAIN_MODEL.md)

## 7. 핵심 Business Rule
BR-EXP-001(3포맷 목적구분)·002/003(크기·간격 SSOT)·005(1단 후미배치)·007(유형별 단수)·009(템플릿 본문교체). → [BUSINESS_RULES.md](BUSINESS_RULES.md)

## 8. 사용자 시나리오
시험지 설정(단수·크기·간격·표시모드) → 다운로드 버튼(HWP/HWPX/DOCX) → 파일 생성·저장.

## 9. 상태·예외
idle→generating→success/error. 오류: 템플릿404·JSZip미로드·blob거부(우회처리)·빈데이터(방어미비). → [STATE_MATRIX.md](STATE_MATRIX.md)

## 10. API 계약
없음(클라이언트 전용). 서버 생성 이관 시 신규 OpenAPI 필요(미정).

## 11. Mock 영역
문항 데이터 전체가 정적 샘플(`data.js`/`data.hwp.js`). 시험지 미저장.

## 12. 실제 연동 영역
없음. 외부 의존은 CDN 라이브러리(JSZip·docx)뿐.

## 13. 재사용 등급
엔진 4종·템플릿 2종 = **R1(참고 구현)**, UI·샘플데이터 = **R0(폐기 전제)**. R2 없음. → [REUSE_MATRIX.md](REUSE_MATRIX.md)

## 14. 테스트와 검증 결과
- 자동 테스트: **없음**
- 수행한 검증: HWPX 열림검증(jsdom+python-hwpx), Node 오라클 diff(HWPX 30/30 바이트 일치), 브라우저 다운로드 수동 확인
- 남은 검증: 각 뷰어(한글/워드) 육안 레이아웃 확인, AC-EXP-001~008 테스트화

## 15. 미결정 사항 (운영 착수 Gate — 가이드 §19.3)
1. 클라이언트 생성 유지 vs 서버 이관
2. 저장·인쇄·다운로드 결과 차이 정책(§16.1)
3. 파일명/보관함 정책
4. 다운로드 권한 규칙
5. 정본 템플릿 관리 주체·갱신 절차

## 16. 운영 전 추가 작업
- 규칙(SSOT)·정렬 로직을 TypeScript로 재구현 + 단위테스트(R1→R2 승격)
- 정본 템플릿을 base64 내장에서 자산 관리 체계로 이관
- AC를 자동 테스트(spec·E2E)로 전환, 회귀 대상 정의
- 생성 방식(클라이언트/서버) 결정 후 아키텍처 확정

---

## 부속 문서
| 문서 | 내용 |
|---|---|
| [DOMAIN_MODEL.md](DOMAIN_MODEL.md) | 도메인 객체·관계·불변조건 |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | 출력·다운로드 업무 규칙 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 시스템 경계·Mock·미결정 |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | 수용 기준(Given/When/Then) |
| [STATE_MATRIX.md](STATE_MATRIX.md) | 실행 상태·예외 |
| [REUSE_MATRIX.md](REUSE_MATRIX.md) | 재사용 등급(R1/R0) |

> **가이드 대비 자기 평가**: 이 산출물은 L2 핸드오프의 정식 요건(Next.js/NestJS 스택, OpenAPI, 자동테스트, TRACEABILITY_MATRIX)을 **충족하지 않는다.** 코드는 R1/R0 프로토타입이며, 본 문서 패키지는 "정직한 분류 + 운영 재구현을 위한 참고 지식 전달"을 목적으로 한다.
