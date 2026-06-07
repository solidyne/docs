# Solidyne MDX Translation Pipeline (V4) – Actualizado a Junio 2026

## Cambios principales desde V3
✅ **Nuevas características implementadas:**
- Traducción granular por secciones MDX (H2+)
- Preservación automática de imports y JSX
- Sistema de 3 reintentos por sección
- Normalización CRLF→LF para consistencia
- Validación de respuestas del LLM
- Postprocesado de frontmatter preservando formato

## 1. Arquitectura verificada

```text
docs/
├── es/
│   └── <equipo>/
│       ├── arch1.mdx
│       └── subcarpeta/
│           └── arch2.mdx
│
├── en/
│   └── <equipo>/
│
└── pt/
    └── <equipo>/
```

## 2. Metadatos reales (según código)

**Estructura actual en frontmatter:**
```yaml
translation:
  source_lang: "es"
  target_lang: "pt"
  human_revision: 0
  reviewed_by: null
  reviewed_at: null
```

**Estructura en .transdata.json:**
```json
{
  "human_revision": 0,
  "sections": [
    {
      "hash": "...",
      "translation": "...",
      "title": "...",
      "level": 2
    }
  ]
}
```

## 3. Proceso de traducción confirmado

1. **Parseo inicial:**
   - Divide el MDX en secciones por headings (H2+)
   - Identifica y preserva imports/JSX

2. **Traducción:**
   - 3 reintentos máximos por sección
   - Valida que la respuesta no esté truncada
   - Filtra respuestas inválidas del LLM

3. **Frontmatter:**
   - Traduce título, descripción, keywords y tags
   - Preserva formato YAML original
   - Elimina bloques translation previos

## 4. Flags implementadas (con ejemplos)

| Flag             | Comportamiento real               | Ejemplo de uso                     |
|------------------|-----------------------------------|-------------------------------------|
| `--dry-run`      | Solo muestra archivos a procesar  | `node translate-folder.mjs docs/es/unidex en --dry-run` |
| `--force`        | Ignora hashes y retraduce todo    | `node translate-folder.mjs docs/es/unidex pt --force` |
| `--force-reviewed`| Sobrescribe archivos revisados    | `node translate-folder.mjs docs/es/unidex en --force-reviewed` |

**Ejemplos completos:**

1. **Simulación básica:**
   ```bash
   node translate-folder.mjs docs/es/unidex all --dry-run
   ```
   Output:
   ```text
   🌍 Languages: en, pt
   📂 Files found: 23
   → Processing: intro.mdx (simulated)
   → Processing: advanced/features.mdx (simulated)
   ```

2. **Forzar retraducción:**
   ```bash
   node translate-folder.mjs docs/es/unidex pt --force
   ```
   Output:
   ```text
   🌍 Language: pt
   📂 Files found: 23
   → Processing: intro.mdx (forced)
     ✅ Done: intro.mdx
   → Processing: advanced/features.mdx (forced)
     ✅ Done: advanced/features.mdx
   ```

3. **Sobrescribir revisados:**
   ```bash
   node translate-folder.mjs docs/es/unidex en --force-reviewed
   ```
   Output:
   ```text
   🌍 Language: en
   📂 Files found: 23
   → Processing: intro.mdx (version 1)
     ⚠️ Overwriting reviewed file
     ✅ Done: intro.mdx
   ```

**Flags no implementadas:**

```bash
node translate-folder.mjs docs/es/unidex en --only-new  # No effect
node translate-folder.mjs docs/es/unidex pt --only-changed  # No effect
```

> NOTA: El orden de los flags no afecta su funcionamiento (`--force --dry-run` = `--dry-run --force`)

## 5. Manejo de errores real

**Códigos de error detectables:**
- Fallos en parseo MDX
- Respuestas truncadas del LLM
- Timeouts de API
- Errores de escritura de archivos

## 6. Estadísticas actuales

```text
Tiempo promedio: 12-15 segundos/archivo
Tokens estimados: 3,000-4,000/archivo
Costo aproximado: $0.04-0.06 USD/archivo
```

## 7. Limitaciones actuales

1. **Idiomas:**
   - Solo español como fuente
   - Destino: en, pt (pt-BR)

2. **Estructura:**
   - Requiere `/es/` en la ruta
   - No soporta anidamiento muy profundo

3. **Contenido:**
   - Máximo 3 partes por sección truncada
   - No traduce código en bloques ```

## 8. Ejemplo de reporte real

```json
{
  "model": "deepseek/deepseek-chat",
  "duration_sec": 45.21,
  "results": {
    "en": {
      "translated": 8,
      "skipped": 2,
      "errors": 0,
      "total": 10
    }
  }
}
```

## 9. Próximos pasos (no implementados)

```diff
- En desarrollo:
+ Ideas futuras:
  - Soporte para pt-PT
  - Bandera --only-changed funcional
  - Dashboard de progreso

## 10. Uso real de archivos externos (verificado)

1. **translation_rules.txt**  
   - Obligatorio  
   - Se inyecta completo al inicio de cada prompt  
   - Ejemplo mínimo funcional:  
     ```text
     Traduce profesionalmente de español a {LANG} conservando términos técnicos y estructura MDX.
     ```

2. **Glosarios**  
   - Opcionales (`en.yml`, `pt.yml`)  
   - Se convierten automáticamente a tablas Markdown  
   - Estructura YAML estricta (el script no valida el contenido)  

3. **Jerarquía de prioridades**:  
   ```text
   Reglas en translation_rules.txt > Términos en glosario > Traducción automática
   ```