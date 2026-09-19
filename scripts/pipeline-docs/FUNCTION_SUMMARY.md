# Resumen de Funciones del Sistema de Traducción MDX

## **Descripción General**

El sistema es un pipeline automatizado para traducir documentación técnica en formato MDX desde español hacia inglés y portugués, diseñado específicamente para documentación de equipos de audio broadcasting de Solidyne. Utiliza un enfoque granular basado en secciones con caching inteligente y protección de revisiones humanas.

## **Arquitectura del Sistema**

### **Componentes Principales**
1. **`translate-folder.mjs`** - Script principal de orquestación
2. **`mdx-section-parser.mjs`** - Divididor de archivos MDX en secciones (H2+)
3. **`mdx-postprocess.mjs`** - Procesamiento posterior y validación
4. **Directorio `glossaries/`** - Archivos YAML con terminología por idioma
5. **`translation_rules.txt`** - Prompt del sistema para el LLM

### **Estructura de Directorios**
```
/docs/
├── es/                    # Fuente español (original)
│   └── [team]/           # Carpetas por equipo
├── en/                    # Generado inglés
├── pt/                    # Generado portugués
scripts/
├── translate-folder.mjs   # Script principal
├── glossaries/
│   ├── en.yml           # Glosario inglés
│   └── pt.yml           # Glosario portugués
├── reports/              # Reportes JSON
└── *.transdata.json     # Cache por archivo
```

## **Funcionalidades Principales**

### **1. Traducción Seccional Granular**
- **División inteligente**: Separa archivos MDX en secciones basadas en encabezados H2+
- **Detección de cambios**: Calcula hash SHA-256 para cada sección
- **Cache inteligente**: Solo retraduce secciones modificadas
- **Archivos de cache**: `.transdata.json` almacena hashes y traducciones

### **2. Protección de Revisiones Humanas**
- **Detección automática**: Identifica archivos con `human_revision > 0` en frontmatter
- **Protección por defecto**: No sobrescribe documentos revisados manualmente
- **Forzado controlado**: Requiere flag `--force-reviewed` para actualización
- **Sincronización**: Mantiene contador `human_revision` entre cache y frontmatter

### **3. Sistema de Glosarios Técnicos**
- **Formatos YAML**: Archivos estructurados por idioma
- **Categorías**:
  - **`preferred`**: Traducciones obligatorias (ej: "cliente" → "user")
  - **`no_translate`**: Términos preservados verbatim (ej: "DSP", "GPIO")
  - **`rules`**: Reglas de estilo contextuales
  - **`notes`**: Guías específicas para traductores
- **Especialización**: Terminología específica de broadcasting profesional

### **4. Manejo Avanzado de Frontmatter**
- **Traducción selectiva**: Campos `title`, `description`, `keywords`
- **Preservación estructural**: Mantiene formato YAML original intacto
- **Metadatos automáticos**: Incluye bloque de información de traducción:
  ```yaml
  translation:
    source_lang: "es"
    target_lang: "en"
    human_revision: 0
    reviewed_by: "the holy spirit"
    reviewed_at: "AAAAMMDD"
  ```

### **5. Características de Protección de Contenido**
- **Blindaje de código**: No traduce `import`, JSX, ni bloques entre backticks
- **Protección JSX**: Mantiene atributos y nombres de componentes intactos
- **Manejo de acordeones**: Traduce bloques `<Accordion>` con título y contenido
- **Preservación de formato**: Mantiene saltos de línea originales (CRLF/LF)

### **6. Mecanismos de Resiliencia**
- **Reintentos automáticos**: Máximo 3 intentos por sección en fallos
- **Detección de truncamiento**: Identifica traducciones incompletas
- **Fallback inteligente**: Vuelve al texto original tras fallos persistentes
- **Validación post-traducción**: Verifica integridad del MDX resultante

