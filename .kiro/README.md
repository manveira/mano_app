# .kiro — configuración del agente para Mano App

Todo lo que el agente necesita para seguir trabajando en otro computador. Se versiona en el repo (`manveira/mano_app`), **excepto `settings/mcp.json`** (tiene tokens).

| Carpeta | Para qué |
|---|---|
| `skills/mano-app/SKILL.md` | La skill: contexto, reglas, estado y procedimientos (di "lee la skill mano-app") |
| `skills/mano-app/references/` | Datos de apoyo (p. ej. números de prueba de Wompi) |
| `steering/*.md` | Reglas permanentes (imágenes intocables, local primero, documentar y probar) |
| `hooks/*.json` | Guardarraíles (bloquea escribir imágenes; recordatorio de documentar y probar) |
| `scripts/guard-design-assets.sh` | Lo que ejecuta el hook de imágenes |
| `settings/mcp.json.example` | Plantilla del MCP de GitHub y Azure **sin llaves** |

## Continuar en otro computador
```bash
git clone https://github.com/manveira/mano_app.git        # dentro de una carpeta, p. ej. ~/Repos/
cd mano_app && git checkout refactor/multifront            # o main cuando esté fusionada
bash scripts/kiro-sync.sh import                           # copia .kiro/ a la carpeta de arriba (~/Repos/.kiro)
cp ../.kiro/settings/mcp.json.example ../.kiro/settings/mcp.json
# edita ../.kiro/settings/mcp.json y pega TU token de GitHub (permisos repo + workflow)
```
Abre Kiro CLI desde la carpeta que contiene `.kiro/` y `mano_app/` (la skill asume ese orden). Después de editar algo en `.kiro/`, ejecuta `bash scripts/kiro-sync.sh export` antes de hacer commit.

## Qué NO se versiona
`settings/mcp.json` (token de GitHub), `.env.local` (llaves de Wompi sandbox) y todo `.env`. Hay que recrearlos en cada computador.
