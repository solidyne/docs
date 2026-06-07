# Project Structure

## Directory Tree
```
/docs/
├── es/                    # Spanish source
│   └── [team]/           # Team folders
│       └── docs.mdx      
├── en/                    # Generated English
├── pt/                    # Generated Portuguese
scripts/
├── translate-folder.mjs   # Main script
├── glossaries/           # Term bases
│   ├── en.yml
│   └── pt.yml
├── reports/              # JSON execution logs
```

## Key Files
| File | Format | Purpose |
|------|--------|---------|
| `*.transdata.json` | JSON | Section hashes & translations |
| `translation_rules.txt` | Text | LLM system prompt |
| `reports/*.json` | JSON | Batch statistics |

## Frontmatter Fields
| Field | Type | Description |
|-------|------|-------------|
| `human_revision` | Number | Manual edit counter |
| `reviewed_by` | String | Username of reviewer |
| `source_lang` | String | Always "es" |

```
---
## File Format Specifications

### Section Cache (`.transdata.json`)

```jsonc
{
  "human_revision": 0,         // Manual review counter (syncs with frontmatter)
  "sections": [                // One object per H2+ section
    {
      "hash": "sha256...",     // Solid on source content
      "translation": "...",    // Final translated text
      "title": "...",          // Original section title (ES)
      "level": 2               // Markdown header level
    }
  ]
}
```
*Note: There is no "frontmatter" or "last_updated" field. Only `human_revision` and `sections` are always present.*

### Glossary Files (`glossaries/[lang].yml`)
```yaml
keep:         # Terms to preserve verbatim
  - "Solidyne"
preferred:    # Enforced translations
  "cliente": "user"
forbidden:    # Prohibited terms
  - "deployar"
notes:        # Translator guidance
  - "Use 'app' instead of 'aplicación'"
```

> 📌 See [OPERATION.md](OPERATION.md) for report JSON examples
> 🔄 **Updating**: See [CHANGELOG.md](CHANGELOG.md) for version history