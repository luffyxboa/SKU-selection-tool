from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.models.skus import SkuRecord
from app.models.settings import GlobalSetting
from app.models.multidimensional import MarketConfig, MarketChannelConfig, MarketCategoryConfig
from app.core.calculator import CalculationEngine

async def build_calc_engine(db: AsyncSession) -> CalculationEngine:
    settings_res = await db.execute(select(GlobalSetting))
    settings = {s.setting_key: s.setting_value for s in settings_res.scalars().all()}
    
    market_res = await db.execute(select(MarketConfig))
    markets = {m.market_name: m for m in market_res.scalars().all()}
    
    channel_res = await db.execute(select(MarketChannelConfig))
    market_channels = {f"{c.market_id}_{c.channel}": c for c in channel_res.scalars().all()}
    
    category_res = await db.execute(select(MarketCategoryConfig))
    market_categories = {f"{c.market_id}_{c.channel}_{c.category}": c for c in category_res.scalars().all()}
        
    return CalculationEngine(settings, markets, market_channels, market_categories)

async def recalculate_all_skus(db: AsyncSession):
    engine = await build_calc_engine(db)
    result = await db.execute(select(SkuRecord).options(selectinload(SkuRecord.cache)))
    skus = result.scalars().all()
    
    for db_sku in skus:
        new_cache = engine.calculate_sku(db_sku)
        if db_sku.cache:
            for k, v in new_cache.__dict__.items():
                if not k.startswith('_'):
                    setattr(db_sku.cache, k, v)
        else:
            db_sku.cache = new_cache
            
    await db.commit()
