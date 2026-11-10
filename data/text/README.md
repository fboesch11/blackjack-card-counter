# Explanation text

Beginner-facing text for hints, quiz answers, and the Hi-Lo tutorial goes in `explanations.json` here (task T5).

Expected keys (the game falls back to short built-in text for any key that's missing):

```json
{
  "actions": {
    "hit": "...",
    "stand": "...",
    "double": "...",
    "split": "...",
    "surrender": "..."
  },
  "codes": {
    "H": "why hitting is right here, in general terms",
    "S": "...", "D": "...", "Ds": "...", "P": "...",
    "Rh": "...", "Rs": "...", "Rp": "..."
  },
  "hilo_tutorial": ["paragraph 1", "paragraph 2", "..."],
  "true_count": ["paragraph 1", "..."]
}
```

Keep it plain-language for someone who has never played. Cite a source for any factual claim (house edge numbers and similar).
