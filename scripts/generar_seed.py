"""Genera los SQL de /supabase/seed a partir de los archivos fuente en /sources.

Uso (desde la raíz del proyecto):  python -I scripts/generar_seed.py

- sources/Juntas_Del_Voto/JUNTAS_FILTRADAS.xlsx  -> supabase/seed/01_catalogo_cotacachi.sql
- sources/Candidatos/candidaturas_prefectura_alcaldia.json -> supabase/seed/02_candidaturas.sql

Solo usa la librería estándar (el .xlsx es un zip de XML). Los SQL son idempotentes
(ON CONFLICT DO NOTHING) para poder volver a ejecutarlos.
"""
import json
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
XLSX = RAIZ / "sources/Juntas_Del_Voto/JUNTAS_FILTRADAS.xlsx"
JSON = RAIZ / "sources/Candidatos/candidaturas_prefectura_alcaldia.json"
SALIDA = RAIZ / "supabase/seed"

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

# Circunscripción de las candidaturas (datos de la elección cargada).
PROVINCIA_ID = 10   # IMBABURA (código CNE)
CANTON_ID = 40      # COTACACHI (código CNE)

# Colores tomados de los logos (sources/Partidos_imagenes). Futuro (20) usa su
# turquesa para no confundirse con el fucsia de la 103-62 (decisión del equipo).
COLORES = {
    "7": "#6F2C90", "8": "#1A47BA", "17": "#FD0000", "20": "#0BBAC1",
    "62": "#D6298A", "70-17": "#F51A27", "103-62": "#E50167",
}

COLUMNAS = ["CODIGO PROVINCIA", "NOMBRE PROVINCIA", "CODIGO CANTON", "NOMBRE CANTON",
            "CODIGO PARROQUIA", "NOMBRE PARROQUIA", "CODIGO ZONA", "NOMBRE ZONA",
            "CODIGO RECINTO", "NOMBRE RECINTO", "CDA", "DIRECCION RECINTO", "TELEFONO",
            "JUN FEM", "JUN MAS", "NUM JUNR", "JUN INIF", "JUN FINF", "JUN INIM", "JUN FINM",
            "NUMERO ELECTORES", "X", "Y", "long", "lat", "DIFICIL ACCESO", "SIN CONECTIVIDAD"]


def leer_xlsx(ruta: Path) -> list[dict]:
    z = zipfile.ZipFile(ruta)
    compartidas = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            compartidas.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    hoja = wb.find("m:sheets", NS)[0]
    destino = rels[hoja.get("{%s}id" % NS["r"])].lstrip("/")
    destino = destino if destino.startswith("xl/") else "xl/" + destino
    filas = []
    for fila in ET.fromstring(z.read(destino)).iter("{%s}row" % NS["m"]):
        celdas = {}
        for c in fila.findall("m:c", NS):
            col = 0
            for ch in re.match(r"[A-Z]+", c.get("r")).group(0):
                col = col * 26 + ord(ch) - 64
            v = c.find("m:v", NS)
            if c.get("t") == "inlineStr":
                celdas[col - 1] = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
            elif v is not None:
                celdas[col - 1] = compartidas[int(v.text)] if c.get("t") == "s" else v.text
        filas.append([celdas.get(i, "") for i in range(max(celdas) + 1)] if celdas else [])
    encabezado, *datos = [f for f in filas if f]
    if encabezado != COLUMNAS:
        sys.exit(f"Encabezado inesperado en {ruta.name}: {encabezado}")
    return [dict(zip(encabezado, f + [""] * (len(encabezado) - len(f)))) for f in datos]


def texto(v: str) -> str:
    return unicodedata.normalize("NFC", " ".join(str(v).split()))


