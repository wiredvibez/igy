"""Adds slide transitions and entrance animations to the deck written by build-deck.js.

Shapes named "a|<effect>|<delayMs>[|<emphasis>@<delayMs>]|<n>" get an entrance effect that
starts on its own when the slide appears ("With Previous" + delay), so one click always means
"next slide". transitions.json holds one transition key per slide.

Usage: python animate.py deck.pptx transitions.json out.pptx
"""

import json
import re
import sys
import zipfile

P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main"
P15 = "http://schemas.microsoft.com/office/powerpoint/2012/main"

# key -> (inner element xml, namespace needed, duration ms)
TRANSITIONS = {
    "fade": ("<p:fade/>", None, 700),
    "push": ('<p:push dir="l"/>', None, 600),
    "p14:vortex": ('<p14:vortex dir="r"/>', "p14", 2000),
    "p14:ripple": ('<p14:ripple dir="center"/>', "p14", 1400),
    "p14:honeycomb": ("<p14:honeycomb/>", "p14", 2500),
    "p14:gallery": ('<p14:gallery dir="r"/>', "p14", 1100),
    "p14:switch": ('<p14:switch dir="r"/>', "p14", 1100),
    "p14:prism": ('<p14:prism dir="r"/>', "p14", 1200),
    "p14:flip": ('<p14:flip dir="r"/>', "p14", 1100),
    "p14:conveyor": ('<p14:conveyor dir="r"/>', "p14", 1200),
    "p14:flash": ("<p14:flash/>", "p14", 1000),
    "p15:airplane": ('<p15:prstTrans prst="airplane"/>', "p15", 2000),
    "p15:origami": ('<p15:prstTrans prst="origami"/>', "p15", 2000),
}


def transition_xml(key):
    inner, ns, dur = TRANSITIONS[key]
    if ns is None:
        return f'<p:transition spd="med">{inner}</p:transition>'
    decl = f'xmlns:p14="{P14}"' + (f' xmlns:p15="{P15}"' if ns == "p15" else "")
    return (
        '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
        f'<mc:Choice {decl} Requires="{ns}">'
        f'<p:transition spd="slow" p14:dur="{dur}">{inner}</p:transition>'
        "</mc:Choice>"
        '<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback>'
        "</mc:AlternateContent>"
    )


class Ids:
    def __init__(self, start):
        self.n = start

    def next(self):
        self.n += 1
        return self.n


def tgt(spid):
    return f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'


def show(ids, spid):
    return (
        f'<p:set><p:cBhvr><p:cTn id="{ids.next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
        f"{tgt(spid)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>"
        '<p:to><p:strVal val="visible"/></p:to></p:set>'
    )


def fade_in(ids, spid, dur):
    return (
        f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{ids.next()}" dur="{dur}"/>'
        f"{tgt(spid)}</p:cBhvr></p:animEffect>"
    )


def anim(ids, spid, attr, keys, dur, extra=""):
    """keys: list of (time 0-100000, value string)."""
    tavs = "".join(
        f'<p:tav tm="{tm}"><p:val><p:strVal val="{val}"/></p:val></p:tav>' for tm, val in keys
    )
    return (
        f'<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="{ids.next()}" dur="{dur}" fill="hold"{extra}/>'
        f"{tgt(spid)}<p:attrNameLst><p:attrName>{attr}</p:attrName></p:attrNameLst></p:cBhvr>"
        f"<p:tavLst>{tavs}</p:tavLst></p:anim>"
    )


# effect -> (presetID, presetSubtype, builder)
def eff_fade(ids, spid):
    return show(ids, spid) + fade_in(ids, spid, 600)


def eff_pop(ids, spid):
    # Zoom with a small overshoot, so stickers "pop" onto the slide.
    keys = [(0, "0"), (70000, "#ppt_w*1.12"), (100000, "#ppt_w")]
    keys_h = [(0, "0"), (70000, "#ppt_h*1.12"), (100000, "#ppt_h")]
    return (
        show(ids, spid)
        + anim(ids, spid, "ppt_w", keys, 650)
        + anim(ids, spid, "ppt_h", keys_h, 650)
        + fade_in(ids, spid, 300)
    )


def eff_rise(ids, spid):
    return (
        show(ids, spid)
        + fade_in(ids, spid, 700)
        + anim(ids, spid, "ppt_x", [(0, "#ppt_x"), (100000, "#ppt_x")], 700, ' decel="100000"')
        + anim(ids, spid, "ppt_y", [(0, "#ppt_y+.1"), (100000, "#ppt_y")], 700, ' decel="100000"')
    )


def eff_fly(side):
    start = "1+#ppt_w/2" if side == "r" else "0-#ppt_w/2"

    def build(ids, spid):
        return (
            show(ids, spid)
            + anim(ids, spid, "ppt_x", [(0, start), (100000, "#ppt_x")], 650, ' decel="100000"')
            + anim(ids, spid, "ppt_y", [(0, "#ppt_y"), (100000, "#ppt_y")], 650, ' decel="100000"')
        )

    return build


def eff_drop(ids, spid):
    # Falls in from above and bounces once.
    keys = [(0, "0-#ppt_h/2"), (62000, "#ppt_y+.025"), (82000, "#ppt_y-.012"), (100000, "#ppt_y")]
    return (
        show(ids, spid)
        + anim(ids, spid, "ppt_x", [(0, "#ppt_x"), (100000, "#ppt_x")], 800)
        + anim(ids, spid, "ppt_y", keys, 800)
    )


