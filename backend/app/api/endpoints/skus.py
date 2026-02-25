from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
import pandas as pd
import io

from app.api.dependencies.database import get_db
from app.models.skus import SkuRecord, SkuCalculationCache
from app.models.settings import GlobalSetting
from app.models.multidimensional import MarketConfig, MarketChannelConfig, MarketCategoryConfig
from app.schemas.skus import SkuRecordResponse, SkuRecordCreate, SkuRecordUpdate
from app.core.calculator import CalculationEngine

router = APIRouter()

from sqlalchemy.orm import selectinload

@router.get("/", response_model=List[SkuRecordResponse])
async def read_skus(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SkuRecord).options(selectinload(SkuRecord.cache)).offset(skip).limit(limit)
    )
    skus = result.scalars().all()
    return skus

@router.post("/export")
async def export_skus(sku_ids: List[str] = Body(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SkuRecord).options(selectinload(SkuRecord.cache)).filter(SkuRecord.sku_id.in_(sku_ids))
    )
    skus = result.scalars().all()
    
    data = []
    for sku in skus:
        row = {
            "SKU ID": sku.sku_id,
            "SKU Name": sku.sku_name,
            "Brand": sku.brand,
            "Category": sku.category,
            "Target Market": sku.target_market,
            "Primary Channel": sku.primary_channel,
            "Ramp Month": sku.ramp_month,
            "MOQ": sku.moq,
            "Lead Time (Days)": sku.lead_time_days,
            "Shelf Life (Months)": sku.shelf_life_months,
            "Local List Price": sku.local_list_price,
            "Landed Cost": sku.landed_cost,
        }
        if sku.cache:
            row["Calculated Score"] = getattr(sku.cache, "channel_weighted_score", getattr(sku.cache, "weighted_score_layer_b", 0))
            row["Final Recommendation"] = sku.cache.final_recommendation
            row["Monthly Revenue"] = sku.cache.monthly_revenue
            row["Gross Margin (%)"] = sku.cache.gm_pct
            row["Gross Margin ($)"] = sku.cache.monthly_gm_dollar
        data.append(row)
        
    df = pd.DataFrame(data)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Selected SKUs')
    
    output.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="sku_export.xlsx"'
    }
    return StreamingResponse(
        output, 
        headers=headers, 
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@router.post("/", response_model=SkuRecordResponse)
async def create_sku(sku: SkuRecordCreate, db: AsyncSession = Depends(get_db)):
    db_sku = SkuRecord(**sku.dict())
    db.add(db_sku)
    
    # Needs to calculate immediately
    engine = await _build_calc_engine(db)
    cache = engine.calculate_sku(db_sku)
    db.add(cache)
    
    await db.commit()
    await db.refresh(db_sku)
    return db_sku

@router.put("/{sku_id}", response_model=SkuRecordResponse)
async def update_sku(sku_id: str, sku_update: SkuRecordUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SkuRecord).options(selectinload(SkuRecord.cache)).filter(SkuRecord.sku_id == sku_id))
    db_sku = result.scalars().first()
    
    if not db_sku:
        raise HTTPException(status_code=404, detail="SKU not found")
        
    update_data = sku_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_sku, key, value)
        
    # Re-calculate!
    engine = await _build_calc_engine(db)
    
    # Calculate new cache values
    new_cache = engine.calculate_sku(db_sku)
    
    # Safely update the existing cache object
    if db_sku.cache:
        for k, v in new_cache.__dict__.items():
            if not k.startswith('_'):
                setattr(db_sku.cache, k, v)
    else:
        db_sku.cache = new_cache
    
    await db.commit()
    await db.refresh(db_sku)
    return db_sku

@router.post("/delete-bulk")
async def delete_skus(sku_ids: List[str] = Body(...), db: AsyncSession = Depends(get_db)):
    # First delete caches referring to these SKUs
    await db.execute(SkuCalculationCache.__table__.delete().where(SkuCalculationCache.sku_id.in_(sku_ids)))
    # Then delete the SKUs themselves
    result = await db.execute(SkuRecord.__table__.delete().where(SkuRecord.sku_id.in_(sku_ids)))
    await db.commit()
    return {"status": "success", "deleted_count": result.rowcount}

async def _build_calc_engine(db: AsyncSession) -> CalculationEngine:
    # Fetch all configs
    settings_res = await db.execute(select(GlobalSetting))
    settings = {s.setting_key: s.setting_value for s in settings_res.scalars().all()}
    
    market_res = await db.execute(select(MarketConfig))
    markets = {m.market_name: m for m in market_res.scalars().all()}
    
    channel_res = await db.execute(select(MarketChannelConfig))
    market_channels = {f"{c.market_id}_{c.channel}": c for c in channel_res.scalars().all()}
    
    category_res = await db.execute(select(MarketCategoryConfig))
    market_categories = {f"{c.market_id}_{c.channel}_{c.category}": c for c in category_res.scalars().all()}
        
    return CalculationEngine(settings, markets, market_channels, market_categories)
