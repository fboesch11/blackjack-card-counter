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

test("missed cards: exact distribution matches brute force on a small shoe", () => {
  const M = require("../src/math.js");
  // 3 low (+1), 2 neutral (0), 4 high (-1); draw 3. Enumerate every 3-card subset.
  const tags = [1, 1, 1, 0, 0, -1, -1, -1, -1], k = 3, brute = {};
  let total = 0;
  for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) for (let m = j + 1; m < 9; m++) {
    const d = tags[i] + tags[j] + tags[m]; brute[d] = (brute[d] || 0) + 1; total++;
  }
  const dist = M.countShiftDist(3, 2, 4, k);
  for (const d of Object.keys(brute)) assert.ok(Math.abs(dist.pmf[d] - brute[d] / total) < 1e-12, `D=${d}`);
  const sum = Object.values(dist.pmf).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
});

test("missed cards: mean and SD from the pmf equal the closed forms", () => {
  const M = require("../src/math.js");
  for (const [l, n, h, k] of [[77, 48, 83, 10], [20, 12, 20, 52], [100, 70, 90, 20], [5, 3, 9, 5]]) {
    const d = M.countShiftDist(l, n, h, k);
    let mean = 0, sq = 0;
    for (const x of d.values) { mean += x * d.pmf[x]; sq += x * x * d.pmf[x]; }
    assert.ok(Math.abs(mean - d.mean) < 1e-9, "mean");
    assert.ok(Math.abs(Math.sqrt(sq - mean * mean) - d.sd) < 1e-9, "sd");
  }
  // A full deck drawn completely: change is exactly 0.
  const full = M.countShiftDist(20, 12, 20, 52);
  assert.equal(full.mode, 0); assert.ok(Math.abs(full.pmf[0] - 1) < 1e-12);
});

test("bots: close-call mistakes only on close calls, and only to allowed plays", () => {
  const rules6 = BJ.makeRules({ decks: 6, h17: false });
  const chart = { "6deck_s17": { meta: {}, table: {
    H16: row("Rh"), H12: row("H"), H13: row("S"), H8: row("H"), H11: row("D"), H19: row("S"),
    S18: row("Ds"), P8: row("P"), PA: row("P"), P6: row("P"), H17: row("S") } } };
  const all = { hit: true, stand: true, double: true, split: true, surrender: true };
  const mk = (cards, up, allowed = all) => {
    const hd = hand(cards), rec = S.recommend(chart, rules6, hd, c(up), { ...allowed, split: allowed.split && hd.isPair() });
    return S.closeCallMistake(rec, hd, c(up), { ...allowed, split: allowed.split && hd.isPair() });
  };
  assert.equal(mk("10 6", "10"), "hit");        // surrender -> play it out
  assert.equal(mk("10 2", "9"), "stand");       // hit 12 -> stand
  assert.equal(mk("10 3", "4"), "hit");         // stand 13 -> hit
  assert.equal(mk("6 5", "6"), "hit");          // double 11 -> just hit
  assert.equal(mk("A 7", "4"), "stand");        // Ds soft 18 -> stand
  assert.equal(mk("6 6", "4"), "stand");        // split 6s vs 4 -> stand on 12
  assert.equal(mk("8 8", "4"), null);           // always split 8s
  assert.equal(mk("A A", "4"), null);           // always split aces
  assert.equal(mk("5 3", "4"), null);           // hit 8: obvious
  assert.equal(mk("10 9", "4"), null);          // stand 19: obvious
  assert.equal(mk("10 7", "4"), null);          // stand hard 17: obvious
  assert.equal(mk("10 2", "9", { ...all, stand: false }), null); // alternative not allowed
});
