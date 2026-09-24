"""Read browser-downloaded CSV/XLSX without an Excel runtime or extra dependencies."""

import csv
import json
import sys
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile


def read(path):
    if path.suffix == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as file:
            return list(csv.reader(file, delimiter=";"))
    namespace = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            tree = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = ["".join(node.itertext()) for node in tree.findall("s:si", namespace)]
        tree = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows = []
        for row in tree.findall("s:sheetData/s:row", namespace):
            values = []
            for cell in row.findall("s:c", namespace):
                column = "".join(character for character in cell.attrib["r"] if character.isalpha())
                position = 0
                for character in column:
                    position = position * 26 + ord(character) - ord("A") + 1
                while len(values) < position:
                    values.append("")
                value = cell.find("s:v", namespace)
                raw = value.text if value is not None and value.text else ""
                if cell.attrib.get("t") == "s":
                    raw = strings[int(raw)]
                elif cell.attrib.get("t") == "inlineStr":
                    inline = cell.find("s:is", namespace)
                    raw = "".join(inline.itertext()) if inline is not None else ""
                values[position - 1] = raw
            rows.append(values)
        return rows


if __name__ == "__main__":
    print(json.dumps(read(Path(sys.argv[1])), ensure_ascii=True))
