from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request, status

from app.config import get_settings


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._blocked_until: dict[str, float] = {}
        self._lock = Lock()

    def assert_allowed(
        self,
        key: str,
        *,
        limit: int,
        window_seconds: int,
        block_seconds: int | None = None,
        detail: str,
    ) -> None:
        now = monotonic()
        with self._lock:
            blocked_until = self._blocked_until.get(key)
            if blocked_until and blocked_until > now:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=detail,
                    headers={"Retry-After": str(int(blocked_until - now) + 1)},
                )

            events = self._events[key]
            self._prune(events, now, window_seconds)
            if len(events) >= limit:
                if block_seconds:
                    self._blocked_until[key] = now + block_seconds
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=detail,
                    headers={"Retry-After": str(block_seconds or window_seconds)},
                )

    def add_event(self, key: str, *, window_seconds: int) -> None:
        now = monotonic()
        with self._lock:
            events = self._events[key]
            self._prune(events, now, window_seconds)
            events.append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)
            self._blocked_until.pop(key, None)

    @staticmethod
    def _prune(events: deque[float], now: float, window_seconds: int) -> None:
        while events and now - events[0] > window_seconds:
            events.popleft()


login_rate_limiter = SlidingWindowRateLimiter()
upload_rate_limiter = SlidingWindowRateLimiter()


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "desconocida"


def ensure_login_allowed(request: Request, username: str) -> str:
    settings = get_settings()
    key = f"login:{get_client_ip(request)}:{username.strip().lower()}"
    login_rate_limiter.assert_allowed(
        key,
        limit=settings.login_rate_limit_attempts,
        window_seconds=settings.login_rate_limit_window_seconds,
        block_seconds=settings.login_rate_limit_block_seconds,
        detail="Demasiados intentos de inicio de sesion. Espera unos minutos antes de reintentar.",
    )
    return key


def register_login_failure(key: str) -> None:
    settings = get_settings()
    login_rate_limiter.add_event(key, window_seconds=settings.login_rate_limit_window_seconds)


def clear_login_failures(key: str) -> None:
    login_rate_limiter.reset(key)


def ensure_upload_allowed(request: Request, paciente_id: str) -> None:
    settings = get_settings()
    key = f"upload:{get_client_ip(request)}:{paciente_id}"
    upload_rate_limiter.assert_allowed(
        key,
        limit=settings.upload_rate_limit_per_minute,
        window_seconds=60,
        detail="Demasiadas subidas consecutivas. Espera un minuto antes de volver a intentarlo.",
    )
    upload_rate_limiter.add_event(key, window_seconds=60)
