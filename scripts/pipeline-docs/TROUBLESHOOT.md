# Troubleshooting Guide

## Common Issues
### 1. Translations Skipped
**Symptom**: Files show as skipped in report  
**Fix**:
```bash
# Check protection status
grep -r "human_revision: [1-9]" docs/es/

# Force-retranslate
node translate-folder.mjs docs/es/team en --force-reviewed
```

### 2. YAML Errors
**Symptom**: `Error: bad indentation`  
**Solution**:
```bash
yamllint glossaries/pt.yml  # Verify 2-space indents
```

### 3. API Failures
```bash
# Test API access
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models
```

## Diagnostic Commands
```bash
# Count translated files
find docs/en -name "*.mdx" | wc -l

# Verify hashes
sha256sum docs/es/team/doc.mdx
```

> 🛠 **Advanced**: See [OPERATION.md](OPERATION.md#debugging)
```

---