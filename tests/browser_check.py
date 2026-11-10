#!/usr/bin/env python3
"""T6 browser test: plays every mode under every rule set in real Chrome, offline.

Opens blackjack-trainer.html from disk with all network requests blocked and
checks the game against things it doesn't compute itself:
  - strategy answers against data/strategy/*.csv (read here, independently)
  - running/true count grading against a count kept here from the cards on screen
  - dealer soft-17 behavior, surrender/double/split availability, split aces
  - Full table seat order, 1 and 6 other players, 1-deck reshuffles
  - phone width (375 px): no sideways scrolling

Usage: python3 tests/browser_check.py [--quick] [--json out.json]
Needs: pip install playwright, and Chrome at /usr/bin/google-chrome (or set CHROME).
"""
import csv, json, os, random, re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "blackjack-trainer.html").as_uri()
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
QUICK = "--quick" in sys.argv
RULESETS = [(d, h) for d in (1, 2, 6) for h in (True, False)]
UP = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"]
KEY = {"hit": "h", "stand": "s", "double": "d", "split": "p", "surrender": "r"}
LABEL = {"Hit": "hit", "Stand": "stand", "Double": "double", "Split": "split", "Surrender": "surrender"}
random.seed(7)

# ---------------------------------------------------------------- charts (independent of the game)
def load_charts():
    charts = {}
    for d, h in RULESETS:
        name = f"{d}deck_{'h17' if h else 's17'}"
        rows = [r for r in csv.reader(l for l in open(ROOT / "data/strategy" / f"{name}.csv") if not l.startswith("#"))]
        charts[(d, h)] = {r[0]: dict(zip(UP, r[1:])) for r in rows[1:]}
    return charts
CHARTS = load_charts()

def val(r): return 11 if r == "A" else 10 if r in ("10", "J", "Q", "K") else int(r)
def hilo(r):
    v = val(r)
    return 1 if 2 <= v <= 6 else 0 if 7 <= v <= 9 else -1
def score(ranks):
    t = sum(val(r) for r in ranks); a = ranks.count("A")
    while t > 21 and a: t -= 10; a -= 1
    return t, a > 0
def upkey(r): return "A" if r == "A" else str(val(r))

def expected(rs, cards, up, allowed):
    chart = CHARTS[rs]
    pair = len(cards) == 2 and val(cards[0]) == val(cards[1])
    def total_row():
        t, soft = score(cards); return ("S" if soft else "H") + str(t)
    row = ("PA" if cards[0] == "A" else "P" + str(val(cards[0]))) if (allowed.get("split") and pair) else total_row()
    code = chart[row][upkey(up)]
    def resolve(c):
        return {"H": "hit", "S": "stand", "P": "split",
                "D": "double" if allowed.get("double") else "hit",
                "Ds": "double" if allowed.get("double") else "stand",
                "Rh": "surrender" if allowed.get("surrender") else "hit",
                "Rs": "surrender" if allowed.get("surrender") else "stand",
                "Rp": "surrender" if allowed.get("surrender") else "split"}[c]
    act = resolve(code)
    if act == "split" and not allowed.get("split"):
        row = total_row(); code = chart[row][upkey(up)]; act = resolve(code)
    return act, row, code

# ---------------------------------------------------------------- results
RESULTS = {"matrix": {}, "checks": {}, "issues": [], "notes": [], "stats": {}}
def mark(mode, rs, ok, note=""):
    key = f"{rs[0]}D-{'H17' if rs[1] else 'S17'}"
    cell = RESULTS["matrix"].setdefault(mode, {}).setdefault(key, {"ok": True, "notes": []})
    cell["ok"] = cell["ok"] and ok
    if note: cell["notes"].append(note)
def check(name, ok, note=""):
    c = RESULTS["checks"].setdefault(name, {"ok": True, "notes": []})
    c["ok"] = c["ok"] and ok
    if note and note not in c["notes"]: c["notes"].append(note)
def issue(text):
    if text not in RESULTS["issues"]: RESULTS["issues"].append(text); print("ISSUE:", text)
def stat(name, n=1): RESULTS["stats"][name] = RESULTS["stats"].get(name, 0) + n

