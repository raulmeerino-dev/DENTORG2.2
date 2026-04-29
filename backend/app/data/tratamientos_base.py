"""Tarifa base de tratamientos solicitada por la clinica.

La lista se mantiene en un unico sitio para que el catalogo real, la demo y
los fallback del proyecto no vuelvan a divergir.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal


FAMILIAS_TRATAMIENTO_BASE = [
    {"nombre": "Protesis fija", "icono": "PF", "orden": 1},
    {"nombre": "Implantologia", "icono": "IM", "orden": 2},
    {"nombre": "Conservadora", "icono": "OC", "orden": 3},
    {"nombre": "Endodoncia", "icono": "EN", "orden": 4},
    {"nombre": "Cirugia oral", "icono": "CX", "orden": 5},
    {"nombre": "Periodoncia", "icono": "PE", "orden": 6},
    {"nombre": "Ortodoncia", "icono": "OR", "orden": 7},
    {"nombre": "Protesis removible", "icono": "PR", "orden": 8},
    {"nombre": "Estetica dental", "icono": "ES", "orden": 9},
    {"nombre": "Otros", "icono": "OT", "orden": 10},
]


# codigo, nombre, familia, precio, requiere_pieza, requiere_caras
TRATAMIENTOS_BASE = [
    ("PF001", "Puente de 2 piezas de zirconio", "Protesis fija", Decimal("780.00"), False, False),
    ("PF002", "Puente de 2 piezas metal-cerámica", "Protesis fija", Decimal("600.00"), False, False),
    ("PF003", "Puente de 3 piezas de zirconio", "Protesis fija", Decimal("1170.00"), False, False),
    ("PF004", "Puente de 3 piezas metal-cerámica", "Protesis fija", Decimal("900.00"), False, False),
    ("PF005", "Puente de 4 piezas de zirconio", "Protesis fija", Decimal("1560.00"), False, False),
    ("PF006", "Puente de 4 piezas metal-cerámica", "Protesis fija", Decimal("1200.00"), False, False),
    ("PF007", "Puente de 5 piezas de zirconio", "Protesis fija", Decimal("1950.00"), False, False),
    ("PF008", "Puente de 5 piezas metal-cerámica", "Protesis fija", Decimal("1500.00"), False, False),
    ("PF009", "Puente de 6 piezas de zirconio", "Protesis fija", Decimal("2340.00"), False, False),
    ("IM001", "Puente fijo de 12 piezas sobre 6 implantes", "Implantologia", Decimal("3400.00"), False, False),
    ("OC001", "Abrasión para obturar", "Conservadora", Decimal("40.00"), True, True),
    ("IM002", "Aditamento de teflón", "Implantologia", Decimal("50.00"), True, False),
    ("IM003", "Aditamento externo", "Implantologia", Decimal("100.00"), True, False),
    ("IM004", "Aditamento para implante integrado", "Implantologia", Decimal("300.00"), True, False),
    ("EN001", "Apicectomía", "Endodoncia", Decimal("180.00"), True, False),
    ("PF010", "Ataches", "Protesis fija", Decimal("240.00"), False, False),
    ("OT001", "Atención domiciliaria", "Otros", Decimal("200.00"), False, False),
    ("ES001", "Blanqueamiento externo", "Estetica dental", Decimal("300.00"), False, False),
    ("ES002", "Blanqueamiento interno", "Estetica dental", Decimal("100.00"), True, False),
    ("OR001", "Brackets de zafiro", "Ortodoncia", Decimal("850.00"), False, False),
    ("OR002", "Brackets metálicos", "Ortodoncia", Decimal("650.00"), False, False),
    ("OR003", "Brackets transparentes", "Ortodoncia", Decimal("700.00"), False, False),
    ("PF011", "Carilla de zirconio", "Protesis fija", Decimal("420.00"), True, False),
    ("PF012", "Cementado", "Protesis fija", Decimal("20.00"), True, False),
    ("CX001", "Cirugía menor", "Cirugia oral", Decimal("40.00"), False, False),
    ("OT002", "Compostura", "Otros", Decimal("60.00"), False, False),
    ("PF013", "Corona metal-cerámica", "Protesis fija", Decimal("300.00"), True, False),
    ("IM005", "Corona sobre implante", "Implantologia", Decimal("450.00"), True, False),
    ("PF014", "Corona de zirconio", "Protesis fija", Decimal("390.00"), True, False),
    ("IM006", "Desatornillar prótesis y limpieza de implantes", "Implantologia", Decimal("75.00"), False, False),
    ("OC002", "Diferencia de reconstrucción", "Conservadora", Decimal("20.00"), True, False),
    ("IM007", "Elevación con regeneración", "Implantologia", Decimal("900.00"), False, False),
    ("IM008", "Elevación de seno", "Implantologia", Decimal("500.00"), False, False),
    ("OC003", "Empaste", "Conservadora", Decimal("50.00"), True, True),
    ("EN002", "Endodoncia multirradicular", "Endodoncia", Decimal("180.00"), True, False),
    ("EN003", "Endodoncia unirradicular", "Endodoncia", Decimal("150.00"), True, False),
    ("OR004", "Estudio de ortodoncia", "Ortodoncia", Decimal("50.00"), False, False),
    ("CX002", "Exodoncia compleja", "Cirugia oral", Decimal("120.00"), True, False),
    ("CX003", "Exodoncia de tercer molar", "Cirugia oral", Decimal("100.00"), True, False),
    ("CX004", "Exodoncia normal", "Cirugia oral", Decimal("50.00"), True, False),
    ("OR005", "Férula de descarga Michigan", "Ortodoncia", Decimal("250.00"), False, False),
    ("OR006", "Férula retenedora de alambre", "Ortodoncia", Decimal("120.00"), False, False),
    ("OR007", "Férula retenedora de ortodoncia", "Ortodoncia", Decimal("100.00"), False, False),
    ("CX005", "Frenectomía", "Cirugia oral", Decimal("180.00"), False, False),
    ("PE001", "Gingivectomía", "Periodoncia", Decimal("180.00"), False, False),
    ("OC004", "Gran reconstrucción", "Conservadora", Decimal("80.00"), True, True),
    ("IM009", "Implante", "Implantologia", Decimal("890.00"), True, False),
    ("PE002", "Injerto de tejido conectivo", "Periodoncia", Decimal("500.00"), False, False),
    ("OC005", "Limpieza", "Conservadora", Decimal("60.00"), False, False),
    ("OR008", "Mantenedor de espacio", "Ortodoncia", Decimal("120.00"), False, False),
    ("IM010", "Mesoestructura completa", "Implantologia", Decimal("4200.00"), False, False),
    ("EN004", "Perno de cuarzo", "Endodoncia", Decimal("100.00"), True, False),
    ("EN005", "Perno de titanio", "Endodoncia", Decimal("90.00"), True, False),
    ("ES003", "Piercing", "Estetica dental", Decimal("40.00"), False, False),
    ("OR009", "Placa expansora", "Ortodoncia", Decimal("500.00"), False, False),
    ("OR010", "Placa Hawley", "Ortodoncia", Decimal("400.00"), False, False),
    ("PR001", "Prótesis metal-esquelética", "Protesis removible", Decimal("800.00"), False, False),
    ("PR002", "Prótesis de resina", "Protesis removible", Decimal("700.00"), False, False),
    ("PR003", "Prótesis inmediata completa", "Protesis removible", Decimal("350.00"), False, False),
    ("PR004", "Prótesis inmediata parcial", "Protesis removible", Decimal("250.00"), False, False),
    ("PE003", "Raspaje y alisado por cuadrante", "Periodoncia", Decimal("80.00"), False, False),
    ("PE004", "Raspaje y alisado por pieza", "Periodoncia", Decimal("20.00"), True, False),
    ("OC006", "Reconstrucción endodoncia", "Conservadora", Decimal("60.00"), True, True),
    ("OC007", "Reconstrucción estética", "Conservadora", Decimal("120.00"), True, True),
    ("IM011", "Regeneración ósea", "Implantologia", Decimal("450.00"), False, False),
    ("CX006", "Regularización ósea", "Cirugia oral", Decimal("200.00"), False, False),
    ("EN006", "Rehacer endodoncia", "Endodoncia", Decimal("180.00"), True, False),
    ("OC008", "Reponer empaste", "Conservadora", Decimal("25.00"), True, True),
    ("OR011", "Revisión placa Hawley", "Ortodoncia", Decimal("30.00"), False, False),
    ("OR012", "Revisión placa expansora", "Ortodoncia", Decimal("50.00"), False, False),
    ("OC009", "Sellador", "Conservadora", Decimal("20.00"), True, False),
    ("IM012", "Sobredentadura", "Implantologia", Decimal("900.00"), False, False),
    ("IM013", "Sobredentadura removible", "Implantologia", Decimal("2340.00"), False, False),
    ("OR013", "Tratamiento de ortodoncia de 12 meses", "Ortodoncia", Decimal("1080.00"), False, False),
    ("OR014", "Tratamiento de ortodoncia de 18 meses", "Ortodoncia", Decimal("1620.00"), False, False),
    ("OR015", "Tratamiento de ortodoncia de 24 meses", "Ortodoncia", Decimal("2160.00"), False, False),
    ("OR016", "Tratamiento de ortodoncia con Smilers de 18 meses", "Ortodoncia", Decimal("6300.00"), False, False),
    ("OR017", "Tratamiento de ortodoncia con Smilers de 12 meses", "Ortodoncia", Decimal("4200.00"), False, False),
    ("OR018", "Tratamiento de ortodoncia con Smilers de 6 meses", "Ortodoncia", Decimal("2100.00"), False, False),
]


TRATAMIENTOS_POR_FAMILIA = defaultdict(list)
for codigo, nombre, familia, precio, requiere_pieza, requiere_caras in TRATAMIENTOS_BASE:
    TRATAMIENTOS_POR_FAMILIA[familia].append(
        (codigo, nombre, precio, Decimal("0.00"), requiere_pieza, requiere_caras)
    )

