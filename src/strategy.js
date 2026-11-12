/* Basic strategy lookup. Charts come from data/strategy/*.csv (inlined by build.py).
 * Works in the browser (window.BJStrategy) and in Node for tests. */
(function (root) {
  "use strict";
  var BJ = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.BJ;

  var CODE_NAMES = {
    H: "Hit", S: "Stand", D: "Double (or hit if you can't)", Ds: "Double (or stand if you can't)",
    P: "Split", Rh: "Surrender (or hit if you can't)", Rs: "Surrender (or stand if you can't)",
    Rp: "Surrender (or split if you can't)"
  };

  function ruleSetKey(rules) { return rules.decks + "deck_" + (rules.h17 ? "h17" : "s17"); }

  function ruleSetLabel(rules) {
    return rules.decks + (rules.decks === 1 ? " deck" : " decks") +
      ", dealer " + (rules.h17 ? "hits" : "stands on") + " soft 17";
  }

  // Chart row for a player hand. Pairs use the pair row only while a split is still possible.
  function rowKey(hand, canSplit) {
    if (canSplit && hand.isPair()) {
      var r = hand.cards[0].rank;
      return r === "A" ? "PA" : "P" + BJ.cardValue(hand.cards[0]);
    }
    var s = hand.score();
    return (s.soft ? "S" : "H") + s.total;
  }

  // Turn a chart code into the action to take, given what's allowed right now.
  function resolve(code, allowed) {
    switch (code) {
      case "H": return "hit";
      case "S": return "stand";
      case "P": return "split";
      case "D": return allowed.double ? "double" : "hit";
      case "Ds": return allowed.double ? "double" : "stand";
      case "Rh": return allowed.surrender ? "surrender" : "hit";
      case "Rs": return allowed.surrender ? "surrender" : "stand";
      case "Rp": return allowed.surrender ? "surrender" : "split";
    }
    throw new Error("Unknown strategy code: " + code);
  }

  // Look up the recommended play. Returns null if the chart for these rules isn't loaded.
  // -> {action, code, row, col, ruleSet}
  function recommend(charts, rules, hand, dealerUp, allowed) {
    var key = ruleSetKey(rules);
    var chart = charts && charts[key];
    if (!chart) return null;
    var row = rowKey(hand, allowed.split);
    var col = BJ.upcardKey(dealerUp);
    var line = chart.table[row];
    if (!line) return null; // e.g. totals the chart doesn't list
    var code = line[col];
    var action = resolve(code, allowed);
    if (action === "split" && !allowed.split) {
      // Pair row said split but we can't: fall back to the hard/soft total row.
      row = rowKey(hand, false); code = chart.table[row][col]; action = resolve(code, allowed);
    }
    return { action: action, code: code, row: row, col: col, ruleSet: key };
  }

  // A plausible wrong play on a close call, the kind real players make; null if the hand isn't a
  // close call. Used to give the table's other players some variety (Faith's request). Obvious
  // hands (hit 8, stand 19, split aces or eights) never get a wrong alternative.
  //   double  -> just hit (D) or stand (Ds)        surrender -> play the hand out
  //   split 2s, 3s, 4s, 6s, 7s, 9s -> don't split   hard 12-16 -> hit/stand swapped
  //   soft 18 -> hit/stand swapped
  function closeCallMistake(rec, hand, dealerUp, allowed) {
    var row = rec.row, code = rec.code, act = rec.action, total = hand.total();
    var up = BJ.cardValue(dealerUp), weak = up >= 2 && up <= 6;
    var alt = null;
    if (act === "double") alt = code === "Ds" ? "stand" : "hit";
    else if (act === "surrender") alt = code === "Rs" ? "stand" : code === "Rp" ? "split" : "hit";
    else if (act === "split" && /^P[234679]$/.test(row)) alt = total <= 11 ? "hit" : total >= 17 ? "stand" : (weak ? "stand" : "hit");
    else if (/^H1[2-6]$/.test(row) && (act === "hit" || act === "stand")) alt = act === "hit" ? "stand" : "hit";
    else if (row === "S18" && (act === "hit" || act === "stand")) alt = act === "hit" ? "stand" : "hit";
    return alt && allowed[alt] ? alt : null;
  }

  /* ---------- Index plays (count-based exceptions to basic strategy) ----------
   * Illustrious 18 (minus insurance, handled separately) and Fab 4, Hi-Lo, six decks, dealer
   * stands on soft 17. Don Schlesinger, Blackjack Attack, as listed by BlackjackInfo and
   * CountingEdge (identical values):
   *   https://www.blackjackinfo.com/card-counting/illustrious-18/
   *   https://www.countingedge.com/blackjack-players/don-schlesinger/the-illustrious-18-card-counting-indices/
   * Each entry: at a true count of `index` or higher play `at`, below it play `below`.
   * Rows: H = hard total, P10 = pair of tens. Only used for 6 decks, S17. */
  var INDEX_SOURCES = [
    "https://www.blackjackinfo.com/card-counting/illustrious-18/",
    "https://www.countingedge.com/blackjack-players/don-schlesinger/the-illustrious-18-card-counting-indices/"
  ];
  var INDEX_PLAYS = [
    // Illustrious 18 (#1, insurance at +3, is in the insurance feature)
    { set: "I18", row: "H16", up: "10", index: 0, at: "stand", below: "hit" },
    { set: "I18", row: "H15", up: "10", index: 4, at: "stand", below: "hit" },
    { set: "I18", row: "P10", up: "5", index: 5, at: "split", below: "stand" },
    { set: "I18", row: "P10", up: "6", index: 4, at: "split", below: "stand" },
    { set: "I18", row: "H10", up: "10", index: 4, at: "double", below: "hit" },
    { set: "I18", row: "H12", up: "3", index: 2, at: "stand", below: "hit" },
    { set: "I18", row: "H12", up: "2", index: 3, at: "stand", below: "hit" },
    { set: "I18", row: "H11", up: "A", index: 1, at: "double", below: "hit" },
    { set: "I18", row: "H9", up: "2", index: 1, at: "double", below: "hit" },
    { set: "I18", row: "H10", up: "A", index: 4, at: "double", below: "hit" },
    { set: "I18", row: "H9", up: "7", index: 3, at: "double", below: "hit" },
    { set: "I18", row: "H16", up: "9", index: 5, at: "stand", below: "hit" },
    { set: "I18", row: "H13", up: "2", index: -1, at: "stand", below: "hit" },
    { set: "I18", row: "H12", up: "4", index: 0, at: "stand", below: "hit" },
    { set: "I18", row: "H12", up: "5", index: -2, at: "stand", below: "hit" },
    { set: "I18", row: "H12", up: "6", index: -1, at: "stand", below: "hit" },
    { set: "I18", row: "H13", up: "3", index: -2, at: "stand", below: "hit" },
    // Fab 4 (late surrender)
    { set: "Fab4", row: "H14", up: "10", index: 3, at: "surrender", below: "hit" },
    { set: "Fab4", row: "H15", up: "10", index: 0, at: "surrender", below: "hit" },
    { set: "Fab4", row: "H15", up: "9", index: 2, at: "surrender", below: "hit" },
    { set: "Fab4", row: "H15", up: "A", index: 1, at: "surrender", below: "hit" }
  ];
  function indexPlaysApply(rules) { return rules.decks === 6 && !rules.h17; }

  // Basic strategy, adjusted for the count where an index play applies.
  // -> rec (as recommend) plus .idx (the entry used, or null) and .either (true when the count is
  //    within half a point of the index, where both plays are accepted). null if no chart.
  // Order: a Fab 4 surrender decides first when surrender is allowed; if basic strategy already
  // says surrender and no Fab 4 entry covers the hand, surrender stands (the I18 stand/hit
  // indices are for when surrender isn't available).
  function recommendWithCount(charts, rules, hand, dealerUp, allowed, tc) {
    var rec = recommend(charts, rules, hand, dealerUp, allowed);
    if (!rec) return null;
    rec.idx = null; rec.either = false; rec.basic = rec.action;
    if (!indexPlaysApply(rules) || hand.isSoft()) return rec;
    var up = BJ.upcardKey(dealerUp), total = "H" + hand.total();
    var pairRow = allowed.split && hand.isPair() && BJ.cardValue(hand.cards[0]) === 10 ? "P10" : null;
    function find(set, row) {
      for (var i = 0; i < INDEX_PLAYS.length; i++) {
        var e = INDEX_PLAYS[i];
        if (e.set === set && e.row === row && e.up === up) return e;
      }
      return null;
    }
    var e = allowed.surrender ? find("Fab4", total) : null;
    if (!e && rec.action === "surrender") return rec;
    if (!e && pairRow) e = find("I18", pairRow);
    if (!e && !pairRow) e = find("I18", total);
    if (!e) return rec;
    var play = tc >= e.index ? e.at : e.below;
    // A double index only applies while doubling is allowed; otherwise basic strategy decides.
    if (!allowed[play]) return rec;
    rec.idx = e; rec.action = play; rec.either = Math.abs(tc - e.index) < 0.5;
    rec.other = play === e.at ? e.below : e.at;
    return rec;
  }
  function describeIndex(e) {
    var name = { stand: "stand", hit: "hit", double: "double", split: "split", surrender: "surrender" };
    var hand = e.row === "P10" ? "a pair of tens" : "hard " + e.row.slice(1);
    return (e.set === "I18" ? "Illustrious 18" : "Fab 4") + ": " + hand + " vs " + e.up + ", " + name[e.at] +
      " at a true count of " + (e.index > 0 ? "+" : "") + e.index + " or higher, otherwise " + name[e.below] + ".";
  }

  var api = {
    INDEX_PLAYS: INDEX_PLAYS, INDEX_SOURCES: INDEX_SOURCES, indexPlaysApply: indexPlaysApply,
    recommendWithCount: recommendWithCount, describeIndex: describeIndex,
    closeCallMistake: closeCallMistake,
    CODE_NAMES: CODE_NAMES, ruleSetKey: ruleSetKey, ruleSetLabel: ruleSetLabel,
    rowKey: rowKey, resolve: resolve, recommend: recommend
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BJStrategy = api;
})(this);
