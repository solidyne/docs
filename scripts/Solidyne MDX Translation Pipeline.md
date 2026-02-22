# Solidyne MDX Translation Pipeline

## Overview

This system translates Spanish MDX documentation to English using OpenRouter + Claude.

Folder structure:

DOCS/
 ├── es/
 ├── en/
 └── scripts/

Each Spanish file generates an English counterpart preserving structure.

---

## Execution

From DOCS/scripts:

node translate-folder.mjs ../es/unidex

Options:

--dry-run        → simulate only
--force          → overwrite all
--only-new       → translate only files not existing in EN
--only-changed   → translate only if source_hash changed

---

## Translation Metadata

Each EN file contains:

translation:
  source_lang: "es"
  status: "draft"
  version: 0
  reviewed_by: ""
  reviewed_at: ""
  source_hash: "<sha256>"

Purpose:

- Detect changes in ES
- Prevent unnecessary re-translation
- Enable future incremental automation

---

## Recommended Workflow

1. Translate by equipment folder.
2. Review English files manually.
3. When approved:
   - Change status to "reviewed"
   - Increment version
   - Add reviewed_by + reviewed_at
4. Publish.
5. Move to next equipment.

---

## Future Automation (Planned)

### Phase 1
- Git hook: detect changes in DOCS/es
- Run translate-folder with --only-changed

### Phase 2
- CI integration (GitHub Actions)
- Auto PR with updated EN files

### Phase 3
- Semantic block translation
- Partial update instead of full file rewrite

---

## Safety

- Never hardcode API keys
- Use environment variable OPENROUTER_API_KEY
- Always test with --dry-run before large runs