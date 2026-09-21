from pydantic import BaseModel


class IngresosResponse(BaseModel):
    total: float
    pac: float
    seg: float