ENTRANCE = {
    "fade": (10, 0, eff_fade),
    "pop": (53, 16, eff_pop),
    "rise": (42, 0, eff_rise),
    "flyR": (2, 2, eff_fly("r")),
    "flyL": (2, 8, eff_fly("l")),
    "drop": (2, 1, eff_drop),
}


def teeter(ids, spid):
    # PowerPoint's "Teeter" emphasis: a quick wiggle (60000 = 1 degree, relative).
    steps = [(120000, 100, 0), (-240000, 200, 100), (240000, 200, 300), (-240000, 200, 500), (120000, 100, 700)]
    out = ""
    for by, dur, delay in steps:
        out += (
            f'<p:animRot by="{by}"><p:cBhvr><p:cTn id="{ids.next()}" dur="{dur}" fill="hold">'
            f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst></p:cTn>{tgt(spid)}'
            "<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>"
        )
    return out


def effect_par(ids, spid, preset, cls, subtype, grp, delay, body_fn):
    ctn_id = ids.next()
    body = body_fn(ids, spid)
    return (
        f'<p:par><p:cTn id="{ctn_id}" presetID="{preset}" presetClass="{cls}" presetSubtype="{subtype}" '
        f'fill="hold" grpId="{grp}" nodeType="withEffect"><p:stCondLst><p:cond delay="{delay}"/></p:stCondLst>'
        f"<p:childTnLst>{body}</p:childTnLst></p:cTn></p:par>"
    )


SHAPE_RE = re.compile(r'<p:(nvSpPr|nvPicPr)><p:cNvPr id="(\d+)" name="(a\|[^"]*)"')


def timing_xml(slide_xml):
    shapes = SHAPE_RE.findall(slide_xml)
    if not shapes:
        return ""
    ids = Ids(4)  # 1..4 are used by the fixed wrapper below
    effects = []
    builds = []
    for kind, spid, name in shapes:
        parts = name.split("|")
        effect, delay = parts[1], int(parts[2])
        emph = parts[3] if len(parts) > 4 else None
        preset, subtype, fn = ENTRANCE[effect]
        effects.append((delay, effect_par(ids, spid, preset, "entr", subtype, 0, delay, fn)))
        is_sp = kind == "nvSpPr"
        if is_sp:
            builds.append(f'<p:bldP spid="{spid}" grpId="0" animBg="1"/>')
        if emph:
            eff, edelay = emph.split("@")
            assert eff == "teeter", eff
            effects.append((int(edelay), effect_par(ids, spid, 32, "emph", 0, 1, int(edelay), teeter)))
            if is_sp:
                builds.append(f'<p:bldP spid="{spid}" grpId="1" animBg="1"/>')
    effects.sort(key=lambda e: e[0])
    inner = "".join(e[1] for e in effects)
    bld = f"<p:bldLst>{''.join(builds)}</p:bldLst>" if builds else ""
    return (
        '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
        '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
        '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/>'
        '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>'
        '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
        f"{inner}"
        "</p:childTnLst></p:cTn></p:par>"
        "</p:childTnLst></p:cTn></p:par>"
        "</p:childTnLst></p:cTn>"
        '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
        '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>'
        "</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>"
        f"{bld}</p:timing>"
    )


def clean_names(slide_xml):
    """Swap the animation tags for readable names in PowerPoint's selection pane."""

    def repl(m):
        parts = m.group(3).split("|")
        return f'<p:{m.group(1)}><p:cNvPr id="{m.group(2)}" name="{parts[1]} {parts[-1]}"'

    return SHAPE_RE.sub(repl, slide_xml)


RUN_LINK_RE = re.compile(
    r'<a:hlinkClick r:id="(rId\d+)"[^>]*?tooltip="([^"]*)"[^>]*?(?:/>|>.*?</a:hlinkClick>)', re.S
)


def lift_links(slide_xml):
    """pptxgenjs can only link a text run (underlined, and only the letters are clickable).
    Move each run link onto its shape, so the whole button is clickable and keeps its look."""

    def fix(m):
        sp = m.group(0)
        link = RUN_LINK_RE.search(sp)
        if not link:
            return sp
        sp = RUN_LINK_RE.sub("", sp).replace(' u="sng"', "")
        shape_link = f'<a:hlinkClick r:id="{link.group(1)}" tooltip="{link.group(2)}"/>'
        sp, n = re.subn(r"(<p:cNvPr [^>]*>)(</p:cNvPr>)", rf"\g<1>{shape_link}\g<2>", sp, count=1)
        assert n == 1, "linked shape without an open cNvPr"
        return sp

    return re.sub(r"<p:sp>.*?</p:sp>", fix, slide_xml, flags=re.S)


def main(src, transitions_path, dst):
    transitions = json.load(open(transitions_path))
    zin = zipfile.ZipFile(src)
    slide_names = [n for n in zin.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
    assert len(slide_names) == len(transitions), (len(slide_names), len(transitions))
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            m = re.fullmatch(r"ppt/slides/slide(\d+)\.xml", item.filename)
            if m:
                xml = data.decode("utf-8")
                idx = int(m.group(1)) - 1
                extra = transition_xml(transitions[idx]) + timing_xml(xml)
                xml = lift_links(clean_names(xml))
                assert "</p:clrMapOvr>" in xml
                xml = xml.replace("</p:clrMapOvr>", "</p:clrMapOvr>" + extra, 1)
                data = xml.encode("utf-8")
            zout.writestr(item, data)
    print(f"wrote {dst}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
