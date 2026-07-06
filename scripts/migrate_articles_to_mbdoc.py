#!/usr/bin/env python3
"""Migrate legacy Article data to MBDoc format.

This script reads articles from the frontend's localStorage export (JSON)
and converts them to MBDoc format, saving them to the backend's data/mbdocs/ directory.

Usage:
    python -m scripts.migrate_articles_to_mbdoc [--input <articles.json>]
"""
import argparse
import json
import logging
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.models.mbdoc import MBDoc
from app.services.article_to_mbdoc import article_to_mbdoc
from app.services.mbdoc_store import save_mbdoc, list_mbdocs

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def migrate_articles(input_file: Path) -> None:
    """Migrate articles from JSON export to MBDoc format.
    
    Expected input format (from frontend export):
    {
        "version": 1,
        "exported_at": "...",
        "articles": [
            {
                "id": "...",
                "title": "...",
                "html": "...",
                "css": "...",
                "markdown": "...",
                "mode": "html",
                "author": "...",
                "digest": "...",
                "cover": "..."
            },
            ...
        ],
        "mbdocs": []
    }
    """
    if not input_file.exists():
        logger.error("Input file not found: %s", input_file)
        sys.exit(1)
    
    try:
        data = json.loads(input_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in input file: %s", e)
        sys.exit(1)
    
    articles = data.get("articles", [])
    if not articles:
        logger.warning("No articles found in input file")
        return
    
    logger.info("Found %d articles to migrate", len(articles))
    
    migrated = 0
    skipped = 0
    errors = 0
    
    for article in articles:
        article_id = article.get("id")
        title = article.get("title", "Untitled")
        
        if not article_id:
            logger.warning("Skipping article with no ID: %s", title)
            skipped += 1
            continue
        
        try:
            # Convert Article to MBDoc
            mbdoc = article_to_mbdoc(
                article_id=article_id,
                title=title,
                html=article.get("html", ""),
                css=article.get("css", ""),
                markdown=article.get("markdown", ""),
                mode=article.get("mode", "html"),
                author=article.get("author", ""),
                digest=article.get("digest", ""),
                cover=article.get("cover", ""),
            )
            
            # Save MBDoc
            save_mbdoc(mbdoc)
            migrated += 1
            logger.info("Migrated: %s (%s)", title, article_id)
            
        except Exception as e:
            logger.error("Failed to migrate %s: %s", title, e)
            errors += 1
    
    logger.info("\nMigration complete:")
    logger.info("  - Migrated: %d", migrated)
    logger.info("  - Skipped: %d", skipped)
    logger.info("  - Errors: %d", errors)
    
    # List all MBDocs after migration
    all_mbdocs = list_mbdocs()
    logger.info("\nTotal MBDocs in system: %d", len(all_mbdocs))


def main():
    parser = argparse.ArgumentParser(description="Migrate articles to MBDoc format")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/articles-export.json"),
        help="Path to articles export JSON file"
    )
    args = parser.parse_args()
    
    migrate_articles(args.input)


if __name__ == "__main__":
    main()