# ---------------------------------------------------------------- page helpers
STATE_JS = r"""() => {
  const p=[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden);
  const rank=c=>c.classList.contains('back')?null:c.getAttribute('aria-label').split(' of ')[0];
  const dsec=p.querySelector('section[aria-label=Dealer]');
  const seats=[...p.querySelectorAll('section.spot[aria-label]')].filter(s=>s!==dsec).map(s=>({
    label:s.getAttribute('aria-label'), mine:s.classList.contains('mine')||!s.classList.contains('seat'),
    hands:[...s.querySelectorAll('.hand')].map(h=>({cards:[...h.querySelectorAll('.card')].map(rank),
      active:h.classList.contains('active'), res:(h.querySelector('.res')||{}).innerText||''}))}));
  const btns={}; p.querySelectorAll('.actions button').forEach(b=>{btns[b.childNodes[0].textContent.trim()]=!b.disabled});
  const side=p.querySelector('aside.side');
  return {dealer: dsec?[...dsec.querySelectorAll('.card')].map(rank):[], seats, btns,
    playingText: (p.querySelector('.actions p')||{}).innerText||'',
    msg:(p.querySelector('.msg')||{}).innerText||'', coach:(p.querySelector('.coach')||{}).innerText||'',
    coachHl:(p.querySelector('.coach .hl')||{}).innerText||'',
    pending: !!p.querySelector('form.check #rc'), side: side?side.innerText:''};
}"""

def new_page(browser, mobile=False, clock=False):
    ctx = browser.new_context(**({"viewport": {"width": 375, "height": 812}, "is_mobile": True, "has_touch": True,
                                   "device_scale_factor": 2} if mobile else {"viewport": {"width": 1280, "height": 900}}))
    ctx.set_offline(True)
    page = ctx.new_page()
    page._net, page._errs = [], []
    def route(r):
        if r.request.url.startswith("file://"): r.continue_()
        else: page._net.append(r.request.url); r.abort()
    page.route("**/*", route)
    page.on("pageerror", lambda e: page._errs.append(str(e)))
    page.on("console", lambda m: page._errs.append("console " + m.type + ": " + m.text) if m.type == "error" else None)
    if clock: page.clock.install()
    page.goto(HTML)
    page.evaluate("try{localStorage.clear()}catch(e){}")
    page.reload()
    return page

def set_rules(page, d, h):
    page.check(f'input[name=decks][value="{d}"]', force=True)
    page.check(f'input[name=h17][value="{1 if h else 0}"]', force=True)

def go(page, mode): page.click(f'.modes button[data-mode="{mode}"]')
def panel(page): return page.locator('[role=tabpanel]:not([hidden])')
def state(page): return page.evaluate(STATE_JS)

def errors_since(page, n0):
    errs = page._errs[n0:]
    for e in errs: issue("Browser error: " + e)
    return not errs

# ---------------------------------------------------------------- table modes (learn / count / table)
class Tracker:
    """Hi-Lo count and cards dealt, kept from what's on screen."""
    def __init__(self, decks): self.decks = decks; self.reset()
    def reset(self): self.rc = 0; self.dealt = 0; self.synced = True
    def add(self, ranks):
        for r in ranks: self.rc += hilo(r); self.dealt += 1
    def tc(self):
        left = (52 * self.decks - self.dealt) / 52
        return self.rc / left if left > 0 else 0

def my_hand(st):
    mine = [s for s in st["seats"] if s["mine"]]
    if not mine: return None, 0
    hands = mine[0]["hands"]
    if len(hands) == 1: return hands[0], 1
    act = [h for h in hands if h["active"]]
    return (act[0] if act else None), len(hands)

def check_dealer(st, rs, where):
    d = st["dealer"]
    if None in d or len(d) < 2: return
    live = any(not ("Bust" in h["res"] or "bust" in h["res"] or "Surrender" in h["res"] or "Blackjack" in h["res"]) for s in st["seats"] for h in s["hands"])
    t2, _ = score(d[:2])
    if t2 == 21 or not live: return
    for i in range(2, len(d) + 1):
        t, soft = score(d[:i])
        must_draw = t < 17 or (t == 17 and soft and rs[1])
        if i < len(d) and not must_draw:
            issue(f"{where}: dealer drew after {d[:i]} ({'soft ' if soft else ''}{t}) under {'H17' if rs[1] else 'S17'}")
            check("Dealer hits soft 17 under H17, stands under S17", False); return
        if i == len(d) and must_draw and t <= 21:
            issue(f"{where}: dealer stopped on {d} ({'soft ' if soft else ''}{t}) under {'H17' if rs[1] else 'S17'}")
            check("Dealer hits soft 17 under H17, stands under S17", False); return
    t, soft = score(d)
    if score(d[:-1]) == (17, True): stat("dealer hit soft 17 (H17)" if rs[1] else "dealer hit soft 17 under S17 (bad)")
    if (t, soft) == (17, True): stat("dealer stood on soft 17 (S17)" if not rs[1] else "dealer stood soft 17 under H17 (bad)")

