# Guía Operativa

## Requisitos previos
- Node.js >= 18
- API Key de OpenRouter (`OPENROUTER_API_KEY`)
- Yarn/npm para instalar dependencias

## Instalación
```bash
npm install
```

## Ejecución básica
```bash
node translate-folder.mjs <carpeta-es> <idioma-dest>
```
Ejemplo:
```bash
node translate-folder.mjs docs/es/unidex en --dry-run
```

## Todos los flags disponibles
| Flag               | Acción                                                          |
|--------------------|-----------------------------------------------------------------|
| `--dry-run`        | Simula el proceso, no traduce ni sobrescribe archivos           |
| `--force`          | Fuerza retraducción de todo, ignora hashes previos              |
| `--force-reviewed` | Pisa traducciones marcadas como revisadas por humano (`human_revision > 0`) |
| `--only-new`       | *Placeholder, aún no implementado*                              |
| `--only-changed`   | *Placeholder, aún no implementado*                              |

## Revisión manual y control de sobrescritura

- Los archivos con frontmatter que tengan `human_revision > 0` no serán actualizados por el pipeline a menos que ejecutes con el flag `--force-reviewed`.
- Si usas `--force-reviewed`, se actualizarán y esto será registrado en el reporte JSON.

## Ejemplo de input/output

- **Input MDX**: muestra un extracto de /docs/es/demo.mdx
- **Output traducido**: igual archivo en `/docs/en/demo.mdx`
- **Reporte JSON**: resumen en `/scripts/reports/`

---

## Primeros pasos recomendados

1. Configura tu API Key OpenRouter.
2. Crea/edita reglas en `translation_rules.txt` y glosario en `/glossaries/<lang>.yml`.
3. Lanza un dry-run:  
   ```
   node translate-folder.mjs docs/es/tuarea en --dry-run
   ```

---
