"""Clinic wall-clock schedules, independent of API timestamp offsets."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.config import get_settings


def clinic_datetime(value: datetime) -> datetime:
    zone = ZoneInfo(get_settings().clinic_timezone)
    # Compatibility with older clients submitting wall-clock datetimes. New
    # clients send an explicit offset; both refer to the same clinic instant.
    return value.replace(tzinfo=zone) if value.tzinfo is None else value.astimezone(zone)
