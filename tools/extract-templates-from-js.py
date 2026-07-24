# -*- coding: utf-8 -*-
"""
extract-templates-from-js.py — templates.js (XML 텍스트 내장) → templates/ 정본 18개 복원

사용법:  python extract-templates-from-js.py
  · 입력: templates.js  (window.HWPX_TEMPLATES = { "<파일명>": { "<내부경로>": `<XML>`, ... }, ... })
  · 출력: templates/*.hwpx (내부 파일들을 zip으로 다시 묶어 복원)

templates/ 폴더는 '실행'에는 필요 없다(templates.js만으로 동작). 정본을 다시 손봐야 할 때
이 스크립트로 templates/를 되살린 뒤 → 한글에서 수정 → build-templates-js.py 로 templates.js 재생성한다.
build-templates-js.py 와 정확히 역방향이며, 담긴 XML 텍스트가 원본과 동일하면 내용이 보존된다.
(zip 재압축이므로 바이트 단위로 동일하진 않지만, 8개 내부 파일의 내용은 동일 → 한글이 정상 인식.)
"""
import io
import os
import re
import sys
import zipfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = os.path.dirname(os.path.abspath(__file__))
# 이 스크립트는 tools/ 에 있고, 정본·산출물은 저장소 루트(상위)에 있음.
REPO = os.path.dirname(ROOT)
SRC = os.path.join(REPO, 'templates.js')
OUT = os.path.join(REPO, 'templates')

if not os.path.exists(SRC):
    raise SystemExit('templates.js 가 없습니다: ' + SRC)

js = open(SRC, encoding='utf-8').read()

# 형식: "<파일명>.hwpx": { "<내부경로>": `<내용>`, ... },  (내용에 백틱 없음이 보장됨)
# 1) 파일명 헤더 위치와, 2) `"경로": `내용`` 엔트리를 각각 뽑아, 헤더 사이 구간의 엔트리를 그 파일에 귀속.
file_hdrs = [(m.start(), m.group(1)) for m in re.finditer(r'"([^"]+\.hwpx)"\s*:\s*\{', js)]
if not file_hdrs:
    raise SystemExit('templates.js 에서 템플릿 파일 항목을 찾지 못했습니다(형식 확인).')

entry_re = re.compile(r'"([^"]+)"\s*:\s*`([^`]*)`', re.S)
bounds = [h[0] for h in file_hdrs] + [len(js)]

os.makedirs(OUT, exist_ok=True)
count = 0
for i, (pos, fname) in enumerate(file_hdrs):
    seg = js[bounds[i]:bounds[i + 1]]
    # 세그먼트 맨 앞의 파일명 헤더("...hwpx": {)는 건너뛰고 그 뒤 엔트리만
    seg = seg[seg.index('{') + 1:]
    entries = entry_re.findall(seg)
    if not entries:
        raise SystemExit('엔트리 없음: ' + fname)
    with zipfile.ZipFile(os.path.join(OUT, fname), 'w') as z:
        for name, content in entries:
            # mimetype 은 무압축(STORED), 나머지는 DEFLATE (hwpx 규약)
            comp = zipfile.ZIP_STORED if name == 'mimetype' else zipfile.ZIP_DEFLATED
            z.writestr(name, content.encode('utf-8'), compress_type=comp)
    count += 1

print('복원 완료: templates/  (%d개)' % count)
for _, fname in file_hdrs:
    print('  -', fname)
