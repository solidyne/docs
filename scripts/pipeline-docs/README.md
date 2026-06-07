# Solidyne MDX Translation Pipeline

Automated translation system for technical MDX documentation from Spanish to English/Portuguese with glossary support and human review protection.

## Key Features
- Granular section-level translation with hash-based caching
- Frontmatter and content translation with YAML preservation
- Protected human-reviewed documents (`human_revision > 0`)
- Multi-attempt LLM translation with truncation recovery
- Terminology management via glossaries
- JSON progress reports

## Quick Start
```bash
# Install dependencies
npm install

# Basic translation
node scripts/translate-folder.mjs docs/es/[team] en

# Simulate translation
node scripts/translate-folder.mjs docs/es/[team] pt --dry-run
```

## Documentation
| Document | Purpose |
|----------|---------|
| [USAGE.md](USAGE.md) | CLI reference and basic operation |
| [FLOW.md](FLOW.md) | Translation algorithm and technical flow |
| [STRUCTURE.md](STRUCTURE.md) | Project organization and file formats |
| [OPERATION.md](OPERATION.md) | Technical specifications |
| [TROUBLESHOOT.md](TROUBLESHOOT.md) | Common issues and solutions |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [ROADMAP.md](ROADMAP.md) | Planned future features |

## Requirements
- Node.js ≥ 18
- OpenRouter API key (`OPENROUTER_API_KEY`)
- Source documents in `/docs/es/` hierarchy

> See [USAGE.md](USAGE.md) for detailed instructions or [TROUBLESHOOT.md](TROUBLESHOOT.md) for help
```
## Output Frontmatter (metadata preview)
All translated files include this block (example for English):
```yaml
translation:
  source_lang: "es"
  target_lang: "en"
  human_revision: 0
  reviewed_by: "the holy spirit"
  reviewed_at: "AAAAMMDD"
```
- `human_revision` is a manual review edit counter (set to 0 by default)
- `reviewed_by` and `reviewed_at` are always present (even with placeholder/default values)
```

---
