from pydantic import BaseModel


class TwoFactorEnableResponse(BaseModel):
    secret: str
    otpauthUrl: str
    qrDataUrl: str
