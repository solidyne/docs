# Estructura de Carpeta y Archivos Clave

## Árbol general

```
/docs/
├── es/
│   └── equipo/
│       └── foo.mdx
├── en/ ... pt/ ... (generados)
scripts/
├── translate-folder.mjs
├── glossaries/
│   └── en.yml
│   └── pt.yml
├── translation_rules.txt
├── reports/
│   └── translate-report_[...].json
├── pipeline-docs/
│   └── (este folder)
```

## Explicación de archivos

- **glossaries/* .yml**: términos técnicos y traducciones preferidas/prohibidas por idioma
- **translation_rules.txt**: instrucciones clave para el LLM
- **.transdata.json**: metadatos por archivo traducido (hash, secciones, control granular)
- **reports/* **: reportes de procesamiento JSON (por corrida de batch)
- **pipeline-docs/* **: documentación y ayuda interna del pipeline

## Campos importantes en frontmatter traducido

```yaml
translation:
  source_lang: "es"
  target_lang: "en"
  human_revision: 0
```

## Ejemplo de glosario

```yaml
keep:
  - "Solidyne"
preferred:
  "cliente": "app client"
forbidden:
  - "deployar"
```
---
