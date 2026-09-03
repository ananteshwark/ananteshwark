"""SSRF guard for operator-configured outbound URLs.

The event webhook and failure-alert webhook targets come from the settings
table, so whoever can write settings chooses a URL the server will then request
with its own network position. Without a check that is a server-side request
forgery primitive: the target can be an internal service, or the cloud instance
metadata endpoint (169.254.169.254), which the server can reach and the
attacker cannot.

Every candidate address the hostname resolves to is checked, so a name that
resolves to a mix of public and private addresses is still refused.

Known limitation: this validates at dispatch time, so a hostname whose DNS
answer changes between the check and the connection (DNS rebinding) is not
fully covered. Closing that requires pinning the validated IP into the socket;
this guard raises the bar substantially without that surgery.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_SCHEMES = ("http", "https")


class UnsafeUrlError(ValueError):
    """The configured URL must not be requested by the server."""


def _is_internal(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local      # includes 169.254.169.254 (cloud metadata)
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def resolved_addresses(host: str, port: int) -> list[str]:
    """Every address `host` resolves to. Literal IPs resolve to themselves."""
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"cannot resolve host {host!r}: {exc}") from exc
    return [info[4][0] for info in infos]


def assert_safe_outbound_url(url: str) -> str:
    """Return `url` if the server may request it, else raise UnsafeUrlError."""
    parsed = urlparse((url or "").strip())

    if parsed.scheme not in ALLOWED_SCHEMES:
        raise UnsafeUrlError(
            f"URL scheme must be http or https (got {parsed.scheme or 'none'!r})"
        )
    host = parsed.hostname
    if not host:
        raise UnsafeUrlError("URL has no host")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    for ip in resolved_addresses(host, port):
        if _is_internal(ip):
            raise UnsafeUrlError(
                f"refusing to call {host!r}: resolves to internal address {ip}"
            )
    return url
