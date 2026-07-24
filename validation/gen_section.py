#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
검증용 section0 본문 생성기 — 브라우저 엔진 hwpx-tpl-export.js 의 Python 이식.

이식 원본(오라클 대조 기준): ../hwpx-tpl-export.js (저장소 루트)
  - 스켈레톤 section0/header 를 프로파일링(profileTemplate)해 스타일 ID/탭스톱/colPr 을 추출하고,
    content(NE_POOL 구조)로부터 본문 <hp:p> 를 다시 만든다.
  - 죽은 실험 플래그(NORMALIZE_DEFAULT_TO_CASE / QA_MARKER_LEFT_ALIGN /
    TWOCOL_MULTILINE_FULL / MULTILINE_GROUPS_TO_FULL)는 전부 false 라 이식에서 제외.

포팅 규칙(JS→Py):
  - JS `.replace(re, ...)`(/g 없음) = 첫 매치만 → re.sub(count=1)
  - JS 문자열 .replace(str, ...) = 첫 매치만 → str.replace(..., 1)
  - Math.round = floor(x+0.5)  (파이썬 round 의 banker's rounding 금지)
  - 동적 치환은 함수 replacement 로(백레퍼런스/백슬래시 해석 회피)

공개 API:
  generate(section0, header, columns, size, view, title=None) -> (new_section0, new_header)
    view ∈ {'q'(문제), 'ans'(정답), 'spell'(문제-스펠링), 'qa'(문제+정답)}
"""
import re, math, urllib.parse, os

# [컬럼 걸침 대책 프로토타입 2026-07-23] 2단에서 한 항목이 컬럼 경계를 넘어 좌/오로 갈라지는 것을
#  '추정 줄수 기반'으로 감지해 개입한다. 기본 off(출력 불변 → Node 오라클 byte-diff 유지).
#   NE_COLSPLIT=off  : 개입 안 함(기존과 동일)
#   NE_COLSPLIT=1col : 경계 넘는 항목만 전체폭(1단)으로 전환
#   NE_COLSPLIT=push : 경계 넘는 항목을 다음 단 맨 위로 밀기(여백 생김, 2단 유지)
#   NE_COLCAP=<n>    : 한 컬럼 줄수 수동 지정(0=linesPerCol 추정치 사용). 한글 실측과 안 맞으면 튜닝.
COLSPLIT_MODE = os.environ.get('NE_COLSPLIT', 'off')
COLSPLIT_COLCAP = int(os.environ.get('NE_COLCAP', '0') or '0')
COLSPLIT_ASKLINES = int(os.environ.get('NE_ASKLINES', '2') or '2')   # 발문(full-width)이 첫 컬럼 위에서 먹는 대략 줄수

# ── 상수(모듈 top, JS 대응) ─────────────────────────────────────────
LB = '<hp:lineBreak/>'
TAB2 = '<hp:tab width="1000" leader="0" type="2"/>'
MINTAB = 300
ANS_FRAC = 0.44
UL_SPACING = 0
UL_FILL = '_'
CB_SKIP_MULTIPAGE = True
EDGE_PB_FULL_TO_TWOCOL = True
EDGE_PB_TWOCOL_TO_FULL = False
ASK_GAP_BEFORE = 1400
MARK = '\x01'
NL = '\x02'
DOT = re.DOTALL


def jround(x):
    """JS Math.round: .5 는 +무한대 방향으로 올림."""
    return math.floor(x + 0.5)


def enc(s):
    """encodeURIComponent 동등: 비인코딩 집합 A-Za-z0-9 -_.!~*'()"""
    return urllib.parse.quote(s, safe="!~*'()")


def dec(s):
    return urllib.parse.unquote(s)


def esc(s):
    if s is None:
        s = ''
    return (str(s).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


def answer_col(stops):
    return jround(stops['left'] + (stops['right'] - stops['left']) * ANS_FRAC)


def estW(t, em=1100):
    u = 0.0
    s = '' if t is None else str(t)
    for ch in s:
        c = ord(ch)
        if c == 32 or c == 0xa0:
            u += 0.33
        elif c >= 0x1100 and not (0x2000 <= c < 0x2100):
            u += 1.0
        elif 48 <= c <= 57:
            u += 0.5
        elif c >= 0x41:
            u += 0.52
        else:
            u += 0.4
    return u * em


def mkTab2(width):
    return '<hp:tab width="%d" leader="0" type="2"/>' % max(1, jround(width))


def attrOf(tag, name):
    m = re.search(r'\b' + re.escape(name) + r'="([^"]*)"', tag)
    return m.group(1) if m else None


# ── section0 분해 ──────────────────────────────────────────────────
def splitSection(section0):
    i = section0.find('<hp:p')
    k = section0.rfind('</hp:p>')
    j = len(section0) if k < 0 else k + len('</hp:p>')
    return {'prefix': section0[:i], 'body': section0[i:j], 'suffix': section0[j:]}


def splitParas(body):
    return re.findall(r'<hp:p\b.*?</hp:p>', body, DOT)


def stripLineseg(p):
    return re.sub(r'<hp:linesegarray>.*?</hp:linesegarray>', '', p, flags=DOT)


def firstText(p):
    m = re.search(r'<hp:t>(.*?)</hp:t>', p, DOT)
    if not m:
        return ''
    t = m.group(1)
    t = re.sub(r'<hp:tab[^>]*/>', ' ', t)
    t = re.sub(r'<hp:lineBreak/>', ' ', t)
    t = re.sub(r'<[^>]+>', '', t)
    return t


def isAsk(p):
    return re.match(r'^\s*※', firstText(p)) is not None


def isItem(p):
    return re.match(r'^\s*\d+\s*\.', firstText(p)) is not None


def isEmptyPara(p):
    t = stripLineseg(p)
    t = re.sub(r'<hp:tab[^>]*/>', '', t)
    t = re.sub(r'<[^>]+>', '', t)
    return t.strip() == ''


def colPrBlock(p):
    m = re.search(r'<hp:ctrl><hp:colPr.*?</hp:colPr></hp:ctrl>', p, DOT)
    return m.group(0) if m else None


def colCountOf(b):
    if not b:
        return None
    m = re.search(r'colCount="(\d+)"', b)
    return int(m.group(1)) if m else None


def blankRunOf(p):
    runs = re.findall(r'<hp:run\b.*?</hp:run>', p, DOT)
    for i in range(len(runs) - 1, -1, -1):
        tm = re.search(r'<hp:t>(.*?)</hp:t>', runs[i], DOT)
        if tm and len(tm.group(1)) and re.match(r'^[\s ]+$', tm.group(1)):
            return runs[i]
    return None


def anchorOf(p):
    m = re.search(r'<hp:t>(.*?)</hp:t>', p, DOT)
    if not m:
        return None
    seg = m.group(1)
    i2 = seg.find('type="2"')
    if i2 < 0:
        return None
    tabStart = seg.rfind('<hp:tab', 0, i2)
    tabEl = seg[tabStart:seg.find('/>', i2) + 2]
    wm = re.search(r'width="(\d+)"', tabEl)
    if not wm:
        return None
    i1 = seg.find('type="1"')
    afterTab1 = (seg.find('/>', i1) + 2) if i1 >= 0 else 0
    content = re.sub(r'<[^>]+>', '', seg[afterTab1:tabStart])
    return {'text': content, 'tab': int(wm.group(1))}


# ── header 파싱 ────────────────────────────────────────────────────
def tabStops(headerXml, ppId):
    if not headerXml or ppId is None:
        return None
    pm = re.search(r'<hh:paraPr id="' + str(ppId) + r'"[^>]*?tabPrIDRef="(\d+)"', headerXml)
    if not pm:
        return None
    tm = re.search(r'<hh:tabPr id="' + pm.group(1) + r'".*?</hh:tabPr>', headerXml, DOT)
    if not tm:
        return None
    caseM = re.findall(r'<hp:case[^>]*HwpUnitChar.*?</hp:case>', tm.group(0), DOT)
    scope = ''.join(caseM) if caseM else tm.group(0)
    L = re.search(r'pos="(\d+)"[^>]*type="LEFT"', scope)
    R = re.search(r'pos="(\d+)"[^>]*type="RIGHT"', scope)
    return {'left': int(L.group(1)) if L else 0, 'right': int(R.group(1)) if R else 0}


def blankTextOf(blankRun):
    m = re.search(r'<hp:t>(.*?)</hp:t>', blankRun or '', DOT)
    return m.group(1) if m else (' ' * 30)


def blackUnderlineCharPr(headerXml):
    for m in re.finditer(r'<hh:charPr id="(\d+)".*?</hh:charPr>', headerXml, DOT):
        if re.search(r'textColor="#0{6}"', m.group(0), re.I) and re.search(r'<hh:underline type="BOTTOM"', m.group(0)):
            return m.group(1)
    return None


def findMalgunFontId(headerXml):
    if not headerXml:
        return None
    byName = {}
    for m in re.finditer(r'<hh:font id="(\d+)" face="([^"]*)"', headerXml):
        if m.group(2) not in byName:
            byName[m.group(2)] = m.group(1)
    for k in byName:
        if re.search(r'malgun', k, re.I):
            return byName[k]
    for k in byName:
        if re.search(r'맑은\s*고딕', k):
            return byName[k]
    return None


def _bump_itemcnt(headerXml, tag):
    """<tag ... itemCnt="N"> 의 N 을 +1 (첫 매치만)."""
    pat = r'(<' + tag + r' itemCnt=")(\d+)(")'
    return re.sub(pat, lambda m: m.group(1) + str(int(m.group(2)) + 1) + m.group(3), headerXml, count=1)


def addUnderlineCharPr(headerXml, baseCpId, spacing):
    if not headerXml or baseCpId is None:
        return headerXml
    m = re.search(r'<hh:charPr id="' + str(baseCpId) + r'".*?</hh:charPr>', headerXml, DOT)
    if not m:
        return headerXml
    ids = [int(x) for x in re.findall(r'<hh:charPr id="(\d+)"', headerXml)]
    newId = max(ids) + 1
    fid = findMalgunFontId(headerXml)
    clone = m.group(0)
    clone = re.sub(r'\bid="\d+"', 'id="%d"' % newId, clone, count=1)
    clone = re.sub(r'\btextColor="[^"]*"', 'textColor="#000000"', clone, count=1)
    clone = re.sub(r'<hh:spacing\b[^>]*/>',
                   '<hh:spacing hangul="0" latin="%s" hanja="0" japanese="0" other="0" symbol="0" user="0"/>' % spacing,
                   clone, count=1)
    clone = re.sub(r'<hh:underline\b[^>]*/>',
                   '<hh:underline type="NONE" shape="SOLID" color="#000000"/>', clone, count=1)
    if fid is not None:
        clone = re.sub(r'<hh:fontRef\b[^>]*/>',
                       '<hh:fontRef hangul="%s" latin="%s" hanja="%s" japanese="%s" other="%s" symbol="%s" user="%s"/>'
                       % (fid, fid, fid, fid, fid, fid, fid), clone, count=1)
    headerXml = re.sub(r'</hh:charPr>(\s*</hh:charProperties>)',
                       lambda mm: '</hh:charPr>' + clone + mm.group(1), headerXml, count=1)
    headerXml = _bump_itemcnt(headerXml, 'hh:charProperties')
    return headerXml


def findUnderlineCP(headerXml):
    if not headerXml:
        return None
    fid = findMalgunFontId(headerXml)
    if fid is None:
        return None
    fontRe = re.compile(r'<hh:fontRef\b[^>]*\blatin="' + fid + r'"')
    best = None
    bestId = -1
    for m in re.finditer(r'<hh:charPr id="(\d+)".*?</hh:charPr>', headerXml, DOT):
        if fontRe.search(m.group(0)) and re.search(r'<hh:underline type="NONE"', m.group(0)) and int(m.group(1)) > bestId:
            bestId = int(m.group(1))
            best = m.group(1)
    return best


def addAnswerBorderCharPr(headerXml, baseCpId):
    if not headerXml or baseCpId is None:
        return headerXml
    m = re.search(r'<hh:charPr id="' + str(baseCpId) + r'".*?</hh:charPr>', headerXml, DOT)
    if not m:
        return headerXml
    ids = [int(x) for x in re.findall(r'<hh:charPr id="(\d+)"', headerXml)]
    newId = max(ids) + 1
    clone = m.group(0)
    clone = re.sub(r'\bid="\d+"', 'id="%d"' % newId, clone, count=1)
    clone = re.sub(r'\btextColor="[^"]*"', 'textColor="#000000"', clone, count=1)
    clone = re.sub(r'<hh:underline\b[^>]*/>',
                   '<hh:underline type="BOTTOM" shape="SOLID" color="#000000"/>', clone, count=1)
    if not re.search(r'<hh:underline\b', clone):
        clone = re.sub(r'(<hh:strikeout\b)',
                       lambda mm: '<hh:underline type="BOTTOM" shape="SOLID" color="#000000"/>' + mm.group(1),
                       clone, count=1)
    headerXml = re.sub(r'</hh:charPr>(\s*</hh:charProperties>)',
                       lambda mm: '</hh:charPr>' + clone + mm.group(1), headerXml, count=1)
    headerXml = _bump_itemcnt(headerXml, 'hh:charProperties')
    return headerXml


def findAnswerBorderCP(headerXml):
    if not headerXml:
        return None
    best = None
    bestId = -1
    for m in re.finditer(r'<hh:charPr id="(\d+)".*?</hh:charPr>', headerXml, DOT):
        if re.search(r'<hh:underline type="BOTTOM"', m.group(0)) and int(m.group(1)) > bestId:
            bestId = int(m.group(1))
            best = m.group(1)
    return best


def findFullPP(headerXml):
    if not headerXml:
        return None
    best = None
    bestR = -1
    for m in re.finditer(r'<hh:paraPr id="(\d+)"[^>]*?tabPrIDRef="(\d+)".*?</hh:paraPr>', headerXml, DOT):
        st = tabStops(headerXml, m.group(1))
        if not st or not st['right']:
            continue
        im = re.search(r'HwpUnitChar.*?<hc:intent value="(-?\d+)"', m.group(0), DOT)
        hanging = im and (int(im.group(1)) == -st['left'])
        if hanging and st['right'] > bestR:
            bestR = st['right']
            best = m.group(1)
    return best


def resolveFullPP(headerXml, detected):
    fs = tabStops(headerXml, detected)
    if fs and fs['right']:
        return detected
    return findFullPP(headerXml) or detected


def addAskGapParaPr(headerXml, askPpId, gap):
    if not headerXml or askPpId is None:
        return headerXml
    m = re.search(r'<hh:paraPr id="' + str(askPpId) + r'".*?</hh:paraPr>', headerXml, DOT)
    if not m:
        return headerXml
    ids = [int(x) for x in re.findall(r'<hh:paraPr id="(\d+)"', headerXml)]
    newId = max(ids) + 1
    clone = m.group(0)
    clone = re.sub(r'\bid="\d+"', 'id="%d"' % newId, clone, count=1)
    clone = re.sub(r'<hc:prev value="\d+" unit="HWPUNIT"/>',
                   '<hc:prev value="%d" unit="HWPUNIT"/>' % gap, clone)  # /g
    headerXml = re.sub(r'</hh:paraPr>(\s*</hh:paraProperties>)',
                       lambda mm: '</hh:paraPr>' + clone + mm.group(1), headerXml, count=1)
    headerXml = _bump_itemcnt(headerXml, 'hh:paraProperties')
    return headerXml


def findAskGapPP(headerXml, gap):
    if not headerXml:
        return None
    sig = re.compile(r'<hc:prev value="' + str(gap) + r'" unit="HWPUNIT"/>')
    best = None
    bestId = -1
    for m in re.finditer(r'<hh:paraPr id="(\d+)".*?</hh:paraPr>', headerXml, DOT):
        if sig.search(m.group(0)) and int(m.group(1)) > bestId:
            bestId = int(m.group(1))
            best = m.group(1)
    return best


def normalizeHeader(headerXml, cfg):
    cfg = cfg or {}
    h = headerXml.replace('keepLines="0"', 'keepLines="1"')          # /g
    h = h.replace('snapToGrid="1"', 'snapToGrid="0"')                # /g
    if cfg.get('columns') == 2 and cfg.get('fullPP'):
        fpp = cfg['fullPP']
        tm = re.search(r'<hh:paraPr id="' + str(fpp) + r'"[^>]*?tabPrIDRef="(\d+)"', h)

        def repl_pp(m):
            s = m.group(0)
            s = s.replace('<hc:intent value="-4670"', '<hc:intent value="-3000"')  # /g
            s = s.replace('<hc:intent value="-9340"', '<hc:intent value="-6000"')  # /g
            return s
        h = re.sub(r'<hh:paraPr id="' + str(fpp) + r'".*?</hh:paraPr>', repl_pp, h, count=1, flags=DOT)
        if tm:
            def repl_tab(m):
                s = m.group(0)
                s = s.replace('pos="4670" type="LEFT"', 'pos="3000" type="LEFT"')  # /g
                s = s.replace('pos="9340" type="LEFT"', 'pos="6000" type="LEFT"')  # /g
                return s
            h = re.sub(r'<hh:tabPr id="' + tm.group(1) + r'".*?</hh:tabPr>', repl_tab, h, count=1, flags=DOT)
    if cfg.get('itemCP') is not None:
        h = addUnderlineCharPr(h, cfg['itemCP'], UL_SPACING)
    if cfg.get('itemCP') is not None:
        h = addAnswerBorderCharPr(h, cfg['itemCP'])
    if cfg.get('askPP') is not None and ASK_GAP_BEFORE > 0:
        h = addAskGapParaPr(h, cfg['askPP'], ASK_GAP_BEFORE)
    return h


def computeK(anchor, stops, em, ulW, fallback):
    if anchor:
        return anchor['tab'] + estW(anchor['text'], em)
    if stops and stops['right']:
        return stops['right'] - stops['left'] - ulW
    return fallback


def mkP(pp, inner, colBreak=False, pageBreak=False):
    return ('<hp:p id="0" paraPrIDRef="' + str(pp) + '" styleIDRef="0" pageBreak="'
            + ('1' if pageBreak else '0') + '" columnBreak="' + ('1' if colBreak else '0')
            + '" merged="0">' + inner + '</hp:p>')


def runT(cp, t):
    return '<hp:run charPrIDRef="' + str(cp) + '"><hp:t>' + t + '</hp:t></hp:run>'


def profileTemplate(section0):
    sp = splitSection(section0)
    paras = [stripLineseg(p) for p in splitParas(sp['body'])]

    firstAskIdx = -1
    for i in range(len(paras)):
        if isAsk(paras[i]):
            firstAskIdx = i
            break
    if firstAskIdx < 0:
        firstAskIdx = min(len(paras), 5)

    prof = {
        'prefix': sp['prefix'], 'suffix': sp['suffix'],
        'header': paras[:firstAskIdx],
        'askPP': '0', 'askCP': '0',
        'itemPP': None, 'itemCP': None, 'fullPP': None, 'fullCP': None,
        'tab1': '<hp:tab width="1440" leader="0" type="1"/>',
        'colPr2': None, 'colPr1': None, 'blankRun': None, 'blankPara': None,
        'itemAnchor': None, 'fullAnchor': None,
    }

    for i in range(firstAskIdx, len(paras)):
        if isAsk(paras[i]):
            prof['askPP'] = attrOf(paras[i], 'paraPrIDRef') or '0'
            rm = re.search(r'<hp:run charPrIDRef="(\d+)"', paras[i])
            prof['askCP'] = rm.group(1) if rm else '0'
            break

    firstItemPP = None
    firstItemCP = None
    for i in range(len(paras)):
        if not isItem(paras[i]):
            continue
        cb = colPrBlock(paras[i])
        cc = colCountOf(cb)
        pp = attrOf(paras[i], 'paraPrIDRef') or '0'
        cpm = re.search(r'<hp:run charPrIDRef="(\d+)"', paras[i])
        cp = cpm.group(1) if cpm else '0'
        t1 = re.search(r'<hp:tab[^>]*type="1"/>', paras[i])
        br = blankRunOf(paras[i])
        if firstItemPP is None:
            firstItemPP = pp
            firstItemCP = cp
            if t1:
                prof['tab1'] = t1.group(0)
            if br:
                prof['blankRun'] = br
            if not prof['itemAnchor']:
                prof['itemAnchor'] = anchorOf(paras[i])
        if cc == 2 and not prof['itemPP']:
            prof['itemPP'] = pp
            prof['itemCP'] = cp
            if t1:
                prof['tab1'] = t1.group(0)
            if cb:
                prof['colPr2'] = cb
            if br:
                prof['blankRun'] = br
            a2 = anchorOf(paras[i])
            if a2:
                prof['itemAnchor'] = a2

    if prof['itemPP']:
        for i in range(len(paras)):
            if not isItem(paras[i]):
                continue
            ppx = attrOf(paras[i], 'paraPrIDRef') or '0'
            if ppx != prof['itemPP']:
                prof['fullPP'] = ppx
                mfx = re.search(r'<hp:run charPrIDRef="(\d+)"', paras[i])
                prof['fullCP'] = mfx.group(1) if mfx else prof['itemCP']
                prof['fullAnchor'] = anchorOf(paras[i])
                break
    else:
        prof['itemPP'] = firstItemPP
        prof['itemCP'] = firstItemCP

    for i in range(len(paras)):
        b = colPrBlock(paras[i])
        if b and colCountOf(b) == 1:
            prof['colPr1'] = b
            break
    for i in range(firstAskIdx, len(paras)):
        if isEmptyPara(paras[i]) and not colPrBlock(paras[i]):
            prof['blankPara'] = paras[i]
            break

    if prof['fullPP'] is None:
        prof['fullPP'] = prof['itemPP']
        prof['fullCP'] = prof['itemCP']
    if prof['itemPP'] is None:
        prof['itemPP'] = prof['fullPP'] = '0'
        prof['itemCP'] = prof['fullCP'] = '0'
    if not prof['blankRun']:
        prof['blankRun'] = '<hp:run charPrIDRef="' + str(prof['itemCP']) + '"><hp:t>' + (' ' * 30) + '</hp:t></hp:run>'
    if not prof['blankPara']:
        prof['blankPara'] = mkP(prof['askPP'], '<hp:run charPrIDRef="' + str(prof['itemCP']) + '"><hp:t/></hp:run>')
    return prof


def parseSegs(html):
    html = '' if html is None else str(html)

    def span_repl(m):
        at = m.group(1)
        am = re.search(r'data-ans="([^"]*)"', at)
        fm = re.search(r'data-fl="([^"]*)"', at)
        ans = am.group(1) if am else ''
        fl = fm.group(1) if fm else ''
        return MARK + enc(ans) + '|' + enc(fl) + MARK
    html = re.sub(r'<span class="wl"([^>]*)>.*?</span>', span_repl, html, flags=DOT)
    html = re.sub(r'<br\s*/?>', NL, html, flags=re.I)
    html = re.sub(r'<[^>]+>', '', html)
    html = (html.replace('&nbsp;', ' ').replace('&amp;', '&')
            .replace('&lt;', '<').replace('&gt;', '>'))
    segs = []
    for li, line in enumerate(html.split(NL)):
        if li > 0:
            segs.append({'type': 'break'})
        parts = line.split(MARK)
        for i in range(len(parts)):
            if i % 2 == 1:
                kv = parts[i].split('|')
                segs.append({'type': 'blank',
                             'ans': dec(kv[0] if len(kv) > 0 else ''),
                             'fl': dec(kv[1] if len(kv) > 1 else '')})
            elif parts[i]:
                segs.append({'type': 'text', 'text': parts[i]})
    return segs


def rep(c, n):
    return c * n if n > 0 else ''


def segsToRuns(segs, cp, head, prof, opts, K, em, fs2, stops):
    s = ['<hp:run charPrIDRef="' + str(cp) + '">' + (head or '') + '<hp:t>']
    state = {'open': True, 'lineText': ''}
    fillW = estW('_', em) or 1
    ulFillW = fillW * (1 + UL_SPACING / 100)
    nbspW0 = estW('\xa0', em) or 1
    rightStop = (stops and stops['right']) or (fs2 and fs2['right']) or 0
    leftStop = (stops and stops['left']) or 3000
    curLineStart = [leftStop]

    def close():
        if state['open']:
            s.append('</hp:t></hp:run>')
            state['open'] = False

    def reopen():
        if not state['open']:
            s.append('<hp:run charPrIDRef="' + str(cp) + '"><hp:t>')
            state['open'] = True

    def ulRun(inner):
        return '<hp:run charPrIDRef="' + str(prof.get('ulCP') or cp) + '"><hp:t>' + inner + '</hp:t></hp:run>'

    def overUnderline(txt, mode, count=None):
        baseCount = count or 20
        if mode == 'center':
            NB = '\xa0'
            targetW = baseCount * fillW
            nbspW = estW(NB, em) or 1
            pad = max(2, jround((targetW - estW(txt, em)) / nbspW))
            lp = pad // 2
            rp = pad - lp
            bcp = prof.get('borderCP') or prof.get('ulCP') or cp
            return '<hp:run charPrIDRef="' + str(bcp) + '"><hp:t>' + rep(NB, lp) + txt + rep(NB, rp) + '</hp:t></hp:run>'
        tW = jround(estW(txt, em) / fillW)
        fill2 = max(2, baseCount - tW)
        return ulRun(txt + rep('_', fill2))

    def fillBlank(seg, count):
        if opts.get('qa') and seg.get('ans'):
            return overUnderline(esc(seg['ans']), 'center', count)
        if opts.get('spell') and seg.get('fl') and re.match(r'[A-Za-z]', seg['fl'][0:1]):
            return overUnderline(esc(seg['fl']), 'lead', count)
        return ulRun(rep('_', count or 20))

    def lineTrailing(i):
        for j in range(i + 1, len(segs)):
            if segs[j]['type'] == 'break':
                return True
            if segs[j]['type'] == 'text' and segs[j]['text'].strip():
                return False
            if segs[j]['type'] == 'blank':
                return False
        return True

    def meaningLineH(i):
        for j in range(i + 1, len(segs)):
            if segs[j]['type'] == 'break':
                return False
            if segs[j]['type'] == 'blank':
                return lineTrailing(j)
        return False

    ulN2 = 12 if fs2 else 20

    def emitMeaningWrapped(text, mkW):
        reserve = ulN2 * ulFillW + mkW + max(MINTAB, estW('가가', em))
        cur = ''
        curW = 0.0
        for ch in text:
            cw = estW(ch, em)
            budget = max(estW('가', em) * 2, rightStop - curLineStart[0] - reserve)
            if curW + cw > budget and len(re.sub(r'^\s+', '', cur)):
                s.append(esc(cur))
                state['lineText'] += cur
                s.append(LB)
                state['lineText'] = ''
                curLineStart[0] = 0
                if ch == ' ':
                    cur = ''
                    curW = 0
                else:
                    cur = ch
                    curW = cw
            else:
                cur += ch
                curW += cw
        if len(cur):
            s.append(esc(cur))
            state['lineText'] += cur

    pending = {'tail': ''}

    def lineMkW(i):
        w = 0.0
        for j in range(i + 1, len(segs)):
            if segs[j]['type'] in ('break', 'blank'):
                break
            if segs[j]['type'] == 'text' and segs[j].get('tail'):
                w += estW(segs[j]['text'], em)
        return w

    for i, seg in enumerate(segs):
        if seg['type'] == 'text' and seg.get('tail'):
            pending['tail'] += seg['text']
            continue
        if seg['type'] == 'text':
            reopen()
            if meaningLineH(i):
                emitMeaningWrapped(seg['text'], lineMkW(i))
            else:
                s.append(esc(seg['text']))
                state['lineText'] += seg['text']
        elif seg['type'] == 'break':
            reopen()
            s.append(LB)
            state['lineText'] = ''
            pending['tail'] = ''
            curLineStart[0] = 0
        elif seg['type'] == 'blank':
            trailing = lineTrailing(i)
            N = 12 if fs2 else 20
            if trailing and (state['lineText'].strip() or pending['tail']) and rightStop:
                mkW = estW(pending['tail'], em) if pending['tail'] else 0
                blankW = N * ulFillW
                # v2.6 이식: 긴 정답(칸 초과)은 새 줄로 내려 우측정렬 (eff=실제 정답폭 예약)
                ansW = estW(seg['ans'], em) if (opts.get('qa') and seg.get('ans')) else 0
                overflow = ansW > blankW * 1.05
                eff = max(blankW, ansW)
                hint = rightStop - curLineStart[0] - estW(state['lineText'], em) - mkW - eff
                if (overflow or hint < blankW * 0.5) and (state['lineText'].strip() or pending['tail']):
                    s.append(LB)
                    state['lineText'] = ''
                    curLineStart[0] = 0
                    hint = rightStop - curLineStart[0] - mkW - eff
                reopen()
                s.append(mkTab2(max(MINTAB, hint)))
                if pending['tail']:
                    s.append(esc(pending['tail']))
                    pending['tail'] = ''
                close()
                s.append(fillBlank(seg, N))
                state['lineText'] = ''
            else:
                if pending['tail']:
                    reopen()
                    s.append(esc(pending['tail']))
                    pending['tail'] = ''
                close()
                s.append(fillBlank(seg, N if trailing else 12))
    close()
    return ''.join(s)


def buildItem(item, n, prof, opts, colPre, isFull, colBreak):
    cp = prof['fullCP'] if isFull else prof['itemCP']
    pp = prof['fullPP'] if isFull else prof['itemPP']
    if opts.get('ansOnly'):
        ansText = esc(item.get('ans') or '')
        runA = ('<hp:run charPrIDRef="' + str(cp) + '">' + (colPre or '') + '<hp:t>'
                + str(n) + '.' + prof['tab1'] + ansText + '</hp:t></hp:run>')
        return mkP(pp, runA, colBreak)
    em = (opts.get('size') or 11) * 100
    K = prof.get('KFull') if isFull else prof.get('KItem')
    if K is None:
        K = 39000 if isFull else 13000
    if item.get('drow'):
        segs = []
        headSegs = [x for x in parseSegs(item.get('head')) if x['type'] == 'text'] if item.get('head') else []
        for x in headSegs:
            segs.append(x)
        hadHead = len(headSegs) > 0
        for ri, r in enumerate(item.get('rows') or []):
            if hadHead or ri > 0:
                segs.append({'type': 'break'})
            for x in parseSegs(r.get('text') or ''):
                if x['type'] == 'text':
                    segs.append(x)
            if r.get('mark'):
                segs.append({'type': 'text', 'text': r['mark']})
            segs.append({'type': 'blank', 'ans': r.get('ans') or '', 'fl': r.get('fl') or ''})
    else:
        segs = parseSegs(item.get('q') or '')
        if item.get('wl') and not any(x['type'] == 'blank' for x in segs):
            segs.append({'type': 'blank', 'ans': item.get('ans') or '', 'fl': item.get('fl') or ''})

    bi = 0
    while bi < len(segs):
        if segs[bi]['type'] == 'blank' and bi > 0 and segs[bi - 1]['type'] == 'text':
            tm = re.match(r'^([\s\S]*?)(\s*\((?:유|반)(?:의어)?\))\s*$', segs[bi - 1]['text'])
            if tm and tm.group(1).strip():
                segs[bi - 1]['text'] = tm.group(1)
                segs.insert(bi, {'type': 'text', 'text': tm.group(2).strip() + ' ', 'tail': True})
                bi += 1
        bi += 1

    fs2 = ({'col': prof.get('ansCol'), 'numTab': prof.get('itemLeft'), 'right': prof.get('itemRight')}
           if (opts.get('columns') == 2 and not isFull and prof.get('ansCol')) else None)
    stops = tabStops(opts.get('headerXml'), pp)
    runStr = segsToRuns(segs, cp, colPre or '', prof, opts, K, em, fs2, stops)
    runStr = runStr.replace('<hp:t>', '<hp:t>' + str(n) + '.' + prof['tab1'], 1)
    return mkP(pp, runStr, colBreak)


def makeAsk(ask, prof, withCol1, pageBreak):
    t = ''.join(x['text'] for x in parseSegs(ask) if x['type'] == 'text')
    t = re.sub(r'^\s*※\s*', '', t)
    pp = prof.get('askGapPP') or prof['askPP']
    if withCol1:
        col1 = prof.get('colPr1') or ('<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0">'
                                      '<hp:colLine type="NONE" width="0.1 mm" color="#000000"/></hp:colPr></hp:ctrl>')
        return mkP(pp, '<hp:run charPrIDRef="' + str(prof['askCP']) + '">' + col1 + '<hp:t>※ ' + esc(t) + '</hp:t></hp:run>',
                   False, pageBreak)
    return mkP(pp, runT(prof['askCP'], '※ ' + esc(t)), False, pageBreak)


def closeColPara(prof):
    col1 = prof.get('colPr1') or ('<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0">'
                                  '<hp:colLine type="NONE" width="0.1 mm" color="#000000"/></hp:colPr></hp:ctrl>')
    return mkP(prof['askPP'], '<hp:run charPrIDRef="' + str(prof['askCP']) + '">' + col1 + '<hp:t/></hp:run>')


def substHeader(h, hd, titleCP):
    if hd and hd.get('title') and titleCP:
        cm = re.search(r'<hp:run charPrIDRef="(\d+)"', h)
        if cm and cm.group(1) == titleCP:
            h = re.sub(r'<hp:t>[^<]*</hp:t>', lambda m: '<hp:t>' + esc(hd['title']) + '</hp:t>', h, count=1)
    return h


def estItemLines(item, prof, em):
    if (prof.get('itemRight') and prof.get('itemLeft') and prof['itemRight'] > prof['itemLeft']):
        colW = prof['itemRight'] - prof['itemLeft']
    else:
        colW = 25000
    numTab = prof.get('itemLeft') or 3000
    fillW = estW('_', em) or 1
    ulFillW = fillW * (1 + UL_SPACING / 100)
    V2 = bool(os.environ.get('NE_EST_V2'))
    # V2[2026-07-23]: 과대추정 보정 — ①표제어(첫 seg, blank 없음)는 첫 뜻줄에 붙어 렌더되므로 별도 줄로 세지 않고
    #  폭만 다음 줄로 이월(1.create[명사]… 처럼 한 줄). ②reserve(밑줄 예약폭)를 12→8로 줄여 meaningColW를 넓혀
    #  짧은 뜻이 거짓으로 2줄로 접히는 것을 방지. → 파생어 항목 5줄→3줄로 실제에 근접, push 지점이 실제 컬럼 경계와 정렬.
    reserve = (8 if V2 else 12) * ulFillW + estW('가가', em)
    meaningColW = max(colW * 0.35, colW - reserve)
    segs = re.split(r'<br\s*/?>', str(item.get('q') or ''), flags=re.I)

    def _clean(x):
        x = re.sub(r'<[^>]+>', '', x)
        x = x.replace('&nbsp;', ' ')
        return re.sub(r'&[a-z]+;', ' ', x)

    if V2:
        head_joins = len(segs) > 1 and re.search(r'class="wl"', segs[0]) is None
        lines = 0
        carryW = 0.0
        for i in range(len(segs)):
            hasBlank = re.search(r'class="wl"', segs[i]) is not None
            txt = _clean(segs[i])
            if i == 0 and head_joins:
                carryW = numTab + estW(txt, em)   # 표제어는 자체 줄 안 셈, 폭만 첫 뜻줄로 이월
                continue
            w = meaningColW if hasBlank else colW
            base = carryW if carryW else (numTab if i == 0 else 0)
            carryW = 0.0
            lines += max(1, math.ceil((base + estW(txt, em)) / w))
        return max(1, lines)

    lines = 0
    for i in range(len(segs)):
        hasBlank = re.search(r'class="wl"', segs[i]) is not None
        txt = _clean(segs[i])
        w = meaningColW if hasBlank else colW
        start = numTab if i == 0 else 0
        lines += max(1, math.ceil((start + estW(txt, em)) / w))
    return max(1, lines)


def itemSpacingPct(headerXml, ppId):
    if not headerXml or ppId is None:
        return 160
    m = re.search(r'<hh:paraPr id="' + str(ppId) + r'".*?</hh:paraPr>', headerXml, DOT)
    if not m:
        return 160
    sm = re.search(r'lineSpacing type="PERCENT" value="(\d+)"', m.group(0))
    return int(sm.group(1)) if sm else 160


def pageTextHeight(section0):
    pg = re.search(r'<hp:pagePr[^>]*height="(\d+)"', section0)
    if not pg:
        return 75000
    gm = re.search(r'<hp:margin\b[^>]*/>', section0)
    g = gm.group(0) if gm else ''

    def a(nm):
        x = re.search(r'\b' + nm + r'="(\d+)"', g)
        return int(x.group(1)) if x else 0
    return int(pg.group(1)) - a('top') - a('bottom') - a('header') - a('footer')


def build_header_block(prof, fields):
    """동적 2줄 헤더 조립(2026-07-22, print_sample 최종 헤더 반영).
    line1 = {학원}·{반}·출제일 {날짜}[{교재}]  (메타, PARA0 secPr 보존)
    line2 = {제목}   이름 ____ | 점수 ____       (제목 큰 글자 + 이름/점수)
    스켈레톤 헤더 문단의 charPr/paraPr 을 재사용해 스타일 유지."""
    hdr = prof['header']
    para0 = hdr[0]  # secPr + colPr + 메타 텍스트런
    m0 = re.search(r'<hp:run charPrIDRef="(\d+)"', para0)
    metaCP = m0.group(1) if m0 else str(prof['itemCP'])

    # 이름/점수 charPr = '이름' 포함 문단의 charPr(없으면 메타)
    nameCP = metaCP
    for p in hdr:
        cm = re.search(r'<hp:run charPrIDRef="(\d+)"', p)
        if cm and '이름' in ''.join(re.findall(r'<hp:t>(.*?)</hp:t>', p, DOT)):
            nameCP = cm.group(1)
    # 제목 charPr(가장 큰 글자)·제목 문단 pPr 은 buildSection0 이 prof 에 실어 넘김
    titleCP = prof.get('_titleCP') or metaCP
    titlePP = prof.get('_titlePP') or '11'

    def seg(v):
        return esc(str(v)) if v else ''
    parts = [p for p in [seg(fields.get('academy')), seg(fields.get('klass'))] if p]
    if fields.get('date'):
        parts.append('출제일 ' + seg(fields.get('date')))
    line1 = '·'.join(parts)
    if fields.get('book'):
        line1 += '[' + seg(fields.get('book')) + ']'

    # PARA0: <hp:t> 만 line1 로 교체(secPr/colPr 보존)
    p0 = re.sub(r'<hp:t>.*?</hp:t>', '<hp:t>' + line1 + '</hp:t>', para0, count=1, flags=DOT)

    # line2: 제목(큰 글자) + 이름/점수(작은 글자, 맑은고딕 밑줄)
    ulcp = prof.get('ulCP') or nameCP

    def ul(n):
        return '<hp:run charPrIDRef="' + str(ulcp) + '"><hp:t>' + ('_' * n) + '</hp:t></hp:run>'
    runs = ''
    if fields.get('title'):
        runs += runT(titleCP, seg(fields.get('title')))
    runs += runT(nameCP, '\xa0\xa0\xa0이름\xa0') + ul(18) + runT(nameCP, '\xa0|\xa0점수\xa0') + ul(10)
    p1 = mkP(titlePP, runs)
    return [p0, p1]


def buildSection0(templateSection0, groups, opts):
    opts = opts or {}
    prof = profileTemplate(templateSection0)
    prof['ulCP'] = findUnderlineCP(opts.get('headerXml'))
    prof['askGapPP'] = findAskGapPP(opts.get('headerXml'), ASK_GAP_BEFORE) if ASK_GAP_BEFORE > 0 else None

    prof['fullPP'] = resolveFullPP(opts.get('headerXml'), prof['fullPP'])

    bcm = re.search(r'charPrIDRef="(\d+)"', prof['blankRun'])
    blankCid = bcm.group(1) if bcm else None
    if blankCid and opts.get('headerXml'):
        ccm = re.search(r'<hh:charPr id="' + blankCid + r'".*?</hh:charPr>', opts['headerXml'], DOT)
        if ccm and not re.search(r'textColor="#0{6}"', ccm.group(0), re.I):
            blk = blackUnderlineCharPr(opts['headerXml'])
            if blk:
                prof['blankRun'] = re.sub(r'charPrIDRef="\d+"', 'charPrIDRef="' + blk + '"', prof['blankRun'], count=1)

    bcp = findAnswerBorderCP(opts.get('headerXml'))
    if not bcp:
        m2 = re.search(r'charPrIDRef="(\d+)"', prof['blankRun'])
        bcp = (m2.group(1) if m2 else None) or prof['itemCP']
    prof['borderCP'] = bcp

    def blank_fill(m):
        return m.group(1) + re.sub(r'[\s ]', '_', m.group(2)) + m.group(3)
    prof['blankRun'] = re.sub(r'(<hp:t>)([\s\S]*?)(</hp:t>)', blank_fill, prof['blankRun'], count=1)

    em = (opts.get('size') or 11) * 100
    ulW = estW(blankTextOf(prof['blankRun']), em)
    itemStops = tabStops(opts.get('headerXml'), prof['itemPP'])
    fullStops = tabStops(opts.get('headerXml'), prof['fullPP'])
    prof['KItem'] = computeK(prof['itemAnchor'], itemStops, em, ulW, 25695 - 3000 - ulW)
    if prof['itemAnchor'] and itemStops and itemStops['right']:
        ulW2 = itemStops['right'] - itemStops['left'] - prof['KItem']
    else:
        ulW2 = ulW
    prof['KFull'] = computeK(prof['fullAnchor'], fullStops, em, ulW2, 53660 - 4670 - ulW2)

    if (opts.get('columns') or 1) == 2 and itemStops and itemStops['right']:
        prof['ansCol'] = answer_col(itemStops)
        prof['itemLeft'] = itemStops['left']
        prof['itemRight'] = itemStops['right']

    lineHUnit = em * (itemSpacingPct(opts.get('headerXml'), prof['itemPP']) / 100)
    linesPerCol = (pageTextHeight(templateSection0) / lineHUnit) if lineHUnit > 0 else 30
    pageCapLines = max(4, math.floor(2 * linesPerCol) - 3)

    out = []
    # 제목 charPr(가장 큰 글자)·제목 문단 pPr 계산 (헤더 필드 방식·title 치환 공용)
    titleCP = None
    titlePP = None
    if opts.get('headerXml'):
        Hmap = {}
        for mm in re.finditer(r'<hh:charPr\b[^>]*\bid="(\d+)"[^>]*\bheight="(\d+)"', opts['headerXml']):
            Hmap[mm.group(1)] = int(mm.group(2))
        best = -1
        for h in prof['header']:
            cm = re.search(r'<hp:run charPrIDRef="(\d+)"', h)
            if cm and Hmap.get(cm.group(1)) is not None and Hmap[cm.group(1)] > best:
                best = Hmap[cm.group(1)]
                titleCP = cm.group(1)
                pm = re.search(r'paraPrIDRef="(\d+)"', h)
                titlePP = pm.group(1) if pm else None

    if opts.get('header_fields'):
        # 동적 2줄 헤더(2026-07-22): secPr 보존하며 필드로 조립
        prof['_titleCP'] = titleCP
        prof['_titlePP'] = titlePP
        out.extend(build_header_block(prof, opts['header_fields']))
    else:
        def isBlankEnter(p):
            if colPrBlock(p):
                return False
            t = stripLineseg(p)
            joined = ''.join(re.sub(r'</?hp:t>', '', x) for x in re.findall(r'<hp:t>.*?</hp:t>', t, DOT))
            return len(joined) == 0

        hdr = list(prof['header'])
        emptyRun = 0
        for hi in range(len(hdr) - 1, -1, -1):
            if isBlankEnter(hdr[hi]):
                emptyRun += 1
            else:
                break
        if emptyRun > 0:
            hdr = hdr[:len(hdr) - emptyRun]
        for h in hdr:
            out.append(substHeader(h, opts.get('header'), titleCP))

    columns = opts.get('columns') or 1
    curCols = [1]
    prevFull = [False]
    hadPrev = [False]

    for g in groups:
        lc = [estItemLines(it, prof, em) for it in g['items']]
        total = sum(lc)
        avgLines = (total / len(g['items'])) if g['items'] else 1
        structLines = 0
        for it in g['items']:
            structLines += len(re.findall(r'<br\s*/?>', str(it.get('q') or ''), re.I)) + 1
        structLines = structLines / len(g['items']) if g['items'] else 1
        isFull = bool(g.get('full'))
        twocol = (not isFull) and columns == 2
        askPageBreak = columns == 2 and hadPrev[0] and (
            (EDGE_PB_FULL_TO_TWOCOL and twocol and prevFull[0]) or
            (EDGE_PB_TWOCOL_TO_FULL and isFull and not prevFull[0])
        )
        if columns == 2:
            curCols[0] = 1
        out.append(makeAsk(g['ask'], prof, columns == 2, askPageBreak))
        prevFull[0] = isFull
        hadPrev[0] = True

        splitAt = -1
        if twocol:
            if not (CB_SKIP_MULTIPAGE and (total > pageCapLines or avgLines >= 2)):
                acc = 0
                best = float('inf')
                for k in range(1, len(g['items'])):
                    acc += lc[k - 1]
                    diff = abs(2 * acc - total)
                    if diff < best:
                        best = diff
                        splitAt = k

        opts['_qaTargetW'] = 0
        if opts.get('qa'):
            mxA = 0.0
            for it in g['items']:
                anss = []
                hasSpan = False
                for mA in re.finditer(r'data-ans="([^"]*)"', str(it.get('q') or '')):
                    anss.append(mA.group(1))
                    hasSpan = True
                if not hasSpan and it.get('ans'):
                    anss.append(str(it['ans']))
                for a in anss:
                    a = re.sub(r'&[a-z]+;', ' ', a)
                    w = estW(a, em)
                    if w > mxA:
                        mxA = w
            opts['_qaTargetW'] = mxA

        # [컬럼 걸침 감지] 2단에서 각 항목의 추정 줄수(lc)로 컬럼을 채워보며, 남은 공간보다 커서
        #  경계를 넘는 항목 index를 모은다. off면 빈 dict → 개입 없음(기존 동작).
        crossing = {}
        if twocol and COLSPLIT_MODE != 'off':
            colcap = COLSPLIT_COLCAP or max(4, int(linesPerCol))
            pos = COLSPLIT_ASKLINES   # 발문이 첫 컬럼 위를 밀어 내린 만큼(근사)
            for i, h in enumerate(lc):
                if pos != 0 and pos + h > colcap:
                    crossing[i] = ('oversize' if h > colcap else 'straddle')
                    # 개입 후 재개 위치: 1col=새 영역(0), push=다음 컬럼 맨 위(h)
                    pos = 0 if (COLSPLIT_MODE == '1col' or h > colcap) else h
                else:
                    pos += h
                if pos >= colcap:
                    pos = pos - colcap   # 컬럼 꽉 참 → 다음 컬럼으로

        col1fb = prof.get('colPr1') or ('<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0">'
                                        '<hp:colLine type="NONE" width="0.1 mm" color="#000000"/></hp:colPr></hp:ctrl>')
        lastIdx = len(g['items']) - 1
        for i, it in enumerate(g['items']):
            colPre = None
            colBreak = twocol and i == splitAt
            # [lastcol] 그룹(유형)의 '마지막 항목'만 전체폭 1단으로 — 그룹 경계 전환이라
            #  발문(※) full-width 여닫기와 같은 '검증된 경로'(colPr1 직접 선언, 별도 빈줄 없음).
            #  중간항목 1col(01)의 재균형-깨짐 회피. 앞 항목들(1..n-1)은 한글이 col1/col2 균형.
            if twocol and COLSPLIT_MODE == 'lastcol' and i == lastIdx and lastIdx > 0:
                out.append(buildItem(it, it['_n'], prof, opts, col1fb, True, False))
                curCols[0] = 1
                continue
            if twocol and i in crossing and COLSPLIT_MODE == '1col':
                # 이 항목만 전체폭(1단)으로: colPr1 선언 + isFull=True. 다음 항목은 colPr2 재선언(curCols=1).
                out.append(buildItem(it, it['_n'], prof, opts, col1fb, True, False))
                curCols[0] = 1
                continue
            if twocol and i in crossing and COLSPLIT_MODE == 'push':
                colBreak = True   # columnBreak=1 → 다음 컬럼 맨 위로 밀기
            if twocol and curCols[0] != 2:
                colPre = prof['colPr2']
                curCols[0] = 2
            out.append(buildItem(it, it['_n'], prof, opts, colPre, not twocol, colBreak))

    if curCols[0] == 2:
        out.append(closeColPara(prof))
    return prof['prefix'] + ''.join(out) + prof['suffix']


# ── 데이터 정규화(ne-export-common.js / data.hwp.js 대응) ────────────
def normalizePool(pool):
    n = [1]
    result = []
    for g in (pool or []):
        items = []
        for it in (g.get('items') or []):
            it = dict(it)
            it['_n'] = n[0]
            n[0] += 1
            if it.get('ans') is None:
                it['ans'] = it.get('aw') or it.get('a') or ''
            if it.get('fl') is None:
                it['fl'] = (str(it['ans'])[0:1]) if it['ans'] else ''
            items.append(it)
        result.append({'ask': g.get('ask'), 'full': bool(g.get('full')), 'items': items})
    return result


def neReorderFullLast(groups):
    if not groups:
        return groups
    twoCol = [g for g in groups if not g.get('full')]
    fullCol = [g for g in groups if g.get('full')]
    ordered = twoCol + fullCol
    n = 1
    for g in ordered:
        for it in (g.get('items') or []):
            it['_n'] = n
            n += 1
    return ordered


# ── 공개 API ───────────────────────────────────────────────────────
VIEW_FLAGS = {
    'q':     {'qa': False, 'ansOnly': False, 'spell': False},
    'ans':   {'qa': False, 'ansOnly': True,  'spell': False},
    'spell': {'qa': False, 'ansOnly': False, 'spell': True},
    'qa':    {'qa': True,  'ansOnly': False, 'spell': False},
}


def prepare_groups(pool):
    """content(NE_POOL 구조) → normalizePool → neReorderFullLast (v2.6 readGroupsCompat 순서)."""
    return neReorderFullLast(normalizePool(pool))


def generate(section0, header, columns, size, view, title=None):
    """스켈레톤 section0/header + content 없이는 못 씀 — content 는 generate_with_pool 사용.
    (호환용: content 를 별도 인자로) """
    raise NotImplementedError('use generate_with_pool')


def generate_with_pool(section0, header, pool, columns, size, view, title=None, header_fields=None):
    """section0/header(스켈레톤, 줄간격 주입 후여도 무방) + pool(NE_POOL) → (new_section0, new_header).

    header_fields(dict) 지정 시 동적 2줄 헤더 조립(학원·반·날짜·교재·제목).
    미지정 시 기존 동작(스켈레톤 헤더 유지, title 만 치환)."""
    flags = VIEW_FLAGS[view]
    prof0 = profileTemplate(section0)
    fullPP = resolveFullPP(header, prof0['fullPP'])
    newHeader = normalizeHeader(header, {'columns': columns, 'fullPP': fullPP,
                                         'itemPP': prof0['itemPP'], 'itemCP': prof0['itemCP'],
                                         'askPP': prof0['askPP']})
    groups = prepare_groups(pool)
    opts = {'columns': columns, 'size': size, 'qa': flags['qa'], 'spell': flags['spell'],
            'ansOnly': flags['ansOnly'], 'headerXml': newHeader}
    if header_fields:
        # title 을 header_fields 로 흡수(둘 다 오면 header_fields.title 우선)
        hf = dict(header_fields)
        if title and not hf.get('title'):
            hf['title'] = title
        opts['header_fields'] = hf
    elif title:
        opts['header'] = {'title': title}
    newSection = buildSection0(section0, groups, opts)
    return newSection, newHeader
