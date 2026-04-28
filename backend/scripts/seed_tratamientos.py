"""
Seed completo del catálogo de tratamientos dentales.
Ejecutar: .venv/Scripts/python scripts/seed_tratamientos.py
"""
import sys, os, io, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import select, delete
from app.database import AsyncSessionLocal
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo

FAMILIAS = [
    {"nombre": "Diagnóstico y Prevención", "icono": "🔍", "orden": 1},
    {"nombre": "Odontología Conservadora", "icono": "🦷", "orden": 2},
    {"nombre": "Endodoncia", "icono": "🔴", "orden": 3},
    {"nombre": "Periodoncia", "icono": "🌿", "orden": 4},
    {"nombre": "Cirugía Oral", "icono": "✂️", "orden": 5},
    {"nombre": "Implantología", "icono": "🔩", "orden": 6},
    {"nombre": "Prótesis Fija", "icono": "👑", "orden": 7},
    {"nombre": "Prótesis Removible", "icono": "🦷", "orden": 8},
    {"nombre": "Ortodoncia", "icono": "📐", "orden": 9},
    {"nombre": "Estética Dental", "icono": "✨", "orden": 10},
    {"nombre": "Odontopediatría", "icono": "👶", "orden": 11},
    {"nombre": "Otros", "icono": "📋", "orden": 12},
]