def end_round_cards(st):
    cards = [r for r in st["dealer"]]
    for s in st["seats"]:
        for h in s["hands"]: cards += h["cards"]
    return cards

def play_table(page, mode, rs, rounds, tr, *, coach=False, clock=False, seat=None, others=None, mistakes=True):
    """Play `rounds` rounds; check strategy hints (coach), count checks, and rule invariants."""
    where = f"{mode} {rs[0]}D-{'H17' if rs[1] else 'S17'}" + (f" others={others} seat={seat}" if others else "")
    ok = True
    for rnd in range(rounds):
        st = state(page)
        if st["pending"]:
            ok &= do_check(page, mode, rs, tr, where)
            st = state(page)
        deal = panel(page).locator(".actions button.primary")
        if deal.count() == 0 or deal.is_disabled():
            issue(f"{where}: no Deal button available"); return False
        deal.click()
        st = state(page)
        if "cut card" in st["msg"]: tr.reset(); stat("cut-card shuffles")
        user_turns, first_turn_seen = 0, False
        guard = 0
        while True:
            guard += 1
            if guard > 400: issue(f"{where}: round never finished"); return False
            st = state(page)
            if "Hit" in st["btns"]:
                user_turns += 1
                hand, nhands = my_hand(st)
                if not hand: issue(f"{where}: can't find the active hand"); return False
                cards, up = hand["cards"], st["dealer"][0]
                allowed = {LABEL[k]: v for k, v in st["btns"].items() if k in LABEL}
                # seat order (Full table): what other seats look like at your first decision
                if others and not first_turn_seen:
                    first_turn_seen = True
                    other = [h for s in st["seats"] if not s["mine"] for h in s["hands"]]
                    if seat == "first" and any(len(h["cards"]) != 2 for h in other):
                        issue(f"{where}: seat 'first' but other players acted before you"); check("Full table seat order", False)
                # rule invariants
                two = len(cards) == 2
                pair = two and val(cards[0]) == val(cards[1])
                split_aces = nhands > 1 and cards[0] == "A"
                exp_sur = two and nhands == 1
                if allowed["surrender"] != exp_sur:
                    issue(f"{where}: surrender {'offered' if allowed['surrender'] else 'not offered'} with {cards}, {nhands} hand(s)")
                    check("Surrender only on first two cards, not after a split", False)
                if allowed["double"] != (two and not split_aces):
                    issue(f"{where}: double {'offered' if allowed['double'] else 'not offered'} with {cards}, {nhands} hand(s)")
                    check("Double after split (DAS)", False)
                if nhands > 1 and two and not split_aces:
                    stat("split hands with double offered (DAS)") if allowed["double"] else None
                if nhands > 1 and two: stat("decisions on a split hand with surrender off") if not allowed["surrender"] else None
                if allowed["split"] and not pair:
                    issue(f"{where}: split offered on non-pair {cards}")
                exp, row, code = expected(rs, cards, up, allowed)
                if coach:
                    panel(page).get_by_role("button", name="What should I do?").click()
                    hint = LABEL.get(state(page)["coachHl"], "?")
                    stat("coach hints checked")
                    if hint != exp:
                        issue(f"{where}: hint says {hint} for {cards} vs {up}, chart {row}/{upkey(up)}={code} says {exp}")
                        ok = False
                move = exp
                if mistakes and coach and random.random() < 0.15:
                    others_ok = [a for a, v in allowed.items() if v and a != exp]
                    if others_ok: move = random.choice(others_ok)
                page.keyboard.press(KEY[move])
                if coach:
                    c = state(page)["coach"]
                    good = c.startswith("Matches basic strategy")
                    if good != (move == exp):
                        issue(f"{where}: coach feedback wrong after {move} on {cards} vs {up} (expected {exp}): {c[:80]}"); ok = False
                    stat("coach feedback checked")
                continue
            if st["playingText"]:  # other players' turn
                if clock: page.clock.run_for(700)
                else: page.wait_for_timeout(700)
                continue
            break
        st = state(page)
        if "ran out mid-hand" in st["msg"]:
            stat("mid-hand reshuffles"); tr.synced = False
        cards = end_round_cards(st)
        if None in cards: issue(f"{where}: face-down card left after the round")
        if tr.synced: tr.add(cards)
        check_dealer(st, rs, where)
        # split aces get one card each
        for s in st["seats"]:
            if s["mine"] and len(s["hands"]) > 1:
                for h in s["hands"]:
                    if h["cards"] and h["cards"][0] == "A" and len(h["cards"]) != 2 and "A" == h["cards"][0]:
                        # only a split-ace hand starts with A in a multi-hand seat after splitting aces
                        if all(x["cards"][0] == "A" for x in s["hands"]):
                            issue(f"{where}: split ace hand got {h['cards']}"); check("Split aces get one card each", False)
                if all(x["cards"][0] == "A" for x in s["hands"]): stat("split aces observed")
        if others and seat == "last" and user_turns:
            stat("rounds seated last")
    return ok

