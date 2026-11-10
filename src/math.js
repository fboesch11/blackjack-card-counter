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

  function MathTab(el, ctx) {
    this.root = el; this.ctx = ctx;
    this.reset();
  }
  MathTab.prototype.reset = function () {
    this.shoe = new BJ.Shoe(this.ctx.rules().decks, { penetration: 1 });
    this.seen = [];
    this.render();
  };
  MathTab.prototype.key = function () {};
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

  root.BJMath = { MathTab: MathTab, tagCorrelation: tagCorrelation, EOR: EOR };
  if (typeof module !== "undefined" && module.exports) module.exports = root.BJMath;
})(typeof window !== "undefined" ? window : this);
