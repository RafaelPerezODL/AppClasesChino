"""WSGI entry point for production deployment (Render, etc.)."""
import sys
import traceback

try:
    from app.main import create_app
    app = create_app()
    print("[wsgi] App created successfully", flush=True)
except Exception as e:
    print(f"[wsgi] FATAL ERROR creating app: {e}", flush=True)
    traceback.print_exc()
    sys.exit(1)
