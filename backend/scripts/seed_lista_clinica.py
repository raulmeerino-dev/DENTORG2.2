"""
Carga la lista exacta de tratamientos de la clínica.
Añade o actualiza sin borrar tratamientos referenciados en historial.
"""
import sys, os, io, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo

# Familias que usaremos (nombre → (icono, orden))
FAMILIAS_DEF = {
    "Prótesis Fija":           ("👑", 1),
    "Implantología":           ("🔩", 2),
    "Odontología General":     ("🦷", 3),
    "Endodoncia":              ("🔴", 4),
    "Cirugía Oral":            ("✂️", 5),
    "Ortodoncia":              ("📐", 6),
    "Prótesis Removible":      ("🏥", 7),
    "Periodoncia":             ("🌿", 8),
    "Estética Dental":         ("✨", 9),
    "Diagnóstico y Prevención":("🔍", 10),
    "Otros":                   ("📋", 11),
}

# (codigo, nombre, precio, familia, requiere_pieza, requiere_caras)
LISTA_CLINICA = [
    # ── Prótesis Fija ─────────────────────────────────────────────────────────
    ("PF-P2Z",  "Puente de 2 piezas de zirconio",              780,   "Prótesis Fija", False, False),
    ("PF-P2M",  "Puente de 2 piezas metal-cerámica",           600,   "Prótesis Fija", False, False),
    ("PF-P3Z",  "Puente de 3 piezas de zirconio",             1170,   "Prótesis Fija", False, False),
    ("PF-P3M",  "Puente de 3 piezas metal-cerámica",           900,   "Prótesis Fija", False, False),
    ("PF-P4Z",  "Puente de 4 piezas de zirconio",             1560,   "Prótesis Fija", False, False),
    ("PF-P4M",  "Puente de 4 piezas metal-cerámica",          1200,   "Prótesis Fija", False, False),
    ("PF-P5Z",  "Puente de 5 piezas de zirconio",             1950,   "Prótesis Fija", False, False),
    ("PF-P5M",  "Puente de 5 piezas metal-cerámica",          1500,   "Prótesis Fija", False, False),
    ("PF-P6Z",  "Puente de 6 piezas de zirconio",             2340,   "Prótesis Fija", False, False),
    ("PF-F12",  "Puente fijo 12 piezas sobre 6 implantes",    3400,   "Prótesis Fija", False, False),
    ("PF-CZ",   "Corona zirconio",                             390,   "Prótesis Fija", True,  False),
    ("PF-CM",   "Corona metal-cerámica",                       300,   "Prótesis Fija", True,  False),
    ("PF-CI",   "Corona sobre implante",                       450,   "Prótesis Fija", True,  False),
    ("PF-CAZ",  "Carilla de zirconio",                         420,   "Prótesis Fija", True,  False),
    ("PF-COMP", "Compostura",                                   60,   "Prótesis Fija", True,  False),
    ("PF-CEM",  "Cementado",                                    20,   "Prótesis Fija", True,  False),
    ("PF-REC",  "Gran reconstrucción",                          80,   "Prótesis Fija", True,  False),
    ("PF-RECE", "Reconstrucción estética",                     120,   "Prótesis Fija", True,  False),
    ("PF-RECD", "Diferencia de reconstrucción",                 20,   "Prótesis Fija", True,  False),
    ("PF-MESO", "Mesoestructura completa",                    4200,   "Prótesis Fija", False, False),
    ("PF-ATAC", "Ataches",                                     240,   "Prótesis Fija", False, False),

    # ── Implantología ─────────────────────────────────────────────────────────
    ("IM-IMP",  "Implante",                                    890,   "Implantología", True,  False),
    ("IM-ELEV", "Elevación de seno",                           500,   "Implantología", False, False),
    ("IM-ELRG", "Elevación con regeneración",                  900,   "Implantología", False, False),
    ("IM-REOS", "Regeneración ósea",                           450,   "Implantología", False, False),
    ("IM-ROOS", "Regularización ósea",                         200,   "Implantología", False, False),
    ("IM-INJO", "Injerto de tejido conectivo",                 500,   "Implantología", False, False),
    ("IM-ADIT", "Aditamento para implante integrado",          300,   "Implantología", True,  False),
    ("IM-ADEX", "Aditamento externo",                          100,   "Implantología", True,  False),
    ("IM-TFLX", "Aditamento de teflon",                         50,   "Implantología", True,  False),
    ("IM-DESAT","Desatornillar prótesis y limpieza implantes",  75,   "Implantología", False, False),
    ("IM-SOBR", "Sobredentadura",                              900,   "Implantología", False, False),
    ("IM-SOBR2","Sobredentadura removible",                   2340,   "Implantología", False, False),

    # ── Odontología General ───────────────────────────────────────────────────
    ("OG-EMP",  "Empaste",                                      50,   "Odontología General", True,  True),
    ("OG-REPE", "Reponer empaste",                              25,   "Odontología General", True,  True),
    ("OG-ABRA", "Abrasión para obturar",                        40,   "Odontología General", True,  True),
    ("OG-LIM",  "Limpieza",                                     60,   "Odontología General", False, False),
    ("OG-SELL", "Sellador",                                     20,   "Odontología General", True,  False),
    ("OG-PERNC","Perno de cuarzo",                             100,   "Odontología General", True,  False),
    ("OG-PERNT","Perno de titanio",                             90,   "Odontología General", True,  False),
    ("OG-RECOE","Reconstrucción endodoncia",                    60,   "Odontología General", True,  False),

    # ── Endodoncia ────────────────────────────────────────────────────────────
    ("EN-UNI",  "Endodoncia unirradicular",                    150,   "Endodoncia", True,  False),
    ("EN-MUL",  "Endodoncia multirradicular",                  180,   "Endodoncia", True,  False),
    ("EN-REH",  "Rehacer endodoncia",                          180,   "Endodoncia", True,  False),
    ("EN-APIC", "Apicectomía",                                 180,   "Endodoncia", True,  False),

    # ── Cirugía Oral ──────────────────────────────────────────────────────────
    ("CX-EXON", "Exodoncia normal",                             50,   "Cirugía Oral", True,  False),
    ("CX-EXOC", "Exodoncia compleja",                          120,   "Cirugía Oral", True,  False),
    ("CX-EXO3", "Exodoncia de tercer molar",                   100,   "Cirugía Oral", True,  False),
    ("CX-FREN", "Frenectomía",                                 180,   "Cirugía Oral", False, False),
    ("CX-GINV", "Gingivectomía",                               180,   "Cirugía Oral", False, False),
    ("CX-MENO", "Cirugía menor",                                40,   "Cirugía Oral", False, False),
    ("CX-DOMV", "Atención domiciliaria",                       200,   "Cirugía Oral", False, False),
    ("CX-PIER", "Piercing",                                     40,   "Cirugía Oral", False, False),

    # ── Ortodoncia ────────────────────────────────────────────────────────────
    ("OR-EST",  "Estudio de ortodoncia",                        50,   "Ortodoncia", False, False),
    ("OR-BMET", "Brackets metálicos",                          650,   "Ortodoncia", False, False),
    ("OR-BTRANSP","Brackets transparentes",                    700,   "Ortodoncia", False, False),
    ("OR-BZAF", "Brackets de zafiro",                          850,   "Ortodoncia", False, False),
    ("OR-FRAL", "Férula retenedora de alambre",                120,   "Ortodoncia", False, False),
    ("OR-FROR", "Férula retenedora de ortodoncia",             100,   "Ortodoncia", False, False),
    ("OR-PEXP", "Placa expansora",                             500,   "Ortodoncia", False, False),
    ("OR-PHAW", "Placa Hawley",                                400,   "Ortodoncia", False, False),
    ("OR-RVHAW","Revisión placa Hawley",                        30,   "Ortodoncia", False, False),
    ("OR-RVEXP","Revisión placa expansora",                     50,   "Ortodoncia", False, False),
    ("OR-MESP", "Mantenedor de espacio",                       120,   "Ortodoncia", False, False),
    ("OR-12M",  "Tratamiento ortodoncia 12 meses",            1080,   "Ortodoncia", False, False),
    ("OR-18M",  "Tratamiento ortodoncia 18 meses",            1620,   "Ortodoncia", False, False),
    ("OR-24M",  "Tratamiento ortodoncia 24 meses",            2160,   "Ortodoncia", False, False),
    ("OR-SM18", "Tratamiento con smilers 18 meses",           6300,   "Ortodoncia", False, False),
    ("OR-SM12", "Tratamiento con smilers 12 meses",           4200,   "Ortodoncia", False, False),
    ("OR-SM6",  "Tratamiento con smilers 6 meses",            2100,   "Ortodoncia", False, False),

    # ── Prótesis Removible ────────────────────────────────────────────────────
    ("PR-MESK", "Prótesis de metal-esquelético",               800,   "Prótesis Removible", False, False),
    ("PR-RESN", "Prótesis de resina",                          700,   "Prótesis Removible", False, False),
    ("PR-IMDC", "Prótesis inmediata completa",                 350,   "Prótesis Removible", False, False),
    ("PR-IMDP", "Prótesis inmediata parcial",                  250,   "Prótesis Removible", False, False),

    # ── Periodoncia ───────────────────────────────────────────────────────────
    ("PE-RASQ", "Raspaje y alisado por cuadrante",              80,   "Periodoncia", False, False),
    ("PE-RASP", "Raspaje y alisado por pieza",                  20,   "Periodoncia", True,  False),

    # ── Estética Dental ───────────────────────────────────────────────────────
    ("EST-BLEX","Blanqueamiento externo",                       300,   "Estética Dental", False, False),
    ("EST-BLIN","Blanqueamiento interno",                       100,   "Estética Dental", True,  False),

    # ── Otros ─────────────────────────────────────────────────────────────────
    ("OTR-FERR","Férula de descarga Michigan",                  250,   "Otros", False, False),
]