def do_check(page, mode, rs, tr, where):
    st = state(page)
    m = re.search(r"About ([\d.]+) of (\d+) decks left", st["side"])
    shown_left = float(m.group(1)) if m else None
    if not tr.synced:
        panel(page).locator("#rc").fill("0"); panel(page).locator("#tc").fill("0"); panel(page).locator("form.check button[type=submit]").click()
        side = state(page)["side"]
        rc = int(re.search(r"It was ([+\-−]?\d+)", side).group(1).replace("−", "-"))
        # resync from the game's answer; only safe because we stop checking until the next shuffle
        tr.rc, tr.synced = rc, True
        left = re.search(r"÷ ([\d.]+) decks left", side)
        tr.dealt = round(52 * tr.decks - float(left.group(1)) * 52) if left else tr.dealt
        stat("count checks skipped after mid-hand reshuffle")
        return True
    exact_tc = tr.tc()
    test_wrong_tc = random.random() < 0.2 and abs(tr.rc / tr.decks - exact_tc) > 0.75
    tc_in = round(tr.rc / tr.decks) if test_wrong_tc else round(exact_tc)
    panel(page).locator("#rc").fill(str(tr.rc)); panel(page).locator("#tc").fill(str(tc_in))
    panel(page).locator("form.check button[type=submit]").click()
    side = state(page)["side"]
    rc_ok = "Running count: right" in side
    tc_ok = "True count: right" in side
    stat("count checks")
    good = True
    if not rc_ok:
        issue(f"{where}: running count graded wrong; I counted {tr.rc} from the cards shown. Game: {side[:160]!r}"); good = False
    if test_wrong_tc:
        stat("true count checks using decks selected (should be wrong)")
        if tc_ok:
            issue(f"{where}: true count {tc_in} (running ÷ decks selected) was accepted; exact is {exact_tc:.2f}")
            check("True count uses decks remaining", False); good = False
    elif not tc_ok:
        issue(f"{where}: true count {tc_in} graded wrong; exact {exact_tc:.2f} ({tr.rc} ÷ {(52*tr.decks-tr.dealt)/52:.2f}). Game: {side[:160]!r}"); good = False
    # would a player using the on-screen "About X decks left" be graded right?
    if shown_left:
        stat("true count checks with on-screen decks estimate")
        user_tc = round(tr.rc / shown_left)
        if abs(user_tc - exact_tc) > 0.5 + 1e-9:
            stat("on-screen estimate would be graded wrong")
            RESULTS.setdefault("estimate_misses", []).append(
                f"{where}: running {tr.rc}, screen shows ~{shown_left} decks, player answers {user_tc}; game wants {exact_tc:.2f} (exact {(52*tr.decks-tr.dealt)/52:.2f} decks)")
    return good