# (codigo, nombre, precio, iva, requiere_pieza, requiere_caras)
TRATAMIENTOS: dict[str, list] = {
    "Diagnóstico y Prevención": [
        ("RV01", "Revisión y diagnóstico",                   30,  21, False, False),
        ("RV02", "Revisión con radiografías",                50,  21, False, False),
        ("XRAY", "Radiografía periapical",                  20,  21, True,  False),
        ("XALB", "Radiografía aleta mordida",               20,  21, False, False),
        ("PANO", "Ortopantomografía (OPG)",                 50,  21, False, False),
        ("TAC1", "TAC / Cone beam (arcada)",               180,  21, False, False),
        ("LI01", "Limpieza bucal (tartrectomía)",           60,  21, False, False),
        ("LI02", "Limpieza bucal con pulido",               75,  21, False, False),
        ("FLU1", "Aplicación de flúor",                    25,  21, False, False),
        ("SELL", "Sellado de fisuras",                      40,  21, True,  False),
        ("SON1", "Sondaje periodontal básico",              40,  21, False, False),
    ],
    "Odontología Conservadora": [
        ("EM01", "Empaste composite 1 cara",                70,  21, True,  True),
        ("EM02", "Empaste composite 2 caras",               90,  21, True,  True),
        ("EM03", "Empaste composite 3+ caras",             110,  21, True,  True),
        ("AM01", "Empaste de amalgama 1 cara",              55,  21, True,  True),
        ("AM02", "Empaste de amalgama 2 caras",             70,  21, True,  True),
        ("INLA", "Incrustación (inlay/onlay) cerámica",   350,  21, True,  True),
        ("RECM", "Reconstrucción completa con espiga",     200,  21, True,  False),
        ("BLAN", "Blanqueamiento interno (pieza no vital)",150,  21, True,  False),
    ],
    "Endodoncia": [
        ("EN01", "Endodoncia unirradicular (anterior)",    220,  21, True,  False),
        ("EN02", "Endodoncia birradicular (premolar)",     280,  21, True,  False),
        ("EN03", "Endodoncia multirradicular (molar)",     330,  21, True,  False),
        ("EN04", "Retratamiento endodóntico",              350,  21, True,  False),
        ("EN05", "Apicectomía",                           280,  21, True,  False),
        ("PERNO","Perno de fibra de vidrio",               80,  21, True,  False),
        ("EMER", "Urgencia / apertura cameral",            60,  21, True,  False),
    ],
    "Periodoncia": [
        ("PE01", "Raspado y alisado radicular (cuadrante)",150,  21, False, False),
        ("PE02", "Raspado y alisado radicular (arcada)",   250,  21, False, False),
        ("PE03", "Cirugía periodontal (cuadrante)",        350,  21, False, False),
        ("PE04", "Injerto gingival",                       450,  21, False, False),
        ("PE05", "Alargamiento coronario",                 300,  21, True,  False),
        ("PE06", "Mantenimiento periodontal",              80,  21, False, False),
        ("PE07", "Ferulización dental",                   120,  21, False, False),
    ],
    "Cirugía Oral": [
        ("EX01", "Extracción simple",                       60,  21, True,  False),
        ("EX02", "Extracción quirúrgica",                  120,  21, True,  False),
        ("EX03", "Extracción cordal (muela juicio)",       180,  21, True,  False),
        ("EX04", "Extracción cordal incluida/impactada",   280,  21, True,  False),
        ("BIOPSIA","Biopsia oral",                         150,  21, False, False),
        ("FREN", "Frenectomía",                           180,  21, False, False),
        ("QUISTE","Extirpación quiste",                    250,  21, False, False),
    ],
    "Implantología": [
        ("IM01", "Colocación de implante dental",          950,  21, True,  False),
        ("IM02", "Corona sobre implante (zirconio)",       700,  21, True,  False),
        ("IM03", "Corona sobre implante (porcelana-metal)",600,  21, True,  False),
        ("IM04", "Pilar de zirconio",                     250,  21, True,  False),
        ("IM05", "Pilar estándar titanio",                150,  21, True,  False),
        ("IM06", "Elevación de seno maxilar (lateral)",   900,  21, False, False),
        ("IM07", "Elevación de seno (crestal)",           400,  21, False, False),
        ("IM08", "Regeneración ósea guiada",              450,  21, False, False),
        ("IM09", "Injerto óseo",                          350,  21, False, False),
        ("IM10", "Prótesis sobre implantes fija completa",3500, 21, False, False),
        ("IM11", "Sobredentadura implantosoportada",      2200, 21, False, False),
        ("IM12", "Descubierta de implante (2ª fase)",     180,  21, True,  False),
    ],
    "Prótesis Fija": [
        ("PR01", "Corona de zirconio",                    500,  21, True,  False),
        ("PR02", "Corona de porcelana-metal",             420,  21, True,  False),
        ("PR03", "Corona de metal (colado)",              250,  21, True,  False),
        ("PR04", "Corona provisional",                    100,  21, True,  False),
        ("PR05", "Puente 3 piezas zirconio",             1400,  21, False, False),
        ("PR06", "Puente 3 piezas porcelana-metal",      1100,  21, False, False),
        ("PR07", "Carilla de porcelana / cerámica",       450,  21, True,  False),
        ("PR08", "Carilla composite (directa)",           180,  21, True,  False),
        ("PR09", "Onlay cerámica",                        380,  21, True,  True),
        ("PR10", "Incrustación metálica",                 200,  21, True,  True),
        ("PR11", "Espiga / poste colado",                 150,  21, True,  False),
        ("PR12", "Reparación de corona / puente",         80,   21, True,  False),
    ],
    "Prótesis Removible": [
        ("REM01","Prótesis completa acrílica (arcada)",   700,  21, False, False),
        ("REM02","Prótesis parcial acrílica",             450,  21, False, False),
        ("REM03","Prótesis parcial esquelética",          700,  21, False, False),
        ("REM04","Prótesis flexible (Valplast / Flexite)",600,  21, False, False),
        ("REM05","Ajuste / reparación de prótesis",       80,   21, False, False),
        ("REM06","Rebase de prótesis",                   120,   21, False, False),
        ("REM07","Añadir diente a prótesis",              60,   21, False, False),
    ],
    "Ortodoncia": [
        ("OR01", "Estudio ortodóncico completo",           80,  21, False, False),
        ("OR02", "Ortodoncia fija metal (arcada sup+inf)", 1600, 21, False, False),
        ("OR03", "Ortodoncia fija metal (1 arcada)",      900,  21, False, False),
        ("OR04", "Ortodoncia fija cerámica (2 arcadas)",  2200, 21, False, False),
        ("OR05", "Ortodoncia invisible (Invisalign/equiv)",2800, 21, False, False),
        ("OR06", "Ortodoncia lingual (2 arcadas)",        4000, 21, False, False),
        ("OR07", "Control mensual ortodoncia",             40,  21, False, False),
        ("OR08", "Retenedor fijo",                        120,  21, False, False),
        ("OR09", "Retenedor removible (Hawley)",           90,  21, False, False),
        ("OR10", "Disyuntor palatino",                    350,  21, False, False),
        ("OR11", "Elástico de ortodoncia",                 10,  21, False, False),
        ("OR12", "Reposición de bracket",                  25,  21, True,  False),
    ],
    "Estética Dental": [
        ("BL01", "Blanqueamiento profesional (cubetas)",  180,  21, False, False),
        ("BL02", "Blanqueamiento láser / fotoactivado",   350,  21, False, False),
        ("BL03", "Blanqueamiento interno",                150,  21, True,  False),
        ("EST1", "Microabrasión del esmalte",             100,  21, True,  False),
        ("EST2", "Diseño de sonrisa (planificación)",     200,  21, False, False),
        ("BOT1", "Toxina botulínica (área)", 150,  21, False, False),
        ("ACI1", "Ácido hialurónico (relleno)",          200,  21, False, False),
    ],
    "Odontopediatría": [
        ("PED01","Revisión pediátrica",                    25,  21, False, False),
        ("PED02","Empaste en diente de leche",             50,  21, True,  False),
        ("PED03","Sellado de fisuras",                     35,  21, True,  False),
        ("PED04","Extracción de diente de leche",          35,  21, True,  False),
        ("PED05","Pulpotomía (diente leche)",              90,  21, True,  False),
        ("PED06","Mantenedor de espacio",                 150,  21, False, False),
        ("PED07","Fluorización tópica",                    20,  21, False, False),
    ],
    "Otros": [
        ("FERRA","Férula de descarga (bruxismo)",         280,  21, False, False),
        ("ATM1", "Tratamiento ATM (sesión)",              100,  21, False, False),
        ("SNOR", "Férula antiapnea/ronquido",             350,  21, False, False),
        ("PROT", "Protector bucal deportivo",              80,  21, False, False),
        ("CONS", "Consulta segunda opinión",               50,  21, False, False),
        ("ADM",  "Gastos administrativos",                 15,  21, False, False),
    ],
}