async def seed():
    async with AsyncSessionLocal() as db:
        # 1. Obtener o crear familias
        familia_map: dict[str, str] = {}
        for nombre, (icono, orden) in FAMILIAS_DEF.items():
            existing = (await db.execute(
                select(FamiliaTratamiento).where(FamiliaTratamiento.nombre == nombre)
            )).scalar_one_or_none()
            if existing:
                existing.icono = icono
                existing.orden = orden
                familia_map[nombre] = str(existing.id)
            else:
                f = FamiliaTratamiento(nombre=nombre, icono=icono, orden=orden)
                db.add(f)
                await db.flush()
                familia_map[nombre] = str(f.id)
                print(f"  Nueva familia: {nombre}")

        # 2. Añadir/actualizar tratamientos
        nuevos = actualizados = 0
        for codigo, nombre, precio, familia, req_pieza, req_caras in LISTA_CLINICA:
            fam_id = familia_map[familia]
            existing = (await db.execute(
                select(TratamientoCatalogo).where(TratamientoCatalogo.codigo == codigo)
            )).scalar_one_or_none()
            if existing:
                existing.nombre = nombre
                existing.precio = precio
                existing.familia_id = fam_id
                existing.requiere_pieza = req_pieza
                existing.requiere_caras = req_caras
                existing.activo = True
                actualizados += 1
            else:
                t = TratamientoCatalogo(
                    familia_id=fam_id, codigo=codigo, nombre=nombre,
                    precio=precio, iva_porcentaje=0,
                    requiere_pieza=req_pieza, requiere_caras=req_caras, activo=True,
                )
                db.add(t)
                nuevos += 1

        await db.commit()
        print(f"\nListo: {nuevos} nuevos + {actualizados} actualizados en {len(FAMILIAS_DEF)} familias.")


if __name__ == "__main__":
    asyncio.run(seed())
