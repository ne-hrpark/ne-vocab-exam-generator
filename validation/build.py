#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v2.7 로컬 CLI HWPX 생성기 (브라우저 불필요)

핵심 발상 (spike로 검증 완료 — README.md 참조):
  - v2.6의 정본(18개, 매우좁게·매우넓게 백업 12개는 2026-07-23 삭제) = 손 관리 표류가 낀 파일들.
  - 본질은 스켈레톤 2계열(1단/2단) × 글자크기(9/11/13) = 6개.
  - 줄간격(3단계: 좁게/보통/넓게)은 header.xml body paraPr의 lineSpacing "숫자 주입"만으로 커버.
    ★[2026-07-23] HWPX 줄간격은 정본 템플릿/OWPML 값 유지(params.json labels). 9pt=145/155/170, 11pt=150/160/180, 13pt=165/170/190.
      (한 번 .hwp 실측값으로 통일했다가 원복: OWPML PERCENT가 HWPML보다 촘촘하게 렌더돼 같은 %가 .hwp보다 좁아짐. HWP·DOCX만 .hwp값 사용.)
  - section0.xml에는 줄간격이 없음(오직 header). lineseg는 한글이 열 때 재계산.

현재 단계(1/2): header 줄간격 주입 + section0 통과(round-trip) 검증.
다음 단계(2/2): content.json -> section0.xml 본문 생성 (gen_section.py).

사용:
  python build.py --dan 2단 --size 11 --spacing 넓게
  python build.py --dan 2단 --size 11 --spacing 130
  (옵션) --content content.json   # 아직 미구현: 지정 시 경고만