# ---------------------------------------------------------------- quiz
QUIZ_JS = r"""() => {
  const p=[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden);
  const sp=p.querySelectorAll('.quiz-hand section.spot');
  const r=c=>c.getAttribute('aria-label').split(' of ')[0];
  const fb=p.querySelector('.feedback');
  return {up:r(sp[0].querySelector('.card')), cards:[...sp[1].querySelectorAll('.card')].map(r),
    fb: fb?fb.innerText:'', right:(p.querySelector('.feedback .hl')||{}).innerText||''};
}"""

def run_quiz(page, rs, n):
    where = f"quiz {rs[0]}D-{'H17' if rs[1] else 'S17'}"
    ok = True
    for i in range(n):
        q = page.evaluate(QUIZ_JS)
        allowed = {"hit": True, "stand": True, "double": True, "surrender": True,
                   "split": len(q["cards"]) == 2 and val(q["cards"][0]) == val(q["cards"][1])}
        exp, row, code = expected(rs, q["cards"], q["up"], allowed)
        wrong = random.random() < 0.2
        pick = exp if not wrong else random.choice([a for a, v in allowed.items() if v and a != exp])
        page.keyboard.press(KEY[pick])
        q2 = page.evaluate(QUIZ_JS)
        said_right = q2["fb"].startswith("Correct")
        if LABEL.get(q2["right"]) != exp:
            issue(f"{where}: {q['cards']} vs {q['up']}: game says {q2['right']}, chart {row}/{upkey(q['up'])}={code} says {exp}"); ok = False
        if said_right != (pick == exp):
            issue(f"{where}: picked {pick} (chart: {exp}) and game said {'Correct' if said_right else 'Not quite'}"); ok = False
        stat("quiz answers checked")
        RESULTS.setdefault("quiz_rows", set()).add((rs, row))
        page.keyboard.press("n")
    return ok

def quiz_specific(page):
    """Required test hands, through the same lookup the quiz and coach use."""
    js = r"""(a) => { const [d,h,cards,up]=a; const r=BJ.makeRules({decks:d,h17:h});
      const hand=new BJ.Hand(cards.map(x=>({rank:x,suit:'♠'})));
      const rec=BJStrategy.recommend(window.BJ_DATA.charts, r, hand, {rank:up,suit:'♠'},
        {hit:true,stand:true,double:true,surrender:true,split:hand.isPair()});
      return rec && rec.action; }"""
    hands = [("11 vs A", ["6", "5"], "A"), ("A,8 vs 6", ["A", "8"], "6"), ("A,7 vs 2", ["A", "7"], "2"),
             ("17 vs A (surrender)", ["10", "7"], "A")]
    for name, cards, up in hands:
        got = []
        for rs in RULESETS:
            g = page.evaluate(js, [rs[0], rs[1], cards, up])
            e, row, code = expected(rs, cards, up, {"hit": 1, "stand": 1, "double": 1, "surrender": 1, "split": cards[0] == cards[1]})
            got.append(f"{rs[0]}D-{'H17' if rs[1] else 'S17'} {g}")
            if g != e:
                issue(f"Test hand {name} {rs}: game {g}, chart says {e}"); check(f"Quiz test hand {name}", False)
        check(f"Quiz test hand {name}", True, "; ".join(got))

# ---------------------------------------------------------------- drill
DRILL_JS = r"""() => {
  const p=[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden);
  const cards=[...p.querySelectorAll('.drill-cards .card:not(.back)')].map(c=>c.getAttribute('aria-label').split(' of ')[0]);
  const m=(p.querySelector('.drill-stage .num')||{}).innerText||'';
  return {cards, dealt:m, pending:!!p.querySelector('#drc'), tc:!!p.querySelector('#dtc'),
    fb:(p.querySelector('.feedback')||{}).innerText||''};
}"""

