/* "The math" tab: the set theory and probability behind card counting, plus a live lab.
 * Registered by app.js, which passes in its DOM helpers. Depends on BJ (engine.js). */
(function (root) {
  "use strict";
  var BJ = root.BJ;

  // Effect of removing one card of each rank from a six-deck shoe on the player's expected value,
  // in percent. Rules: double any two, DAS, split once. Wizard of Odds, "Effect of Card Removal".
  var EOR_SOURCE = "https://wizardofodds.com/games/blackjack/effect-of-removal/";
  var EOR = {
    ranks: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"],
    s17: [0.069, 0.082, 0.110, 0.141, 0.079, 0.041, -0.008, -0.040, -0.091, -0.094],
    h17: [0.071, 0.086, 0.117, 0.143, 0.084, 0.038, -0.010, -0.045, -0.097, -0.084]
  };
  var SRC = {
    hilo: "https://wizardofodds.com/games/blackjack/card-counting/high-low/",
    intro: "https://wizardofodds.com/games/blackjack/card-counting/introduction/",
    calc: "https://wizardofodds.com/games/blackjack/strategy/calculator/"
  };

  // Group of a card under Hi-Lo: L = low (2-6, +1), N = neutral (7-9, 0), H = high (10-A, -1).
  function group(card) { var t = BJ.hiLo(card); return t === 1 ? "L" : t === 0 ? "N" : "H"; }

  // Weighted correlation between the Hi-Lo tags and the effect-of-removal values
  // (tens weighted 4x because 10, J, Q, K all count as ten). Computed here, not from a source.
  function tagCorrelation(eor) {
    var w = [1, 1, 1, 1, 1, 1, 1, 1, 4, 1], x = [1, 1, 1, 1, 1, 0, 0, 0, -1, -1];
    var W = 0, mx = 0, my = 0, i;
    for (i = 0; i < w.length; i++) { W += w[i]; mx += w[i] * x[i]; my += w[i] * eor[i]; }
    mx /= W; my /= W;
    var c = 0, vx = 0, vy = 0;
    for (i = 0; i < w.length; i++) {
      c += w[i] * (x[i] - mx) * (eor[i] - my); vx += w[i] * Math.pow(x[i] - mx, 2); vy += w[i] * Math.pow(eor[i] - my, 2);
    }
    return c / Math.sqrt(vx * vy);
  }

  /* ---------- Missed cards: distribution of the count change ----------
   * k cards leave the shoe unseen. The shoe's unseen part has l low, n0 neutral and h high cards
   * (N = l + n0 + h). The change in running count is D = (#low among the k) - (#high among the k).
   * The k cards are a draw without replacement, so (#low, #neutral, #high) is multivariate
   * hypergeometric:  P(a, b, c) = C(l,a) C(n0,b) C(h,c) / C(N,k),  a + b + c = k.
   * Returns the exact distribution of D plus its mean and standard deviation. */
  var LF = [0];
  function logFact(n) { for (var i = LF.length; i <= n; i++) LF[i] = LF[i - 1] + Math.log(i); return LF[n]; }
  function logC(n, r) { return r < 0 || r > n ? -Infinity : logFact(n) - logFact(r) - logFact(n - r); }
  function countShiftDist(l, n0, h, k) {
    var N = l + n0 + h, pmf = {}, base = logC(N, k);
    for (var a = 0; a <= Math.min(l, k); a++)
      for (var c = 0; c <= Math.min(h, k - a); c++) {
        var b = k - a - c;
        if (b > n0) continue;
        var p = Math.exp(logC(l, a) + logC(n0, b) + logC(h, c) - base);
        pmf[a - c] = (pmf[a - c] || 0) + p;
      }
    // Closed forms (draws without replacement): mean = k·mu, var = k·sigma²·(N-k)/(N-1)
    var mu = (l - h) / N, sigma2 = (l + h) / N - mu * mu;
    var variance = N > 1 ? k * sigma2 * (N - k) / (N - 1) : 0;
    var keys = Object.keys(pmf).map(Number).sort(function (x, y) { return x - y; });
    var mode = keys[0];
    keys.forEach(function (x) { if (pmf[x] > pmf[mode] + 1e-12) mode = x; });
    return { pmf: pmf, values: keys, mean: k * mu, sd: Math.sqrt(variance), mode: mode };
  }
  // Smallest central range [lo, hi] (around the mode) holding at least `mass` of the probability.
  function centralRange(dist, mass) {
    var lo = dist.mode, hi = dist.mode, tot = dist.pmf[dist.mode];
    while (tot < mass - 1e-12) {
      var pl = dist.pmf[lo - 1] || 0, ph = dist.pmf[hi + 1] || 0;
      if (!pl && !ph) break;
      if (pl >= ph) { lo--; tot += pl; } else { hi++; tot += ph; }
    }
    return [lo, hi, tot];
  }

  function MathTab(el, ctx) {
    this.root = el; this.ctx = ctx;
    this.reset();
  }
  MathTab.prototype.reset = function () {
    this.shoe = new BJ.Shoe(this.ctx.rules().decks, { penetration: 1 });
    this.seen = [];
    this.newMiss();
    this.render();
  };
  MathTab.prototype.key = function () {};
  // Missed-cards exercise: deal a random part of a fresh shoe face up (so the count is known),
  // then k more cards go by unseen. The user estimates the most likely running count now.
  MathTab.prototype.newMiss = function () {
    var d = this.ctx.rules().decks, k = this.missK || 10;
    var shoe = new BJ.Shoe(d, { penetration: 1 });
    var seenN = Math.floor(shoe.total * (0.1 + Math.random() * 0.55));
    var rc = 0, i, seen = { L: 0, N: 0, H: 0 };
    for (i = 0; i < seenN; i++) { var c = shoe.draw(); rc += BJ.hiLo(c); seen[group(c)]++; }
    var hidden = [];
    for (i = 0; i < k; i++) hidden.push(shoe.draw());
    var dist = countShiftDist(20 * d - seen.L, 12 * d - seen.N, 20 * d - seen.H, k);
    var actual = rc + hidden.reduce(function (s, c) { return s + BJ.hiLo(c); }, 0);
    this.miss = { d: d, k: k, rc: rc, left: shoe.total - seenN, hidden: hidden, dist: dist, actual: actual, answer: null };
  };
  MathTab.prototype.answerMiss = function (v) {
    var m = this.miss, best = m.dist.pmf[m.dist.mode];
    // Right if the guess is a most-likely value (ties count) or the mean rounded to a whole number.
    var p = m.dist.pmf[v - m.rc] || 0;
    m.answer = { v: v, ok: p >= best - 1e-9 || v === Math.round(m.rc + m.dist.mean) };
    this.missStats = this.missStats || { n: 0, right: 0 };
    this.missStats.n++; if (m.answer.ok) this.missStats.right++;
    this.render();
  };
  MathTab.prototype.deal = function (n) {
    for (var i = 0; i < n && this.shoe.remaining() > 1; i++) this.seen.push(this.shoe.draw());
    this.render();
  };

  MathTab.prototype.render = function () {
    var h = this.ctx.h, root = this.ctx.clear(this.root), self = this;
    var r = this.ctx.rules(), d = r.decks;
    var link = function (url, text) { return h("a", { href: url, rel: "noopener", text: text }); };
    // Formula line. "Σ_{c ∈ S}" in the text becomes Σ with a real subscript.
    var eq = function (text) {
      var out = [], re = /Σ_\{([^}]*)\}/g, last = 0, m;
      while ((m = re.exec(text))) {
        out.push(text.slice(last, m.index), "Σ", h("sub", { text: m[1] }));
        last = re.lastIndex;
      }
      out.push(text.slice(last));
      return h("p", { class: "eq" }, out);
    };
    var sec = function (title) {
      var s = h("section", { class: "math-sec" }, h("h3", { text: title }));
      for (var i = 1; i < arguments.length; i++) if (arguments[i]) s.appendChild(arguments[i]);
      return s;
    };
    var P = function (t) { return h("p", { text: t }); };

    root.appendChild(h("div", { class: "intro" },
      h("h2", { text: "The math behind counting" }),
      P("Card counting is set theory and probability. The shoe is a set of cards, every card dealt moves from one subset to another, and the count is a function that tracks what the remaining subset looks like. This page builds it up step by step. Numbers follow your deck setting (" + d + (d === 1 ? " deck" : " decks") + ")."),
      P("Figures from outside sources are linked. Anything labeled \"calculated here\" is arithmetic done by this page, not quoted from a source.")));

    // 1. The deck as a set
    var n = 52 * d;
    root.appendChild(sec("1. The shoe is a set",
      P("Call the shoe D. With " + d + (d === 1 ? " deck" : " decks") + ", D has |D| = 52 × " + d + " = " + n + " cards. Each physical card is a distinct element, even when two cards share a rank."),
      P("Hi-Lo splits D into three disjoint subsets, a partition: every card is in exactly one of them."),
      h("table", { class: "chart math-table" },
        h("thead", null, h("tr", null, ["Subset", "Ranks", "Per deck", "In your shoe"].map(function (t) { return h("th", { scope: "col", text: t }); }))),
        h("tbody", null,
          [["L (low)", "2, 3, 4, 5, 6", "5 × 4 = 20", 20 * d], ["N (neutral)", "7, 8, 9", "3 × 4 = 12", 12 * d],
            ["H (high)", "10, J, Q, K, A", "5 × 4 = 20", 20 * d]].map(function (row) {
            return h("tr", null, h("th", { scope: "row", text: row[0] }), h("td", { text: row[1] }), h("td", { text: row[2] }), h("td", { class: "num", text: String(row[3]) }));
          }))),
      eq("L ∪ N ∪ H = D,  L ∩ N = L ∩ H = N ∩ H = ∅,  |L| + |N| + |H| = " + 20 * d + " + " + 12 * d + " + " + 20 * d + " = " + n)));

    // 2. Hi-Lo is a function
    root.appendChild(sec("2. The count is a function on the set",
      P("Hi-Lo assigns every card a tag. As a function f from D to {−1, 0, +1}:"),
      eq("f(c) = +1 if c ∈ L,  0 if c ∈ N,  −1 if c ∈ H"),
      h("p", null, "Source for the tag values: ", link(SRC.hilo, "Wizard of Odds, Hi-Lo"), "."),
      P("Add f over the whole shoe:"),
      eq("Σ_{c ∈ D} f(c) = (+1)·|L| + 0·|N| + (−1)·|H| = " + 20 * d + " − " + 20 * d + " = 0"),
      P("A system whose tags sum to 0 over the full shoe is called balanced. That's why counting a whole deck always ends at 0, which is the self-check in the Count drill.")));

    // 3. The identity
    root.appendChild(sec("3. What the running count actually measures",
      P("At any moment the shoe is split into two disjoint sets: S, the cards you've seen, and U = D ∖ S, the cards still unseen. The running count is f summed over what you've seen:"),
      eq("RC = Σ_{c ∈ S} f(c) = |L ∩ S| − |H ∩ S|"),
      P("Because the whole shoe sums to 0, the seen part and the unseen part must cancel:"),
      eq("Σ_{c ∈ S} f(c) + Σ_{c ∈ U} f(c) = Σ_{c ∈ D} f(c) = 0"),
      eq("so  RC = −Σ_{c ∈ U} f(c) = −(|L ∩ U| − |H ∩ U|)"),
      eq("RC = |H ∩ U| − |L ∩ U|"),
      P("That's the whole idea of counting. You only ever look at the cards that are gone, yet the running count tells you exactly how many more high cards than low cards are left. A running count of +5 means the unseen cards hold 5 more high cards than low cards.")));

    // 4. True count
    root.appendChild(sec("4. True count is a density",
      P("+5 extra high cards matters a lot if 30 cards are left and very little if 300 are. Dividing by the decks left turns the count into a rate:"),
      eq("decks left = |U| ÷ 52,   TC = RC ÷ (|U| ÷ 52) = 52 · (|H ∩ U| − |L ∩ U|) ÷ |U|"),
      P("So the true count is the surplus of high cards over low cards per 52 unseen cards. It means the same thing in a 1-deck game and a 6-deck shoe, which is why decisions are based on it."),
      eq("Example: RC = +7 with about 4 decks left → TC = 7 ÷ 4 = 1.75 ≈ 2"),
      h("p", null, "Example and rounding from ", link(SRC.hilo, "Wizard of Odds, Hi-Lo"), ". Players estimate decks left from the discard tray, so a rough answer is normal.")));

    // 5. Probability of the next card
    var tenFull = 16 * d, pTen = tenFull / n;
    root.appendChild(sec("5. From sets to probability",
      P("If the cards in U are well shuffled, each one is equally likely to come next. So the chance the next card is in some subset A is just a ratio of set sizes:"),
      eq("P(next card ∈ A) = |A ∩ U| ÷ |U|"),
      P("Ten-value cards (10, J, Q, K) are 16 of every 52. In a fresh shoe:"),
      eq("P(ten) = " + tenFull + " ÷ " + n + " = " + (pTen * 100).toFixed(2) + "%   (calculated here)"),
      P("As the count rises, |H ∩ U| grows relative to |U|, so this probability goes up. That one ratio drives most of the advantage a counter gets.")));

    // 6. Insurance
    var tensIns = 16 * d, leftIns = n - 1, pIns = tensIns / leftIns;
    root.appendChild(sec("6. A worked expected value: insurance",
      P("When the dealer shows an ace, you can bet half your bet that the hidden card is ten-value. It pays 2 to 1. If p is the chance the hole card is a ten, the expected value of a 1-unit insurance bet is:"),
      eq("EV = 2·p − 1·(1 − p) = 3p − 1"),
      P("It breaks even when 3p − 1 = 0, so p = 1/3 ≈ 33.33%. Off the top of your shoe, with the dealer's ace removed:"),
      eq("p = " + tensIns + " ÷ " + leftIns + " = " + (pIns * 100).toFixed(2) + "%,   EV = 3p − 1 = " + ((3 * pIns - 1) * 100).toFixed(2) + "%   (calculated here)"),
      h("p", null, "So insurance loses money with no information, and becomes a good bet once enough tens are left. ",
        link(SRC.intro, "Wizard of Odds"), " gives the same six-deck baseline (about 30.87% tens) and the 33.33% break-even. The ",
        link(SRC.hilo, "Hi-Lo page"), " says to take insurance at a true count of +3 or higher.")));

    // 7. Effect of removal
    var col = r.h17 ? "h17" : "s17";
    var corr = tagCorrelation(EOR[col]);
    root.appendChild(sec("7. Why low cards gone is good for you",
      h("p", null, "The table shows how much the player's expected value changes when one card of each rank is removed from a six-deck shoe (",
        link(EOR_SOURCE, "Wizard of Odds, effect of removal"), "; double any two, double after split, split once). Column: dealer " + (r.h17 ? "hits" : "stands on") + " soft 17."),
      h("div", { class: "chart-wrap" }, h("table", { class: "chart math-table" },
        h("thead", null, h("tr", null, h("th", { scope: "col", text: "Rank removed" }), EOR.ranks.map(function (k) { return h("th", { scope: "col", text: k }); }))),
        h("tbody", null,
          h("tr", null, h("th", { scope: "row", text: "Change in EV" }), EOR[col].map(function (v) { return h("td", { class: "num", text: (v > 0 ? "+" : "") + v.toFixed(3) + "%" }); })),
          h("tr", null, h("th", { scope: "row", text: "Hi-Lo tag" }), EOR.ranks.map(function (k) { return h("td", { class: "num", text: { "7": "0", "8": "0", "9": "0", "10": "−1", A: "−1" }[k] || "+1" }); }))))),
      P("Removing a low card (2–6) raises the player's EV and removing a high card lowers it. Hi-Lo's tags have the same signs, so a rising count means the cards that have left are mostly the ones whose removal helps you."),
      eq("Weighted correlation between Hi-Lo tags and this column: " + corr.toFixed(2) + "   (calculated here, tens weighted 4×)"),
      P("A correlation near 1 means a simple +1/0/−1 tag captures most of what the exact values say. The misses are the 7 and 9, which each move EV by about 0.04% but are tagged 0, and the 5, which is worth more than the other low cards but gets the same +1.")));

    // 8. Basic strategy
    root.appendChild(sec("8. Basic strategy is a maximum",
      P("For each hand and dealer upcard, every action (hit, stand, double, split, surrender) has an expected value, the average result per unit bet over all possible remaining cards. Basic strategy is simply the action with the largest one:"),
      eq("best action = argmax over a ∈ {hit, stand, double, split, surrender} of E[result | a, your hand, dealer upcard]"),
      h("p", null, "The charts in the quiz come from a calculator that does this computation for each rule set (",
        link(SRC.calc, "Wizard of Odds strategy calculator"), "). Small rule changes like the soft 17 rule change a few of the expected values enough to flip the best action, which is why the chart changes with your settings.")));

    // 9. Lab
    root.appendChild(this.renderLab());
    root.appendChild(this.renderMiss());

    root.appendChild(h("section", { class: "math-sec small muted" }, h("h3", { text: "Sources" }),
      h("ul", null, [
        [SRC.hilo, "Wizard of Odds: Hi-Lo card counting (tag values, true count example, insurance at +3)"],
        [SRC.intro, "Wizard of Odds: Card counting introduction (insurance baseline and break-even)"],
        [EOR_SOURCE, "Wizard of Odds: Effect of card removal (EV table)"],
        [SRC.calc, "Wizard of Odds: Blackjack strategy calculator (strategy charts)"]
      ].map(function (s) { return h("li", null, link(s[0], s[1])); }))));
  };

  MathTab.prototype.renderLab = function () {
    var h = this.ctx.h, self = this, d = this.shoe.decks, n = this.shoe.total;
    var S = { L: 0, N: 0, H: 0 }, T = 0;
    this.seen.forEach(function (c) { S[group(c)]++; if (BJ.cardValue(c) === 10) T++; });
    var full = { L: 20 * d, N: 12 * d, H: 20 * d };
    var U = { L: full.L - S.L, N: full.N - S.N, H: full.H - S.H };
    var u = n - this.seen.length;
    var rc = S.L - S.H, ident = U.H - U.L;
    var tc = rc / (u / 52);
    var tensLeft = 16 * d - T;
    var pTen = tensLeft / u;
    var sign = function (x) { return (x > 0 ? "+" : "") + x; };

    var row = function (label, o, total) {
      return h("tr", null, h("th", { scope: "row", text: label }),
        ["L", "N", "H"].map(function (k) { return h("td", { class: "num", text: String(o[k]) }); }), h("td", { class: "num", text: String(total) }));
    };
    var last = this.seen.slice(-12);
    return h("section", { class: "math-sec panel lab" },
      h("h3", { text: "9. Lab: watch the formulas work" }),
      h("p", { class: "small", text: "Deal cards from a fresh " + d + "-deck shoe. Every number below is computed from the cards actually dealt." }),
      h("div", { class: "row" },
        h("button", { class: "btn primary", onclick: function () { self.deal(1); } }, "Deal 1"),
        h("button", { class: "btn", onclick: function () { self.deal(10); } }, "Deal 10"),
        h("button", { class: "btn", onclick: function () { self.deal(52); } }, "Deal a deck"),
        h("button", { class: "btn", onclick: function () { self.reset(); } }, "Reshuffle")),
      h("div", { class: "cards lab-cards", "aria-label": "Last cards dealt" }, last.map(function (c) { return self.ctx.cardEl(c); })),
      last.length < this.seen.length ? h("p", { class: "small muted", text: "Showing the last 12 of " + this.seen.length + " cards dealt." }) : null,
      h("div", { class: "chart-wrap" }, h("table", { class: "chart math-table" },
        h("thead", null, h("tr", null, ["", "L (2–6)", "N (7–9)", "H (10–A)", "Total"].map(function (t) { return h("th", { scope: "col", text: t }); }))),
        h("tbody", null, row("Seen, S", S, this.seen.length), row("Unseen, U", U, u)))),
      h("p", { class: "eq" }, "RC = |L ∩ S| − |H ∩ S| = " + S.L + " − " + S.H + " = " + sign(rc)),
      h("p", { class: "eq" }, "|H ∩ U| − |L ∩ U| = " + U.H + " − " + U.L + " = " + sign(ident) + "  ", h("span", { class: rc === ident ? "right" : "wrong", text: rc === ident ? "equal, as section 3 predicts" : "mismatch" })),
      h("p", { class: "eq" }, "TC = RC ÷ (|U| ÷ 52) = " + sign(rc) + " ÷ " + (u / 52).toFixed(2) + " = " + (Math.round(tc * 100) / 100 || 0)),
      h("p", { class: "eq" }, "P(next card is ten-value) = " + tensLeft + " ÷ " + u + " = " + (pTen * 100).toFixed(2) + "%   (fresh shoe: 30.77%)"),
      h("p", { class: "eq" }, "Insurance EV if the dealer showed an ace now ≈ 3p − 1 = " + ((3 * pTen - 1) * 100).toFixed(2) + "%  ",
        h("span", { class: pTen > 1 / 3 ? "right" : "muted", text: pTen > 1 / 3 ? "positive: insurance would be a good bet" : "negative: don't take insurance" })),
      h("p", { class: "small muted", text: "The insurance line treats the next card as the hole card and ignores which card is the dealer's ace, so it's an approximation." }));
  };

  // Bar chart of the distribution of the new running count. Highlights the most likely value
  // and, once answered, the count the hidden cards actually produced.
  function distChart(h, m, reveal) {
    var vals = m.dist.values.filter(function (x) { return m.dist.pmf[x] >= 0.002; });
    var W = 640, H = 200, padL = 36, padB = 30, padT = 12;
    var maxP = 0; vals.forEach(function (x) { maxP = Math.max(maxP, m.dist.pmf[x]); });
    var bw = (W - padL - 8) / vals.length;
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "dist");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Probability of each possible running count after " + m.k + " unseen cards. Most likely: " +
      sgn(m.rc + m.dist.mode) + ".");
    function el(tag, attrs, text) {
      var e = document.createElementNS(NS, tag);
      for (var a in attrs) e.setAttribute(a, attrs[a]);
      if (text != null) e.textContent = text;
      svg.appendChild(e); return e;
    }
    el("line", { x1: padL, y1: H - padB, x2: W - 4, y2: H - padB, class: "axis" });
    [0, 0.5, 1].forEach(function (f) {
      var y = H - padB - f * (H - padB - padT);
      el("text", { x: padL - 6, y: y + 4, "text-anchor": "end", class: "tick" }, Math.round(maxP * f * 100) + "%");
    });
    vals.forEach(function (x, i) {
      var p = m.dist.pmf[x], bh = (p / maxP) * (H - padB - padT);
      var cls = "bar" + (x === m.dist.mode ? " mode" : "") + (reveal && m.rc + x === m.actual ? " actual" : "");
      var r = el("rect", { x: padL + i * bw + 1, y: H - padB - bh, width: Math.max(bw - 2, 1), height: bh, rx: 2, class: cls });
      var t = document.createElementNS(NS, "title"); t.textContent = "Count " + sgn(m.rc + x) + ": " + (p * 100).toFixed(1) + "%"; r.appendChild(t);
      if (vals.length <= 24 || i % 2 === 0)
        el("text", { x: padL + i * bw + bw / 2, y: H - padB + 16, "text-anchor": "middle", class: "tick" }, sgn(m.rc + x));
    });
    return svg;
  }
  function sgn(x) { return (x > 0 ? "+" : "") + x; }

  MathTab.prototype.renderMiss = function () {
    var h = this.ctx.h, self = this, m = this.miss, D = m.dist;
    var r68 = centralRange(D, 0.68), r95 = centralRange(D, 0.95);
    var input = h("input", { class: "ans num", type: "text", id: "miss-ans", "data-count": "miss", inputmode: "numeric",
      autocomplete: "off", placeholder: "e.g. -3" });
    var err = h("p", { class: "wrong small", role: "alert" });
    function submit() {
      var t = String(input.value).trim().replace(/[\u2212\u2013]/g, "-");
      if (!/^[+-]?\d+$/.test(t)) { err.textContent = "Enter a whole number, like 3, -2 or +1."; input.focus(); return; }
      self.answerMiss(parseInt(t, 10));
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    var flip = h("button", { type: "button", class: "btn", "aria-label": "Flip the sign of your estimate", onclick: function () {
      var v = input.value.trim(); input.value = v.charAt(0) === "-" ? v.slice(1) : "-" + v.replace(/^\+/, ""); input.focus(); } }, "±");
    var kSel = h("select", { "aria-label": "Unseen cards", onchange: function (e) { self.missK = parseInt(e.target.value, 10); self.newMiss(); self.render(); } },
      [5, 10, 20, 52].map(function (k) { return h("option", { value: k, selected: k === m.k ? "selected" : null }, k + " cards"); }));

    var sec = h("section", { class: "math-sec panel lab" },
      h("h3", { text: "10. Missed cards: estimating a count you lost track of" }),
      h("p", { text: "Say you know the running count, then some cards go by that you didn't see. You can't know the new count, but you can work out the probability of every possible value. The unseen cards are a random sample from what's left in the shoe, so the change in the count has an exact distribution." }),
      h("p", { class: "eq", text: "change D = (low cards among the k) − (high cards among the k)" }),
      h("p", { class: "eq", text: "P(a low, b neutral, c high) = C(l, a) · C(n, b) · C(h, c) ÷ C(N, k),  a + b + c = k" }),
      h("p", { class: "eq", text: "E[D] = k · (l − h) ÷ N = −k · RC ÷ N,   Var(D) = k · σ² · (N − k) ÷ (N − 1)" }),
      h("p", { class: "small", text: "Here l, n and h are the low, neutral and high cards left, N = l + n + h, σ² is the variance of one unseen card's tag, and (N − k) ÷ (N − 1) is the finite-population correction for drawing without replacement. Because l − h = −RC (section 3), the expected change always pulls the count back toward 0, but only by k ÷ N of it. The best single guess is usually the count you already had." }),
      h("p", { class: "row small" }, "Cards missed ", kSel));

    sec.appendChild(h("div", { class: "miss-q" },
      h("p", null, h("b", { text: "Your count was " + sgn(m.rc) + " with " + m.left + " cards (" + (m.left / 52).toFixed(2) + " decks) left. Then " + m.k + " cards went by unseen." })),
      m.answer ? null : h("div", null,
        h("label", { for: "miss-ans", text: "Most likely running count now" }),
        h("div", { class: "row" }, flip, input,
          h("button", { type: "button", class: "btn primary", onclick: submit }, "Check")), err)));

    if (m.answer) {
      var A = m.answer;
      sec.appendChild(h("div", { class: "feedback", "aria-live": "polite" },
        h("p", null, A.ok ? h("span", { class: "right", text: "Good estimate. " }) : h("span", { class: "wrong", text: "Not the most likely value. " }),
          "Most likely new count: ", h("span", { class: "hl num", text: sgn(m.rc + D.mode) }),
          " (" + (D.pmf[D.mode] * 100).toFixed(1) + "% chance). Average: " + sgn(Math.round((m.rc + D.mean) * 100) / 100) + "."),
        h("p", { class: "eq", text: "E[D] = −" + m.k + " × (" + sgn(m.rc) + ") ÷ " + m.left + " = " + (Math.round(D.mean * 100) / 100 || 0) +
          ",   SD = " + D.sd.toFixed(2) }),
        h("p", { text: "68% range: " + sgn(m.rc + r68[0]) + " to " + sgn(m.rc + r68[1]) + " (" + (r68[2] * 100).toFixed(0) + "%).  95% range: " +
          sgn(m.rc + r95[0]) + " to " + sgn(m.rc + r95[1]) + " (" + (r95[2] * 100).toFixed(0) + "%)." }),
        distChart(h, m, true),
        h("p", { class: "small muted" }, h("span", { class: "key-mode" }, "■"), " most likely  ", h("span", { class: "key-actual" }, "■"),
          " what the hidden cards actually made: " + sgn(m.actual)),
        h("div", { class: "cards lab-cards", "aria-label": "The cards you missed" }, m.hidden.map(function (c) { return self.ctx.cardEl(c); })),
        h("p", { class: "small muted", text: "Normal approximation for comparison: about " + sgn(Math.round(m.rc + D.mean)) + " ± " +
          (1.96 * D.sd).toFixed(1) + " for 95%. The exact bars above are what the game grades against." }),
        h("button", { type: "button", class: "btn primary", onclick: function () { self.newMiss(); self.render(); } }, "Try another")));
    }
    if (this.missStats) sec.appendChild(h("p", { class: "stats" }, h("span", null, "Estimates right ",
      h("b", { class: "num", text: this.missStats.right + "/" + this.missStats.n }))));
    return sec;
  };

  root.BJMath = { MathTab: MathTab, tagCorrelation: tagCorrelation, EOR: EOR, countShiftDist: countShiftDist, centralRange: centralRange };
  if (typeof module !== "undefined" && module.exports) module.exports = root.BJMath;
})(typeof window !== "undefined" ? window : this);
