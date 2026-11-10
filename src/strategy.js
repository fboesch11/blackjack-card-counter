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

  var api = {
    CODE_NAMES: CODE_NAMES, ruleSetKey: ruleSetKey, ruleSetLabel: ruleSetLabel,
    rowKey: rowKey, resolve: resolve, recommend: recommend
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BJStrategy = api;
})(this);
