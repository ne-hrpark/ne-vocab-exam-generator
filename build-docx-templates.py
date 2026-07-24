# -*- coding: utf-8 -*-
"""
build-docx-templates.py — docx/ 사전제작 정본 → docx-templates.js (base64 내장) 자동 생성

사용법:  python build-docx-templates.py
  · 입력: docx/{단}단/{크기}/어휘시험지_{단}단_{크기}_{간격}.docx  (실참조 18개, 매우좁게·매우넓게 백업 제외)
  · 출력: docx-templates.js
        window.DOCX_TEMPLATES = { "<파일명>": "<zip 전체 base64>", ... }

docx-tpl-export.js 가 이 내장 base64 로 JSZip.loadAsync → file:// 에서도 동작(HWPX templates.js 와 동일 취지).
DOCX 내부엔 theme/fontTable 등 바이너리성 파일이 있어 텍스트 리터럴 대신 zip 전체를 base64 로 담는다.
생성기는 word/document.xml 만 교체하므로 템플릿 본문(샘플 단어)은 무시된다.

경로/폴더 표기는 실제 docx/ 구조(../docx, 프로젝트 루트 기준)를 따른다.
사전제작 파일 교체 시 이 스크립트를 재실행. (Word 임시 잠금파일 ~$… 는 자동 제외)
"""
import base64
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = os.path.dirname(os.path.abspath(__file__))
# docx/ 는 프로젝트 루트(= 이 스크립트 상위의 상위) 아래에 있음
SRC = os.path.normpath(os.path.join(ROOT, '..', 'docx'))
OUT = os.path.join(ROOT, 'docx-templates.js')

entries = []
count = 0
total = 0
for col in ('1단', '2단'):
    for size in ('9', '11', '13'):
        d = os.path.join(SRC, col, size)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.lower().endswith('.docx') or fn.startswith('~$'):
                continue
            with open(os.path.join(d, fn), 'rb') as f:
                data = f.read()
            total += len(data)
            b64 = base64.b64encode(data).decode('ascii')
            entries.append('  "%s": "%s"' % (fn, b64))
            count += 1

if not count:
    raise SystemExit('docx/ 에서 사전제작 파일을 찾지 못했습니다: ' + SRC)

js = (
    '/* docx-templates.js — 자동 생성 파일. 손으로 수정하지 말 것.\n'
    ' * 생성: python build-docx-templates.py  (입력: docx/{단}단/{크기}/*.docx %d개)\n'
    ' * 사전제작 docx 전체를 base64로 담음 → docx-tpl-export.js 가 file:// 에서도 로드.\n'
    ' * 사전제작 파일 수정 후 이 스크립트를 재실행. */\n'
    'window.DOCX_TEMPLATES = {\n%s\n};\n'
) % (count, ',\n'.join(entries))

open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
print('생성 완료: docx-templates.js  (%d개, 원본 %.0fKB → JS %.0fKB)'
      % (count, total / 1024.0, os.path.getsize(OUT) / 1024.0))
