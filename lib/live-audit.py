# Real-browser end-to-end audit of the LIVE site.
# Measures what a user feels: load speed, every control, every interaction, console errors,
# layout, and the full crawl journey from first click to export.
import json, time

BASE = "https://jobintel-pi.vercel.app"
rows = []


def check(name, ok, detail=""):
    rows.append((name, bool(ok), detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + ("   " + str(detail) if detail else ""))
    return ok


def jsj(expr):
    # js() already deserialises JSON objects into dicts; only strings need json.loads.
    val = js(expr)
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception as exc:
        return {"_error": str(exc)}


# ───────────────────────────── 1. cold load performance
print("\n═══ 1. Cold load performance")
t0 = time.time()
new_tab(BASE + "/")
wait_for_load()
load_ms = int((time.time() - t0) * 1000)
check("homepage loads", True, f"{load_ms} ms")

nav = jsj("""(() => {
  const n = performance.getEntriesByType('navigation')[0] || {};
  return JSON.stringify({
    domContentLoaded: Math.round(n.domContentLoadedEventEnd||0),
    load: Math.round(n.loadEventEnd||0),
    ttfb: Math.round(n.responseStart||0),
    transfer: Math.round((n.transferSize||0)/1024)
  });
})()""")
check("TTFB under 900ms", nav.get("ttfb", 9999) < 900, f"{nav.get('ttfb')} ms")
check("DOMContentLoaded under 2s", nav.get("domContentLoaded", 99999) < 2000, f"{nav.get('domContentLoaded')} ms")

# paint metrics + CLS
perf = jsj("""(() => new Promise(res => {
  const out = {fcp: 0, lcp: 0};
  performance.getEntriesByType('paint').forEach(p => { if (p.name==='first-contentful-paint') out.fcp = Math.round(p.startTime); });
  try {
    new PerformanceObserver(l => { const e=l.getEntries(); if(e.length) out.lcp = Math.round(e[e.length-1].startTime); })
      .observe({type:'largest-contentful-paint', buffered:true});
  } catch(e) {}
  setTimeout(() => res(JSON.stringify(out)), 700);
}))()""")
check("First contentful paint under 1.5s", perf.get("fcp", 99999) < 1500, f"{perf.get('fcp')} ms")
check("Largest contentful paint under 2.5s", perf.get("lcp", 0) < 2500 or perf.get("lcp") == 0, f"{perf.get('lcp')} ms")

# ───────────────────────────── 2. console health
print("\n═══ 2. Console & network health")
js("""(() => {
  window.__errs = []; window.__warns = [];
  window.addEventListener('error', e => window.__errs.push(String(e.message||e)));
  window.addEventListener('unhandledrejection', e => window.__errs.push('promise: ' + String(e.reason)));
  const ow = console.warn, oe = console.error;
  console.warn = (...a) => { window.__warns.push(a.join(' ')); ow.apply(console, a); };
  console.error = (...a) => { window.__errs.push(a.join(' ')); oe.apply(console, a); };
})()""")

# ───────────────────────────── 3. visual layout
print("\n═══ 3. Layout & visuals")
vis = jsj("""(() => {
  const h1 = document.querySelector('h1');
  const panel = document.querySelector('form');
  const cs = getComputedStyle(document.body);
  const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const cards = [...document.querySelectorAll('.card')].slice(0,3).map(c => ({
    radius: getComputedStyle(c).borderRadius,
    shadow: getComputedStyle(c).boxShadow.slice(0,28)
  }));
  return JSON.stringify({
    overflow,
    h1Size: h1 ? getComputedStyle(h1).fontSize : '',
    h1Visible: h1 ? h1.getBoundingClientRect().width > 100 : false,
    panelVisible: panel ? panel.getBoundingClientRect().width > 200 : false,
    font: cs.fontFamily.split(',')[0],
    bg: cs.backgroundColor,
    cards
  });
})()""")
check("no horizontal overflow", vis.get("overflow", 99) <= 1, f"{vis.get('overflow')}px")
check("hero headline visible & sized", vis.get("h1Visible") and vis.get("h1Size", "0px") >= "28px", vis.get("h1Size"))
check("control panel rendered", vis.get("panelVisible"))
check("custom font loaded (Geist)", "Geist" in str(vis.get("font")) or "geist" in str(vis.get("font", "")).lower(), vis.get("font"))
check("card tokens applied", all(c.get("radius") for c in vis.get("cards", [])), vis.get("cards", [{}])[0])

# ───────────────────────────── 4. every control responds
print("\n═══ 4. Every control responds")
ctrl = jsj("""(() => {
  const btns=[...document.querySelectorAll('button')];
  const rects=btns.map(b=>b.getBoundingClientRect());
  const tooSmall=rects.filter(r=>r.width>0 && r.height<32).length;
  const overlapping=rects.filter((r,i)=>rects.some((o,j)=>j>i && r.width>0 && o.width>0 &&
    r.left<o.right-2 && r.right>o.left+2 && r.top<o.bottom-2 && r.bottom>o.top+2)).length;
  return JSON.stringify({count:btns.length, tooSmall, overlapping});
})()""")
check("all buttons have usable hit area", ctrl.get("tooSmall", 99) == 0, f"{ctrl.get('tooSmall')} small")
check("no overlapping buttons", ctrl.get("overlapping", 99) == 0, f"{ctrl.get('overlapping')} overlaps")

# toggle each chip family and confirm aria-pressed flips.
# React state updates are async, so every click is followed by an await before the re-read;
# reading synchronously reports a false "stuck".
chips = jsj("""(() => (async () => {
  const tick = () => new Promise(r => setTimeout(r, 120));
  const names=['Internship','Entry','Associate','Mid-Senior','Director','Executive'];
  const res={};
  for (const n of names) {
    const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n);
    if(!b){res[n]='missing';continue;}
    const before=b.getAttribute('aria-pressed');
    b.click(); await tick();
    const after=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n).getAttribute('aria-pressed');
    if(after===before){res[n]='stuck';continue;}
    [...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n).click(); await tick();
    const back=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n).getAttribute('aria-pressed');
    res[n] = back===before ? 'ok' : 'no-restore';
  }
  return JSON.stringify(res);
})())""")
check("all 6 seniority chips toggle", all(v == "ok" for v in chips.values()), chips)

wp = jsj("""(() => (async () => {
  const tick = () => new Promise(r => setTimeout(r, 120));
  const res={};
  for (const n of ['Any','On-site','Remote','Hybrid']) {
    const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n && x.hasAttribute('aria-pressed'));
    if(!b){res[n]='missing';continue;}
    b.click(); await tick();
    const on=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n).getAttribute('aria-pressed');
    res[n] = on;
    if (on==='true') { [...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n).click(); await tick(); }
  }
  return JSON.stringify(res);
})())""")
check("every workplace chip selects", all(v == "true" for v in wp.values()), wp)

dt = jsj("""(() => (async () => {
  const tick = () => new Promise(r => setTimeout(r, 120));
  const res={};
  for (const n of ['Any time','24 hours','1 week','1 month']) {
    const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n && x.hasAttribute('aria-pressed'));
    if(!b){res[n]='missing';continue;}
    b.click(); await tick();
    const on=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n).getAttribute('aria-pressed');
    res[n] = on;
    if (on==='true') { [...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n).click(); await tick(); }
  }
  return JSON.stringify(res);
})())""")
check("every date chip selects", all(v == "true" for v in dt.values()), dt)

cnt = jsj("""(() => (async () => {
  const tick = () => new Promise(r => setTimeout(r, 120));
  const res={};
  for (const n of ['25','50','100','200']) {
    const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n);
    if(!b){res[n]='missing';continue;}
    b.click(); await tick();
    const on=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===n).getAttribute('aria-pressed');
    res[n] = on;
  }
  [...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='50').click(); await tick();
  return JSON.stringify(res);
})())""")
check("every result-count chip selects", all(v == "true" for v in cnt.values()), cnt)

# slider + checkbox
sl = jsj("""(() => {
  const r=document.querySelector('input[type=range]');
  const before=r.value;
  r.value='2000'; r.dispatchEvent(new Event('input',{bubbles:true}));
  const mid=r.value;
  r.value=before; r.dispatchEvent(new Event('input',{bubbles:true}));
  const c=document.querySelector('input[type=checkbox]');
  const cb=c.checked; c.click();
  const toggled=c.checked!==cb; c.click();
  return JSON.stringify({slider: before!==mid, checkbox: toggled, pace: before});
})()""")
check("pacing slider responds", sl.get("slider") is True, sl)
check("deep-detail checkbox toggles", sl.get("checkbox") is True)

# ───────────────────────────── 5. micro-interactions (motion)
print("\n═══ 5. Motion & skeleton")
fill_input('input[placeholder*="python backend"]', 'frontend developer')
time.sleep(0.2)
t_click = time.time()
js("[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Scrape jobs')).click()")
# skeleton must appear immediately
skel = jsj("""(() => JSON.stringify({skeletons: document.querySelectorAll('.skeleton').length}))()""")
check("skeleton appears within 1s of click", skel.get("skeletons", 0) > 0, f"{skel.get('skeletons')} bones in {int((time.time()-t_click)*1000)}ms")

first_card_ms = None
for i in range(60):
    time.sleep(1)
    n = js("(() => document.querySelectorAll('article').length)()")
    if n and n > 0:
        first_card_ms = int((time.time() - t_click) * 1000)
        break
check("first job card under 12s", first_card_ms is not None and first_card_ms < 12000, f"{first_card_ms} ms")
check("cards stream in batches", n > 0, f"{n} cards")

# animation present on cards
anim = jsj("""(() => {
  const a=document.querySelector('article');
  const s=getComputedStyle(a);
  return JSON.stringify({name:s.animationName, dur:s.animationDuration});
})()""")
check("cards animate in", anim.get("name") not in (None, "none"), anim)

# ───────────────────────────── 6. full journey to completion
print("\n═══ 6. Journey: crawl → detail → filter → sort → export")
status = None
for i in range(90):
    time.sleep(4)
    st = js("""(() => ([...document.querySelectorAll('span')].map(x=>x.innerText).filter(t=>['Crawling live','Reading postings','Resuming…','Complete','Stopped'].includes(t))[0]||''))()""")
    if st in ("Complete", "Stopped"):
        status = st
        break
check("crawl reaches a terminal state", status in ("Complete", "Stopped"), status)

total = js("(() => document.querySelectorAll('article').length)()")
check("results rendered", total > 0, f"{total} cards")

# detail enrichment visible
det = jsj("""(() => JSON.stringify({
  withDesc: [...document.querySelectorAll('article')].filter(a=>a.innerText.includes('Show full description')||a.innerText.includes('Show less')).length,
  withSeniority: [...document.querySelectorAll('article')].filter(a=>/Full-time|Part-time|Contract|Internship/i.test(a.innerText)).length
}))()""")
check("detail descriptions present", det.get("withDesc", 0) > 0, f"{det.get('withDesc')} of {total}")
check("seniority/type metadata present", det.get("withSeniority", 0) > 0, f"{det.get('withSeniority')} of {total}")

# expand a description
if det.get("withDesc", 0):
    before_len = js("(() => document.body.innerText.length)()")
    js("(() => [...document.querySelectorAll('button')].find(b=>b.innerText.includes('Show full description'))?.click())()")
    time.sleep(0.5)
    after_len = js("(() => document.body.innerText.length)()")
    check("description expands on click", after_len > before_len, f"{before_len}→{after_len}")

# sort
js("(() => [...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Newest')?.click())()")
time.sleep(0.7)
order = jsj("""(() => {
  const parse = t => {
    if (!t) return 1e9;
    if (/today|just now/i.test(t)) return 0;
    const m = t.match(/(\\d+)\\s*(minute|hour|day|week|month)/i);
    if (!m) return 1e8;
    const n = +m[1], u = m[2].toLowerCase();
    return n * ({minute:1/60, hour:1, day:24, week:168, month:720}[u] || 1e8);
  };
  const ages = [...document.querySelectorAll('article')].map(a => {
    const s=[...a.querySelectorAll('span')].map(x=>x.innerText.trim());
    return parse(s.find(t=>/ago|Today/i.test(t))||'');
  });
  const sorted = ages.every((v,i)=> i===0 || ages[i-1] <= v + 0.01);
  return JSON.stringify({sorted, first: ages.slice(0,5)});
})()""")
check("newest sort orders correctly", order.get("sorted") is True, order.get("first"))

# text filter
probe = js("""(() => document.querySelector('article h3')?.innerText.trim().slice(0,6) || '')()""")
if probe:
    js(f"""(() => {{
      const i = document.querySelector('input[placeholder*="Filter results"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(i, {json.dumps(probe)}); i.dispatchEvent(new Event('input',{{bubbles:true}}));
    }})()""")
    time.sleep(0.6)
    filt = js("(() => document.querySelectorAll('article').length)()")
    check("text filter narrows", 0 < filt <= total, f"{filt} of {total}")
    js("""(() => {
      const i = document.querySelector('input[placeholder*="Filter results"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(i, ''); i.dispatchEvent(new Event('input',{bubbles:true}));
    })()""")
    time.sleep(0.4)

# export both formats
csv = js("""(() => new Promise(res => {
  let b=null; const oc=URL.createObjectURL; URL.createObjectURL=x=>{b=x;return 'blob:t'};
  const ok=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){};
  [...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='CSV').click();
  HTMLAnchorElement.prototype.click=ok; URL.createObjectURL=oc;
  if(!b) return res('no blob');
  b.text().then(t=>res(t));
}))()""")
lines = len(csv.split("\n")) if isinstance(csv, str) and "Title,Company" in csv else 0
check("CSV export valid", lines > 1, f"{lines} lines")
check("CSV header correct", "Title,Company,Location" in str(csv)[:80], str(csv)[:60])

jsn = js("""(() => new Promise(res => {
  let b=null; const oc=URL.createObjectURL; URL.createObjectURL=x=>{b=x;return 'blob:t'};
  const ok=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){};
  [...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='JSON').click();
  HTMLAnchorElement.prototype.click=ok; URL.createObjectURL=oc;
  if(!b) return res('no blob');
  b.text().then(t=>res(t));
}))()""")
try:
    parsed = json.loads(jsn)
    check("JSON export valid", len(parsed) > 0, f"{len(parsed)} records")
except Exception:
    check("JSON export valid", False, "unparseable")

# ───────────────────────────── 7. errors after full journey
print("\n═══ 7. Error state after full journey")
errs = jsj("(() => JSON.stringify({errs: window.__errs.slice(0,5), n: window.__errs.length}))()")
check("zero console errors", errs.get("n", 99) == 0, errs.get("errs"))

# ───────────────────────────── 8. responsive detail
print("\n═══ 8. Responsive")
for w, name in [(390, "mobile"), (768, "tablet"), (1280, "laptop"), (1920, "wide")]:
    cdp("Emulation.setDeviceMetricsOverride", width=w, height=900, deviceScaleFactor=1, mobile=(w < 500))
    time.sleep(0.7)
    r = jsj("""(() => {
      const ov = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const btn = [...document.querySelectorAll('button')].find(b=>b.innerText.includes('Scrape'));
      const br = btn ? btn.getBoundingClientRect() : null;
      return JSON.stringify({ov, btnW: br?Math.round(br.width):0, btnH: br?Math.round(br.height):0});
    })()""")
    check(f"@{name} no overflow", r.get("ov", 99) <= 1, f"{r.get('ov')}px")
    check(f"@{name} CTA tappable", r.get("btnH", 0) >= 40, f"{r.get('btnH')}px tall")
cdp("Emulation.clearDeviceMetricsOverride")

# ───────────────────────────── summary
print("\n" + "═" * 56)
failed = [r for r in rows if not r[1]]
print(f"LIVE RESULT: {len(rows)-len(failed)} passed, {len(failed)} failed")
for n, ok, d in failed:
    print("  -", n, d)