def sql(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def si_no(v: str) -> bool:
    v = v.strip().upper()
    if v not in ("SI", "NO"):
        sys.exit(f"Valor SI/NO inesperado: {v!r}")
    return v == "SI"


def catalogo() -> str:
    filas = leer_xlsx(XLSX)
    provincias, cantones, parroquias, recintos, mesas = {}, {}, {}, [], []
    for f in filas:
        prov, cant, parr = int(f["CODIGO PROVINCIA"]), int(f["CODIGO CANTON"]), int(f["CODIGO PARROQUIA"])
        provincias[prov] = texto(f["NOMBRE PROVINCIA"])
        cantones[cant] = (prov, texto(f["NOMBRE CANTON"]))
        parroquias[parr] = (cant, texto(f["NOMBRE PARROQUIA"]))
        codigo = str(int(f["CODIGO RECINTO"]))
        recintos.append((parr, codigo, texto(f["NOMBRE RECINTO"]), int(f["CODIGO ZONA"]),
                         texto(f["NOMBRE ZONA"]) or None, texto(f["DIRECCION RECINTO"]) or None,
                         round(float(f["lat"]), 8), round(float(f["long"]), 8),
                         si_no(f["DIFICIL ACCESO"]), si_no(f["SIN CONECTIVIDAD"])))
        total = 0
        for sexo, ini, fin, cuenta in (("F", "JUN INIF", "JUN FINF", "JUN FEM"), ("M", "JUN INIM", "JUN FINM", "JUN MAS")):
            numeros = range(int(f[ini]), int(f[fin]) + 1)
            if len(numeros) != int(f[cuenta]):
                sys.exit(f"Rango de juntas {sexo} incoherente en el recinto {codigo}")
            mesas += [(codigo, n, sexo) for n in numeros]
            total += len(numeros)
        if total != int(f["NUM JUNR"]):
            sys.exit(f"NUM JUNR no coincide en el recinto {codigo}")

    out = [f"-- Generado por scripts/generar_seed.py desde {XLSX.relative_to(RAIZ).as_posix()}. No editar a mano.",
           f"-- {len(recintos)} recintos, {len(mesas)} juntas (mesas).", "begin;", ""]
    out.append("insert into public.provincias (id, nombre) values")
    out.append(",\n".join(f"  ({k}, {sql(v)})" for k, v in sorted(provincias.items())) + "\non conflict (id) do nothing;\n")
    out.append("insert into public.cantones (id, provincia_id, nombre) values")
    out.append(",\n".join(f"  ({k}, {p}, {sql(n)})" for k, (p, n) in sorted(cantones.items())) + "\non conflict (id) do nothing;\n")
    out.append("insert into public.parroquias (id, canton_id, nombre) values")
    out.append(",\n".join(f"  ({k}, {c}, {sql(n)})" for k, (c, n) in sorted(parroquias.items())) + "\non conflict (id) do nothing;\n")
    out.append("insert into public.recintos (parroquia_id, codigo, nombre, codigo_zona, nombre_zona, direccion, lat, lng, dificil_acceso, sin_conectividad) values")
    out.append(",\n".join("  (" + ", ".join(sql(x) for x in r) + ")" for r in sorted(recintos, key=lambda r: int(r[1])))
               + "\non conflict (codigo) do nothing;\n")
    out.append("insert into public.mesas (recinto_id, numero, sexo)\nselect r.id, v.numero, v.sexo from (values")
    out.append(",\n".join(f"  ({sql(c)}, {n}, {sql(s)})" for c, n, s in sorted(mesas, key=lambda m: (int(m[0]), m[2], m[1]))))
    out.append(") as v(codigo, numero, sexo)\njoin public.recintos r on r.codigo = v.codigo\non conflict (recinto_id, numero, sexo) do nothing;\n")
    out.append("commit;\n")
    return "\n".join(out)


def candidaturas() -> str:
    datos = json.loads(JSON.read_text(encoding="utf-8"))
    filas = []
    for dignidad, clave in (("prefectura", "prefecto"), ("alcaldia", "alcalde")):
        for c in datos[dignidad]:
            lista = c["lista"].strip()
            if lista not in COLORES:
                sys.exit(f"Falta el color de la lista {lista}")
            binomio = texto(c["candidatos"]["viceprefecto"]) if dignidad == "prefectura" else None
            filas.append((dignidad, PROVINCIA_ID, CANTON_ID if dignidad == "alcaldia" else None, lista,
                          texto(c["organizacion_politica"]), texto(c["candidatos"][clave]), binomio, COLORES[lista]))
    out = [f"-- Generado por scripts/generar_seed.py desde {JSON.relative_to(RAIZ).as_posix()}. No editar a mano.",
           "-- Prefectura: provincia de Imbabura (10). Alcaldía: cantón Cotacachi (40).",
           "insert into public.candidaturas (dignidad, provincia_id, canton_id, lista, organizacion_politica, candidato, binomio, color) values",
           ",\n".join("  (" + ", ".join(sql(x) for x in f) + ")" for f in filas),
           "on conflict on constraint candidaturas_lista_uk do nothing;", ""]
    return "\n".join(out)


if __name__ == "__main__":
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / "01_catalogo_cotacachi.sql").write_text(catalogo(), encoding="utf-8", newline="\n")
    (SALIDA / "02_candidaturas.sql").write_text(candidaturas(), encoding="utf-8", newline="\n")
    print("Seed generado en", SALIDA.relative_to(RAIZ).as_posix())
