// Tests the chart LOOKUP mechanics only. The fixture below is made up for testing
// and is NOT real basic strategy; real charts come from data/strategy/*.csv (task T1).
const test = require("node:test");
const assert = require("node:assert/strict");
const BJ = require("../src/engine.js");
const S = require("../src/strategy.js");

const c = (rank) => ({ rank, suit: "♠" });
const hand = (s) => new BJ.Hand(s.split(" ").map(c));
const UP = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
const row = (code) => Object.fromEntries(UP.map((u) => [u, code]));

const fixture = { "6deck_h17": { meta: {}, table: {
  H11: row("D"), H16: row("Rh"), H17: row("Rs"), H12: row("H"),
  S18: row("Ds"), P8: row("P"), P5: row("D"), H10: row("D"),
} } };
const rules = BJ.makeRules({ decks: 6, h17: true });
const all = { double: true, split: true, surrender: true };
const none = { double: false, split: false, surrender: false };

test("rule set key matches CSV file names", () => {
  assert.equal(S.ruleSetKey(BJ.makeRules({ decks: 1, h17: false })), "1deck_s17");
  assert.equal(S.ruleSetKey(rules), "6deck_h17");
});

test("row keys: hard, soft, pairs (tens of any rank count as P10)", () => {
  assert.equal(S.rowKey(hand("10 6"), true), "H16");
  assert.equal(S.rowKey(hand("A 7"), true), "S18");
  assert.equal(S.rowKey(hand("8 8"), true), "P8");
  assert.equal(S.rowKey(hand("8 8"), false), "H16");
  assert.equal(S.rowKey(hand("K Q"), true), "P10");
  assert.equal(S.rowKey(hand("A A"), true), "PA");
});

test("fallback codes resolve by what's allowed", () => {
  assert.equal(S.resolve("D", all), "double");
  assert.equal(S.resolve("D", none), "hit");
  assert.equal(S.resolve("Ds", none), "stand");
  assert.equal(S.resolve("Rh", none), "hit");
  assert.equal(S.resolve("Rs", none), "stand");
  assert.equal(S.resolve("Rp", { ...none, split: true }), "split");
});

test("recommend uses the chart for the current rule set", () => {
  assert.equal(S.recommend(fixture, rules, hand("6 5"), c("A"), all).action, "double");
  assert.equal(S.recommend(fixture, rules, hand("10 7"), c("K"), all).action, "surrender");
  assert.equal(S.recommend(fixture, rules, hand("8 8"), c("9"), all).action, "split");
  // Pair can't be split any more -> use the hard total row instead.
  const r = S.recommend(fixture, rules, hand("8 8"), c("9"), { ...all, split: false });
  assert.equal(r.row, "H16");
});

test("missing chart returns null instead of guessing", () => {
  const s17 = BJ.makeRules({ decks: 6, h17: false });
  assert.equal(S.recommend(fixture, s17, hand("6 5"), c("A"), all), null);
});

test("math tab: Hi-Lo tags correlate ~0.96 with the effect-of-removal table", () => {
  const M = require("../src/math.js");
  assert.equal(M.tagCorrelation(M.EOR.s17).toFixed(2), "0.96");
  assert.equal(M.tagCorrelation(M.EOR.h17).toFixed(2), "0.96");
});

test("balanced count identity: RC equals high-minus-low left in the shoe", () => {
  for (const d of [1, 2, 6]) {
    const shoe = new BJ.Shoe(d), k = new BJ.Counter();
    let hiLeft = 20 * d, loLeft = 20 * d;
    for (let i = 0; i < 52 * d - 1; i++) {
      const c = shoe.draw(); k.see(c);
      if (BJ.hiLo(c) === 1) loLeft--; else if (BJ.hiLo(c) === -1) hiLeft--;
      assert.equal(k.running, hiLeft - loLeft);
    }
  }
});
