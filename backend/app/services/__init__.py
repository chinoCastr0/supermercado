"""Exportaciones públicas del paquete de servicios.

Importar este paquete carga el parser y pandas; los otros servicios se importan
por su módulo concreto. Esta fachada no constituye una interfaz de repositorio."""

from app.services.excel_import import parse_excel_rows

__all__ = ["parse_excel_rows"]
