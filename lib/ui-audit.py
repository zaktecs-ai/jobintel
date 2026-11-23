import json
import time

base_url = "http://localhost:3210"
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("  OK  " if cond else "  FAIL ") + name + ("  " + str(detail) if detail else ""))


js_read = "(() => JSON.stringify({status: [...document.querySelectorAll('span')].map(x=>x.innerText).filter(t=>['Crawling live','Reading postings','Resuming','Complete','Stopped','Ready'].includes(t))[0]||'', cards: document.querySelectorAll('article').length, errs: (window.__errs||[]).length}))()"


def state():
    return json.loads(js(js_read))

import json
import time

BASE = "http://localhost:3210"
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("  OK  " if cond else "  FAIL ") + name + ("  " + str(detail) if detail else ""))


def state():
    return json.loads(js(js_read))


# ─────────────────────────────────────────────── A. structure
print("\n── A. Structure & accessibility")
new_tab(base_url + "/")
wait_for_load()
js("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));")
info = json.loads(js("""(() => {
  const btn = [...document.querySelectorAll('button')];
  const inputs = [...document.querySelectorAll('input')];
  return JSON.stringify({
    h1: !!document.querySelector('h1'),
    lang: document.documentElement.lang,
    title: document.title,
    inputs: inputs.length,
    labelledInputs: inputs.filter(i => i.getAttribute('aria-label') || i.placeholder || i.closest('label')).length,
    buttons: btn.length,
    typeButtons: btn.filter(b=>b.type==='submit').length,
    hasRange: !!document.querySelector('input[type=range]'),
    hasCheckbox: !!document.querySelector('input[type=checkbox]'),
    cards: document.querySelectorAll('article').length,
    emptyState: document.body.innerText.includes('Nothing crawled yet'),
  });
})()"""))
check("h1 present", info["h1"])
check("lang attribute", info["lang"] == "en", info["lang"])
check("title set", "JobIntel" in info["title"], info["title"])
check("all inputs labelled", info["labelledInputs"] == info["inputs"], f"{info['labelledInputs']}/{info['inputs']}")
check("single submit button", info["typeButtons"] == 1, info["typeButtons"])
check("range slider exists", info["hasRange"])
check("deep-detail checkbox exists", info["hasCheckbox"])
check("empty state shown initially", info["emptyState"])

# ─────────────────────────────────────────────── B. form validation
print("\n── B. Form controls & validation")
js("""(() => {
  const i = document.querySelector('input[placeholder*="python backend"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(i, ''); i.dispatchEvent(new Event('input',{bubbles:true}));
})()""")
time.sleep(0.4)
disabled = js("""(() => [...document.querySelectorAll('button')].find(b=>b.innerText.includes('Scrape jobs'))?.disabled)()""")
check("submit disabled with empty keywords", disabled is True)

fill_input('input[placeholder*="python backend"]', "qa engineer")
time.sleep(0.3)
enabled = js("""(() => ![...document.querySelectorAll('button')].find(b=>b.innerText.includes('Scrape jobs'))?.disabled)()""")
check("submit enabled with keywords", enabled is True)

# location chip sets value
js("""(() => [...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Karachi').click())()""")
time.sleep(0.3)
loc = js("""(() => document.querySelector('input[placeholder*="Lahore, Pakistan"]')?.value)()""")
check("location chip fills field", loc == "Karachi, Pakistan", loc)

# experience toggle
js("""(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Entry'); b.click(); b.click(); b.click(); })()""")
time.sleep(0.3)
pressed = js("""(() => [...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Entry')?.getAttribute('aria-pressed'))()""")
check("experience chip toggles (3 clicks = on)", pressed == "true", pressed)

# ─────────────────────────────────────────────── C. live run + filters
print("\n── C. Live crawl, filters, sort")
js("""(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Entry'); if(b.getAttribute('aria-pressed')==='true') b.click(); })()""")
time.sleep(0.2)
js("""(() => [...document.querySelectorAll('button')].find(b=>b.innerText.includes('Scrape jobs')).click())()""")

started = False
for _ in range(18):
    time.sleep(8)
    s = state()
    if s["cards"] > 0:
        started = True
        break
check("stream produced cards", started, s)

