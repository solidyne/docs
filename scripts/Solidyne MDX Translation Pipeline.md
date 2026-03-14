# Solidyne MDX Translation Pipeline (V3)

## Overview

This document describes the automated MDX translation pipeline used to translate Spanish documentation (`/docs/es`) into multiple target languages while preserving:

* MDX structural integrity
* JSX components
* Frontmatter consistency
* Hash-based change detection
* Safe batch processing
* Truncation detection and auto-continuation
* Terminology control via language glossaries

The system is designed for:

* Manual review after translation
* Incremental updates
* Multi-language documentation
* Future automation (event-driven updates)

---

# 1. Architecture

## Source Structure

```
docs/
├── es/
│   └── <equipment>/
│       ├── file1.mdx
│       └── subfolder/
│           └── file2.mdx
│
├── en/
│   └── <equipment>/
│
└── pt/
    └── <equipment>/
```

The script:

* Recursively scans `/docs/es/<equipment>`
* Replicates folder structure under the target language directory
* Translates only when required (hash-based)
* Injects translation metadata into frontmatter
* Supports multiple target languages

---

# 2. Script Location

```
scripts/
├── translate-folder.mjs
├── translation_rules.txt
├── glossaries/
│   ├── pt.yml
│   └── en.yml
└── reports/
```

---

# 3. Supported Languages

Languages are defined in the script:

```javascript
const SUPPORTED_LANGS = ["en", "pt"];
```

Language naming for prompts is controlled by:

```javascript
const LANGUAGE_MAP = {
  en: "English",
  pt: "Brazilian Portuguese (pt-BR)"
};
```

Notes:

* The folder name remains `pt`
* The translation target is explicitly **Brazilian Portuguese (pt-BR)**

This prevents Portuguese-Portugal terminology from appearing.

---

# 4. Translation Workflow

## Command

```
node translate-folder.mjs <source-folder> <target-language>
```

Example:

```
node translate-folder.mjs docs/es/unidex en
node translate-folder.mjs docs/es/unidex pt
```

Translate all supported languages:

```
node translate-folder.mjs docs/es/unidex all
```

---

## Optional Flags

```
--dry-run
--force
--only-new
--only-changed
```

### dry-run

Simulates execution without calling the API.

Useful to validate:

* paths
* file detection
* language selection

---

## Default Mode

A file is translated when:

* It does not exist in the target language folder
* OR the stored `source_hash` differs from the current ES file

---

# 5. Hash System

## What is a hash?

A **hash** is a cryptographic fingerprint of a file's content.

We use:

```
SHA-256
```

---

## Purpose

* Detect content changes in Spanish source files
* Avoid unnecessary re-translation
* Enable incremental update logic

---

## How it works

1. Spanish file content is hashed
2. Hash is stored in translated frontmatter
3. On next run:

* If hash unchanged → file skipped
* If hash changed → file re-translated

---

# 6. Translation Metadata (Frontmatter)

Every translated file contains:

```yaml
translation:
  source_lang: "es"
  target_lang: "pt"
  status: "draft"
  version: 0
  reviewed_by: ""
  reviewed_at: ""
  source_hash: "08227fc2834f4cffca04b80527394122614fbccb5828776afb4212f39b4bee68"
```

---

# 7. Frontmatter Field Definitions

## source_lang

Language of original document.

```
"es"
```

---

## target_lang

Target language of the translation.

Examples:

```
"en"
"pt"
```

---

## status

Allowed values:

```
draft
reviewed
updated
```

### Meaning

**draft**

Machine translated.
Pending human review.

**reviewed**

Human validated translation.

**updated**

Source document changed and translation was regenerated.

---

## version

Integer.

Tracks the number of **human revision cycles**.

Example:

```
0 → initial machine translation
1 → first human revision
2 → second human revision
```

---

## reviewed_by

String identifier of reviewer.

Example:

```
reviewed_by: "JPD"
```

---

## reviewed_at

ISO-8601 date format (mandatory):

```
YYYY-MM-DD
```

Example:

```
reviewed_at: "2026-02-21"
```

Do NOT use:

```
21/02/2026
Feb 21, 2026
02-21-26
```

Always use ISO format.

---

## source_hash

SHA-256 hash of the original Spanish document.

Generated automatically by the script.

**Do not edit manually.**

---

# 8. Glossary System

Language glossaries provide **terminology control** for translations.

Example location:

```
scripts/glossaries/pt.yml
```

The glossary contains:

* preferred translations
* avoided terms
* non-translatable technical terms
* broadcast and audio terminology

During execution:

1. The YAML glossary is loaded
2. Converted to a simplified table
3. Injected into the translation prompt

Example prompt structure:

```
TRANSLATION RULES
+ GLOSSARY
+ TRANSLATION INSTRUCTION
```

This ensures consistent terminology across the documentation.

---

# 9. Truncation Control System

The pipeline includes robust protection against LLM truncation.

## Problems Observed

Large outputs may occasionally produce placeholder fragments such as:

```
[Continued in next part due to length...]
```

or

```
[Content continues with same careful translation...]
```

These indicate incomplete output.

---

## Protection Mechanism

The script automatically:

1. Detects truncation markers
2. Requests continuation from the model
3. Merges additional segments
4. Allows up to **3 output parts**
5. Removes placeholder artifacts

This ensures:

* No incomplete MDX is silently saved
* Batch integrity is preserved
* Errors remain visible in JSON reports

---

# 10. Token Usage

Typical metrics:

```
3,000 – 4,000 tokens per file
≈ $0.04 – $0.06 per file
```

Estimated full batch:

```
~237 files ≈ $10–15 USD
```

Translation rules are in
