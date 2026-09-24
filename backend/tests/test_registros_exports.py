import csv
import io

import pytest
from openpyxl import load_workbook
from pypdf import PdfReader

from app.domains.reporting.application.record_exports import ExportValueError, RecordExportWriter
from app.domains.reporting.schemas.registros import RegistroColumn

COLUMNS = [RegistroColumn(key="paciente", label="Paciente"), RegistroColumn(key="importe", label="Importe", type="money")]


def test_csv_keeps_every_row_and_quotes_spreadsheet_formulas():
    writer = RecordExportWriter("csv", COLUMNS, "Facturas", "Todos los periodos")
    try:
        writer.add({"paciente": '=HYPERLINK("http://invalid")', "importe": -12.5})
        writer.add({"paciente": "Ángela; Muñoz\nSegunda línea", "importe": 0})
        for number in range(1200):
            writer.add({"paciente": f"Paciente {number}", "importe": number})
        rows = list(csv.reader(io.StringIO(writer.finish().read().decode("utf-8-sig")), delimiter=";"))
        assert len(rows) == 1203
        assert rows[0] == ["Paciente", "Importe"]
        assert rows[1] == ['\'=HYPERLINK("http://invalid")', "-12.5"]
        assert rows[2] == ["Ángela; Muñoz\nSegunda línea", "0"]
        assert rows[-1] == ["Paciente 1199", "1199"]
    finally:
        writer.close()


def test_xlsx_keeps_numeric_money_and_untrusted_text_without_formulas():
    writer = RecordExportWriter("xlsx", COLUMNS, "Facturas", "Periodo de consulta")
    try:
        writer.add({"paciente": "=1+2", "importe": 1234.56})
        writer.add({"paciente": "@Paciente", "importe": None})
        workbook = load_workbook(writer.finish(), data_only=False)
        sheet = workbook.active
        assert sheet["A2"].value == "=1+2"
        assert sheet["A2"].data_type == "s"
        assert sheet["B2"].value == 1234.56
        assert sheet["B2"].data_type == "n"
        assert sheet["B3"].value is None
        assert sheet.freeze_panes == "A2"
        assert sheet.auto_filter.ref == "A1:B3"
        assert workbook.properties.description == "Periodo de consulta"
        workbook.close()
    finally:
        writer.close()


def test_pdf_repeats_headers_and_preserves_long_text_across_pages():
    writer = RecordExportWriter("pdf", COLUMNS, "Documentos", "Todos los periodos")
    try:
        writer.add({"paciente": "<informe> " + "Contenido legible. " * 1800 + "FINAL-DOCUMENTO", "importe": None})
        for number in range(120):
            writer.add({"paciente": f"Registro {number}", "importe": number})
        reader = PdfReader(writer.finish())
        assert len(reader.pages) > 3
        text = "\n".join(page.extract_text() for page in reader.pages)
        assert "FINAL-DOCUMENTO" in text
        assert "Registro 119" in text
        assert "<informe>" in text
        assert all("Paciente" in page.extract_text() for page in reader.pages)
    finally:
        writer.close()


def test_excel_rejects_text_it_would_truncate_and_csv_preserves_it():
    value = "Contenido " * 4000
    excel = RecordExportWriter("xlsx", COLUMNS, "Documentos", "")
    csv_writer = RecordExportWriter("csv", COLUMNS, "Documentos", "")
    try:
        with pytest.raises(ExportValueError, match="CSV"):
            excel.add({"paciente": value})
        csv_writer.add({"paciente": value})
        rows = list(csv.reader(io.StringIO(csv_writer.finish().read().decode("utf-8-sig")), delimiter=";"))
        assert rows[1][0] == value
    finally:
        excel.finish()
        excel.close()
        csv_writer.close()
