from app.models.skus import SkuRecord, SkuCalculationCache
from typing import Dict, Any

class CalculationEngine:
    def __init__(self, global_settings: Dict[str, float], markets: Dict[str, Any], market_channels: Dict[str, Any], market_categories: Dict[str, Any]):
        self.settings = global_settings
        self.markets = markets
        self.market_channels = market_channels
        self.market_categories = market_categories
        
    def _get_setting(self, key: str, default: float = 0.0) -> float:
        return self.settings.get(key, default)

    def _get_override(self, market: str, channel: str, category: str, field_name: str, global_default: float = 1.0) -> float:
        """
        3-Tier Resolution Cascade:
        1. MarketCategoryConfig
        2. MarketChannelConfig
        3. GlobalSettings (fallback)
        """
        # 1. Check Category Specific Overrides
        cat_key = f"{market}_{channel}_{category}"
        if cat_key in self.market_categories:
            override_val = getattr(self.market_categories[cat_key], f"{field_name}_override", None)
            if override_val is not None:
                return override_val

        # 2. Check Market Channel Defaults
        chan_key = f"{market}_{channel}"
        if chan_key in self.market_channels:
            val = getattr(self.market_channels[chan_key], getattr(self, '_map_field_name', lambda x: x)(field_name), None)
            if val is not None:
                return val
                
        # 3. Fallback
        return self._get_setting(field_name, global_default)

    def _map_field_name(self, field_name: str) -> str:
        # Maps the override name back to the base MarketChannelConfig name
        mapping = {
            "adoption_rate": "retail_adoption_rate",
            "marketing_lift": "marketing_lift",
            "competitor_idx": "competitor_activity_idx"
        }
        return mapping.get(field_name, field_name)

    def calculate_sku(self, sku: SkuRecord) -> SkuCalculationCache:
        cache = SkuCalculationCache(sku_id=sku.sku_id)
        
        # We need both Market and Channel to proceed fully
        if not sku.target_market or not sku.primary_channel:
            return cache # Returns empty cache but prevents crashes
            
        market = sku.target_market
        channel = sku.primary_channel
        
        # 1. Market Economics & Financial Constants
        base_list_price = sku.local_list_price or 0.0
        base_landed_cost = sku.landed_cost or 0.0
        
        market_data = self.markets.get(market)
        if market_data:
            adj_list_price = base_list_price * market_data.price_multiplier
            imported_cogs = base_landed_cost * (1.0 + market_data.import_freight_pct) * (1.0 + market_data.duties_taxes_pct)
        else:
            adj_list_price = base_list_price
            imported_cogs = base_landed_cost
        
        # 2. CTS Matrix Total
        chan_key = f"{market}_{channel}"
        cts_pct = 0.0
        if chan_key in self.market_channels:
            mc = self.market_channels[chan_key]
            cts_pct = (mc.commission_pct + mc.fulfillment_pct + mc.cod_pct + 
                       mc.returns_allowance_pct + mc.listing_fees_pct + 
                       mc.trade_terms_pct + mc.rebates_pct + mc.promo_accrual_pct)
            
        # 3. Core Financials
        cache.gm_dollar_per_unit = adj_list_price - (imported_cogs + (cts_pct * adj_list_price))
        cache.gm_pct = (cache.gm_dollar_per_unit / adj_list_price) if adj_list_price > 0 else 0.0
        
        # 4. Layer B: Market & Channel Fit (Scores 1-5)
        w1 = self._get_setting("consumer_trend_weight", 0.2)
        w2 = self._get_setting("point_of_diff_weight", 0.2)
        w3 = self._get_setting("channel_suitability_weight", 0.2)
        w4 = self._get_setting("strategic_role_weight", 0.2)
        w5 = self._get_setting("marketing_leverage_weight", 0.2)
        
        score_b = (
            (sku.score_consumer_trend or 0) * w1 +
            (sku.score_point_of_diff or 0) * w2 +
            (sku.score_channel_suitability or 0) * w3 +
            (sku.score_strategic_role or 0) * w4 +
            (sku.score_marketing_leverage or 0) * w5
        )
        cache.weighted_score_layer_b = score_b
        
        # Channel-Weighted Score
        ch_weight = 1.0 # default
        if chan_key in self.market_channels:
            ch_weight = self.market_channels[chan_key].channel_weight
        cache.channel_weighted_score = score_b * ch_weight

        # 5. Layer C: Strategic Synergy
        s1 = self._get_setting("price_ladder_weight", 0.2)
        s2 = self._get_setting("usage_occasion_weight", 0.2)
        s3 = self._get_setting("channel_diff_weight", 0.2)
        s4 = self._get_setting("story_cohesion_weight", 0.2)
        s5 = self._get_setting("operational_synergy_weight", 0.2)
        
        score_c = (
            (sku.score_price_ladder or 0) * s1 +
            (sku.score_usage_occasion or 0) * s2 +
            (sku.score_channel_diff or 0) * s3 +
            (sku.score_story_cohesion or 0) * s4 +
            (sku.score_operational_synergy or 0) * s5
        )
        cache.synergy_score_layer_c = score_c

        # 6. Layer D: Risk Heatmap
        r1 = self._get_setting("regulatory_delay_weight", 0.2)
        r2 = self._get_setting("retail_listing_weight", 0.2)
        r3 = self._get_setting("competitive_weight", 0.2)
        r4 = self._get_setting("supply_chain_weight", 0.2)
        r5 = self._get_setting("price_war_weight", 0.2)
        
        score_d = (
            (sku.score_regulatory_delay or 0) * r1 +
            (sku.score_retail_listing or 0) * r2 +
            (sku.score_competitive or 0) * r3 +
            (sku.score_supply_chain or 0) * r4 +
            (sku.score_price_war or 0) * r5
        )
        cache.risk_score_layer_d = score_d
        
        # 8. Advanced Demand Logic (Price Elasticity & Scenarios)
        base_units = 0.0
        if chan_key in self.market_channels:
            base_units = self.market_channels[chan_key].base_units_month
            
        # 8a. Global Setup Variables
        global_risk_floor = self._get_setting("global_risk_floor", 0.6)
        global_risk_slope = self._get_setting("global_risk_slope", 0.25)
        price_elasticity = self._get_setting("price_elasticity_abs", 1.5)
        
        # Use 3-Tier Cascade for Multipliers
        category = sku.category or "Unknown"
        marketing_budget_multiplier = self._get_override(market, channel, category, "marketing_lift", 1.0)
        retail_adoption_fraction = self._get_override(market, channel, category, "adoption_rate", 1.0)
        target_comp_index = self._get_override(market, channel, category, "competitor_idx", 1.0)

        # 8b. Core Factors
        # Risk factor = MAX(Floor, 1 - Slope * (RiskScore - 1))
        cache.risk_factor = max(global_risk_floor, 1.0 - global_risk_slope * (score_d - 1.0))
        
        # Base multiplier from channel weighted score: MAX(0.6, Channel_Weighted_Score / 5)
        score_multiplier = max(0.6, cache.channel_weighted_score / 5.0)
        
        # Ramp Factor (Simplified: Could be dynamic array based on ramp_month)
        ramp_factor = 1.0 
        
        # Marketing & Adoption 
        # Excel: CLAMP(Marketing Support Index * Channel Marketing Budget) -> Assume Index is 1.0 if not provided
        marketing_factor = max(0.85, min(1.15, 1.0 * marketing_budget_multiplier))
        adoption_factor = retail_adoption_fraction
        
        # Competitor Factor (Derived from Risk Penalty)
        comp_weight = self._get_setting("competitive_weight", 0.2)
        price_war_weight = self._get_setting("price_war_weight", 0.2)
        lin_penalty = (comp_weight*target_comp_index + price_war_weight*target_comp_index) * (score_d/5.0)
        competitor_factor = max(1.0 - min(self._get_setting("risk_penalty_cap", 0.4), lin_penalty), 0.6)
        
        # Price Effective Index = SKU Price Index (1.0 default) * (1 + Global Price Adj)
        global_price_adj = self._get_setting("global_price_adjustment_pct", 0.0)
        price_eff_index = 1.0 * (1.0 + global_price_adj)
        
        # Common pre-calculated multiplier
        # Base Units * Score Multiplier * Global Risk Factor * Marketing * Adoption * Competitor * Ramp 
        common_units_mult = (base_units * score_multiplier * cache.risk_factor * 
                             marketing_factor * adoption_factor * competitor_factor * ramp_factor)

        # 8c. Scenario Processing (Base, Best, Worst)
        # Using typical multiplier offsets if they are not defined in the settings DB yet
        scenarios = {
            "base": {
                "price_delta": self._get_setting("scenario_base_price_delta", 0.0),
                "marketing_mult": self._get_setting("scenario_base_marketing_mult", 1.0),
                "adoption_mult": self._get_setting("scenario_base_adoption_mult", 1.0),
                "competitor_mult": self._get_setting("scenario_base_competitor_mult", 1.0),
            },
            "best": {
                "price_delta": self._get_setting("scenario_best_price_delta", -0.05),
                "marketing_mult": self._get_setting("scenario_best_marketing_mult", 1.15),
                "adoption_mult": self._get_setting("scenario_best_adoption_mult", 1.2),
                "competitor_mult": self._get_setting("scenario_best_competitor_mult", 0.9),
            },
            "worst": {
                "price_delta": self._get_setting("scenario_worst_price_delta", 0.10),
                "marketing_mult": self._get_setting("scenario_worst_marketing_mult", 0.85),
                "adoption_mult": self._get_setting("scenario_worst_adoption_mult", 0.8),
                "competitor_mult": self._get_setting("scenario_worst_competitor_mult", 1.2),
            },
        }

        # Calculate Demand for each scenario
        # Formula: Common_Mult * ((1 / (Price_Eff_Index * (1 + Price_Delta))) ^ Price_Elasticity) * Scenario_Mults
        
        # Base
        base_s = scenarios["base"]
        base_price_effect = (1.0 / (price_eff_index * (1.0 + base_s["price_delta"]))) ** price_elasticity
        cache.adj_units_base = common_units_mult * base_price_effect * base_s["marketing_mult"] * base_s["adoption_mult"] * base_s["competitor_mult"]
        
        # Best
        best_s = scenarios["best"]
        best_price_effect = (1.0 / (price_eff_index * (1.0 + best_s["price_delta"]))) ** price_elasticity
        cache.adj_units_best = common_units_mult * best_price_effect * best_s["marketing_mult"] * best_s["adoption_mult"] * best_s["competitor_mult"]
        
        # Worst
        worst_s = scenarios["worst"]
        worst_price_effect = (1.0 / (price_eff_index * (1.0 + worst_s["price_delta"]))) ** price_elasticity
        cache.adj_units_worst = common_units_mult * worst_price_effect * worst_s["marketing_mult"] * worst_s["adoption_mult"] * worst_s["competitor_mult"]

        # 8d. Financial Rollups (Legacy compatibility + Base mappings)
        cache.monthly_revenue = cache.adj_units_base * adj_list_price
        cache.monthly_gm_dollar = cache.adj_units_base * cache.gm_dollar_per_unit
        
        # Save specific scenario GM$
        cache.monthly_gm_base = cache.adj_units_base * cache.gm_dollar_per_unit
        cache.monthly_gm_best = cache.adj_units_best * cache.gm_dollar_per_unit
        cache.monthly_gm_worst = cache.adj_units_worst * cache.gm_dollar_per_unit

        # 9. Final Recommendation Logic
        min_launch_score = self._get_setting("launch_now_min_score", 4.0)
        max_launch_risk = self._get_setting("launch_now_max_risk", 2.5)
        
        # If the user left it blank on upload (None), assume they passed. Only fail if explicitly False.
        is_regulatory_passed = sku.regulatory_eligible if sku.regulatory_eligible is not None else True
        is_supply_passed = sku.supply_ready if sku.supply_ready is not None else True
        is_gm_passed = cache.gm_pct >= self._get_setting("gm_floor_pct", 0.35)
        
        # Store booleans in cache for the UI/API to read
        cache.pass_regulatory = is_regulatory_passed
        cache.pass_supply_ready = is_supply_passed
        cache.pass_gm_floor = is_gm_passed
        
        if sku.ip_risk_high or sku.regulatory_prohibition:
            cache.final_recommendation = "Do Not Launch"
            cache.select_for_wave_1 = False
        elif (cache.pass_regulatory and cache.pass_supply_ready and cache.pass_gm_floor and
              cache.weighted_score_layer_b >= min_launch_score and 
              cache.risk_score_layer_d <= max_launch_risk):
            cache.final_recommendation = "Launch Now"
            cache.select_for_wave_1 = True
        else:
            cache.final_recommendation = "Phase Later"
            cache.select_for_wave_1 = False

        return cache
