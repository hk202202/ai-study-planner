from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator


def _mark_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo:
        return value
    return value.replace(tzinfo=timezone.utc)


UTCDateTime = Annotated[datetime, AfterValidator(_mark_utc)]
