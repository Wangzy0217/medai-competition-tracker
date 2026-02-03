import os

from app import create_app

app, socketio = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5001"))
    socketio.run(app, host="0.0.0.0", port=port)