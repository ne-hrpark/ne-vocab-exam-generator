# -*- coding: utf-8 -*-
"""
build-templates-js.py — templates/ 정본 18개 → templates.js (XML 텍스트 내장) 자동 생성
  (2026-07-23: 매우좁게·매우넓게 미참조 백업 12개 삭제 → 30개에서 18개로. 개수는 폴더 내용대로 자동 반영)

사용법:  python build-templates-js.py
  · 입력: templates/*.hwpx  (정본 — 한글 프로그램이 저장한 바이트 그대로)
  · 출력: templates.js
        window.HWPX_TEMPLATES = { "<파일명>": { "<내부경로>": `<XML 텍스트>`, ... }, ... }

정본 zip 안 8개 파일이 전부 UTF-8 XML 텍스트(이미지·바이너리 없음)이고 백틱·${·역슬래시가
하나도 없어, base64 대신 **XML 원문을 템플릿 리터럴(백틱)로 이스케이프 없이 그대로** 담는다.
→ base64보다 크지만(zip 압축이 풀리므로) 사람이 읽고 grep·diff·값 수정이 가능(유지보수용).

정본(정렬·여백 등)을 수정했으면 templates/의 hwpx를 교체한 뒤 이 스크립트를 재실행한다.
반대 방향(templates.js → templates/ 복원)은 extract-templates-from-js.py. templates.js는 손으로 고치지 말 것.
"""
import io
import os
import sys
import zipfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = os.path.dirname(os.path.abspath(__file__))
# 이 스크립트는 tools/ 에 있고, 정본·산출물은 저장소 루트(상위)에 있음.
REPO = os.path.dirname(ROOT)
SRC = os.path.join(REPO, 'templates')
OUT = os.path.join(REPO, 'templates.js')

files = sorted(f for f in os.listdir(SRC) if f.lower().endswith('.hwpx'))
if not files:
    raise SystemExit('templates/ 에 hwpx가 없습니다: ' + SRC)


def entry_order(name):
    # 읽기 좋게: mimetype 먼저, 큰 파일(header/section0) 마지막
    if name == 'mimetype':
        return (0, name)
    if name == 'Contents/header.xml':
        return (8, name)
    if name == 'Contents/section0.xml':
        return (9, name)
    return (5, name)


blocks = []
total_raw = 0
for f in files:
    with zipfile.ZipFile(os.path.join(SRC, f)) as z:
        names = [n for n in z.namelist() if not n.endswith('/')]
        entries = []
        for n in sorted(names, key=entry_order):
            data = z.read(n)
            total_raw += len(data)
            text = data.decode('utf-8')   # 전부 UTF-8 텍스트(바이너리 없음)
            # 백틱 리터럴 안전성 — 특수문자가 있으면 조용한 손상 대신 즉시 실패
            for bad in ('`', '${', '\\'):
                if bad in text:
                    raise SystemExit('백틱 리터럴로 담을 수 없는 문자(%r)가 %s/%s 에 있음 → 빌드 중단' % (bad, f, n))
            entries.append('    "%s": `%s`' % (n, text))
        blocks.append('  "%s": {\n%s\n  }' % (f, ',\n'.join(entries)))

js = (
    '/* templates.js — 자동 생성 파일. 손으로 수정하지 말 것.\n'
    ' * 생성: python build-templates-js.py  (입력: templates/*.hwpx %d개)\n'
    ' * 정본 내부 XML을 base64가 아니라 "텍스트 그대로"(백틱 리터럴) 담음 → 읽기·grep·값수정 가능.\n'
    ' * 용도: hwpx-tpl-export.js 가 이 내장 데이터로 zip을 즉석 구성 → file:// 에서도 동작.\n'
    ' * 복원(→templates/): python extract-templates-from-js.py. 정본 수정 후 이 스크립트 재실행. */\n'
    'window.HWPX_TEMPLATES = {\n%s\n};\n'
) % (len(files), ',\n'.join(blocks))

open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
print('생성 완료: templates.js  (%d개 템플릿, 원본텍스트 %.0fKB → JS %.0fKB)'
      % (len(files), total_raw / 1024.0, os.path.getsize(OUT) / 1024.0))
for f in files:
    print('  -', f)
