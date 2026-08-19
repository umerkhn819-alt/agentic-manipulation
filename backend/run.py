"""
Start the backend on the port configured in .env (API_PORT, default 8000).

Using this instead of calling uvicorn directly keeps the port in ONE place: the frontend's
dev proxy reads the same API_PORT value, so the two can never drift apart.

    python run.py
"""

import uvicorn

import config

if __name__ == "__main__":
    print(f"Starting on http://localhost:{config.API_PORT}  (set API_PORT in .env to change)")
    uvicorn.run("main:app", host="127.0.0.1", port=config.API_PORT, reload=True)