### **7. Generación de Reportes**
- **Formato JSON**: Reportes detallados por ejecución
- **Métricas completas**:
  - Archivos traducidos, omitidos, con errores
  - Tiempo total de ejecución
  - Archivos revisados saltados/forzados
- **Nombrado automático**: `translate-report_[carpeta]_[idioma]_[fecha].json`

## **Parámetros de Ejecución**

| Flag | Descripción | Casos de Uso |
|------|-------------|--------------|
| `--dry-run` | Modo simulación sin cambios | Validación inicial, estimación de costos |
| `--force` | Ignora hashes, retraduce todo | Cambios en glosarios, reglas actualizadas |
| `--force-reviewed` | Sobrescribe revisiones humanas | Actualización crítica de documentación |
| `--only-new` | *Futura característica* | Traducción incremental de nuevos archivos |
| `--only-changed` | *Futura característica* | Sincronización parcial de cambios |

## **Flujo de Ejecución**

### **Fase 1: Preparación**
1. Validación de parámetros y carpetas
2. Verificación de variable `OPENROUTER_API_KEY`
3. Carga de reglas y glosarios

### **Fase 2: Procesamiento por Idioma**
1. Exploración recursiva de archivos `.mdx` en carpeta fuente
2. Para cada archivo:
   - Verificación de protección por revisión humana
   - Extracción y traducción de frontmatter
   - División en secciones con `parseMdxSections()`
   - Cálculo de hashes SHA-256 por sección

### **Fase 3: Traducción Seccional**
1. Para cada sección:
   - Comparación con cache (hash match)
   - Reutilización de traducción existente si aplica
   - Traducción con LLM si necesaria
   - Reintentos ante fallos (máximo 3)
   - Validación de integridad

### **Fase 4: Ensamblaje y Escritura**
1. Reconstrucción del archivo MDX completo
2. Inclusión de frontmatter traducido y metadatos
3. Escritura del archivo traducido
4. Actualización del cache `.transdata.json`

### **Fase 5: Reporte y Finalización**
1. Generación de estadísticas de ejecución
2. Creación de reporte JSON en `reports/`
3. Output de resumen por consola

## **Estructuras de Datos**

### **Archivo de Cache (`.transdata.json`)**
```json
{
  "human_revision": 0,
  "sections": [
    {
      "hash": "sha256...",          // Hash del contenido original
      "translation": "...",         // Texto traducido completo
      "title": "Título en español", // Título original (no traducido)
      "level": 2                   // Nivel de encabezado
    }
  ]
}
```

### **Archivo de Reporte**
```json
{
  "model": "deepseek/deepseek-chat",
  "duration_sec": "45.23",
  "results": {
    "en": {
      "translated": 8,
      "skipped": index,
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

### **Glosario YAML (ejemplo)**
```yaml
rules:
  - Translate for a professional broadcast environment
  - Preserve product names and trademarks exactly
  
no_translate:
  - DSP
  - GPIO
  - Dante
  
preferred:
  consola IP: IP audio console
  planta transmisora: transmitter site
  
notes:
  - Prefer broadcast-industry terminology
```

## **Casos Especiales y Manejo de Bordes**

### **Contenido Protegido**
- **Imports**: `import Button from "@/components/Button"` → No se traduce
- **JSX/Componentes**: `<Component prop="value">` → Solo texto visible
- **Bloques de código**: ```javascript\ncode\n``` → Preservado íntegro
- **Enlaces MDX**: Se ajustan rutas `/es/` → `/[idioma]/`
- **Snippets**: `/snippets/name.mdx` → `/snippets/name-[lang].mdx`

### **Manejo de Acordeones**
```mdx
<Accordion title="Configuración inicial">
  Contenido del acordeón
