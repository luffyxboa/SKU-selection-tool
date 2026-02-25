from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import engine, Base, AsyncSessionLocal
from app.api import api_router
from app.models.markets import Market

load_dotenv()

app = FastAPI(
    title="SKU Selection Tool API",
    description="Backend API for managing SKU recommendations and business model configurations.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def seed_markets():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Market))
        markets = result.scalars().all()
        if not markets:
            default_markets = ["Nepal", "Sri Lanka", "Malaysia"]
            for m in default_markets:
                session.add(Market(market_name=m))
            await session.commit()

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        # Create all tables if they don't exist
        await conn.run_sync(Base.metadata.create_all)
    await seed_markets()

@app.get("/")
def read_root():
    return {"message": "Welcome to the SKU Selection Tool API"}

app.include_router(api_router, prefix="/api")
