from sqlalchemy import Column, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class MarketConfig(Base):
    __tablename__ = "market_config"

    market_name = Column(String, primary_key=True, index=True)
    currency = Column(String, default="USD")
    import_freight_pct = Column(Float, default=0.0)
    duties_taxes_pct = Column(Float, default=0.0)
    price_multiplier = Column(Float, default=1.0)
    doc_distributor = Column(Float, default=30.0)
    doc_retail = Column(Float, default=15.0)

    # Relationships
    channel_configs = relationship("MarketChannelConfig", back_populates="market", cascade="all, delete")
    category_overrides = relationship("MarketCategoryConfig", back_populates="market", cascade="all, delete")

class MarketChannelConfig(Base):
    __tablename__ = "market_channel_config"

    market_id = Column(String, ForeignKey("market_config.market_name", ondelete="CASCADE"), primary_key=True)
    channel = Column(String, primary_key=True)
    
    # Granular CTS Matrix
    commission_pct = Column(Float, default=0.0)
    fulfillment_pct = Column(Float, default=0.0)
    cod_pct = Column(Float, default=0.0)
    returns_allowance_pct = Column(Float, default=0.0)
    listing_fees_pct = Column(Float, default=0.0)
    trade_terms_pct = Column(Float, default=0.0)
    rebates_pct = Column(Float, default=0.0)
    promo_accrual_pct = Column(Float, default=0.0)
    
    # Performance Drivers
    retail_adoption_rate = Column(Float, default=1.0)
    marketing_lift = Column(Float, default=1.0)
    base_units_month = Column(Float, default=0.0)
    channel_weight = Column(Float, default=1.0)
    competitor_activity_idx = Column(Float, default=0.0)

    # Relationships
    market = relationship("MarketConfig", back_populates="channel_configs")

class MarketCategoryConfig(Base):
    __tablename__ = "market_category_config"

    market_id = Column(String, ForeignKey("market_config.market_name", ondelete="CASCADE"), primary_key=True)
    channel = Column(String, primary_key=True)
    category = Column(String, primary_key=True)

    # Optional Override Multipliers (Nullable if relying on Channel default)
    adoption_rate_override = Column(Float, nullable=True)
    marketing_lift_override = Column(Float, nullable=True)
    competitor_idx_override = Column(Float, nullable=True)

    # Relationships
    market = relationship("MarketConfig", back_populates="category_overrides")
