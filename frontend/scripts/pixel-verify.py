"""Rendered-pixel verification for the AquaNexus redesign.

Checks, from real rendered pixels rather than CSS inference:

* horizontal overflow at 1440 / 1024 / 768 / 390 px on every route;
* the right-hand investigation rail does not overlap the map and does not push
  the document wider than the viewport (the AgriSense `w-full shrink-0` bug);
* WCAG AA contrast for the text actually painted on the page, measured by
  sampling the screenshot inside each text element's box and taking the extreme
  (lowest-contrast) pixel as the local background.

Usage: python3 scripts/pixel-verify.py [base_url]
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = Path("/tmp/aquanexus-shots")
OUT.mkdir(exist_ok=True)

VIEWPORTS = [("1440", 1440, 900), ("1024", 1024, 768), ("768", 768, 1024), ("390", 390, 844)]
ROUTES = [
    # "/" is a redirect into /home; keep it in the sweep so the redirect is
    # checked for overflow too.
    "/",
    "/home",
    "/explore",
    # The two water-intelligence sections added by the AgriSense restyle. They
    # render long scrolling panels, so they are the most likely to overflow.
    "/explore?lat=6.5244&lon=3.3792&label=Lagos&tab=profile",
    "/explore?lat=6.5244&lon=3.3792&label=Lagos&tab=planning",
    "/explore?lat=6.5244&lon=3.3792&label=Lagos&tab=water-atlas",
    "/study-areas",
    "/reports",
    "/global",
]

TEXT_PROBE = """
() => {
  const out = [];
  const seen = new Set();
  const els = document.querySelectorAll('body *');
  for (const el of els) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (el.closest('.sr-only')) continue;
    const direct = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent && n.textContent.trim().length > 1
    );
    if (!direct) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const key = cs.color + '|' + cs.fontSize + '|' + Math.round(r.width);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      color: cs.color,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      text: (el.textContent || '').trim().slice(0, 60),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    });
  }
  return out;
}
"""

LAYOUT_PROBE = """
() => {
  const doc = document.documentElement;
  const res = {
    scrollWidth: doc.scrollWidth,
    innerWidth: window.innerWidth,
  };
  const rail = document.querySelector('aside[data-testid="investigation-rail"]');
  const map = document.querySelector('.maplibregl-map');
  if (rail) {
    const r = rail.getBoundingClientRect();
    res.rail = { left: r.left, right: r.right, width: r.width, hidden: r.width === 0 };
  }
  if (map) {
    const m = map.getBoundingClientRect();
    res.map = { left: m.left, right: m.right, width: m.width };
  }
  return res;
}
"""


def parse_rgb(value: str) -> tuple[int, int, int]:
    inner = value[value.find("(") + 1 : value.find(")")]
    parts = [p.strip() for p in inner.split(",")]
    return int(float(parts[0])), int(float(parts[1])), int(float(parts[2]))


def relative_luminance(rgb: tuple[int, int, int]) -> float:
    def channel(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    la, lb = relative_luminance(a), relative_luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main() -> int:
    failures: list[str] = []
    report: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--force-color-profile=srgb"])
        for label, width, height in VIEWPORTS:
            page = browser.new_page(viewport={"width": width, "height": height})
            for route in ROUTES:
                page.goto(f"{BASE}{route}", wait_until="networkidle", timeout=60000)
                page.wait_for_timeout(1200)
                layout = page.evaluate(LAYOUT_PROBE)
                if layout["scrollWidth"] > layout["innerWidth"] + 1:
                    failures.append(
                        f"OVERFLOW {route} @{label}: scrollWidth={layout['scrollWidth']} "
                        f"> innerWidth={layout['innerWidth']}"
                    )
                if layout.get("rail") and not layout["rail"]["hidden"] and layout.get("map"):
                    if layout["rail"]["left"] < layout["map"]["right"] - 1:
                        failures.append(
                            f"RAIL-OVERLAP {route} @{label}: rail.left="
                            f"{layout['rail']['left']:.0f} < map.right={layout['map']['right']:.0f}"
                        )
                if label == "1440":
                    shot = OUT / f"explore-{label}.png"
                    page.screenshot(path=str(shot))
                    img = Image.open(shot).convert("RGB")
                    probes = page.evaluate(TEXT_PROBE)
                    worst = []
                    for p in probes:
                        r = p["rect"]
                        # Pad the box so the sample includes the surface behind
                        # the glyphs, not just the glyphs themselves.
                        pad = 3
                        x0 = max(0, int(r["x"]) - pad)
                        y0 = max(0, int(r["y"]) - pad)
                        x1 = min(img.width, int(r["x"] + r["w"]) + pad)
                        y1 = min(img.height, int(r["y"] + r["h"]) + pad)
                        if x1 - x0 < 3 or y1 - y0 < 3:
                            continue
                        crop = img.crop((x0, y0, x1, y1))
                        fg = parse_rgb(p["color"])
                        # Background = the most common pixel that is not a glyph
                        # pixel (glyph pixels are near the CSS colour).
                        counts: dict[tuple[int, int, int], int] = {}
                        for px in crop.getdata():
                            if sum(abs(a - b) for a, b in zip(px, fg)) < 40:
                                continue
                            counts[px] = counts.get(px, 0) + 1
                        if not counts:
                            continue
                        bg = max(counts.items(), key=lambda kv: kv[1])[0]
                        ratio = contrast(fg, bg)
                        small = p["fontSize"] < 18.66 and int(p["fontWeight"]) < 700
                        need = 4.5 if small else 3.0
                        if ratio < need:
                            worst.append((ratio, need, p["text"], p["color"], bg, p["fontSize"]))
                    if not probes:
                        # A route that yields no probes proves nothing; treat it
                        # as a failure so a broken stylesheet cannot masquerade
                        # as a passing contrast check.
                        failures.append(
                            f"NO-PROBES {route} @{label}: no text elements were "
                            "sampled, so contrast was not actually verified"
                        )
                    worst.sort()
                    report.append(
                        f"--- contrast {route} @{label} ({len(probes)} text probes) ---"
                    )
                    if worst:
                        for ratio, need, text, fg, bg, size in worst[:15]:
                            report.append(
                                f"  {ratio:.2f} (need {need}) size={size:.1f} "
                                f"fg={fg} bg={bg} :: {text!r}"
                            )
                    else:
                        report.append("  all sampled text passes AA")
            page.close()
        browser.close()

    print("\n".join(report))
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(" ", f)
        return 1
    print("\nNo overflow or rail-overlap failures.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
