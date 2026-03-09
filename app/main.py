"""
Servidor Flask para la aplicación de práctica de chino.
Sirve la interfaz web y expone la API de vocabulario y frases.
"""

import json
from pathlib import Path

from flask import Flask, jsonify, render_template, request, Response, send_from_directory
import requests as http_requests


def load_json(filename: str) -> dict:
    """Carga un archivo JSON desde la carpeta data."""
    path = Path(__file__).parent / "data" / filename
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def create_app() -> Flask:
    """Crea y configura la aplicación Flask."""
    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
    )

    vocabulary_data = load_json("vocabulary.json")
    phrases_data    = load_json("phrases.json")

    @app.route("/")
    def index():
        """Página principal con las flashcards."""
        return render_template("index.html")

    @app.route("/sw.js")
    def service_worker():
        """Serve service worker from root scope."""
        return send_from_directory(app.static_folder, "sw.js",
                                  mimetype="application/javascript")

    @app.route("/api/vocabulary")
    def api_vocabulary():
        """Devuelve todo el vocabulario en formato JSON."""
        return jsonify(vocabulary_data)

    @app.route("/api/phrases")
    def api_phrases():
        """Devuelve todas las frases para el ejercicio de drag-and-drop."""
        return jsonify(phrases_data)

    # ── OpenAI Proxy ──────────────────────────────────────
    @app.route("/api/openai/chat", methods=["POST"])
    def proxy_openai_chat():
        """Proxy para OpenAI Chat Completions."""
        api_key = request.headers.get("X-API-Key", "")
        if not api_key:
            return jsonify({"error": "API key missing"}), 401

        resp = http_requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            data=request.get_data(),
            timeout=30,
        )
        return Response(resp.content, status=resp.status_code,
                        content_type="application/json")

    @app.route("/api/openai/tts", methods=["POST"])
    def proxy_openai_tts():
        """Proxy para OpenAI TTS (audio/speech)."""
        api_key = request.headers.get("X-API-Key", "")
        if not api_key:
            return jsonify({"error": "API key missing"}), 401

        resp = http_requests.post(
            "https://api.openai.com/v1/audio/speech",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            data=request.get_data(),
            timeout=30,
        )
        return Response(resp.content, status=resp.status_code,
                        content_type=resp.headers.get("Content-Type", "audio/mpeg"))

    @app.route("/api/openai/transcribe", methods=["POST"])
    def proxy_openai_transcribe():
        """Proxy para OpenAI Whisper (audio/transcriptions)."""
        api_key = request.headers.get("X-API-Key", "")
        if not api_key:
            return jsonify({"error": "API key missing"}), 401

        audio_file = request.files.get("file")
        if not audio_file:
            return jsonify({"error": "No audio file"}), 400

        # Read audio fully into memory to avoid stream-position bugs
        audio_bytes = audio_file.read()

        if len(audio_bytes) < 1000:
            return jsonify({"error": "Audio too short"}), 400

        files = {
            "file": (
                audio_file.filename or "audio.webm",
                audio_bytes,
                audio_file.content_type or "audio/webm",
            ),
        }
        data = {
            "model": request.form.get("model", "whisper-1"),
            "language": request.form.get("language", "zh"),
        }
        prompt = request.form.get("prompt", "")
        if prompt:
            data["prompt"] = prompt

        resp = http_requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files=files,
            data=data,
            timeout=30,
        )
        return Response(resp.content, status=resp.status_code,
                        content_type="application/json")

    return app
