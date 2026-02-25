from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from typing import List, Optional

from app.api.dependencies.database import get_db
from app.models.multidimensional import MarketConfig, MarketChannelConfig, MarketCategoryConfig
from app.services.recalculator import recalculate_all_skus

router = APIRouter()

# --- Schemas ---
class MarketConfigUpdate(BaseModel):
    currency: Optional[str] = None
    import_freight_pct: Optional[float] = None
    duties_taxes_pct: Optional[float] = None
    price_multiplier: Optional[float] = None
    doc_distributor: Optional[float] = None
    doc_retail: Optional[float] = None

class MarketChannelConfigUpdate(BaseModel):
    commission_pct: Optional[float] = None
    fulfillment_pct: Optional[float] = None
    cod_pct: Optional[float] = None
    returns_allowance_pct: Optional[float] = None
    listing_fees_pct: Optional[float] = None
    trade_terms_pct: Optional[float] = None
    rebates_pct: Optional[float] = None
    promo_accrual_pct: Optional[float] = None
    retail_adoption_rate: Optional[float] = None
    marketing_lift: Optional[float] = None
    base_units_month: Optional[float] = None
    channel_weight: Optional[float] = None
    competitor_activity_idx: Optional[float] = None

class MarketCategoryConfigCreateUpdate(BaseModel):
    adoption_rate_override: Optional[float] = None
    marketing_lift_override: Optional[float] = None
    competitor_idx_override: Optional[float] = None

class MarketConfigResponse(MarketConfigUpdate):
    market_name: str
    class Config:
        from_attributes = True

class MarketChannelConfigResponse(MarketChannelConfigUpdate):
    market_id: str
    channel: str
    class Config:
        from_attributes = True

class MarketCategoryConfigResponse(MarketCategoryConfigCreateUpdate):
    market_id: str
    channel: str
    category: str
    class Config:
        from_attributes = True

# --- Market Level Endpoints ---
@router.get("/", response_model=List[MarketConfigResponse])
async def get_markets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MarketConfig))
    return result.scalars().all()

@router.post("/{market_name}")
async def create_market(market_name: str, payload: MarketConfigUpdate, db: AsyncSession = Depends(get_db)):
    # Check if exists
    result = await db.execute(select(MarketConfig).filter_by(market_name=market_name))
    db_obj = result.scalars().first()
    if db_obj:
        raise HTTPException(status_code=400, detail="Market already exists")
    
    new_market = MarketConfig(market_name=market_name, **payload.dict(exclude_unset=True))
    db.add(new_market)
    await db.commit()
    return {"message": "Success"}

@router.put("/{market_name}")
async def update_market(market_name: str, payload: MarketConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MarketConfig).filter_by(market_name=market_name))
    db_obj = result.scalars().first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Market not found")
        
    for var, value in payload.dict(exclude_unset=True).items():
        setattr(db_obj, var, value)
            
    await db.commit()
    await recalculate_all_skus(db)
    return {"message": "Success"}

@router.delete("/{market_name}")
async def delete_market(market_name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MarketConfig).filter_by(market_name=market_name))
    db_obj = result.scalars().first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Market not found")
    
    await db.delete(db_obj)
    await db.commit()
    await recalculate_all_skus(db)
    return {"message": "Deleted successfully"}

# --- Market-Channel Level Endpoints ---
@router.get("/{market_name}/channels", response_model=List[MarketChannelConfigResponse])
async def get_market_channels(market_name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MarketChannelConfig).filter_by(market_id=market_name))
    return result.scalars().all()

@router.put("/{market_name}/channels/{channel_name}")
async def update_market_channel(market_name: str, channel_name: str, payload: MarketChannelConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MarketChannelConfig).filter_by(market_id=market_name, channel=channel_name))
    db_obj = result.scalars().first()
    
    if not db_obj:
        # Upsert if it doesn't exist yet but the market does
        db_obj = MarketChannelConfig(market_id=market_name, channel=channel_name)
        db.add(db_obj)
        
    for var, value in payload.dict(exclude_unset=True).items():
        setattr(db_obj, var, value)
            
    await db.commit()
    await recalculate_all_skus(db)
    return {"message": "Success"}

# --- Market-Channel-Category Override Endpoints ---
@router.get("/{market_name}/channels/{channel_name}/categories", response_model=List[MarketCategoryConfigResponse])
async def get_market_category_overrides(market_name: str, channel_name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MarketCategoryConfig).filter_by(market_id=market_name, channel=channel_name))
    return result.scalars().all()

@router.put("/{market_name}/channels/{channel_name}/categories/{category_name}")
async def upsert_market_category_override(market_name: str, channel_name: str, category_name: str, payload: MarketCategoryConfigCreateUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MarketCategoryConfig).filter_by(market_id=market_name, channel=channel_name, category=category_name))
    db_obj = result.scalars().first()
    
    if not db_obj:
        db_obj = MarketCategoryConfig(market_id=market_name, channel=channel_name, category=category_name)
        db.add(db_obj)
        
    for var, value in payload.dict(exclude_unset=True).items():
        setattr(db_obj, var, value)
            
    await db.commit()
    await recalculate_all_skus(db)
    return {"message": "Success"}

@router.delete("/{market_name}/channels/{channel_name}/categories/{category_name}")
async def delete_market_category_override(market_name: str, channel_name: str, category_name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MarketCategoryConfig).filter_by(market_id=market_name, channel=channel_name, category=category_name))
    db_obj = result.scalars().first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Override not found")
        
    await db.delete(db_obj)
    await db.commit()
    await recalculate_all_skus(db)
    return {"message": "Success"}