# filter by text
first_title = js("""(() => document.querySelector('article h3')?.innerText.trim())()""")
probe = (first_title or "")[:8]
js(f"""(() => {{
  const i = document.querySelector('input[placeholder*="Filter results"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(i, {json.dumps(probe)}); i.dispatchEvent(new Event('input',{{bubbles:true}}));
}})()""")
time.sleep(0.6)
after_filter = state()["cards"]
check("text filter narrows results", after_filter >= 1 and after_filter < 999, f"{after_filter} cards for '{probe}'")

js("""(() => {
  const i = document.querySelector('input[placeholder*="Filter results"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(i, ''); i.dispatchEvent(new Event('input',{bubbles:true}));
})()""")
time.sleep(0.5)
restored = state()["cards"]
check("clearing filter restores all", restored > after_filter, f"{after_filter}→{restored}")

# sort
js("""(() => [...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Newest')?.click())()""")
time.sleep(0.5)
sorted_ok = js("""(() => {
  const dates = [...document.querySelectorAll('article')].map(a=>{
    const m = a.innerText.match(/(\\d{4}-\\d{2}-\\d{2})/); return m?m[1]:null;
  }).filter(Boolean);
  return JSON.stringify({count: dates.length, desc: dates.every((d,i)=> i===0 || dates[i-1] >= d)});
})()""")
so = json.loads(sorted_ok)
check("newest sort is descending", so["desc"] or so["count"] < 2, so)

# freshness chip
js("""(() => [...document.querySelectorAll('button')].find(b=>b.innerText.includes('Posted last 3 days'))?.click())()""")
time.sleep(0.6)
fresh = state()["cards"]
fresh_ok = js("""(() => {
  const bad = [...document.querySelectorAll('article')].filter(a=>{
    const m = a.innerText.match(/(\\d{4}-\\d{2}-\\d{2})/); if(!m) return false;
    return (Date.now() - new Date(m[1]+'T00:00:00Z').getTime())/86400000 > 4;
  }).length;
  return JSON.stringify({shown: document.querySelectorAll('article').length, stale: bad});
})()""")
fo = json.loads(fresh_ok)
check("3-day freshness chip hides stale jobs", fo["stale"] == 0, fo)
js("""(() => [...document.querySelectorAll('button')].find(b=>b.innerText.includes('Posted last 3 days'))?.click())()""")

# ─────────────────────────────────────────────── D. export
print("\n── D. Export")
csv_ok = js("""(() => {
  const b = [...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='CSV');
  return JSON.stringify({exists: !!b, disabled: b?.disabled});
})()""")
co = json.loads(csv_ok)
check("CSV button enabled with results", co["exists"] and not co["disabled"], co)
check("JSON button enabled with results",
      js("""(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='JSON'); return !!b && !b.disabled; })()""") is True)

# description expansion
before = js("""(() => document.body.innerText.includes('Show full description'))()""")
if before:
    js("""(() => [...document.querySelectorAll('button')].find(b=>b.innerText.includes('Show full description'))?.click())()""")
    time.sleep(0.4)
    after = js("""(() => document.body.innerText.includes('Show less'))()""")
    check("description expands", after is True)

# ─────────────────────────────────────────────── E. edge cases
print("\n── E. Edge cases")
# XSS-style keyword must not break render
js("""(() => {
  const i = document.querySelector('input[placeholder*="python backend"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(i, '<img src=x onerror=alert(1)>'); i.dispatchEvent(new Event('input',{bubbles:true}));
})()""")
time.sleep(0.3)
errs_after = state()["errs"]
check("no JS errors after special-char input", errs_after == 0, errs_after)

# ─────────────────────────────────────────────── F. responsive
print("\n── F. Responsive overflow")
for w, label in [(390, "mobile"), (768, "tablet"), (1440, "desktop")]:
    cdp("Emulation.setDeviceMetricsOverride", width=w, height=900, deviceScaleFactor=1, mobile=(w < 500))
    time.sleep(0.7)
    ov = js("""(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)()""")
    check(f"no horizontal overflow @{label} ({w}px)", ov <= 1, f"overflow={ov}px")
cdp("Emulation.clearDeviceMetricsOverride")

print("\n" + "─" * 54)
failed = [r for r in results if not r[1]]
print(f"RESULT: {len(results)-len(failed)} passed, {len(failed)} failed")
for name, ok, detail in failed:
    print("  -", name, detail)
