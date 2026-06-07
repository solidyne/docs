# Translation Algorithm

```mermaid
graph TD
    A[MDX Input] --> B[Split H2+ Sections]
    B --> C{Hash Match?}
    C -->|Yes| D[Reuse Translation]
    C -->|No| E[LLM Translation Attempt 1]
    E --> F{Valid?}
    F -->|No| G[Attempt 2-3]
    G --> F
    F -->|Yes| H[Update .transdata.json]
    D & H --> I[Generate Output]
```

## Critical Checks
1. **Frontmatter Safety**  
   - Preserves original YAML structure
   - Only translates specific fields (title/description/keywords)

2. **Content Protection**  
   - Never translates code blocks (```) or JSX
   - Maintains original line endings (CRLF/LF)

3. **Hash Validation**  
   ```python
   # SHA-256 calculation logic
   hash = sha256(normalize_content(section_text))
   ```

4. - Sections starting with `import ` or `<` (JSX) are preserved as-is, never translated.
   ```

---


> ⚠️ **Failure Modes**: See [TROUBLESHOOT.md](TROUBLESHOOT.md#hash-errors)
```

---