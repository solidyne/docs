# Solidyne MDX Translation Pipeline (V3) – Actualizado a Mayo 2026

## Resumen

Este documento describe el pipeline automatizado usado para traducir documentación MDX en español (`/docs/es`) a múltiples idiomas destino, con preservación de:

* Integridad estructural MDX
* Componentes JSX
* Consistencia de frontmatter (metadatos de traducción)
* Control hash para detección de cambios
* Procesamiento seguro en batch
* Detección y control de truncamiento automático
* Control de terminología vía glosarios por idioma

El sistema está diseñado para:

* Revisión manual post-traducción
* Actualizaciones incrementales
* Soporte multi-idioma
* Futura automatización basada en eventos

> **Importante:** El script requiere una clave de acceso (`OPENROUTER_API_KEY`) a la API de OpenRouter para funcionar. Se usa por defecto el modelo configurado en el script; actualmente:  
> `deepseek/deepseek-chat` (puede cambiarse editando la variable `MODEL` en el script).

---

# 1. Arquitectura

## Estructura de carpetas fuente y traducciones

```
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

El script realiza:

* Escaneo recursivo de `/docs/es/<equipo>`
* Replica la estructura de carpetas para cada idioma destino
* Traduce solo donde es necesario (según hash)
* Inyecta metadatos de traducción en el frontmatter
* Soporta múltiples idiomas destino definidos en el script

> **Importante:** Actualmente solo se soporta **español** como idioma fuente.

---

# 2. Ubicación y archivos relevantes del pipeline

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

# 3. Idiomas soportados y modelo de traducción

Los idiomas destino están definidos en el script:

```javascript
const SUPPORTED_LANGS = ["en", "pt"];
```

El mapeo destino para los prompts es:

```javascript
const LANGUAGE_MAP = {
  en: "English",
  pt: "Brazilian Portuguese (pt-BR)"
};
```

* El nombre de la carpeta sigue siendo `pt`.
* La traducción es explícitamente **Portugués Brasil (pt-BR)**.
* El modelo utilizado por defecto se define en la variable:
  ```javascript
  const MODEL = "deepseek/deepseek-chat";
  ```
  Cambia esta línea para utilizar otro modelo disponible en OpenRouter.

> Verifica la [lista oficial de modelos soportados](https://openrouter.ai/models).

---

# 4. Requisitos previos

1. Define y exporta tu `OPENROUTER_API_KEY` antes de ejecutar el script.
   ```bash
   export OPENROUTER_API_KEY=tu_api_key
   ```
2. Requiere Node.js v18+ y dependencias (`npm install` según package.json).
3. El nombre de la carpeta fuente debe contener `/es/` para detectar correctamente la estructura.

---

# 5. Ejecución y opciones

## Comando principal

```
node translate-folder.mjs <carpeta-fuente> <idioma-destino>
```

Ejemplos:

```
node translate-folder.mjs docs/es/unidex en
node translate-folder.mjs docs/es/unidex pt
```

Para traducir a todos los idiomas disponibles:

```
node translate-folder.mjs docs/es/unidex all
```

---

## Flags soportadas

```
--dry-run
--force
--only-new   (No implementado)
--only-changed   (No implementado)
```

### Descripción de flags

- **--dry-run:** Simula la ejecución sin llamar a la API. Útil para validar rutas, archivos y selección de idiomas.
- **--force:** Fuerza la retraducción de todos los archivos aunque el hash no haya cambiado.
- **--only-new/--only-changed:** *Actualmente no implementadas*, aunque aparecen en el script. No afectan la lógica.

---

## Modo de traducción por defecto

Un archivo se traduce cuando:

* No existe en la carpeta de destino
* **O** el `source_hash` guardado en el archivo traducido **no coincide** con el hash actual del archivo fuente en español

---

# 6. Sistema de hash

## ¿Para qué se usa el hash?

Un **hash SHA-256** se calcula del contenido del archivo fuente en español y se inserta en el frontmatter del archivo traducido.
Esto permite:

* Detectar cambios en el original
* Evitar retraducciones innecesarias
* Soportar actualizaciones incrementales

---

# 7. Metadatos de traducción (frontmatter)

Cada archivo traducido incluye:

```yaml
translation:
  source_lang: "es"
  target_lang: "pt"
  status: "draft"
  version: 0
  reviewed_by: ""
  reviewed_at: ""
  source_hash: "..."
```

**Notas:**
- `version`, `reviewed_by` y `reviewed_at` deben mantenerse manualmente al revisar traducciones. El script *no* incrementa ni actualiza estos campos.
- No edites manualmente `source_hash`: se genera automáticamente.

---

# 8. Definición de los campos de metadatos

- **source_lang**: `"es"`
- **target_lang**: `"en"` o `"pt"`
- **status**:  
  - `"draft"` — traducción automática, pendiente de revisión  
  - `"reviewed"` — validada por humano  
  - `"updated"` — regenerada tras un cambio en el original

- **version**:  
  Un entero que marca el ciclo de revisión humana (0: auto, 1: primera revisión, etc.)

- **reviewed_by**:  
  Identificador del revisor.

- **reviewed_at**:  
  Fecha en formato ISO (YYYY-MM-DD).

- **source_hash**:  
  Hash SHA-256 del archivo fuente en español.

---

# 9. Glosario por idioma

Cada idioma destino puede tener su glosario con:

* Traducciones preferidas
* Términos a evitar
* Términos técnicos no traducibles

Ejemplo de ubicación:

```
scripts/glossaries/pt.yml
```

La estructura simplificada será incluida automáticamente en los prompts para una traducción consistente.

---

# 10. Protección frente a truncamientos del modelo

Para archivos grandes, el script detecta respuestas truncadas como:

```
[Continued in next part due to length...]
[Content continues with same careful translation...]
```

El pipeline:

* Detecta esos casos
* Solicita continuación y une hasta **3 partes**
* Limpia los artefactos de truncamiento
* Garantiza no guardar archivos incompletos
* Registra cualquier error en el reporte JSON

---

# 11. Validaciones y postprocesado

Tras la traducción, el script:

* Ejecuta utilidades de postprocesado (`postProcessMdx`) para corregir enlaces internos y snippets
* Valida la estructura MDX (`validateMdx`)
* Todas las advertencias aparecen en consola y reporte

---

# 12. Reportes de ejecución

Después de cada corrida, se genera un archivo JSON en `scripts/reports` con el resumen de la traducción:

- Nombre del modelo utilizado
- Duración total
- Archivos traducidos, omitidos, con error, y total

Ejemplo:
```
scripts/reports/translate-report_<carpeta>_<idioma>_<fecha>.json
```

---

# 13. Limitaciones conocidas

- Las flags `--only-new` y `--only-changed` **no tienen efecto real**.
- La estructura fuente debe contener `/es/` en el path para detectar correctamente la raíz de destino.
- El incremento de versión/revisión debe hacerse manualmente al revisar traducciones.

---

# 14. Métricas típicas de uso

```
3,000 – 4,000 tokens por archivo
≈ $0.04 – $0.06 USD por archivo
```
Batch completo típico:
```
~237 archivos ≈ $10–15 USD
```

---

# 15. Notas finales

- Edita la variable `MODEL` en el script para cambiar el modelo de traducción activo.
- Si aparecen problemas con el modelo, verifica en [OpenRouter Models](https://openrouter.ai/models) qué modelos están habilitados para tu cuenta/API Key.
- Verifica las advertencias en consola y en los reportes JSON.

---