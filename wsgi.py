"""WSGI entry point for production deployment (Render, etc.)."""
from app.main import create_app

app = create_app()
