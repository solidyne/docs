# Version History

## v1.2.0 - Julio 2026
### Added
- Archivos revisados manualmente (`human_revision > 0`) no se sobrescriben a menos que se use `--force-reviewed`.
- Reporte JSON ahora incluye campos `skipped_reviewed` y `forced_updates`.
- El campo `reviewed_at` del frontmatter tiene ahora el formato default "AAAAMMDD" para facilitar la revisión manual.

### Fixed
- Tags en frontmatter preservados
- Verificación de hash restaurada

## v1.0.0 - Junio 2026
- Lanzamiento inicial
