# Operational Guide

## Basic Usage
```bash
node scripts/translate-folder.mjs <source-path> <target-lang> [flags]
```

Example translating a team's docs:
```bash
node scripts/translate-folder.mjs docs/es/unidex en
```

## Key Features
1. **Human Review Protection**  
   Files with `human_revision > 0` won't be overwritten unless using `--force-reviewed`.
   
2. **Partial Translation**  
   Only changed sections (detected via SHA-256 hashes) are retranslated.

3. **Glossary Support**  
   Uses `glossaries/[lang].yml` for preferred/prohibited terms.

## Available Flags
| Flag | Description |
|------|-------------|
| `--dry-run` | Simulation mode (no files changed) |
| `--force` | Retranslate everything (ignore hashes) |
| `--force-reviewed` | Override human-reviewed files |
| `--only-new` | *Future feature* |
| `--only-changed` | *Future feature* |

## Recommended First Steps
1. Set up your OpenRouter API key
2. Configure `translation_rules.txt` and glossaries
3. Run initial test:  
   ```bash
   node scripts/translate-folder.mjs docs/es/sample en --dry-run
   ```

> For technical details see [FLOW.md](FLOW.md) or debug with [TROUBLESHOOT.md](TROUBLESHOOT.md)