"""
import argparse, json, os, re, sys, zipfile, io
import gen_section

ROOT = os.path.dirname(os.path.abspath(__file__))
PARAMS = json.load(open(os.path.join(ROOT, "params.json"), encoding="utf-8"))

# 뷰모드 라벨(한글/영문) → gen_section 키. 파일명 라벨도 함께.
VIEW_ALIASES = {
    "문제": "q", "q": "q",
    "정답": "ans", "ans": "ans",
    "스펠링": "spell", "문제(스펠링)": "spell", "spell": "spell",
    "문제+정답": "qa", "정답표시": "qa", "정답표시시험지": "qa", "qa": "qa",
}
VIEW_LABEL = {"q": "문제", "ans": "정답", "spell": "문제(스펠링)", "qa": "문제+정답"}


def resolve_spacing(fam, spacing):
    """spacing = 한글 라벨(예:'매우넓게') 또는 퍼센트('200'/200). -> 정수 퍼센트."""
    labels = fam["labels"]  # {label: percent}
    if isinstance(spacing, str) and spacing in labels:
        return labels[spacing]
    try:
        pct = int(spacing)
    except (TypeError, ValueError):
        raise SystemExit(f"[에러] 줄간격 '{spacing}' 해석 불가. 가능: {labels}")
    if pct not in labels.values():
        raise SystemExit(f"[에러] 줄간격 {pct}% 미지원. 가능: {sorted(labels.values())} (라벨 {labels})")
    return pct


def inject_line_spacing(header_xml, body_ids, pct):
    """body paraPr 블록 안의 lineSpacing value 만 pct 로 교체(구조용 문단은 불변)."""
    idset = {str(i) for i in body_ids}
    changed = [0]

    def repl_para(m):
        block, pid = m.group(0), m.group(1)
        if pid not in idset:
            return block
        new, n = re.subn(
            r'(<hh:lineSpacing type="PERCENT" value=")\d+(")',
            lambda mm: mm.group(1) + str(pct) + mm.group(2),
            block,
        )
        changed[0] += n
        return new

    out = re.sub(r'<hh:paraPr id="(\d+)".*?</hh:paraPr>', repl_para, header_xml, flags=re.S)
    return out, changed[0]


def build(dan, size, spacing, content_path=None, out_dir=None, view="문제", title=None, header_fields=None):
    key = f"{dan}_{size}"
    if key not in PARAMS:
        raise SystemExit(f"[에러] 조합 {key} 없음. 가능: {list(PARAMS)}")
    fam = PARAMS[key]
    pct = resolve_spacing(fam, spacing)
    # 기준 파일 = 저장소 루트 templates/ 의 '보통' 정본(단수×크기당 1개).
    # 스켈레톤 별도 사본 대신 정본을 직접 읽어 정본 단일화(중복·drift 제거).
    skel = os.path.join(ROOT, "..", "templates", fam["base_template"])
    if not os.path.exists(skel):
        raise SystemExit(f"[에러] 기준 정본 없음: {skel}")

    view_key = VIEW_ALIASES.get(view)
    if view_key is None:
        raise SystemExit(f"[에러] 뷰모드 '{view}' 미지원. 가능: {sorted(set(VIEW_LABEL))} 또는 {list(VIEW_LABEL.values())}")

    # read all members
    with zipfile.ZipFile(skel) as z:
        members = z.namelist()
        data = {n: z.read(n) for n in members}

    header = data["Contents/header.xml"].decode("utf-8")
    header, n = inject_line_spacing(header, fam["body_paraPr_ids"], pct)

    if content_path:
        pool = json.load(open(content_path, encoding="utf-8"))
        columns = 2 if dan == "2단" else 1
        section0 = data["Contents/section0.xml"].decode("utf-8")
        # 헤더 필드 중 하나라도 있으면 동적 2줄 헤더 조립
        hf = {k: v for k, v in (header_fields or {}).items() if v}
        new_section, new_header = gen_section.generate_with_pool(
            section0, header, pool, columns, size, view_key, title,
            header_fields=(hf or None))
        data["Contents/section0.xml"] = new_section.encode("utf-8")
        header = new_header
        print(f"[본문생성] content={os.path.basename(content_path)} view={VIEW_LABEL[view_key]} "
              f"groups={len(pool)} columns={columns}")

    data["Contents/header.xml"] = header.encode("utf-8")

    out_dir = out_dir or os.path.join(ROOT, "out")
    os.makedirs(out_dir, exist_ok=True)
    name_view = f"_{VIEW_LABEL[view_key]}" if content_path else ""
    out_path = os.path.join(out_dir, f"{dan}_{size}_{pct}{name_view}.hwpx")

    # rezip. mimetype must be first and stored(uncompressed) per OCF convention.
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        ordered = ["mimetype"] + [m for m in members if m != "mimetype"]
        for m in ordered:
            if m == "mimetype":
                zi = zipfile.ZipInfo(m); zi.compress_type = zipfile.ZIP_STORED
                z.writestr(zi, data[m])
            else:
                z.writestr(m, data[m])

    print(f"[OK] {out_path}  (body paraPr {len(fam['body_paraPr_ids'])}개 -> lineSpacing {pct}%, 치환 {n}건)")
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dan", required=True, choices=["1단", "2단"])
    ap.add_argument("--size", required=True, type=int, choices=[9, 11, 13])
    ap.add_argument("--spacing", required=True, help="라벨(좁게/보통/넓게) 또는 퍼센트(.hwp 통일값)")
    ap.add_argument("--content", default=None, help="content.json (NE_POOL 구조). 지정 시 section0 본문 생성")
    ap.add_argument("--view", default="문제", help="뷰모드: 문제/정답/스펠링/문제+정답 (content 지정 시)")
    ap.add_argument("--title", default=None, help="시험명(제목). content 지정 시")
    # 동적 2줄 헤더 필드(하나라도 주면 새 헤더 조립: 학원·반·출제일 날짜[교재] / 제목 이름·점수)
    ap.add_argument("--academy", default=None, help="학원명 (헤더 1줄)")
    ap.add_argument("--klass", default=None, help="반 (헤더 1줄)")
    ap.add_argument("--date", default=None, help="출제일 (헤더 1줄)")
    ap.add_argument("--book", default=None, help="교재 (헤더 1줄 [ ] 안)")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    hf = {"academy": a.academy, "klass": a.klass, "date": a.date, "book": a.book, "title": a.title}
    build(a.dan, a.size, a.spacing, a.content, a.out, a.view, a.title, header_fields=hf)


if __name__ == "__main__":
    main()
