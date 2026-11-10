/* UI: settings, the four modes, rendering. Depends on BJ (engine.js) and BJStrategy (strategy.js). */
(function () {
  "use strict";
  var BJ = window.BJ, S = window.BJStrategy;
  var DATA = window.BJ_DATA || { charts: {}, text: {} };
  var CHARTS = DATA.charts || {};

  /* ---------- Text (data/text/explanations.json overrides these defaults) ---------- */
  var TEXT = DATA.text || {};
  var ACTION_HELP = Object.assign({
    hit: "Take another card. You can keep hitting until you stand or go over 21.",
    stand: "Keep the total you have. Your turn ends.",
    double: "Double your bet, take exactly one more card, and your turn ends. Only on your first two cards.",
    split: "Turn a pair into two hands, each with its own bet. Each hand gets a second card.",
    surrender: "Give up right away and get half your bet back. Only as your first move on your first two cards."
  }, TEXT.actions || {});
  var CODE_WHY = TEXT.codes || {};
  var ACTION_LABEL = { hit: "Hit", stand: "Stand", double: "Double", split: "Split", surrender: "Surrender" };
  var ACTION_KEY = { hit: "h", stand: "s", double: "d", split: "p", surrender: "r" };
  var ACTIONS = ["hit", "stand", "double", "split", "surrender"];

  /* ---------- Small helpers ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) el.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
      else el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }
  // Empties el before a re-render. Holds el's height and the scroll position for one frame
  // so the page doesn't collapse and jump to the top while the new content is built.
  function clear(el) {
    var y = window.scrollY, hgt = el.offsetHeight;
    if (hgt) el.style.minHeight = hgt + "px";
    while (el.firstChild) el.removeChild(el.firstChild);
    if (hgt) requestAnimationFrame(function () {
      el.style.minHeight = "";
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    });
    return el;
  }
  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rand(arr.length)]; }
  function fmt(n) { var r = Math.round(n * 10) / 10 || 0; return (r > 0 ? "+" : "") + r; } // || 0 turns -0 into 0
  function signed(n) { return (n > 0 ? "+" : "") + n; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function cardEl(card, opts) {
    opts = opts || {};
    if (!card) return h("div", { class: "card back" + (opts.big ? " big" : ""), "aria-label": "face-down card" });
    var red = card.suit === "♥" || card.suit === "♦";
    return h("div", { class: "card" + (red ? " red" : "") + (opts.big ? " big" : "") + (opts.fresh ? " deal" : ""),
      role: "img", "aria-label": card.rank + " of " + card.suit },
      h("span", { class: "r", "aria-hidden": "true", text: card.rank }),
      h("span", { class: "s", "aria-hidden": "true", text: card.suit }));
  }
  function totalText(hand) {
    var s = hand.score();
    if (hand.isBlackjack()) return "Blackjack";
    if (s.total > 21) return s.total + ", bust";
    return (s.soft && s.total < 21 ? "soft " : "") + s.total;
  }
  /* ---------- Count answer fields ----------
   * Plain text fields, not type=number: number fields block "+2", reject decimals that
   * don't fit their step, and phone number pads often have no minus key. */
  function parseCount(str) {
    var t = String(str == null ? "" : str).trim().replace(/[\u2212\u2013]/g, "-").replace(/\s+/g, "");
    return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t) ? parseFloat(t) : NaN;
  }
  // -> {el, input}. The ± button flips the sign, for phone keyboards without a minus key.
  function countField(id, labelText) {
    var input = h("input", { class: "ans num", type: "text", id: id, autocomplete: "off", autocapitalize: "off",
      spellcheck: "false", placeholder: "e.g. -3" });
    var flip = h("button", { type: "button", class: "btn", "aria-label": "Flip the sign of " + labelText, onclick: function () {
      var v = input.value.trim();
      input.value = v.charAt(0) === "-" ? v.slice(1) : "-" + v.replace(/^\+/, "");
      input.focus();
    } }, "±");
    return { input: input, el: [h("label", { for: id, text: labelText }), h("div", { class: "row" }, input, flip)] };
  }
  // Wires a count form: checks every field parses before calling done(values...).
  function countForm(fields, done, extraTop) {
    var err = h("p", { class: "wrong small", role: "alert" });
    // Checked from a click/Enter handler rather than a form submit: previews that sandbox the
    // page without form permission (like the in-chat preview) silently block submits.
    function check() {
      for (var i = 0; i < fields.length; i++) {
        if (isNaN(parseCount(fields[i].input.value))) {
          err.textContent = "Enter a number for " + fields[i].input.labels[0].textContent.split(" (")[0].toLowerCase() + ", like 3, -2 or +1.";
          fields[i].input.focus();
          return;
        }
      }
      done.apply(null, fields.map(function (f) { return parseCount(f.input.value); }));
    }
    var form = h("div", { class: "check", role: "group", "aria-label": "Check your count" }, extraTop || null);
    fields.forEach(function (f) {
      f.input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); check(); } });
      f.input.setAttribute("enterkeyhint", "done");
      f.el.forEach(function (x) { form.appendChild(x); });
    });
    form.appendChild(err);
    form.appendChild(h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn primary", type: "button", onclick: check }, "Check")));
    setTimeout(function () {
      // On a phone the form can sit below the table; bring it into view before asking.
      if (window.innerWidth < 760 && form.scrollIntoView) form.scrollIntoView({ block: "center", behavior: "smooth" });
      fields[0].input.focus({ preventScroll: window.innerWidth < 760 });
    }, 0);
    return form;
  }

  // Paragraphs from data/text/explanations.json when present, else the built-in defaults.
  function paras(list, fallback) {
    var src = Array.isArray(list) && list.length ? list : fallback;
    return src.map(function (t) { return h("p", { text: String(t) }); });
  }
  function chartMissingNotice(rules) {
    return h("p", { class: "notice" },
      "The basic strategy chart for " + S.ruleSetLabel(rules) +
      " hasn't been added yet (task T1, data/strategy/" + S.ruleSetKey(rules) + ".csv). Strategy answers appear once it's added.");
  }
  // Explanation for a recommendation: the T5 text for its code if present, plus the chart's
  // fallback rule when the code has one (e.g. "Ds" = double, or stand if doubling isn't allowed).
  function whyText(rec) {
    var parts = [];
    if (CODE_WHY[rec.code]) parts.push(CODE_WHY[rec.code]);
    if (rec.code.length > 1 || rec.code === "D") parts.push("Chart code " + rec.code + ": " + S.CODE_NAMES[rec.code] + ".");
    return parts.join(" ");
  }

  /* ---------- Settings ---------- */
  var settings = { decks: parseInt(store("bj.decks") || "6", 10), h17: store("bj.h17") === "1" };
  if ([1, 2, 6].indexOf(settings.decks) < 0) settings.decks = 6;
  function rules() { return BJ.makeRules(settings); }

  var form = document.getElementById("settings");
  form.querySelector('input[name=decks][value="' + settings.decks + '"]').checked = true;
  form.querySelector('input[name=h17][value="' + (settings.h17 ? 1 : 0) + '"]').checked = true;
  form.addEventListener("change", function () {
    settings.decks = parseInt(form.querySelector("input[name=decks]:checked").value, 10);
    settings.h17 = form.querySelector("input[name=h17]:checked").value === "1";
    store("bj.decks", String(settings.decks)); store("bj.h17", settings.h17 ? "1" : "0");
    if (current) current.reset("Rules changed to " + S.ruleSetLabel(rules()) + ". New shuffle, count back to 0.");
  });

  // Footer: list chart sources actually loaded.
  (function () {
    var el = document.getElementById("chart-sources");
    var keys = Object.keys(CHARTS);
    clear(el);
    if (!keys.length) { el.textContent = "not added yet"; return; }
    keys.sort().forEach(function (k, i) {
      if (i) el.appendChild(document.createTextNode(", "));
      el.appendChild(h("a", { href: CHARTS[k].meta.source, rel: "noopener" }, k.replace("_", " ").toUpperCase()));
    });
  })();

  /* =================================================================
   * Table game: used by "Learn to play" (coach on), "Count while playing" (count checks on)
   * and "Full table" (count checks on, other players at the table)
   * ================================================================= */
  var SEAT_POS = { first: "First (acts first)", middle: "Middle", last: "Last (sees the most cards)" };
  function TableGame(root, opts) {
    this.root = root; this.opts = opts;
    this.stats = { hands: 0, net: 0, checks: 0, checksRight: 0, moves: 0, movesRight: 0 };
    this.checkEvery = opts.others ? 1 : 3;
    this.others = opts.others || 0;   // other players at the table
    this.seatPos = "last";
    this.reset();
  }
  TableGame.prototype.seats = function () { return this.others + 1; };
  TableGame.prototype.userSeat = function () {
    var n = this.seats();
    return this.seatPos === "first" ? 0 : this.seatPos === "middle" ? Math.floor((n - 1) / 2) : n - 1;
  };
  TableGame.prototype.seatName = function (seat) {
    if (seat === this.userSeat()) return "You";
    return "Player " + (seat < this.userSeat() ? seat + 1 : seat);
  };
  TableGame.prototype.reset = function (note) {
    var r = rules();
    this.shoe = new BJ.Shoe(r.decks);
    this.counter = new BJ.Counter();
    this.round = null;
    this.roundsSinceCheck = 0;
    this.pendingCheck = false;
    this.fresh = 0;
    this.coachMsg = null;
    this.lastCheck = null;
    this.stopBots();
    this.msg = note || "";
    this.render();
  };
  TableGame.prototype.deal = function () {
    var self = this;
    if (this.pendingCheck || (this.round && this.round.phase !== "done")) return;
    // Shuffle at the cut card, or early if there might not be enough cards for a full round.
    if (this.shoe.needsShuffle(this.seats() * 4 + 6)) {
      this.shoe.shuffle(); this.counter.reset();
      this.msg = "The dealer reached the cut card and shuffled. The count starts over at 0.";
    } else this.msg = "";
    this.coachMsg = null;
    this.round = new BJ.Round(this.shoe, rules(), {
      seats: this.seats(), userSeat: this.userSeat(),
      onExpose: function (c) { self.counter.see(c); },
      onReshuffle: function () {
        self.counter.reset();
        self.msg = "The shoe ran out mid-hand, so the dealer shuffled the discards. The count starts over at 0 from here.";
      }
    });
    this.round.start(1);
    this.afterMove();
  };
  // Other players play basic strategy, one move at a time so the user can follow and count.
  TableGame.prototype.stopBots = function () { if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; } };
  TableGame.prototype.stop = TableGame.prototype.stopBots;
  TableGame.prototype.runBots = function () {
    var self = this, rd = this.round;
    this.stopBots();
    if (!rd || rd.phase !== "player" || rd.isUserTurn()) return;
    this.botTimer = setTimeout(function () {
      self.botTimer = null;
      if (self.round !== rd || rd.phase !== "player" || rd.isUserTurn()) return;
      var hand = rd.current(), ok = rd.available();
      var rec = S.recommend(CHARTS, rules(), hand, rd.dealer.cards[0], ok);
      // Without a chart, other players fall back to "hit below 17".
      var move = rec ? rec.action : (hand.total() < 17 ? "hit" : "stand");
      if (!ok[move]) move = hand.total() < 17 ? "hit" : "stand";
      rd.act(move);
      self.afterMove();
    }, this.opts.botDelay || 650);
  };
  TableGame.prototype.act = function (action) {
    var rd = this.round;
    if (!rd || rd.phase !== "player" || !rd.isUserTurn() || !rd.available()[action]) return;
    if (this.opts.coach) {
      var rec = S.recommend(CHARTS, rules(), rd.current(), rd.dealer.cards[0], rd.available());
      if (rec) {
        this.stats.moves++;
        var good = rec.action === action;
        if (good) this.stats.movesRight++;
        this.coachMsg = { good: good, rec: rec, did: action, row: rec.row, col: rec.col };
      }
    }
    rd.act(action);
    this.afterMove();
  };
  TableGame.prototype.afterMove = function () {
    var rd = this.round;
    if (rd.phase === "done") {
      this.stats.hands++; this.stats.net += rd.net();
      if (this.opts.countChecks) {
        this.roundsSinceCheck++;
        if (this.roundsSinceCheck >= this.checkEvery) { this.pendingCheck = true; this.roundsSinceCheck = 0; }
      }
    }
    this.render();
    this.runBots();
  };
  TableGame.prototype.hint = function () {
    var rd = this.round;
    if (!rd || rd.phase !== "player" || !rd.isUserTurn()) return;
    var rec = S.recommend(CHARTS, rules(), rd.current(), rd.dealer.cards[0], rd.available());
    this.coachMsg = rec ? { hint: true, rec: rec } : { missing: true };
    this.render();
  };
  TableGame.prototype.submitCheck = function (rcVal, tcVal) {
    var rc = this.counter.running, tc = this.counter.trueCount(this.shoe);
    var rcOk = rcVal === rc;
    var tcOk = Math.abs(tcVal - tc) <= 0.5 + 1e-9;
    this.stats.checks++; if (rcOk && tcOk) this.stats.checksRight++;
    this.lastCheck = { rc: rc, tc: tc, rcOk: rcOk, tcOk: tcOk, rcVal: rcVal, tcVal: tcVal,
      decksLeft: this.shoe.decksRemaining() };
    this.pendingCheck = false;
    this.render();
  };
  TableGame.prototype.key = function (k) {
    if (k === "n" || k === "Enter") { if (!this.round || this.round.phase === "done") this.deal(); return; }
    for (var a in ACTION_KEY) if (ACTION_KEY[a] === k) this.act(a);
  };
  TableGame.prototype.render = function () {
    var self = this, rd = this.round, root = clear(this.root), o = this.opts;
    root.appendChild(o.intro());
    var inRound = rd && rd.phase === "player";
    var playing = inRound && rd.isUserTurn();
    var ok = playing ? rd.available() : {};

    // Dealer
    var dealerCards = [];
    if (rd) rd.dealer.cards.forEach(function (c, i) { dealerCards.push(i === 1 && !rd.holeRevealed ? cardEl(null) : cardEl(c)); });
    var dealerTotal = rd && rd.holeRevealed ? totalText(rd.dealer) : (rd ? "showing " + BJ.upcardKey(rd.dealer.cards[0]) : "");
    var dealer = h("section", { class: "spot", "aria-label": "Dealer" },
      h("h3", null, "Dealer", h("span", { class: "total", text: dealerTotal })),
      h("div", { class: "cards" }, dealerCards));

    // Seats: one section per seat, in the order they act.
    var multi = this.seats() > 1;
    var seatsEl = h("div", { class: multi ? "seats" : null });
    var userSeat = this.userSeat();
    for (var seat = 0; seat < this.seats(); seat++) {
      var hands = h("div", { class: "hands" });
      var mine = seat === userSeat;
      if (rd) rd.hands.forEach(function (hd, i) {
        if (hd.seat !== seat) return;
        var res = rd.results ? rd.results[i] : null;
        var resText = res ? ({ blackjack: "Blackjack, win 1.5", win: "Win", push: "Push (tie)", lose: "Lose",
          bust: "Bust", surrender: "Surrendered, half back" })[res.outcome] + (mine && res.net ? " (" + signed(res.net) + ")" : "") : "";
        var isActive = inRound && i === rd.active && (multi || rd.hands.length > 1);
        hands.appendChild(h("div", { class: "hand" + (isActive ? " active" : "") },
          h("div", { class: "cards" }, hd.cards.map(function (c) { return cardEl(c); })),
          h("div", { class: "res" }, h("b", { text: totalText(hd) }), hd.doubled ? " (doubled)" : "",
            resText ? h("span", { class: mine ? (res.net > 0 ? "right" : res.net < 0 ? "wrong" : "") : "muted" }, " " + resText) : null)));
      });
      var label = multi ? this.seatName(seat) : (rd && rd.hands.length > 1 ? "Your hands" : "You");
      seatsEl.appendChild(h("section", { class: "spot" + (multi ? " seat" : "") + (multi && mine ? " mine" : ""), "aria-label": label },
        h("h3", { text: label }), hands));
    }
    var player = seatsEl;

    // Actions
    var actions = h("div", { class: "row actions" });
    if (playing) {
      ACTIONS.forEach(function (a) {
        actions.appendChild(h("button", { class: "btn", disabled: !ok[a], onclick: function () { self.act(a); } },
          ACTION_LABEL[a], h("kbd", { text: ACTION_KEY[a].toUpperCase() })));
      });
      if (o.coach) actions.appendChild(h("button", { class: "btn", onclick: function () { self.hint(); } }, "What should I do?"));
    } else if (inRound) {
      actions.appendChild(h("p", { class: "muted", text: this.seatName(rd.current().seat) + " is playing. Count their cards." }));
    } else {
      actions.appendChild(h("button", { class: "btn primary", disabled: this.pendingCheck, onclick: function () { self.deal(); } },
        rd ? "Deal next hand" : "Deal", h("kbd", { text: "N" })));
    }

    var main = h("div", null, dealer, player, actions, h("p", { class: "msg", "aria-live": "polite", text: this.msg }));
    if (o.coach) main.appendChild(this.renderCoach());
    if (o.coach && playing) main.appendChild(h("ul", { class: "help-list" }, ACTIONS.map(function (a) {
      return h("li", null, h("b", { text: ACTION_LABEL[a] + ": " }), ACTION_HELP[a]);
    })));

    var grid = h("div", { class: "table-grid" + (o.countChecks ? " with-side" : "") }, main);
    if (o.countChecks) grid.appendChild(this.renderSide());
    root.appendChild(grid);

    var st = this.stats;
    var stats = h("p", { class: "stats" },
      h("span", null, "Hands ", h("b", { class: "num", text: String(st.hands) })),
      h("span", null, "Result ", h("b", { class: "num", text: signed(st.net) + " bets" })));
    if (o.coach && st.moves) stats.appendChild(h("span", null, "Strategy moves ", h("b", { class: "num", text: st.movesRight + "/" + st.moves })));
    if (o.countChecks) stats.appendChild(h("span", null, "Count checks ", h("b", { class: "num", text: st.checksRight + "/" + st.checks })));
    root.appendChild(stats);
  };
  TableGame.prototype.renderCoach = function () {
    var m = this.coachMsg, r = rules();
    if (!CHARTS[S.ruleSetKey(r)]) return chartMissingNotice(r);
    if (!m) return h("div");
    if (m.missing) return chartMissingNotice(r);
    if (m.hint) return h("div", { class: "coach", "aria-live": "polite" },
      "Basic strategy says ", h("span", { class: "hl", text: ACTION_LABEL[m.rec.action] }), ". ", whyText(m.rec));
    return h("div", { class: "coach", "aria-live": "polite" },
      m.good ? h("span", { class: "right", text: "Matches basic strategy. " })
        : h("span", null, h("span", { class: "wrong", text: "Basic strategy says " }), h("span", { class: "hl", text: ACTION_LABEL[m.rec.action] }), " (you chose " + ACTION_LABEL[m.did].toLowerCase() + "). "),
      whyText(m.rec));
  };
  TableGame.prototype.renderSide = function () {
    var self = this, side = h("aside", { class: "panel side" });
    var used = 1 - this.shoe.remaining() / this.shoe.total;
    side.appendChild(h("h3", { text: "Your count" }));
    side.appendChild(h("div", { class: "tray" },
      h("div", { class: "small muted", text: "Discard tray (cards already played)" }),
      h("div", { class: "tray-bar", role: "img", "aria-label": Math.round(used * 100) + "% of the shoe played" },
        h("div", { class: "tray-fill", style: "width:" + (used * 100).toFixed(1) + "%" })),
      h("div", { class: "small muted num", text: "About " + (Math.round(this.shoe.decksRemaining() * 2) / 2) + " of " + this.shoe.decks + " decks left" })));

    if (this.opts.others) {
      var others = h("select", { "aria-label": "Other players", onchange: function (e) { self.others = parseInt(e.target.value, 10); self.reset("Table changed. New shuffle, count back to 0."); } },
        [1, 2, 3, 4, 5, 6].map(function (n) { return h("option", { value: n, selected: n === self.others ? "selected" : null }, String(n)); }));
      var pos = h("select", { "aria-label": "Your seat", onchange: function (e) { self.seatPos = e.target.value; self.reset("Seat changed. New shuffle, count back to 0."); } },
        Object.keys(SEAT_POS).map(function (k) { return h("option", { value: k, selected: k === self.seatPos ? "selected" : null }, SEAT_POS[k]); }));
      side.appendChild(h("p", { class: "small" }, "Other players ", others));
      side.appendChild(h("p", { class: "small" }, "Your seat ", pos));
    }
    var every = h("select", { "aria-label": "Check my count every", onchange: function (e) { self.checkEvery = parseInt(e.target.value, 10); } },
      [1, 3, 5].map(function (n) { return h("option", { value: n, selected: n === self.checkEvery ? "selected" : null }, n === 1 ? "every hand" : "every " + n + " hands"); }));
    side.appendChild(h("p", { class: "small" }, "Check my count ", every));

    if (this.pendingCheck) {
      side.appendChild(countForm([countField("rc", "Running count"),
        countField("tc", "True count (running ÷ decks left, nearest whole number)")],
        function (rcv, tcv) { self.submitCheck(rcv, tcv); }));
    } else if (this.lastCheck) {
      var L = this.lastCheck;
      side.appendChild(h("div", { class: "small", "aria-live": "polite" },
        h("p", null, "Running count: ", h("span", { class: L.rcOk ? "right" : "wrong", text: L.rcOk ? "right" : "you said " + signed(L.rcVal) }),
          ". It was ", h("span", { class: "hl num", text: signed(L.rc) }), "."),
        h("p", null, "True count: ", h("span", { class: L.tcOk ? "right" : "wrong", text: L.tcOk ? "right" : "you said " + fmt(L.tcVal) }),
          ". It was ", h("span", { class: "hl num", text: fmt(L.tc) }),
          " (" + signed(L.rc) + " ÷ " + (Math.round(L.decksLeft * 100) / 100) + " decks left).")));
    } else {
      side.appendChild(h("p", { class: "small muted", text: "Keep a running count in your head as cards appear. The game stops to check it after the hand." }));
    }
    return side;
  };

  /* =================================================================
   * Strategy quiz
   * ================================================================= */
  function Quiz(root) { this.root = root; this.stats = { n: 0, right: 0, streak: 0 }; this.focus = "all"; this.showChart = false; this.reset(); }
  Quiz.prototype.reset = function (note) { this.note = note || ""; this.answer = null; this.next(); };
  Quiz.prototype.next = function () {
    var tens = ["10", "J", "Q", "K"];
    var cat = this.focus === "all" ? pick(["hard", "hard", "soft", "pair"]) : this.focus;
    var a, b;
    if (cat === "pair") {
      var r = pick(["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"]);
      a = r === "10" ? pick(tens) : r; b = r === "10" ? pick(tens) : r;
    } else if (cat === "soft") {
      a = "A"; b = String(2 + rand(8));
    } else {
      do { a = pick(["2", "3", "4", "5", "6", "7", "8", "9", "10"]); b = pick(["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]); }
      while (BJ.cardValue({ rank: a }) === BJ.cardValue({ rank: b }));
    }
    var suit = function () { return pick(BJ.SUITS); };
    this.hand = new BJ.Hand([{ rank: a, suit: suit() }, { rank: b, suit: suit() }]);
    this.up = { rank: pick(BJ.RANKS), suit: suit() };
    this.answer = null;
    this.render();
  };
  Quiz.prototype.choose = function (action) {
    if (this.answer) return;
    var rec = S.recommend(CHARTS, rules(), this.hand, this.up, { hit: true, stand: true, double: true, split: this.hand.isPair(), surrender: true });
    if (!rec) return;
    var good = rec.action === action;
    this.stats.n++; if (good) { this.stats.right++; this.stats.streak++; } else this.stats.streak = 0;
    this.answer = { rec: rec, did: action, good: good };
    this.render();
  };
  Quiz.prototype.key = function (k) {
    if (this.answer && (k === "n" || k === "Enter")) return this.next();
    for (var a in ACTION_KEY) if (ACTION_KEY[a] === k) this.choose(a);
  };
  Quiz.prototype.render = function () {
    var self = this, root = clear(this.root), r = rules();
    root.appendChild(h("div", { class: "intro" },
      h("h2", { text: "Basic strategy quiz" }),
      h("p", { text: "Basic strategy is the mathematically best play for every hand you can be dealt against every dealer upcard. It changes slightly with the number of decks and the soft 17 rule, so the quiz follows your settings above." })));
    if (this.note) root.appendChild(h("p", { class: "muted small", text: this.note }));
    if (!CHARTS[S.ruleSetKey(r)]) { root.appendChild(chartMissingNotice(r)); return; }

    var focus = h("select", { "aria-label": "Hands to practice", onchange: function (e) { self.focus = e.target.value; self.next(); } },
      [["all", "All hands"], ["hard", "Hard totals"], ["soft", "Soft totals (with an ace)"], ["pair", "Pairs"]].map(function (o) {
        return h("option", { value: o[0], selected: o[0] === self.focus ? "selected" : null }, o[1]);
      }));
    root.appendChild(h("p", { class: "row small" }, "Practice ", focus));

    root.appendChild(h("div", { class: "panel" },
      h("div", { class: "quiz-hand" },
        h("section", { class: "spot" }, h("h3", null, "Dealer shows"), h("div", { class: "cards" }, cardEl(this.up))),
        h("section", { class: "spot" }, h("h3", null, "You have", h("span", { class: "total", text: totalText(this.hand) })),
          h("div", { class: "cards" }, this.hand.cards.map(function (c) { return cardEl(c); })))),
      h("div", { class: "row actions" }, ACTIONS.map(function (a) {
        var disabled = !!self.answer || (a === "split" && !self.hand.isPair());
        return h("button", { class: "btn", disabled: disabled, onclick: function () { self.choose(a); } }, ACTION_LABEL[a], h("kbd", { text: ACTION_KEY[a].toUpperCase() }));
      })),
      this.renderFeedback()));

    root.appendChild(h("p", { class: "stats" },
      h("span", null, "Correct ", h("b", { class: "num", text: this.stats.right + "/" + this.stats.n })),
      h("span", null, "Streak ", h("b", { class: "num", text: String(this.stats.streak) }))));

    var toggle = h("button", { class: "btn", "aria-expanded": String(this.showChart), onclick: function () { self.showChart = !self.showChart; self.render(); } },
      this.showChart ? "Hide the chart" : "Show the full chart");
    root.appendChild(h("div", { style: "margin-top:16px" }, toggle));
    if (this.showChart) root.appendChild(renderChart(r, this.answer && this.answer.rec));
  };
  Quiz.prototype.renderFeedback = function () {
    var self = this, A = this.answer;
    if (!A) return h("p", { class: "feedback muted small", text: "Pick a move. Keyboard: H, S, D, P, R." });
    return h("div", { class: "feedback", "aria-live": "polite" },
      h("p", null, A.good ? h("span", { class: "right", text: "Correct. " }) : h("span", { class: "wrong", text: "Not quite. " }),
        "The right play is ", h("span", { class: "hl", text: ACTION_LABEL[A.rec.action] }), "."),
      h("p", { class: "small", text: whyText(A.rec) + " (Chart row " + A.rec.row + ", dealer " + A.rec.col + ".)" }),
      h("button", { class: "btn primary", onclick: function () { self.next(); } }, "Next hand", h("kbd", { text: "N" })));
  };

  function renderChart(r, rec) {
    var chart = CHARTS[S.ruleSetKey(r)];
    var cols = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
    var rows = Object.keys(chart.table);
    var table = h("table", { class: "chart" },
      h("caption", { class: "small", style: "text-align:left;padding-bottom:4px", text: "Basic strategy, " + S.ruleSetLabel(r) }),
      h("thead", null, h("tr", null, h("th", { scope: "col", text: "Hand" }), cols.map(function (c) { return h("th", { scope: "col", text: c }); }))),
      h("tbody", null, rows.map(function (row) {
        return h("tr", null, h("th", { scope: "row", text: row }), cols.map(function (c) {
          var on = rec && rec.row === row && rec.col === c;
          return h("td", { class: on ? "hit" : null, text: chart.table[row][c] });
        }));
      })));
    return h("div", { class: "chart-wrap" }, table,
      h("p", { class: "legend" }, "Rows: H = hard total, S = soft total (ace counted as 11), P = pair. Codes: ",
        Object.keys(S.CODE_NAMES).map(function (k) { return k + " " + S.CODE_NAMES[k].toLowerCase(); }).join("; "),
        ". Source: ", h("a", { href: chart.meta.source, rel: "noopener", text: chart.meta.source }), ", retrieved " + chart.meta.retrieved + "."));
  }

  /* =================================================================
   * Count drill: flip through the shoe, stop at random points to check the running count
   * ================================================================= */
  function Drill(root) { this.tutOpen = store("bj.tutSeen") !== "1"; this.root = root; this.speed = 0; this.perFlip = 1; this.askTrue = false; this.stats = { n: 0, right: 0 }; this.reset(); }
  Drill.prototype.reset = function (note) {
    this.stop();
    this.shoe = new BJ.Shoe(rules().decks, { penetration: 1 });
    this.counter = new BJ.Counter();
    this.showing = [];
    this.untilCheck = this.gap();
    this.pending = false; this.result = null; this.done = false;
    this.note = note || "";
    this.render();
  };
  Drill.prototype.gap = function () { return 8 + rand(10); };
  Drill.prototype.flip = function () {
    if (this.pending || this.done) return;
    this.result = null;
    this.showing = [];
    for (var i = 0; i < this.perFlip && this.shoe.remaining(); i++) {
      var c = this.shoe.draw(); this.counter.see(c); this.showing.push(c); this.untilCheck--;
    }
    if (!this.shoe.remaining()) { this.done = true; this.pending = true; this.stop(); }
    else if (this.untilCheck <= 0) { this.pending = true; this.stop(); }
    this.render(true);
  };
  Drill.prototype.stop = function () { if (this.timer) { clearInterval(this.timer); this.timer = null; } };
  Drill.prototype.play = function () {
    var self = this;
    this.stop();
    if (this.speed > 0) this.timer = setInterval(function () { self.flip(); }, this.speed);
    this.render();
  };
  Drill.prototype.submit = function (rcVal, tcVal) {
    var rc = this.counter.running, tc = this.counter.trueCount(this.shoe);
    var rcOk = rcVal === rc;
    var tcOk = !this.askTrue || this.done || Math.abs(tcVal - tc) <= 0.5 + 1e-9;
    this.stats.n++; if (rcOk && tcOk) this.stats.right++;
    this.result = { rc: rc, tc: tc, rcOk: rcOk, tcOk: tcOk, rcVal: rcVal, tcVal: tcVal, final: this.done, left: this.shoe.decksRemaining() };
    this.pending = false;
    this.untilCheck = this.gap();
    this.render();
  };
  Drill.prototype.key = function (k) {
    if (k === " " || k === "n") this.flip();
  };
  Drill.prototype.render = function (fresh) {
    var self = this, root = clear(this.root);
    root.appendChild(h("div", { class: "intro" },
      h("h2", { text: "Count drill" }),
      h("p", { class: "values", text: "+1 for 2–6.  0 for 7–9.  −1 for 10, J, Q, K, A." }),
      // Full tutorial is open the first time, then folds away so the cards sit higher on a phone.
      h("details", { class: "tutorial", open: this.tutOpen ? "open" : null,
        ontoggle: function (e) { self.tutOpen = e.target.open; store("bj.tutSeen", "1"); } },
        h("summary", { text: "How Hi-Lo counting works" }),
        paras(TEXT.hilo_tutorial, [
          "Hi-Lo gives every card a value: 2 through 6 count +1, 7 through 9 count 0, and tens, faces and aces count −1. Add them up as the cards go by. That total is the running count.",
          "A plus count means more high cards are left in the shoe than low ones. A full shoe always adds up to exactly 0, so if you counted every card right you'll end at 0."]))));
    if (this.note) root.appendChild(h("p", { class: "muted small", text: this.note }));

    var speed = h("select", { "aria-label": "Flip speed", onchange: function (e) { self.speed = parseInt(e.target.value, 10); self.play(); } },
      [[0, "I'll flip each card"], [2000, "Auto: every 2 s"], [1000, "Auto: every 1 s"], [600, "Auto: every 0.6 s"]].map(function (o) {
        return h("option", { value: o[0], selected: o[0] === self.speed ? "selected" : null }, o[1]); }));
    var per = h("select", { "aria-label": "Cards per flip", onchange: function (e) { self.perFlip = parseInt(e.target.value, 10); } },
      [1, 2].map(function (n) { return h("option", { value: n, selected: n === self.perFlip ? "selected" : null }, n + (n === 1 ? " card" : " cards") + " at a time"); }));
    var tcBox = h("input", { type: "checkbox", id: "asktc", checked: this.askTrue ? "checked" : null, onchange: function (e) { self.askTrue = e.target.checked; } });
    root.appendChild(h("div", { class: "row small", style: "margin-bottom:16px" }, speed, per,
      h("label", null, tcBox, " Also ask the true count")));

    var stage = h("div", { class: "panel" });
    var cards = h("div", { class: "drill-cards" }, this.showing.length ? this.showing.map(function (c) { return cardEl(c, { big: true, fresh: fresh }); }) : cardEl(null, { big: true }));
    var used = this.shoe.total - this.shoe.remaining();
    var side = h("div", null,
      h("p", { class: "num", text: used + " of " + this.shoe.total + " cards dealt" }),
      this.pending || this.done ? null : h("button", { class: "btn primary", onclick: function () { self.flip(); } }, "Flip", h("kbd", { text: "Space" })),
      this.timer ? h("button", { class: "btn", style: "margin-left:8px", onclick: function () { self.speed = 0; self.stop(); self.render(); } }, "Pause") : null);
    stage.appendChild(h("div", { class: "drill-stage" }, cards, side));

    if (this.pending) {
      var fields = [countField("drc", "Running count")];
      if (this.askTrue && !this.done)
        fields.push(countField("dtc", "True count (" + (Math.round(this.shoe.decksRemaining() * 2) / 2) + " decks left, nearest whole number)"));
      stage.appendChild(countForm(fields, function (rcv, tcv) { self.submit(rcv, tcv); },
        h("p", null, h("b", { text: this.done ? "That's the whole shoe. What's your final running count?" : "Stop. What's the running count?" }))));
    } else if (this.result) {
      var R = this.result;
      stage.appendChild(h("div", { class: "feedback", "aria-live": "polite" },
        h("p", null, R.rcOk ? h("span", { class: "right", text: "Right. " }) : h("span", { class: "wrong", text: "You said " + signed(R.rcVal) + ". " }),
          "The running count is ", h("span", { class: "hl num", text: signed(R.rc) }), "."),
        this.askTrue && !R.final ? h("p", null, R.tcOk ? h("span", { class: "right", text: "True count right. " }) : h("span", { class: "wrong", text: "True count: you said " + fmt(R.tcVal) + ". " }),
          "It's ", h("span", { class: "hl num", text: fmt(R.tc) }), " (" + signed(R.rc) + " ÷ " + (Math.round(R.left * 100) / 100) + " decks left).") : null,
        R.final ? h("button", { class: "btn primary", onclick: function () { self.reset(); } }, "Shuffle and start again") : null));
    }
    root.appendChild(stage);
    root.appendChild(h("p", { class: "stats" }, h("span", null, "Checks right ", h("b", { class: "num", text: this.stats.right + "/" + this.stats.n }))));
  };

  /* =================================================================
   * Modes and routing
   * ================================================================= */
  function learnIntro() {
    return h("div", { class: "intro" },
      h("h2", { text: "Learn to play" }),
      h("p", { text: "Get closer to 21 than the dealer without going over. Number cards are worth their number, J, Q and K are worth 10, and an ace is worth 11 or 1, whichever helps. A hand with an ace counted as 11 is called soft." }),
      h("p", { text: "The dealer has to hit until reaching 17 or more. Press Deal, and after each move the coach tells you whether it matches basic strategy." }));
  }
  function countIntro() {
    return h("div", { class: "intro" },
      h("h2", { text: "Count while playing" }),
      h("p", { text: "Play normally and keep the Hi-Lo running count of every card you see, including the dealer's hidden card once it's turned over. Every few hands the game stops and asks for your running count and true count." }),
      paras(TEXT.true_count, ["True count = running count ÷ decks left in the shoe. Use the discard tray to estimate decks left, the same way players do at a real table."]));
  }

  function tableIntro() {
    return h("div", { class: "intro" },
      h("h2", { text: "Full table" }),
      h("p", { text: "A real table has other players, and every card they're dealt counts too. Here the other players play basic strategy on their own while you keep the running count of the whole table: their cards, your cards, and the dealer's." }),
      h("p", { text: "Pick how many players and where you sit. Sitting last means you see everyone else's cards before you decide." }));
  }

  var app = document.getElementById("app");
  var builders = {
    learn: function (el) { return new TableGame(el, { coach: true, intro: learnIntro }); },
    quiz: function (el) { return new Quiz(el); },
    drill: function (el) { return new Drill(el); },
    count: function (el) { return new TableGame(el, { countChecks: true, intro: countIntro }); },
    table: function (el) { return new TableGame(el, { countChecks: true, others: 3, intro: tableIntro }); }
  };
  var instances = {}, current = null, currentName = null;
  var holders = {};
  function show(name) {
    if (!builders[name]) name = "learn";
    if (current && current.stop) current.stop();
    Object.keys(holders).forEach(function (k) { holders[k].hidden = true; });
    if (!holders[name]) { holders[name] = h("div", { role: "tabpanel" }); app.appendChild(holders[name]); instances[name] = builders[name](holders[name]); }
    holders[name].hidden = false;
    // Drop focus from the tab so keyboard shortcuts (like Space to flip) go to the mode.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    current = instances[name]; currentName = name;
    if (current.runBots) current.runBots(); // resume other players if we left mid-round
    document.querySelectorAll(".modes button").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.mode === name)); });
    store("bj.mode", name);
  }
  document.querySelectorAll(".modes button").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.mode); }); });
  document.addEventListener("keydown", function (e) {
    if (!current || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target.tagName;
    if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
    if (t === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === " ") e.preventDefault();
    current.key(k);
  });
  // A settings change resets every mode that's been opened, not just the visible one.
  form.addEventListener("change", function () {
    Object.keys(instances).forEach(function (k) { if (instances[k] !== current) instances[k].reset(); });
  });
  show(store("bj.mode") || "learn");
})();