</Accordion>
```
Se traducen tanto el atributo `title` como el contenido interno.

### **Fallos y Recuperación**
1. **Error de API**: Reintento automático (máximo 3x)
2. **Truncamiento**: Continuación de traducción incompleta
3. **YAML inválido**: Log warning, preservación del original
4. **Timeout**: Continúa con siguiente archivo, cuenta como error

## **Especificaciones Técnicas**

### **Requisitos del Sistema**
- Node.js ≥ 18
- Variable de entorno `OPENROUTER_API_KEY`
- Documentos fuente en `/docs/es/[team]/` jerarquía

### **Configuración LLM**
- **Proveedor**: OpenRouter API
- **Modelo por defecto**: `deepseek/deepseek-chat`
- **Tokens máximo**: 8000 por solicitud
- **Temperature**: 0 (para consistencia)
- **Prompt personalizado**: `translation_rules.txt`

### **Métricas de Rendimiento**
- **Velocidad**: 15-20 segundos por archivo
- **Costo estimado**: ~$0.05 por archivo
- **Escalabilidad**: Procesamiento por lotes de carpetas completas

## **Integración con API de Traducción**

### **Flujo de Solicitud LLM**
```
Contenido → Prompt + Glosario → LLM → Validación → Output
```

### **Validaciones Post-Traducción**
- Ausencia de marcadores `[continued]`
- Integridad de bloques de código
- Cierre apropiado de JSX/componentes
- Enlaces correctamente ajustados

## **Roadmap y Características Futuras**

### **Prioridades Altas (Q3 2026)**
1. `--only-changed` flag para traducción delta
2. Integración con GitHub Actions
3. Soporte para portugués europeo (pt-PT)

### **Futuro Desarrollo**
1. Dashboard de revisión web
2. Notificaciones por Slack/Teams
3. Generación automática de glosarios
4. Pipeline CI/CD completo

## **Buenas Prácticas de Uso**

### **Preparación**
1. Establecer `OPENROUTER_API_KEY` en entorno
2. Configurar `glossaries/[lang].yml` para terminología
3. Revisar `translation_rules.txt` para contexto

### **Ejecución Inicial**
```bash
# Prueba de validación
node scripts/translate-folder.mjs docs/es/sample en --dry-run

# Traducción completa
node scripts/translate-folder.mjs docs/es/unidex en

# Traducción forzada tras revisiones
node scripts/translate-folder.mjs docs/es/unidex en --force-reviewed
```

### **Mantenimiento**
1. Revisar reportes JSON en `scripts/reports/`
2. Actualizar glosarios según nueva terminología
3. Monitorear `human_revision` para documentos revisados

## **Solución de Problemas**

### **Protección de Revisiones**
```bash
# Verificar archivos protegidos
grep -r "human_revision: [1-9]" docs/es/

# Forzar actualización de revisados
node translate-folder.mjs docs/es/team en --force-reviewed
```

### **Validación de Glosarios**
```bash
# Verificar sintaxis YAML
yamllint glossaries/pt.yml

# Probar acceso a API
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models
```

## **Consideraciones Clave**

1. **Consistencia terminológica**: Glosarios aseguran traducción uniforme
2. **Preservación de estructura**: Frontmatter y componentes intactos
3. **Eficiencia**: Caching por sección evita retraducción innecesaria
4. **Control humano**: Sistema de revisiones protege trabajo manual
5. **Auditabilidad**: Reportes JSON proporcionan trazabilidad completa

---

**Documentación Relacionada**:
- [USAGE.md](USAGE.md) - Guía operativa y referencia CLI
- [FLOW.md](FLOW.md) - Algoritmo y flujo técnico detallado
- [STRUCTURE.md](STRUCTURE.md) - Organización de proyecto
- [OPERATION.md](OPERATION.md) - Especificaciones técnicas
- [TROUBLESHOOT.md](TROUBLESHOOT.md) - Solución de problemas
- [CHANGELOG.md](CHANGELOG.md) - Historial de versiones
- [ROADMAP.md](ROADMAP.md) - Planes de desarrollo futuro

**Última actualización**: Generado automáticamente desde análisis del sistema completo