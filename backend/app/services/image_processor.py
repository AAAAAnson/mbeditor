"""Image processing service for MBEditor."""
import base64
import logging
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def download_and_encode(url: str, timeout: float = 10.0) -> Optional[str]:
    """Download image and encode as data URI.

    Returns data URI string or None if download fails.
    """
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "image/png")
            if not content_type.startswith("image/"):
                return None
            b64 = base64.b64encode(resp.content).decode("ascii")
            return f"data:{content_type};base64,{b64}"
    except Exception as e:
        logger.debug("Image download failed for %s: %s", url, e)
        return None
