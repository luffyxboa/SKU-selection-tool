from fastapi import APIRouter, Depends

from app.api.endpoints import skus, settings, upload, markets, auth
from app.api.dependencies.auth import get_current_user

api_router = APIRouter()

# Public Auth Routes
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])

# Protected Data Routes
api_router.include_router(skus.router, prefix="/skus", tags=["SKUs"], dependencies=[Depends(get_current_user)])
api_router.include_router(settings.router, prefix="/settings", tags=["Settings"], dependencies=[Depends(get_current_user)])
api_router.include_router(markets.router, prefix="/markets", tags=["Markets"], dependencies=[Depends(get_current_user)])
api_router.include_router(upload.router, prefix="/upload", tags=["Upload"], dependencies=[Depends(get_current_user)])