async def seed():
    async with AsyncSessionLocal() as db:
        familia_map: dict[str, str] = {}

        # Crear o actualizar familias
        for fam_data in FAMILIAS:
            existing = (await db.execute(
                select(FamiliaTratamiento).where(FamiliaTratamiento.nombre == fam_data["nombre"])
            )).scalar_one_or_none()

            if existing:
                existing.icono = fam_data["icono"]
                existing.orden = fam_data["orden"]
                familia_map[fam_data["nombre"]] = str(existing.id)
            else:
                fam = FamiliaTratamiento(
                    nombre=fam_data["nombre"],
                    icono=fam_data["icono"],
                    orden=fam_data["orden"],
                )
                db.add(fam)
                await db.flush()
                familia_map[fam_data["nombre"]] = str(fam.id)
                print(f"  Nueva familia: {fam_data['nombre']}")

        # Crear o actualizar tratamientos
        nuevos = 0
        actualizados = 0
        for familia_nombre, trts in TRATAMIENTOS.items():
            fam_id = familia_map[familia_nombre]
            for codigo, nombre, precio, iva, req_pieza, req_caras in trts:
                existing = (await db.execute(
                    select(TratamientoCatalogo).where(TratamientoCatalogo.codigo == codigo)
                )).scalar_one_or_none()

                if existing:
                    existing.nombre = nombre
                    existing.precio = precio
                    existing.iva_porcentaje = iva
                    existing.requiere_pieza = req_pieza
                    existing.requiere_caras = req_caras
                    existing.familia_id = fam_id
                    existing.activo = True
                    actualizados += 1
                else:
                    trat = TratamientoCatalogo(
                        familia_id=fam_id,
                        codigo=codigo,
                        nombre=nombre,
                        precio=precio,
                        iva_porcentaje=iva,
                        requiere_pieza=req_pieza,
                        requiere_caras=req_caras,
                        activo=True,
                    )
                    db.add(trat)
                    nuevos += 1

        await db.commit()
        print(f"\nCatálogo actualizado: {len(FAMILIAS)} familias, {nuevos} nuevos + {actualizados} actualizados.")


if __name__ == "__main__":
    asyncio.run(seed())
