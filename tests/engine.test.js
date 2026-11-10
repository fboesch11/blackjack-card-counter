// Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const BJ = require("../src/engine.js");

const c = (rank, suit = "♠") => ({ rank, suit });
const cards = (s) => s.split(" ").map((r) => c(r));
// Fixed shoe; deal order is P1, D-up, P2, D-hole, then hits in order.
const roundWith = (order, ruleOpts = {}, seen = []) => {
  const shoe = new BJ.Shoe(1, { cards: cards(order) });
  return new BJ.Round(shoe, BJ.makeRules(ruleOpts), { onExpose: (x) => seen.push(x) });
};

test("shoe has 52 x decks cards, every rank 4 x decks times", () => {
  for (const d of [1, 2, 6]) {
    const shoe = new BJ.Shoe(d);
    assert.equal(shoe.remaining(), 52 * d);
    const counts = {};
    for (const card of shoe.cards) counts[card.rank] = (counts[card.rank] || 0) + 1;
    for (const r of BJ.RANKS) assert.equal(counts[r], 4 * d, `${d} decks, rank ${r}`);
  }
});

test("Hi-Lo tags: 2-6 = +1, 7-9 = 0, tens and aces = -1", () => {
  const expected = { A: -1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0, 10: -1, J: -1, Q: -1, K: -1 };
  for (const [r, v] of Object.entries(expected)) assert.equal(BJ.hiLo(c(r)), v, r);
});

test("Hi-Lo is balanced: counting a full shoe ends at 0", () => {
  for (const d of [1, 2, 6]) {
    const shoe = new BJ.Shoe(d), k = new BJ.Counter();
    while (shoe.remaining()) k.see(shoe.draw());
    assert.equal(k.running, 0);
  }
});

test("true count divides by decks remaining, not decks selected", () => {
  const shoe = new BJ.Shoe(6), k = new BJ.Counter();
  for (let i = 0; i < 156; i++) shoe.draw(); // 3 decks dealt, 3 left
  k.running = 6;
  assert.equal(k.trueCount(shoe), 2);
});

test("reshuffle is due at 75% penetration", () => {
  const shoe = new BJ.Shoe(2);
  for (let i = 0; i < 77; i++) shoe.draw();
  assert.equal(shoe.needsShuffle(), false);
  shoe.draw();
  assert.equal(shoe.needsShuffle(), true);
});

test("hand totals: soft/hard aces", () => {
  const h = new BJ.Hand(cards("A 6"));
  assert.deepEqual(h.score(), { total: 17, soft: true });
  h.add(c("10"));
  assert.deepEqual(h.score(), { total: 17, soft: false });
  assert.equal(new BJ.Hand(cards("A A 9")).total(), 21);
  assert.equal(new BJ.Hand(cards("K Q")).isPair(), true);
});

test("dealer hits soft 17 under H17 and stands under S17", () => {
  // Player 10,10 stands. Dealer A,6 then a 4 if drawn.
  const h17 = roundWith("10 A 10 6 4", { h17: true }).start();
  h17.act("stand");
  assert.equal(h17.dealer.cards.length, 3);
  assert.equal(h17.dealer.total(), 21);

  const s17 = roundWith("10 A 10 6 4", { h17: false }).start();
  s17.act("stand");
  assert.equal(s17.dealer.cards.length, 2);
  assert.equal(s17.results[0].outcome, "win");
});

test("player blackjack pays 3:2; dealer blackjack ends the round", () => {
  const r = roundWith("A 9 K 7").start();
  assert.equal(r.phase, "done");
  assert.equal(r.results[0].outcome, "blackjack");
  assert.equal(r.net(), 1.5);

  const d = roundWith("10 A 9 K").start();
  assert.equal(d.phase, "done");
  assert.equal(d.results[0].outcome, "lose");
});

test("surrender: first two cards only, returns half the bet", () => {
  const r = roundWith("10 10 6 7 9").start();
  assert.equal(r.available().surrender, true);
  r.act("surrender");
  assert.equal(r.net(), -0.5);

  const h = roundWith("10 10 2 7 3 9").start();
  h.act("hit");
  assert.equal(h.available().surrender, false);
});

test("split, double after split, and no surrender after a split", () => {
  // P: 8,8 vs dealer 6 (hole 10). Split -> 8+3 (double -> +10), 8+10 stand. Dealer 16 draws 9 = bust.
  const r = roundWith("8 6 8 10 3 10 10 9").start();
  assert.equal(r.available().split, true);
  r.act("split");
  assert.equal(r.hands.length, 2);
  assert.equal(r.available().double, true, "DAS allowed");
  assert.equal(r.available().surrender, false, "no surrender after split");
  r.act("double");
  r.act("stand");
  assert.equal(r.phase, "done");
  assert.deepEqual(r.results.map((x) => x.outcome), ["win", "win"]);
  assert.equal(r.net(), 3);
});

test("split aces get one card each and can't be resplit", () => {
  const r = roundWith("A 9 A 7 A 5 9").start();
  r.act("split");
  // First ace drew another ace: hand is done (one card only), no resplit.
  assert.equal(r.hands[0].cards.length, 2);
  assert.equal(r.phase, "done");
  assert.equal(r.hands[1].total(), 16);
  assert.equal(r.hands[0].isBlackjack(), false, "21 after split isn't a blackjack");
});

test("hole card is only counted once revealed", () => {
  const seen = [];
  const r = roundWith("10 5 7 K 9", {}, seen).start();
  assert.equal(seen.length, 3, "player 2 cards + dealer upcard");
  r.act("stand");
  assert.equal(seen.length, 5, "hole card + dealer hit revealed after player stands");
});