def run_drill(page, rs, use_pm=False, max_checks=None):
    where = f"drill {rs[0]}D-{'H17' if rs[1] else 'S17'}"
    ok = True
    panel(page).locator("#asktc").check()
    rc, dealt, checks, flips = 0, 0, 0, 0
    total = 52 * rs[0]
    m = re.match(r"(\d+) of (\d+)", page.evaluate(DRILL_JS)["dealt"])
    if int(m.group(2)) != total:
        issue(f"{where}: shoe has {m.group(2)} cards, expected {total}"); check("Shoe holds 52 x decks cards", False); ok = False
    while True:
        d = page.evaluate(DRILL_JS)
        if d["pending"]:
            final = dealt == total
            left = (total - dealt) / 52
            if use_pm and rc < 0:
                panel(page).locator("#drc").fill(str(-rc))
                panel(page).get_by_role("button", name="Flip the sign of Running count").click()
                stat("negative counts entered with the ± button")
            else:
                panel(page).locator("#drc").fill(str(rc))
            if d["tc"]: panel(page).locator("#dtc").fill(str(round(rc / left)))
            elif not final: issue(f"{where}: true count box missing though 'Also ask the true count' is ticked")
            panel(page).locator("form.check button[type=submit]").click()
            fb = page.evaluate(DRILL_JS)["fb"]
            checks += 1; stat("drill count checks")
            if not fb.startswith("Right"):
                issue(f"{where}: running count {rc} after {dealt} cards graded wrong: {fb[:120]!r}"); ok = False
            if d["tc"] and "True count right" not in fb:
                issue(f"{where}: true count {round(rc/left)} (exact {rc/left:.2f}) graded wrong: {fb[:160]!r}"); ok = False
            if final or (max_checks and checks >= max_checks): break
            continue
        flips += 1
        if flips > total + 200: issue(f"{where}: drill stuck"); return False
        panel(page).get_by_role("button", name=re.compile("^Flip")).click()
        d2 = page.evaluate(DRILL_JS)
        for r in d2["cards"]: rc += hilo(r); dealt += 1
        if dealt > total + 5: issue(f"{where}: drill never ended"); return False
    if max_checks and dealt < total: return ok
    if rc != 0: issue(f"{where}: full shoe counted to {rc}, not 0"); check("A full shoe counts down to 0", False); ok = False
    if dealt != total: issue(f"{where}: drill dealt {dealt} cards, expected {total}"); check("Shoe holds 52 x decks cards", False); ok = False
    RESULTS["notes"].append(f"{where}: {dealt} cards, {checks} checks, final count {rc}")
    return ok

# ---------------------------------------------------------------- layout
def layout(page, label):
    w = page.evaluate("() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth})")
    small = page.evaluate("""() => [...document.querySelectorAll('button')].filter(b=>b.offsetParent)
        .map(b=>b.getBoundingClientRect()).filter(r=>r.height<36||r.width<36).length""")
    if w["sw"] > w["iw"] + 1:
        issue(f"Phone width: sideways scrolling on {label} ({w['sw']}px content in {w['iw']}px screen)"); check("Phone width: no sideways scrolling", False)
    if small: RESULTS["notes"].append(f"Phone width, {label}: {small} visible button(s) smaller than 36 px")
    return w["sw"] <= w["iw"] + 1

