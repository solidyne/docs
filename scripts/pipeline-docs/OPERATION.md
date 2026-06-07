# Technical Specifications

## Core Components
| Module | Purpose |
|--------|---------|
| `translate-folder.mjs` | Main orchestrator |
| `glossaries/` | Terminology control |
| `translation_rules.txt` | LLM system prompt |
| `.transdata.json` | Section metadata cache |

## Frontmatter (as generated)
All translated files will always include:
```yaml
translation:
  source_lang: "es"
  target_lang: "en"
  human_revision: 0
  reviewed_by: "the holy spirit"
  reviewed_at: "AAAAMMDD"
```
- `reviewed_by` and `reviewed_at` are always present, with string or placeholder value per code.

## .transdata.json (actual structure)
Each translated file (e.g., `/docs/en/foo.mdx`) will have an adjacent metadata file:
```json
{
  "human_revision": 0,
  "sections": [
    {
      "hash": "d03214e...",
      "translation": "Translated section here...",
      "title": "Original section title",   // Untranslated ES
      "level": 2
    }
    // ...
  ]
}
```
- No `frontmatter` or `last_updated` written by the script.

## Translation Report (.json batch file)
Report output (example):
```json
{
  "model": "deepseek/deepseek-chat",
  "duration_sec": "45.23",
  "results": {
    "en": {
      "translated": 8,
      "skipped": 2,
      "errors": 0,
      "total": 10,
      "skippedReviewed": 1,
      "forcedUpdates": 0
    }
  },
  "skipped_reviewed": 1,
  "forced_updates": 0
}
```
- Top-level fields: `model`, `duration_sec`, `results`, and explicit cumulative counts.
```

---


## Performance
- Throughput: 15-20 sec/file
- API Cost: ~$0.05/file
- Max Retries: 3 per section

> 📈 **Scaling**: See [ROADMAP.md](ROADMAP.md#scaling)
```

---