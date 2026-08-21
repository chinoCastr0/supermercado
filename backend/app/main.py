#main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.products import router as products_router
from app.database import initialize_database
import app.models


initialize_database()

app = FastAPI(
    title="Sistema Supermercado",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products_router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "API del supermercado funcionando",
    }

    
