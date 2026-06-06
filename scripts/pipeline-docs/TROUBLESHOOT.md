# Problemas Comunes y Soluciones

## Errores de permisos
- Asegúrate de ejecutar con permisos de usuario o admin según la carpeta.

## El script no traduce algunas secciones
- ¿Se modificó realmente el texto en español? Si no, reutiliza traducción por hash.

## El LLM corta o trunca secciones
- El pipeline intenta hasta 3 partes. Si sigue incompleto, revisa tamaño de sección o reduce longitud.

## "tags" aparecen traducidos incorrectamente
- Confirma que el script esté actualizado. Desde v1.1 los tags NO se traducen.

## Error: API KEY
- Verifica variable OPENROUTER_API_KEY y que el modelo esté habilitado en OpenRouter.ai

## Archivos mal ubicados o estructura rota
- Asegúrate de que trabajas siempre bajo una carpeta raíz `/docs/es/`.

---

## Diagnóstico avanzado

- Para debug de perms usa:  
  `icacls <ruta>`  
- Logs extendidos en `reports/`

---