# ---------------------------------------------------------------- main
def main():
    n_round = 8 if QUICK else 40
    n_quiz = 20 if QUICK else 150
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])

        # Desktop: every mode x every rule set
        page = new_page(browser, clock=True)
        e0 = 0
        title = page.title()
        check("Opens from disk with network off", bool(title), f"title: {title!r}")
        quiz_specific(page)
        for rs in RULESETS:
            set_rules(page, *rs)
            for mode in ("learn", "quiz", "drill", "count", "table"):
                go(page, mode)
                n0 = len(page._errs)
                if mode == "learn":
                    tr = Tracker(rs[0]); ok = play_table(page, mode, rs, n_round, tr, coach=True, clock=True)
                elif mode == "quiz":
                    ok = run_quiz(page, rs, n_quiz)
                elif mode == "drill":
                    ok = run_drill(page, rs)
                elif mode == "count":
                    panel(page).locator('select[aria-label="Check my count every"]').select_option("1")
                    tr = Tracker(rs[0]); ok = play_table(page, mode, rs, n_round, tr, clock=True)
                else:
                    panel(page).locator('select[aria-label="Check my count every"]').select_option("1")
                    tr = Tracker(rs[0]); ok = play_table(page, mode, rs, n_round, tr, clock=True, seat="last", others=3)
                ok = errors_since(page, n0) and ok
                mark(mode, rs, ok)
                print(f"{mode:6} {rs}: {'ok' if ok else 'FAIL'}", flush=True)
            # leave every mode in a fresh state for the next rule set (settings change resets them)

        # Full table: seats and player counts, 1 deck (most reshuffles)
        for others in (1, 6):
            for seat in ("first", "middle", "last"):
                rs = (1, True)
                set_rules(page, 2, True); set_rules(page, *rs)
                go(page, "table")
                panel(page).locator('select[aria-label="Other players"]').select_option(str(others))
                panel(page).locator('select[aria-label="Your seat"]').select_option(seat)
                panel(page).locator('select[aria-label="Check my count every"]').select_option("1")
                st = state(page)
                if len(st["seats"]) and False: pass
                n0 = len(page._errs)
                tr = Tracker(1)
                ok = play_table(page, "table", rs, 15 if QUICK else (60 if others == 6 else 30), tr, clock=True, seat=seat, others=others)
                nseats = len(state(page)["seats"])
                if nseats != others + 1: issue(f"Full table others={others}: {nseats} seats shown"); ok = False
                ok = errors_since(page, n0) and ok
                check(f"Full table, 1 deck, {others} other player(s), seat {seat}", ok)
                print(f"table 1D others={others} seat={seat}: {'ok' if ok else 'FAIL'}", flush=True)

        # seat order: after your last move, does the round end at once (last) or do others still play (first)?
        for seat in ("first", "last"):
            set_rules(page, 6, False); go(page, "table")
            panel(page).locator('select[aria-label="Other players"]').select_option("3")
            panel(page).locator('select[aria-label="Your seat"]').select_option(seat)
            seen_after = 0
            for _ in range(12):
                if state(page)["pending"]:
                    panel(page).locator("#rc").fill("0"); panel(page).locator("#tc").fill("0"); panel(page).locator("form.check button[type=submit]").click()
                panel(page).locator(".actions button.primary").click()
                while True:
                    st = state(page)
                    if "Hit" in st["btns"]:
                        page.keyboard.press("s")
                        if "Hit" not in state(page)["btns"] and state(page)["playingText"]: seen_after += 1
                        continue
                    if st["playingText"]: page.clock.run_for(700); continue
                    break
            if seat == "first": check("Full table seat order", seen_after > 0, f"seat first: others still played after you in {seen_after}/12 hands")
            else: check("Full table seat order", seen_after == 0, f"seat last: others played after you in {seen_after}/12 hands")

        # settings change mid-mode resets shoe and count
        set_rules(page, 6, True); go(page, "count")
        panel(page).locator('select[aria-label="Check my count every"]').select_option("1")
        tr = Tracker(6); play_table(page, "count", (6, True), 3, tr, clock=True)
        set_rules(page, 2, True)
        msg = state(page)["msg"]
        tr = Tracker(2)
        ok = play_table(page, "count", (2, True), 3, tr, clock=True)
        check("Changing settings mid-mode reshuffles and resets the count", "Rules changed" in msg and ok, f"message: {msg!r}")
        go(page, "drill")
        d = page.evaluate(DRILL_JS)["dealt"]
        check("Changing settings mid-mode reshuffles and resets the count", d.startswith("0 of 104"), f"drill after change: {d!r}")

        # engine-level rule checks with fixed cards (same engine the page runs)
        rule_js = r"""() => {
          const C=r=>({rank:r,suit:'♠'}), out={};
          // player 10,8 ; dealer A,6 then a 2
          const run=(h17)=>{const shoe=new BJ.Shoe(1,{cards:[C('10'),C('A'),C('8'),C('6'),C('2'),C('9'),C('9'),C('9'),C('9')]});
            const rd=new BJ.Round(shoe,BJ.makeRules({decks:1,h17}),{}); rd.start(1); rd.act('stand'); return rd.dealer.cards.map(c=>c.rank).join(',');};
          out.h17=run(true); out.s17=run(false);
          // 8,8 vs 6: split, then each 8 gets a 3 -> 11; double should be allowed, surrender not
          const shoe=new BJ.Shoe(6,{cards:[C('8'),C('6'),C('8'),C('10'),C('3'),C('3'),C('9'),C('9'),C('9'),C('9')]});
          const rd=new BJ.Round(shoe,BJ.makeRules({decks:6}),{}); rd.start(1); rd.act('split');
          out.afterSplit=rd.available();
          // A,A: one card each
          const s2=new BJ.Shoe(6,{cards:[C('A'),C('6'),C('A'),C('10'),C('5'),C('5'),C('9'),C('9'),C('9')]});
          const r2=new BJ.Round(s2,BJ.makeRules({decks:6}),{}); r2.start(1); r2.act('split');
          out.aces=r2.hands.map(h=>h.cards.map(c=>c.rank).join(',')); out.acesPhase=r2.phase;
          return out; }"""
        r = page.evaluate(rule_js)
        check("Dealer hits soft 17 under H17, stands under S17", r["h17"] == "A,6,2" and r["s17"] == "A,6",
              f"dealer A,6 with a 2 next: H17 -> {r['h17']}, S17 -> {r['s17']}")
        check("Double after split (DAS)", r["afterSplit"]["double"] is True, f"after splitting 8,8 and drawing a 3: double={r['afterSplit']['double']}")
        check("Surrender only on first two cards, not after a split", r["afterSplit"]["surrender"] is False,
              f"after a split: surrender={r['afterSplit']['surrender']}")
        check("Split aces get one card each", r["aces"] == ["A,5", "A,5"] and r["acesPhase"] == "done",
              f"split A,A got {r['aces']}, round {r['acesPhase']}")

        # both count screens waiting for an answer at the same time (user switched screens mid-check)
        for m in ("count", "table"):
            go(page, m)
            for _ in range(80):
                st = state(page)
                if st["pending"]: break
                if "Hit" in st["btns"]: page.keyboard.press("s"); continue
                if st["playingText"]: page.clock.run_for(700); continue
                panel(page).locator(".actions button.primary").click()
        for m in ("table", "count"):
            go(page, m)
            n0 = len(page._errs)
            panel(page).locator("#rc").fill("abc"); panel(page).locator("#tc").fill("1")
            panel(page).locator("form.check button[type=submit]").click(); page.clock.run_for(50)
            alert = panel(page).locator("form.check [role=alert]").inner_text()
            errs = page._errs[n0:]; del page._errs[n0:]
            ok = bool(alert) and not errs
            if not ok: issue(f"{m}: typed 'abc' while both count screens had a question open: message {alert!r}, page error {errs}")
            check("Invalid count answer shows a message", ok, f"{m} (both screens asking): message {alert!r}" + (f", error {errs[0]!r}" if errs else ""))
        for m in ("table", "count"):
            go(page, m); panel(page).locator("#rc").fill("0"); panel(page).locator("#tc").fill("0")
            panel(page).locator("form.check button[type=submit]").click()
        check("No network requests", not page._net, f"blocked requests: {page._net[:5]}" if page._net else "none attempted")
        page.context.close()

        # Phone width: every mode, a 1-deck and a 6-deck rule set
        page = new_page(browser, mobile=True, clock=True)
        for rs in ((1, True), (6, False)):
            set_rules(page, *rs)
            for mode in ("learn", "quiz", "drill", "count", "table"):
                go(page, mode); n0 = len(page._errs)
                if mode == "quiz":
                    run_quiz(page, rs, 10)
                    show = panel(page).get_by_role("button", name=re.compile("Show the full chart"))
                    if show.count(): show.click()
                elif mode == "drill":
                    run_drill(page, rs, use_pm=True, max_checks=6)
                elif mode in ("learn", "count"):
                    play_table(page, mode, rs, 3, Tracker(rs[0]), coach=(mode == "learn"), clock=True, mistakes=False)
                else:
                    play_table(page, mode, rs, 3, Tracker(rs[0]), clock=True, seat="last", others=3)
                ok = layout(page, f"{mode} {rs[0]}D") and errors_since(page, n0)
                mark("phone", rs, ok, mode)
        check("Phone width: no sideways scrolling", True)
        check("No network requests", not page._net)
        page.context.close()
        browser.close()

    RESULTS["quiz_rows"] = len(RESULTS.get("quiz_rows", ()))
    out = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
    if out: Path(out).write_text(json.dumps(RESULTS, indent=1, default=str))
    print(json.dumps({k: RESULTS[k] for k in ("stats", "issues")}, indent=1))
    print("checks:", {k: v["ok"] for k, v in RESULTS["checks"].items()})
    return 1 if RESULTS["issues"] else 0

if __name__ == "__main__":
    sys.exit(main())
