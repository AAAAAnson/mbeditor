import re

from app.services import wechat_service


def extract_source_url(raw_html: str) -> str:
    comment_match = re.search(r'<!--\s*source_url:(https?://[^\s]+)\s*-->', raw_html)
    if comment_match:
        return comment_match.group(1)

    url_match = re.search(r'<a\s+href="(https?://[^"]+)"', raw_html)
    return url_match.group(1) if url_match else ""


def create_article_draft(
    *,
    article: dict,
    processed_html: str,
    thumb_media_id: str,
    source_url: str,
    author: str,
    digest: str,
) -> dict:
    return wechat_service.create_draft(
        title=article.get("title", "Untitled"),
        html=processed_html,
        author=author or article.get("author", ""),
        digest=digest or article.get("digest", ""),
        thumb_media_id=thumb_media_id,
        content_source_url=source_url,
    )
