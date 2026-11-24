# tests/e2e — Prueba de interfaz (Playwright)

`ui-smoke.js` recorre el flujo del comisionista contra el entorno local: splash → elegir rol → registro → inicio → cada botón de cada pantalla → cierre de sesión, más la vitrina pública y el inicio de sesión. Última corrida (24-nov-2026): **31/31**. Las esperas son largas (15–20 s) a propósito: las imágenes de 36 Mpx tardan unos 4 s en decodificarse (ver `docs/SCREENS.md`, pendiente 6).

## Cómo correrla
1. App local arriba: `bash scripts/local-up.sh`
2. Playwright instalado fuera del repo (no se agrega a `web/package.json`):
   ```bash
   mkdir -p /tmp/mano/e2e && cd /tmp/mano/e2e && npm init -y && npm i playwright@1.49 && npx playwright install chromium
   ```
3. En WSL sin `sudo` faltan 4 librerías del sistema. Se descargan y extraen sin root:
   ```bash
   mkdir -p /tmp/mano/libs/debs && cd /tmp/mano/libs/debs
   for p in libnss3 libnspr4 libasound2t64 libasound2-data; do apt-get download $p; done
   for d in *.deb; do dpkg -x "$d" ../root; done
   export LD_LIBRARY_PATH=/tmp/mano/libs/root/usr/lib/x86_64-linux-gnu:/tmp/mano/libs/root/lib/x86_64-linux-gnu
   ```
4. Ejecutar:
   ```bash
   NODE_PATH=/tmp/mano/e2e/node_modules node tests/e2e/ui-smoke.js
   ```
   `SHOTS=<carpeta>` guarda capturas de depuración (fuera del repo). `WEB=<url>` cambia la URL base.

La prueba crea usuarios nuevos con sufijo único; no necesita reiniciar la BD. Las capturas son artefactos de prueba, **no** imágenes del diseñador.
