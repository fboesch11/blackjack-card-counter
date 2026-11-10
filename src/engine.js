/* Blackjack engine: cards, shoe, Hi-Lo count, hands, and one round of play.
 * Pure logic, no DOM. Works in the browser (window.BJ) and in Node (require) for tests. */
(function (root) {
  "use strict";

  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var SUITS = ["♠", "♥", "♦", "♣"];

  /* ---------- Cards ---------- */

  function cardValue(card) {
    if (card.rank === "A") return 11;
    if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return 10;
    return parseInt(card.rank, 10);
  }

  // Dealer upcard / chart column key: "2".."10" or "A".
  function upcardKey(card) {
    return card.rank === "A" ? "A" : String(cardValue(card));
  }

  // Hi-Lo tag: 2-6 = +1, 7-9 = 0, 10/J/Q/K/A = -1.
  function hiLo(card) {
    var v = cardValue(card);
    if (v >= 2 && v <= 6) return 1;
    if (v >= 7 && v <= 9) return 0;
    return -1;
  }

  /* ---------- Shoe ---------- */

  // opts.rng: function returning [0,1) (default Math.random)
  // opts.cards: exact card order to deal (tests); overrides shuffling
  // opts.penetration: fraction of the shoe dealt before a reshuffle is due (default 0.75)
  function Shoe(decks, opts) {
    opts = opts || {};
    this.decks = decks;
    this.rng = opts.rng || Math.random;
    this.penetration = opts.penetration == null ? 0.75 : opts.penetration;
    this.fixed = opts.cards ? opts.cards.slice() : null;
    this.shuffle();
  }
  Shoe.prototype.shuffle = function () {
    var cards = [];
    if (this.fixed) {
      cards = this.fixed.slice();
    } else {
      for (var d = 0; d < this.decks; d++)
        for (var s = 0; s < SUITS.length; s++)
          for (var r = 0; r < RANKS.length; r++) cards.push({ rank: RANKS[r], suit: SUITS[s] });
      for (var i = cards.length - 1; i > 0; i--) { // Fisher-Yates
        var j = Math.floor(this.rng() * (i + 1));
        var t = cards[i]; cards[i] = cards[j]; cards[j] = t;
      }
    }
    this.cards = cards;
    this.total = cards.length;
    this.pos = 0;
  };
  Shoe.prototype.draw = function () {
    if (this.pos >= this.cards.length) throw new Error("Shoe is empty");
    return this.cards[this.pos++];
  };
  Shoe.prototype.remaining = function () { return this.cards.length - this.pos; };
  Shoe.prototype.decksRemaining = function () { return this.remaining() / 52; };
  Shoe.prototype.needsShuffle = function () { return this.pos >= this.total * this.penetration; };

  /* ---------- Hi-Lo counter ---------- */

  function Counter() { this.reset(); }
  Counter.prototype.reset = function () { this.running = 0; this.seen = 0; };
  Counter.prototype.see = function (card) { this.running += hiLo(card); this.seen++; };
  // True count = running count / decks remaining in the shoe.
  Counter.prototype.trueCount = function (shoe) {
    var decks = shoe.decksRemaining();
    return decks > 0 ? this.running / decks : 0;
  };

  /* ---------- Hand ---------- */

  function Hand(cards, opts) {
    opts = opts || {};
    this.cards = cards ? cards.slice() : [];
    this.bet = opts.bet || 1;
    this.fromSplit = !!opts.fromSplit;
    this.splitAces = !!opts.splitAces;
    this.doubled = false;
    this.surrendered = false;
    this.stood = false;
  }
  Hand.prototype.add = function (card) { this.cards.push(card); };
  // Returns {total, soft}. Soft = an ace is still being counted as 11.
  Hand.prototype.score = function () {
    var total = 0, aces = 0;
    for (var i = 0; i < this.cards.length; i++) {
      total += cardValue(this.cards[i]);
      if (this.cards[i].rank === "A") aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total: total, soft: aces > 0 };
  };
  Hand.prototype.total = function () { return this.score().total; };
  Hand.prototype.isSoft = function () { return this.score().soft; };
  Hand.prototype.isBust = function () { return this.total() > 21; };
  // A natural only counts on the original two cards, never after a split.
  Hand.prototype.isBlackjack = function () {
    return !this.fromSplit && this.cards.length === 2 && this.total() === 21;
  };
  // Pair = two cards of the same value (K,Q counts as a pair of tens).
  Hand.prototype.isPair = function () {
    return this.cards.length === 2 && cardValue(this.cards[0]) === cardValue(this.cards[1]);
  };
  Hand.prototype.isDone = function () {
    return this.stood || this.surrendered || this.doubled || this.isBust() ||
      this.total() === 21 || (this.splitAces && this.cards.length >= 2);
  };

  /* ---------- Rules ---------- */

  // decks: 1|2|6, h17: dealer hits soft 17. The rest are fixed for this project (docs/decisions.md).
  function makeRules(o) {
    o = o || {};
    return {
      decks: o.decks || 6,
      h17: !!o.h17,
      das: true,
      surrender: true,      // late surrender, after the dealer checks for blackjack
      maxHands: 4,          // resplit up to 4 hands
      resplitAces: false,
      blackjackPays: 1.5,
      peek: true
    };
  }

  /* ---------- Round ---------- */

  // One round of blackjack. Every card that becomes visible is reported to onExpose,
  // so the app can keep the Hi-Lo count exactly as a player at the table would.
  function Round(shoe, rules, opts) {
    opts = opts || {};
    this.shoe = shoe;
    this.rules = rules;
    this.onExpose = opts.onExpose || function () {};
    this.hands = [];
    this.active = 0;
    this.dealer = new Hand();
    this.holeRevealed = false;
    this.phase = "init"; // init -> player -> dealer -> done
    this.results = null;
  }
  Round.prototype._deal = function (hand, faceUp) {
    var c = this.shoe.draw();
    hand.add(c);
    if (faceUp) this.onExpose(c);
    return c;
  };
  Round.prototype.start = function (bet) {
    var p = new Hand([], { bet: bet || 1 });
    this.hands = [p];
    this._deal(p, true);
    this._deal(this.dealer, true);   // upcard
    this._deal(p, true);
    this._deal(this.dealer, false);  // hole card
    this.phase = "player";

    var up = this.dealer.cards[0];
    var dealerBJ = this.dealer.isBlackjack();
    // Dealer peeks when showing an ace or ten-value card. A dealer blackjack ends the round.
    if (this.rules.peek && (up.rank === "A" || cardValue(up) === 10) && dealerBJ) return this._finish();
    if (p.isBlackjack()) return this._finish();
    this._advance();
    return this;
  };
  Round.prototype.current = function () {
    return this.phase === "player" ? this.hands[this.active] : null;
  };
  // Which actions the player may take right now.
  Round.prototype.available = function () {
    var h = this.current();
    if (!h) return {};
    var two = h.cards.length === 2;
    return {
      hit: true,
      stand: true,
      double: two && !h.splitAces && (!h.fromSplit || this.rules.das),
      split: two && h.isPair() && this.hands.length < this.rules.maxHands &&
        !(h.cards[0].rank === "A" && h.fromSplit && !this.rules.resplitAces),
      surrender: two && this.rules.surrender && this.hands.length === 1 && !h.fromSplit
    };
  };
  Round.prototype.act = function (action) {
    var h = this.current();
    var ok = this.available();
    if (!h || !ok[action]) throw new Error("Action not allowed: " + action);
    if (action === "hit") {
      this._deal(h, true);
    } else if (action === "stand") {
      h.stood = true;
    } else if (action === "double") {
      h.bet *= 2; h.doubled = true; this._deal(h, true);
    } else if (action === "surrender") {
      h.surrendered = true;
    } else if (action === "split") {
      var aces = h.cards[0].rank === "A";
      var a = new Hand([h.cards[0]], { bet: h.bet, fromSplit: true, splitAces: aces });
      var b = new Hand([h.cards[1]], { bet: h.bet, fromSplit: true, splitAces: aces });
      this.hands.splice(this.active, 1, a, b);
      this._deal(a, true);
    }
    this._advance();
    return this;
  };
  // Move to the next hand that still needs a decision; deal its second card if it came from a split.
  Round.prototype._advance = function () {
    while (this.active < this.hands.length) {
      var h = this.hands[this.active];
      if (h.cards.length === 1) this._deal(h, true);
      if (!h.isDone()) return;
      this.active++;
    }
    this._dealerPlay();
  };
  Round.prototype._revealHole = function () {
    if (!this.holeRevealed) { this.holeRevealed = true; this.onExpose(this.dealer.cards[1]); }
  };
  Round.prototype._dealerPlay = function () {
    this.phase = "dealer";
    this._revealHole();
    var live = this.hands.some(function (h) { return !h.isBust() && !h.surrendered; });
    if (live) {
      for (;;) {
        var s = this.dealer.score();
        if (s.total < 17 || (s.total === 17 && s.soft && this.rules.h17)) this._deal(this.dealer, true);
        else break;
      }
    }
    this._finish();
  };
  // Net result per hand, in bet units. outcome: blackjack|win|push|lose|bust|surrender
  Round.prototype._finish = function () {
    this._revealHole();
    this.phase = "done";
    var d = this.dealer, dt = d.total(), dBJ = d.isBlackjack(), pays = this.rules.blackjackPays;
    this.results = this.hands.map(function (h) {
      var o, net;
      if (h.surrendered) { o = "surrender"; net = -h.bet / 2; }
      else if (h.isBust()) { o = "bust"; net = -h.bet; }
      else if (h.isBlackjack() && !dBJ) { o = "blackjack"; net = h.bet * pays; }
      else if (dBJ) { o = h.isBlackjack() ? "push" : "lose"; net = h.isBlackjack() ? 0 : -h.bet; }
      else if (dt > 21 || h.total() > dt) { o = "win"; net = h.bet; }
      else if (h.total() === dt) { o = "push"; net = 0; }
      else { o = "lose"; net = -h.bet; }
      return { outcome: o, net: net };
    });
    return this;
  };
  Round.prototype.net = function () {
    return (this.results || []).reduce(function (s, r) { return s + r.net; }, 0);
  };

  var api = {
    RANKS: RANKS, SUITS: SUITS, cardValue: cardValue, upcardKey: upcardKey, hiLo: hiLo,
    Shoe: Shoe, Counter: Counter, Hand: Hand, makeRules: makeRules, Round: Round
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BJ = api;
})(this);
