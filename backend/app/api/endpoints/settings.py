from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Dict, Any

from app.api.dependencies.database import get_db
from app.models.settings import GlobalSetting
from app.services.recalculator import recalculate_all_skus

router = APIRouter()

@router.get("/")
async def get_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlobalSetting))
    settings = result.scalars().all()
    return {s.setting_key: s.setting_value for s in settings}

@router.put("/")
async def update_settings(payload: Dict[str, float], db: AsyncSession = Depends(get_db)):
    # Bulk update
    for key, value in payload.items():
        result = await db.execute(select(GlobalSetting).filter(GlobalSetting.setting_key == key))
        db_setting = result.scalars().first()
        
        if not db_setting:
            db_setting = GlobalSetting(setting_key=key, setting_value=value)
            db.add(db_setting)
        else:
            db_setting.setting_value = value
            
    await db.commit()
    await recalculate_all_skus(db)
    return {"message": "Success"}
