#!/usr/bin/env python3
"""Ensambla contract/openapi.yaml a partir de contract/src/.

  src/base.yaml            -> raíz (info, servers, tags, securitySchemes, parameters, responses)
  src/schemas/*.yaml       -> cada archivo es un mapa  NombreSchema: {schema}   (se funden en components.schemas)
  src/paths/*.yaml         -> cada archivo es un mapa  /ruta: {path item}       (se funden en paths)

Falla si hay schemas o rutas duplicados entre archivos. No inventa nada: solo ensambla.
Uso:  uv run --with pyyaml python contract/build.py     (o  python3 contract/build.py  si hay PyYAML)
"""
import glob, os, sys
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
OUT = os.path.join(HERE, "openapi.yaml")


def load(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def main():
    doc = load(os.path.join(SRC, "base.yaml"))
    doc.setdefault("paths", {})
    comps = doc.setdefault("components", {})
    schemas = comps.setdefault("schemas", {})
    errors = []

    for f in sorted(glob.glob(os.path.join(SRC, "schemas", "*.yaml"))):
        for name, sch in load(f).items():
            if name in schemas:
                errors.append(f"schema duplicado '{name}' ({os.path.basename(f)})")
            schemas[name] = sch

    for f in sorted(glob.glob(os.path.join(SRC, "paths", "*.yaml"))):
        for path, item in load(f).items():
            if not str(path).startswith("/"):
                errors.append(f"ruta inválida '{path}' ({os.path.basename(f)}): debe empezar con /")
                continue
            if path in doc["paths"]:
                # permitir fundir métodos distintos de la misma ruta entre archivos
                dup = set(doc["paths"][path]) & set(item)
                if dup:
                    errors.append(f"operación duplicada {sorted(dup)} en '{path}' ({os.path.basename(f)})")
                doc["paths"][path].update(item)
            else:
                doc["paths"][path] = item

    if errors:
        print("❌ build falló:\n  - " + "\n  - ".join(errors))
        sys.exit(1)

    doc["paths"] = dict(sorted(doc["paths"].items()))
    doc["components"]["schemas"] = dict(sorted(schemas.items()))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("# GENERADO por contract/build.py a partir de contract/src/. NO EDITAR A MANO.\n")
        yaml.safe_dump(doc, f, sort_keys=False, allow_unicode=True, width=120)
    n_ops = sum(1 for p in doc["paths"].values() for m in p if m in ("get", "post", "put", "patch", "delete"))
    print(f"✅ {OUT}: {len(doc['paths'])} rutas, {n_ops} operaciones, {len(schemas)} schemas")


if __name__ == "__main__":
    main()
