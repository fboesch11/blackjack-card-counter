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
  /* True count grading (Faith, Nov 10): show the answer to one decimal, and count an answer right
   * when it rounds to the same whole number as that one-decimal answer. Rounding the shown value
   * (not the raw one) keeps grading consistent with what's on screen, e.g. 1.46 shows as 1.5 → 2.
   * Halves round away from zero (1.5 → 2, −1.5 → −2). */
  function tenth(x) { return Math.round(x * 10) / 10 || 0; }
  function wholeTC(x) { var r = Math.sign(x) * Math.round(Math.abs(tenth(x))); return r || 0; }
  function tcRight(userVal, exact) { return wholeTC(userVal) === wholeTC(exact); }
  // "+1.7, which rounds to +2" (or just "+2" when the tenth is already whole).
  function tcText(exact) {
    var t = tenth(exact), w = wholeTC(exact);
    return t === w ? signed(w) : fmt(t) + ", which rounds to " + signed(w);
  }
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
  // decimals: true for the true count. inputmode opens the phone's number pad (numeric = digits,
  // decimal = digits and a decimal point). Those pads have no minus key, hence the ± button.
  // Ids are made unique per field: two modes can have a count question open at once, and a
  // shared id would tie each label to the hidden screen's box. data-count keeps a stable hook.
  var fieldSeq = 0;
  function countField(name, labelText, decimals) {
    var id = name + "-" + (++fieldSeq);
    var input = h("input", { class: "ans num", type: "text", id: id, "data-count": name, autocomplete: "off", autocapitalize: "off",
      spellcheck: "false", placeholder: "e.g. -3", inputmode: decimals ? "decimal" : "numeric" });
    var flip = h("button", { type: "button", class: "btn", "aria-label": "Flip the sign of " + labelText, onclick: function () {
      var v = input.value.trim();
      input.value = v.charAt(0) === "-" ? v.slice(1) : "-" + v.replace(/^\+/, "");
      input.focus();
    } }, "±");
    return { input: input, label: labelText, el: [h("label", { for: id, text: labelText }), h("div", { class: "row" }, flip, input),
      h("p", { class: "small muted hint-neg", text: "Negative? Tap ± to add or remove the minus sign." })] };
  }
  // Wires a count form: checks every field parses before calling done(values...).
  function countForm(fields, done, extraTop) {
    var err = h("p", { class: "wrong small", role: "alert" });
    // Checked from a click/Enter handler rather than a form submit: previews that sandbox the
    // page without form permission (like the in-chat preview) silently block submits.
    function check() {
      for (var i = 0; i < fields.length; i++) {
        if (isNaN(parseCount(fields[i].input.value))) {
          err.textContent = "Enter a number for " + fields[i].label.split(" (")[0].toLowerCase() + ", like 3, -2 or +1.";
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
   * and "Full table practice" (count checks on, other players at the table)
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
  // Each other player gets their own habit: how often they miss a close call (5% to 30%).
  TableGame.prototype.botSlop = function (seat) {
    this.slop = this.slop || {};
    if (this.slop[seat] == null) this.slop[seat] = [0.05, 0.1, 0.15, 0.2, 0.3][rand(5)];
    return this.slop[seat];
  };
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
      // Now and then a player gets a close call wrong, like real players do.
      if (rec && Math.random() < self.botSlop(hand.seat)) move = S.closeCallMistake(rec, hand, rd.dealer.cards[0], ok) || move;
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
    var tcOk = tcRight(tcVal, tc);
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
    // introBelow: game first, instructions after (Faith asked for this in Count while playing).
    if (!o.introBelow) root.appendChild(o.intro());
    else root.appendChild(h("h2", { class: "drill-title", text: o.title }));
    var inRound = rd && rd.phase === "player";
    var playing = inRound && rd.isUserTurn();
    var ok = playing ? rd.available() : {};

    var t = this.buildTable(inRound), dealer = t.dealer, player = t.seats;

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
    if (o.introBelow) {
      var help = o.intro();
      help.classList.add("drill-help");
      var h2 = help.querySelector("h2");
      if (h2) h2.replaceWith(h("h3", { text: "How this mode works" }));
      root.appendChild(help);
    }
  };
  // Dealer and seat sections for the current round (shared with the betting game).
  TableGame.prototype.buildTable = function (inRound) {
    var self = this, rd = this.round;
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
          bust: "Bust", surrender: "Surrendered, half back" })[res.outcome] + (mine && res.net ? " (" + (self.fmtNet ? self.fmtNet(res.net) : signed(res.net)) + ")" : "") : "";
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
    return { dealer: dealer, seats: seatsEl };
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
        countField("tc", "True count (running ÷ decks left, nearest whole number)", true)],
        function (rcv, tcv) { self.submitCheck(rcv, tcv); }));
    } else if (this.lastCheck) {
      var L = this.lastCheck;
      side.appendChild(h("div", { class: "small", "aria-live": "polite" },
        h("p", null, "Running count: ", h("span", { class: L.rcOk ? "right" : "wrong", text: L.rcOk ? "right" : "you said " + signed(L.rcVal) }),
          ". It was ", h("span", { class: "hl num", text: signed(L.rc) }), "."),
        h("p", null, "True count: ", h("span", { class: L.tcOk ? "right" : "wrong", text: L.tcOk ? "right" : "you said " + fmt(L.tcVal) }),
          ". It was ", h("span", { class: "hl num", text: tcText(L.tc) }),
          " (" + signed(L.rc) + " ÷ " + (Math.round(L.decksLeft * 100) / 100) + " decks left).")));
    } else {
      side.appendChild(h("p", { class: "small muted", text: "Keep a running count in your head as cards appear. The game stops to check it after the hand." }));
    }
    return side;
  };

  /* =================================================================
   * Bet the count: a bankroll session against the dealer with bots. No hints or count checks
   * during play; when the player cashes out or runs out of money, a summary lists every blunder.
   * ================================================================= */
  // Thresholds for betting blunders. Below +1 the house still has the edge; at +2 and up the
  // player does (simulation figures cited on screen). In between, either bet is accepted.
  var SIM = { noEdgeBelow: 1, edgeAt: 2, riskyShare: 0.25, maxUnits: 50 };
  var SIM_SRC = {
    edge: "https://wizardofvegas.com/forum/questions-and-answers/math/36973-blackjack-card-count-probability/",
    action: "https://www.actionnetwork.com/casino/blackjack/how-to-count-cards",
    wiki: "https://en.wikipedia.org/wiki/Card_counting",
    hilo: "https://wizardofodds.com/games/blackjack/card-counting/high-low/"
  };
  function money(x) {
    var r = Math.round(x * 100) / 100, a = Math.abs(r);
    return (r < 0 ? "−" : "") + "$" + a.toLocaleString("en-US", { minimumFractionDigits: a % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function moneyNet(x) { return (x > 0 ? "+" : "") + money(x); }
  // Suggested bet in table-minimum units by true count. This is the game's own teaching ramp,
  // not a published standard: 1 unit up to +1, then 2, 4, 6 and 8 units at +2, +3, +4, +5 and up.
  function rampUnits(tc) { var t = wholeTC(tc); return t <= 1 ? 1 : t === 2 ? 2 : t === 3 ? 4 : t === 4 ? 6 : 8; }
  function pearson(xs, ys) {
    var n = xs.length; if (n < 3) return null;
    var mx = 0, my = 0, i; for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n;
    var c = 0, vx = 0, vy = 0;
    for (i = 0; i < n; i++) { c += (xs[i] - mx) * (ys[i] - my); vx += Math.pow(xs[i] - mx, 2); vy += Math.pow(ys[i] - my, 2); }
    return vx && vy ? c / Math.sqrt(vx * vy) : null;
  }

  function SimGame(root, opts) {
    this.setup = { bank: 1000, min: 10, others: 3, seatPos: "last" };
    TableGame.call(this, root, opts);
  }
  SimGame.prototype = Object.create(TableGame.prototype);
  SimGame.prototype.constructor = SimGame;
  SimGame.prototype.fmtNet = moneyNet;

  // A rules change mid-session ends the session (so its results aren't lost); otherwise back to setup.
  SimGame.prototype.reset = function (note) {
    this.stopBots();
    if (this.phase === "play" && this.session && this.session.hands.length && (!this.round || this.round.phase === "done")) {
      this.finish("rules"); return;
    }
    this.phase = "setup"; this.session = null; this.round = null; this.msg = note || "";
    this.render();
  };
  SimGame.prototype.start = function () {
    var r = rules(), st = this.setup;
    this.others = st.others; this.seatPos = st.seatPos;
    this.shoe = new BJ.Shoe(r.decks); this.counter = new BJ.Counter();
    this.session = { start: st.bank, bank: st.bank, min: st.min, max: st.min * SIM.maxUnits, bet: st.min,
      hands: [], strategy: [], decisions: 0, end: null, finalGuess: null, rules: S.ruleSetLabel(r) };
    this.phase = "play"; this.round = null; this.msg = "";
    this.render();
  };
  SimGame.prototype.betting = function () { return this.phase === "play" && (!this.round || this.round.phase === "done"); };
  SimGame.prototype.betProblem = function () {
    var ses = this.session, cap = Math.min(ses.max, ses.bank);
    if (ses.bet < ses.min) return "The table minimum is " + money(ses.min) + ".";
    if (ses.bet > ses.bank) return "You only have " + money(ses.bank) + ".";
    if (ses.bet > cap) return "The table maximum is " + money(ses.max) + ".";
    return "";
  };
  SimGame.prototype.setBet = function (v) {
    if (!this.betting()) return;
    this.session.bet = Math.max(0, Math.round(v * 100) / 100);
    this.render();
  };
  SimGame.prototype.deal = function () {
    var self = this, ses = this.session;
    if (!this.betting() || this.betProblem()) return;
    if (this.shoe.needsShuffle(this.seats() * 4 + 6)) {
      this.shoe.shuffle(); this.counter.reset();
      this.msg = "The dealer shuffled. Start your count over at 0.";
    } else this.msg = "";
    // The count at the moment the bet goes out is what the bet is graded against.
    ses.hands.push({ n: ses.hands.length + 1, bet: ses.bet, tc: this.counter.trueCount(this.shoe), rc: this.counter.running,
      decksLeft: this.shoe.decksRemaining(), bankBefore: ses.bank, net: 0, outcome: "" });
    this.round = new BJ.Round(this.shoe, rules(), {
      seats: this.seats(), userSeat: this.userSeat(),
      onExpose: function (c) { self.counter.see(c); },
      onReshuffle: function () {
        self.counter.reset();
        self.msg = "The shoe ran out mid-hand and the dealer shuffled the discards. Start your count over at 0.";
      }
    });
    this.round.start(ses.bet);
    this.afterMove();
  };
  // What the player can do now, including whether there's money left to double or split.
  SimGame.prototype.allowedNow = function () {
    var rd = this.round, ok = rd.available(), hand = rd.current();
    var onTable = rd.seatHands(rd.userSeat).reduce(function (sum, x) { return sum + x.bet; }, 0);
    if (this.session.bank - onTable < hand.bet) { ok.double = false; ok.split = false; }
    return ok;
  };
  SimGame.prototype.act = function (action) {
    var rd = this.round;
    if (!rd || rd.phase !== "player" || !rd.isUserTurn()) return;
    var ok = this.allowedNow();
    if (!ok[action]) return;
    var hand = rd.current(), up = rd.dealer.cards[0], ses = this.session;
    var rec = S.recommend(CHARTS, rules(), hand, up, ok);
    ses.decisions++;
    if (rec && rec.action !== action)
      ses.strategy.push({ n: ses.hands.length, cards: hand.cards.slice(), up: up, total: totalText(hand), did: action, should: rec.action,
        code: rec.code, tc: this.counter.trueCount(this.shoe) });
    rd.act(action);
    this.afterMove();
  };
  SimGame.prototype.afterMove = function () {
    var rd = this.round, ses = this.session;
    if (rd && rd.phase === "done" && !rd.settled) {
      rd.settled = true;
      var net = rd.net(), last = ses.hands[ses.hands.length - 1];
      ses.bank = Math.round((ses.bank + net) * 100) / 100;
      last.net = net;
      last.outcome = rd.results.filter(function (x) { return x.seat === rd.userSeat; }).map(function (x) { return x.outcome; }).join(", ");
      if (ses.bank < ses.min) { this.finish("broke"); return; }
      if (ses.bet > ses.bank) ses.bet = Math.floor(ses.bank);
    }
    this.render();
    this.runBots();
  };
  SimGame.prototype.finish = function (reason) {
    this.stopBots();
    this.session.end = reason;
    this.session.finalCount = this.counter.running;
    this.session.finalTC = this.counter.trueCount(this.shoe);
    this.phase = "final";
    this.render();
  };
  SimGame.prototype.key = function (k) {
    if (this.phase !== "play") return;
    if (k === "n" || k === "Enter") { this.deal(); return; }
    for (var a in ACTION_KEY) if (ACTION_KEY[a] === k) this.act(a);
  };

  SimGame.prototype.intro = function () {
    return h("section", { class: "intro drill-help", "aria-label": "How this mode works" },
      h("h3", { text: "How this mode works" }),
      h("p", { text: "You start with a set amount of money and play against the dealer with other players at the table. Before each hand, set your bet. Keep the Hi-Lo count yourself. Nothing on screen tells you the count or the right play while you're playing." }),
      h("p", { text: "When the true count is +2 or higher, the cards left favor you, so that's the time to bet more. Below +1, the house has the edge, so bet the minimum. Between +1 and +2, either is fine." }),
      h("p", { text: "Cash out whenever you like. The session also ends if you can't cover the table minimum. Then you get a summary of every betting and strategy blunder you made." }),
      h("p", { class: "small muted", text: "The other players mostly play basic strategy but sometimes get a close call wrong. The discard tray is shown, like at a real table, so you can estimate decks left. Insurance isn't offered in this game." }));
  };

  SimGame.prototype.render = function () {
    var root = clear(this.root);
    root.appendChild(h("h2", { class: "drill-title", text: "Bet the count" }));
    if (this.phase === "setup") this.renderSetup(root);
    else if (this.phase === "play") this.renderPlay(root);
    else if (this.phase === "final") this.renderFinal(root);
    else this.renderSummary(root);
    if (this.phase !== "summary") root.appendChild(this.intro());
  };
  SimGame.prototype.renderSetup = function (root) {
    var self = this, st = this.setup;
    function sel(label, key, opts, fmtOpt) {
      return h("label", { class: "setup-field" }, h("span", { text: label }),
        h("select", { "aria-label": label, onchange: function (e) { st[key] = isNaN(+e.target.value) ? e.target.value : +e.target.value; } },
          opts.map(function (v) { return h("option", { value: v, selected: v === st[key] ? "selected" : null }, fmtOpt(v)); })));
    }
    if (this.msg) root.appendChild(h("p", { class: "muted small", text: this.msg }));
    root.appendChild(h("div", { class: "panel setup" },
      h("p", { text: "Rules: " + S.ruleSetLabel(rules()) + ". Change decks or soft 17 above before you start." }),
      h("div", { class: "setup-grid" },
        sel("Starting money", "bank", [500, 1000, 2000, 5000], money),
        sel("Table minimum", "min", [5, 10, 25], money),
        sel("Other players", "others", [0, 1, 2, 3, 4, 5, 6], String),
        sel("Your seat", "seatPos", Object.keys(SEAT_POS), function (k) { return SEAT_POS[k]; })),
      h("p", { class: "small muted", text: "Table maximum is " + SIM.maxUnits + " times the minimum." }),
      h("button", { class: "btn primary", type: "button", onclick: function () { self.start(); } }, "Start session")));
  };
  SimGame.prototype.renderPlay = function (root) {
    var self = this, rd = this.round, ses = this.session;
    var inRound = rd && rd.phase === "player";
    var mine = inRound && rd.isUserTurn();
    var t = this.buildTable(inRound);

    var actions = h("div", { class: "row actions" });
    if (mine) {
      var ok = this.allowedNow();
      ACTIONS.forEach(function (a) {
        actions.appendChild(h("button", { class: "btn", disabled: !ok[a], onclick: function () { self.act(a); } },
          ACTION_LABEL[a], h("kbd", { text: ACTION_KEY[a].toUpperCase() })));
      });
    } else if (inRound) {
      actions.appendChild(h("p", { class: "muted", text: this.seatName(rd.current().seat) + " is playing." }));
    }
    var main = h("div", null, t.dealer, t.seats, actions, h("p", { class: "msg", "aria-live": "polite", text: this.msg }));
    if (this.betting()) main.appendChild(this.renderBet());

    var used = 1 - this.shoe.remaining() / this.shoe.total;
    var side = h("aside", { class: "panel side sim-side" },
      h("p", { class: "bank" }, h("span", { class: "small muted", text: "Your money" }), h("b", { class: "num", text: money(ses.bank) })),
      h("p", { class: "small muted num", text: "Started with " + money(ses.start) + ". Hands played: " + ses.hands.length + "." }),
      h("div", { class: "tray" },
        h("div", { class: "small muted", text: "Discard tray (cards already played)" }),
        h("div", { class: "tray-bar", role: "img", "aria-label": Math.round(used * 100) + "% of the shoe played" },
          h("div", { class: "tray-fill", style: "width:" + (used * 100).toFixed(1) + "%" })),
        h("div", { class: "small muted num", text: "About " + (Math.round(this.shoe.decksRemaining() * 2) / 2) + " of " + this.shoe.decks + " decks left" })),
      h("button", { class: "btn", type: "button", disabled: !this.betting(), onclick: function () { self.finish("cashout"); } }, "Cash out and see summary"));
    root.appendChild(h("div", { class: "table-grid with-side" }, main, side));
  };
  SimGame.prototype.renderBet = function () {
    var self = this, ses = this.session, prob = this.betProblem();
    // Casino chip values at or above the table minimum.
    var chips = [ses.min, 25, 100, 500].filter(function (v, i, a) { return v >= ses.min && a.indexOf(v) === i; }).map(function (v) {
      return h("button", { class: "btn chip", type: "button", onclick: function () { self.setBet(ses.bet + v); } }, "+" + money(v));
    });
    return h("div", { class: "panel bet-panel" },
      h("p", { class: "bet-line" }, "Your bet ", h("b", { class: "num", text: money(ses.bet) })),
      h("div", { class: "row" }, chips,
        h("button", { class: "btn", type: "button", onclick: function () { self.setBet(ses.min); } }, "Minimum"),
        h("button", { class: "btn", type: "button", onclick: function () { self.setBet(0); } }, "Clear")),
      prob ? h("p", { class: "wrong small", role: "alert", text: prob }) : null,
      h("div", { class: "row", style: "margin-top:10px" },
        h("button", { class: "btn primary", type: "button", disabled: !!prob, onclick: function () { self.deal(); } },
          "Deal " + money(ses.bet), h("kbd", { text: "N" }))));
  };
  SimGame.prototype.renderFinal = function (root) {
    var self = this, ses = this.session;
    var why = { cashout: "You cashed out.", broke: "You don't have enough left for the " + money(ses.min) + " minimum, so the session is over.",
      rules: "The table rules changed, so the session ended." }[ses.end];
    var field = countField("final-rc", "Running count when you stopped");
    var form = countForm([field], function (v) { ses.finalGuess = v; self.phase = "summary"; self.render(); },
      h("p", null, h("b", { text: why + " One last check before your summary: what's your running count?" })));
    form.appendChild(h("button", { class: "btn", type: "button", style: "margin-top:8px",
      onclick: function () { self.phase = "summary"; self.render(); } }, "Skip"));
    root.appendChild(h("div", { class: "panel" }, form));
  };

  SimGame.prototype.analyze = function () {
    var ses = this.session, out = { noEdge: 0, missed: 0, risky: 0, wagered: 0, biggest: 0, blunders: [] };
    ses.hands.forEach(function (x) {
      var tc = tenth(x.tc);
      x.suggest = Math.min(rampUnits(x.tc) * ses.min, ses.max, x.bankBefore);
      x.flags = [];
      if (x.bet > ses.min && tc < SIM.noEdgeBelow) { x.flags.push("noEdge"); out.noEdge++; }
      // Only a blunder if there was money to raise with.
      if (x.bet <= ses.min && tc >= SIM.edgeAt && x.bankBefore >= 2 * ses.min) { x.flags.push("missed"); out.missed++; }
      if (x.bet > SIM.riskyShare * x.bankBefore) { x.flags.push("risky"); out.risky++; }
      out.wagered += x.bet; out.biggest = Math.max(out.biggest, x.bet);
      x.flags.forEach(function (f) { out.blunders.push({ n: x.n, kind: f, hand: x }); });
    });
    ses.strategy.forEach(function (s) { out.blunders.push({ n: s.n, kind: "strategy", s: s }); });
    out.blunders.sort(function (a, b) { return a.n - b.n; });
    out.corr = pearson(ses.hands.map(function (x) { return x.tc; }), ses.hands.map(function (x) { return x.bet; }));
    return out;
  };
  // Scatter of bet size against the true count when the bet went out, with the no-edge and
  // edge zones shaded. Points with a betting blunder are drawn in red.
  function betChart(ses) {
    var NS = "http://www.w3.org/2000/svg", W = 640, H = 240, L = 48, B = 34, T = 12, R = 10;
    var hs = ses.hands; if (!hs.length) return null;
    var tcs = hs.map(function (x) { return tenth(x.tc); });
    var lo = Math.min(-4, Math.floor(Math.min.apply(null, tcs))), hi = Math.max(6, Math.ceil(Math.max.apply(null, tcs)));
    var maxU = Math.max(4, Math.ceil(Math.max.apply(null, hs.map(function (x) { return x.bet / ses.min; }))));
    var X = function (v) { return L + (v - lo) / (hi - lo) * (W - L - R); };
    var Y = function (u) { return H - B - (u / (maxU * 1.12)) * (H - B - T - 14); };  // headroom for the zone labels
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "dist bets");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Bet size against true count for each hand");
    function el(tag, a, txt) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; }
    el("rect", { x: X(lo), y: T, width: X(SIM.noEdgeBelow) - X(lo), height: H - B - T, class: "zone-house" });
    el("rect", { x: X(SIM.edgeAt), y: T, width: X(hi) - X(SIM.edgeAt), height: H - B - T, class: "zone-player" });
    el("text", { x: X(lo) + 6, y: T + 14, class: "tick" }, "House edge: bet the minimum");
    el("text", { x: X(hi) - 6, y: T + 14, "text-anchor": "end", class: "tick" }, "Your edge: bet more");
    el("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, class: "axis" });
    el("line", { x1: L, y1: T, x2: L, y2: H - B, class: "axis" });
    for (var v = lo; v <= hi; v++) if ((v - lo) % (hi - lo > 12 ? 2 : 1) === 0)
      el("text", { x: X(v), y: H - B + 16, "text-anchor": "middle", class: "tick" }, (v > 0 ? "+" : "") + v);
    el("text", { x: (L + W) / 2, y: H - 4, "text-anchor": "middle", class: "tick" }, "True count when you bet");
    [1, Math.round(maxU / 2), maxU].forEach(function (u) { el("text", { x: L - 6, y: Y(u) + 4, "text-anchor": "end", class: "tick" }, money(u * ses.min)); });
    hs.forEach(function (x) {
      var bad = x.flags && x.flags.some(function (f) { return f !== "risky"; });
      var c = el("circle", { cx: X(tenth(x.tc)), cy: Y(x.bet / ses.min), r: 5, class: "pt" + (bad ? " bad" : "") });
      var tt = document.createElementNS(NS, "title"); tt.textContent = "Hand " + x.n + ": " + money(x.bet) + " at " + tcText(x.tc); c.appendChild(tt);
    });
    return svg;
  }
  SimGame.prototype.renderSummary = function (root) {
    var self = this, ses = this.session, A = this.analyze();
    var link = function (u, t) { return h("a", { href: u, rel: "noopener", text: t }); };
    var why = { cashout: "You cashed out.", broke: "You ran out of money for the " + money(ses.min) + " minimum.", rules: "The table rules changed, so the session ended." }[ses.end];
    var net = ses.bank - ses.start;
    root.appendChild(h("p", { text: why + " Rules: " + ses.rules + "." }));
    root.appendChild(h("div", { class: "panel sim-results" },
      h("div", { class: "result-row" },
        h("p", null, h("span", { class: "small muted", text: "Started" }), h("b", { class: "num", text: money(ses.start) })),
        h("p", null, h("span", { class: "small muted", text: "Ended" }), h("b", { class: "num", text: money(ses.bank) })),
        h("p", null, h("span", { class: "small muted", text: "Result" }), h("b", { class: "num " + (net > 0 ? "right" : net < 0 ? "wrong" : ""), text: moneyNet(net) })),
        h("p", null, h("span", { class: "small muted", text: "Hands" }), h("b", { class: "num", text: String(ses.hands.length) })),
        h("p", null, h("span", { class: "small muted", text: "Total bet" }), h("b", { class: "num", text: money(A.wagered) })),
        h("p", null, h("span", { class: "small muted", text: "Biggest bet" }), h("b", { class: "num", text: money(A.biggest) }))),
      h("p", { class: "small muted", text: "One session is a small sample. Winning or losing money here says little about whether you played well; the blunders below do." })));

    var countLine = ses.finalGuess == null ? "You skipped the final count check." :
      (ses.finalGuess === ses.finalCount ? "Your final running count was right: " + signed(ses.finalCount) + "." :
        "You said " + signed(ses.finalGuess) + "; the running count was " + signed(ses.finalCount) + ".");
    root.appendChild(h("section", { class: "math-sec" }, h("h3", { text: "Your count" }),
      h("p", { text: countLine + " The true count was " + tcText(ses.finalTC) + "." })));

    var betBl = A.noEdge + A.missed + A.risky;
    root.appendChild(h("section", { class: "math-sec" }, h("h3", { text: "Betting" }),
      h("p", { text: betBl ? "Betting blunders: " + betBl + " (raised with no edge " + A.noEdge + ", stayed at the minimum with an edge " + A.missed + ", risky bets " + A.risky + ")."
        : "No betting blunders. Your bets followed the count." }),
      betChart(ses),
      h("p", { class: "small", text: A.corr == null ? "Play more hands with different bets to see how closely your bets followed the count." :
        "How closely your bets followed the true count: " + A.corr.toFixed(2) + " (1.00 = your bet rose exactly with the count, 0 = no relationship; calculated here)." })));

    root.appendChild(h("section", { class: "math-sec" }, h("h3", { text: "Strategy" }),
      h("p", { text: ses.strategy.length ? "Strategy blunders: " + ses.strategy.length + " of " + ses.decisions + " decisions didn't match basic strategy." :
        (ses.decisions ? "All " + ses.decisions + " of your decisions matched basic strategy." : "You didn't make any playing decisions.") })));

    var KIND = { noEdge: "Raised with no edge", missed: "Stayed at the minimum with an edge", risky: "Risky bet", strategy: "Strategy" };
    function describe(b) {
      if (b.kind === "strategy") {
        var s = b.s;
        return [s.cards.map(function (c) { return c.rank; }).join(", ") + " (" + s.total + ") vs dealer " + BJ.upcardKey(s.up) + ". You chose " + ACTION_LABEL[s.did].toLowerCase() + ".",
          "Basic strategy: " + S.CODE_NAMES[s.code].toLowerCase() + "."];
      }
      var x = b.hand;
      if (b.kind === "noEdge") return ["Bet " + money(x.bet) + " at a true count of " + tcText(x.tc) + ".", "Bet the minimum, " + money(ses.min) + ". Below +1 the house still has the edge."];
      if (b.kind === "missed") return ["Bet the minimum at a true count of " + tcText(x.tc) + ".", "Raise your bet, e.g. " + money(x.suggest) + ". At +2 and up the cards favor you."];
      return ["Bet " + money(x.bet) + ", " + Math.round(x.bet / x.bankBefore * 100) + "% of the " + money(x.bankBefore) + " you had.", "Keep each bet to a small share of your money so a losing streak can't end your session."];
    }
    root.appendChild(h("section", { class: "math-sec" }, h("h3", { text: "Every blunder" }),
      A.blunders.length ? h("div", { class: "chart-wrap" }, h("table", { class: "chart math-table blunders" },
        h("thead", null, h("tr", null, ["Hand", "Type", "What happened", "Better play"].map(function (c) { return h("th", { scope: "col", text: c }); }))),
        h("tbody", null, A.blunders.map(function (b) {
          var d = describe(b);
          return h("tr", null, h("td", { class: "num", text: String(b.n) }), h("td", { text: KIND[b.kind] }), h("td", { text: d[0] }), h("td", { text: d[1] }));
        })))) : h("p", { text: "None. Clean session." })));

    root.appendChild(h("details", { class: "math-sec" }, h("summary", { text: "Every hand: count, bet and result" }),
      h("div", { class: "chart-wrap" }, h("table", { class: "chart math-table" },
        h("thead", null, h("tr", null, ["Hand", "True count", "Your bet", "Suggested", "Result"].map(function (c) { return h("th", { scope: "col", text: c }); }))),
        h("tbody", null, ses.hands.map(function (x) {
          return h("tr", { class: x.flags.length ? "flagged" : null }, h("td", { class: "num", text: String(x.n) }), h("td", { class: "num", text: tcText(x.tc) }),
            h("td", { class: "num", text: money(x.bet) }), h("td", { class: "num", text: money(x.suggest) }), h("td", { class: "num", text: moneyNet(x.net) + (x.outcome ? " (" + x.outcome + ")" : "") }));
        }))))));

    root.appendChild(h("section", { class: "math-sec small muted" }, h("h3", { text: "How blunders are judged" }),
      h("ul", null,
        h("li", null, "Edge by true count comes from a simulation posted on the ", link(SIM_SRC.edge, "Wizard of Vegas forum"),
          " (six decks, 66% penetration): about −0.44% at 0, +0.06% at +1, +0.62% at +2, +0.99% at +3. That's why raising below +1 counts as a blunder and staying at the minimum at +2 or more does too. It's one user's simulation, not an official table."),
        h("li", null, "Bet the minimum at a true count of 0 or below, and bet more as it rises: ", link(SIM_SRC.action, "Action Network"),
          ". Bet increases should be proportional to your advantage (the Kelly idea): ", link(SIM_SRC.wiki, "Wikipedia, Card counting"), "."),
        h("li", null, "Spread: Action Network suggests about 8 units on double deck and calls 16 units on six decks pushing it. ",
          link(SIM_SRC.hilo, "Wizard of Odds"), " calls 1 to 15 about the most aggressive spread for six decks."),
        h("li", { text: "This game's own rules, not published standards: the suggested bets (1 unit up to +1, then 2, 4, 6 and 8 units at +2, +3, +4, +5 and up) and the risky-bet line at 25% of your money." }),
        h("li", { text: "Strategy blunders compare your play with the basic strategy chart for these rules. Count-based index plays aren't graded." }))));

    root.appendChild(h("div", { class: "row" },
      h("button", { class: "btn primary", type: "button", onclick: function () { self.start(); } }, "Play again"),
      h("button", { class: "btn", type: "button", onclick: function () { self.session = null; self.phase = "setup"; self.render(); } }, "Change setup")));
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
    // Game first, instructions below (Faith: every tab except Learn to play).
    root.appendChild(h("h2", { class: "drill-title", text: "Basic strategy quiz" }));
    var help = h("section", { class: "intro drill-help", "aria-label": "How this mode works" },
      h("h3", { text: "How this mode works" }),
      h("p", { text: "Basic strategy is the mathematically best play for every hand you can be dealt against every dealer upcard. It changes slightly with the number of decks and the soft 17 rule, so the quiz follows your settings above." }),
      h("p", { text: "Pick a move for each hand. You'll see the right play and why, and you can open the full chart below your score." }));
    if (this.note) root.appendChild(h("p", { class: "muted small", text: this.note }));
    if (!CHARTS[S.ruleSetKey(r)]) { root.appendChild(chartMissingNotice(r)); root.appendChild(help); return; }

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
    root.appendChild(help);
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
  function Drill(root) { this.root = root; this.speed = 0; this.perFlip = 1; this.askTrue = false; this.stats = { n: 0, right: 0 }; this.reset(); }
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
    var tcOk = !this.askTrue || this.done || tcRight(tcVal, tc);
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
    // Faith: the drill goes first, the instructions below it.
    root.appendChild(h("h2", { class: "drill-title", text: "Count drill" }));
    if (this.note) root.appendChild(h("p", { class: "muted small", text: this.note }));

    var speed = h("select", { "aria-label": "Flip speed", onchange: function (e) { self.speed = parseInt(e.target.value, 10); self.play(); } },
      [[0, "I'll flip each card"], [2000, "Auto: every 2 s"], [1000, "Auto: every 1 s"], [600, "Auto: every 0.6 s"]].map(function (o) {
        return h("option", { value: o[0], selected: o[0] === self.speed ? "selected" : null }, o[1]); }));
    var per = h("select", { "aria-label": "Cards per flip", onchange: function (e) { self.perFlip = parseInt(e.target.value, 10); } },
      [1, 2].map(function (n) { return h("option", { value: n, selected: n === self.perFlip ? "selected" : null }, n + (n === 1 ? " card" : " cards") + " at a time"); }));
    var tcBox = h("input", { type: "checkbox", id: "asktc", checked: this.askTrue ? "checked" : null, onchange: function (e) { self.askTrue = e.target.checked; } });
    var controls = h("div", { class: "row small drill-controls" }, speed, per,
      h("label", null, tcBox, " Also ask the true count"));

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
        fields.push(countField("dtc", "True count (" + (Math.round(this.shoe.decksRemaining() * 2) / 2) + " decks left, nearest whole number)", true));
      stage.appendChild(countForm(fields, function (rcv, tcv) { self.submit(rcv, tcv); },
        h("p", null, h("b", { text: this.done ? "That's the whole shoe. What's your final running count?" : "Stop. What's the running count?" }))));
    } else if (this.result) {
      var R = this.result;
      stage.appendChild(h("div", { class: "feedback", "aria-live": "polite" },
        h("p", null, R.rcOk ? h("span", { class: "right", text: "Right. " }) : h("span", { class: "wrong", text: "You said " + signed(R.rcVal) + ". " }),
          "The running count is ", h("span", { class: "hl num", text: signed(R.rc) }), "."),
        this.askTrue && !R.final ? h("p", null, R.tcOk ? h("span", { class: "right", text: "True count right. " }) : h("span", { class: "wrong", text: "True count: you said " + fmt(R.tcVal) + ". " }),
          "It's ", h("span", { class: "hl num", text: tcText(R.tc) }), " (" + signed(R.rc) + " ÷ " + (Math.round(R.left * 100) / 100) + " decks left).") : null,
        R.final ? h("button", { class: "btn primary", onclick: function () { self.reset(); } }, "Shuffle and start again") : null));
    }
    root.appendChild(stage);
    root.appendChild(controls);
    root.appendChild(h("p", { class: "stats" }, h("span", null, "Checks right ", h("b", { class: "num", text: this.stats.right + "/" + this.stats.n }))));
    root.appendChild(h("section", { class: "intro drill-help", "aria-label": "How to count" },
      h("h3", { text: "How Hi-Lo counting works" }),
      h("p", { class: "values", text: "+1 for 2–6.  0 for 7–9.  −1 for 10, J, Q, K, A." }),
      paras(TEXT.hilo_tutorial, [
        "Hi-Lo gives every card a value: 2 through 6 count +1, 7 through 9 count 0, and tens, faces and aces count −1. Add them up as the cards go by. That total is the running count.",
        "A plus count means more high cards are left in the shoe than low ones. A full shoe always adds up to exactly 0, so if you counted every card right you'll end at 0."])));
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
      h("h2", { text: "Full table practice" }),
      h("p", { text: "A real table has other players, and every card they're dealt counts too. Here the other players play basic strategy on their own while you keep the running count of the whole table: their cards, your cards, and the dealer's." }),
      h("p", { text: "Pick how many players and where you sit. Sitting last means you see everyone else's cards before you decide." }),
      h("p", { text: "The other players mostly play basic strategy, but now and then they get a close call wrong, like real players. Their mistakes don't change how you count." }));
  }

  var app = document.getElementById("app");
  var builders = {
    learn: function (el) { return new TableGame(el, { coach: true, intro: learnIntro }); },
    quiz: function (el) { return new Quiz(el); },
    drill: function (el) { return new Drill(el); },
    count: function (el) { return new TableGame(el, { countChecks: true, intro: countIntro, introBelow: true, title: "Count while playing" }); },
    table: function (el) { return new TableGame(el, { countChecks: true, others: 3, intro: tableIntro, introBelow: true, title: "Full table practice" }); },
    math: function (el) { return new window.BJMath.MathTab(el, { h: h, clear: clear, cardEl: cardEl, rules: rules }); },
    sim: function (el) { return new SimGame(el, { others: 3 }); }
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
