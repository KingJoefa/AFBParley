# Notes Agent

Loads curated game intelligence from `data/notes/{year}-wk{week}.json` and emits structured `Finding[]` for use in Build prompts.

## Purpose

- Provides **matchup-level context** that the LLM cannot reliably infer
- Surfaces **curated notes** like key matchups, tendencies, injury narratives
- Runs **unconditionally** (not toggleable by user)
- Does **NOT** affect roster grounding (players allowed/disallowed)

## Finding Types

| Type                   | Source Field      | Description                          |
|------------------------|-------------------|--------------------------------------|
| `note_key_matchup`     | `keyMatchups[]`   | Named matchup to highlight           |
| `note_tendency`        | `notes` sentences | Stat-like pattern (%, YPC, ranks)    |
| `note_injury_context`  | `injuries{}`      | Injury + team context                |
| `note_weather_context` | `weather{}`       | Temp, wind, snow chance              |

## Stat Pattern Whitelist

Only sentences matching these patterns become `note_tendency`:

- `%` (percentages)
- `YPC/YPA/YPP` (per-play metrics)
- `1st/2nd/3rd/4th` (rankings)
- `pressures/sacks/targets` (counting stats)
- `target share`, `pressure rate`, `passer rating`
- Stat lines like `12/82/0`

This avoids noisy findings from narrative text.

## Data Format

```json
{
  "week": 21,
  "season": 2025,
  "round": "Conference Championships",
  "games": {
    "NE@DEN": {
      "kickoff": "Sun Jan 25, 3:00 PM ET",
      "keyMatchups": [
        "Drake Maye vs DEN's 47-sack pass rush"
      ],
      "injuries": {
        "DEN": ["Bo Nix (knee) - OUT, Jarrett Stidham starts"]
      },
      "weather": {
        "temp_f": 28,
        "wind_mph": 8,
        "snow_chance_pct": 30
      },
      "notes": "Denver's defense ranks 4th in sacks with 47. NE allowed 30 sacks on the season.",
      "news": [
        { "date": "2026-01-19", "text": "Bo Nix officially ruled out with ACL injury" }
      ]
    }
  }
}
```

## Integration

The Notes Agent runs in `runAgents()` and its findings are included in the Build prompt as a dedicated "Curated Notes" block.
