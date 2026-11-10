# Strategy chart format

One CSV per rule set. Six files are required:

| File | Decks | Dealer soft 17 |
|---|---|---|
| `1deck_h17.csv` | 1 | Hits |
| `1deck_s17.csv` | 1 | Stands |
| `2deck_h17.csv` | 2 | Hits |
| `2deck_s17.csv` | 2 | Stands |
| `6deck_h17.csv` | 6 | Hits |
| `6deck_s17.csv` | 6 | Stands |

The rules shared by all six: double on any first two cards, double after split allowed, late surrender allowed, dealer peeks for blackjack, blackjack pays 3:2, resplit up to 4 hands, split aces get one card each and can't be resplit.

## Required first lines

Lines starting with `#` are metadata. Every file must have both of these, or `build.py` will refuse to build:

```
# source: <URL of the published chart or calculator used>
# retrieved: <YYYY-MM-DD>
```

Charts must come from a published source. Do not fill them in from memory.

## Table layout

Header row, then one row per player hand. Columns are the dealer's upcard.

```
hand,2,3,4,5,6,7,8,9,10,A
```

Rows, all required:

- **Hard totals:** `H4` through `H21`
- **Soft totals:** `S13` (A,2) through `S21` (A,10)
- **Pairs:** `P2` (2,2) through `P10` (10,10), and `PA` (A,A)

## Action codes

| Code | Meaning |
|---|---|
| `H` | Hit |
| `S` | Stand |
| `D` | Double if allowed, otherwise hit |
| `Ds` | Double if allowed, otherwise stand |
| `P` | Split |
| `Rh` | Surrender if allowed, otherwise hit |
| `Rs` | Surrender if allowed, otherwise stand |
| `Rp` | Surrender if allowed, otherwise split |

"If allowed" matters because doubling and surrender are only possible on the first two cards of a hand, and surrender isn't allowed after a split.

A pair row answers the question "split or not?" If the correct play is not to split, put the code for the equivalent hard or soft total in that cell (for example, `P5` usually plays like hard 10).
