"""
Aplicación de escritorio para practicar chino mandarín.
Ejecutar este archivo para iniciar la aplicación.
"""

from app.main import create_app

if __name__ == "__main__":
    app = create_app()
    print("\n🀄 Aplicación de Chino iniciada")
    print("   Abre tu navegador en: http://localhost:5000\n")
    app.run(debug=True, port=5000)
