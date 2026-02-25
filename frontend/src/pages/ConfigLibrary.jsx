import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import api from '../services/api';

const ConfigLibrary = () => {
    const [activeTab, setActiveTab] = useState('settings');

    // Data State
    const [settings, setSettings] = useState({});
    const [markets, setMarkets] = useState([]);
    const [marketChannels, setMarketChannels] = useState({}); // { market_name: [channels...] }

    // UI State
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    // Selection State
    const [selectedMarket, setSelectedMarket] = useState('');
    const [selectedChannel, setSelectedChannel] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [settingsRes, marketsRes] = await Promise.all([
                api.get('/settings/'),
                api.get('/markets/')
            ]);

            setSettings(settingsRes.data);
            setMarkets(marketsRes.data);

            if (marketsRes.data.length > 0) {
                const firstMarket = marketsRes.data[0].market_name;
                setSelectedMarket(firstMarket);
                await fetchMarketChannels(firstMarket);
            }

        } catch (error) {
            console.error("Error fetching config:", error);
            setMessage({ text: 'Failed to load configuration data.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const fetchMarketChannels = async (marketName) => {
        try {
            const res = await api.get(`/markets/${marketName}/channels`);
            setMarketChannels(prev => ({ ...prev, [marketName]: res.data }));
            if (res.data.length > 0) {
                setSelectedChannel(res.data[0].channel);
            }
        } catch (error) {
            console.error("Error fetching market channels:", error);
        }
    };

    const handleMarketSelect = async (marketName) => {
        setSelectedMarket(marketName);
        if (!marketChannels[marketName]) {
            await fetchMarketChannels(marketName);
        } else if (marketChannels[marketName].length > 0) {
            setSelectedChannel(marketChannels[marketName][0].channel);
        }
    };

    const handleSettingChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
    };

    const handleMarketChange = (marketName, field, value) => {
        setMarkets(prev => prev.map(m => {
            if (m.market_name === marketName) {
                return { ...m, [field]: field === 'currency' ? value : (parseFloat(value) || 0) };
            }
            return m;
        }));
    };

    const handleChannelChange = (marketName, channelIndex, field, value) => {
        setMarketChannels(prev => {
            const updatedMarket = [...prev[marketName]];
            updatedMarket[channelIndex] = { ...updatedMarket[channelIndex], [field]: parseFloat(value) || 0 };
            return { ...prev, [marketName]: updatedMarket };
        });
    };

    const saveSettings = async () => {
        setSaving(true);
        setMessage({ text: '', type: '' });
        try {
            await api.put('/settings/', settings);
            setMessage({ text: 'Global settings updated successfully.', type: 'success' });
        } catch (error) {
            setMessage({ text: 'Failed to update settings.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const saveMarkets = async () => {
        setSaving(true);
        setMessage({ text: '', type: '' });
        try {
            await Promise.all(markets.map(m =>
                api.put(`/markets/${m.market_name}`, m)
            ));
            setMessage({ text: 'Market economics updated successfully.', type: 'success' });
        } catch (error) {
            setMessage({ text: 'Failed to update markets.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const saveChannels = async () => {
        setSaving(true);
        setMessage({ text: '', type: '' });
        try {
            if (marketChannels[selectedMarket]) {
                await Promise.all(marketChannels[selectedMarket].map(c =>
                    api.put(`/markets/${selectedMarket}/channels/${c.channel}`, c)
                ));
                setMessage({ text: `${selectedMarket} channels updated successfully.`, type: 'success' });
            }
        } catch (error) {
            setMessage({ text: 'Failed to update channels.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // Helper to categorize Global Settings
    const categorizeSetting = (key) => {
        if (key.endsWith('_weight')) return 'Scoring Weights (Layers B, C, D)';
        if (key.startsWith('scenario_')) return 'Scenario Multipliers (Base, Best, Worst)';
        if (['global_risk_floor', 'global_risk_slope', 'price_elasticity_abs', 'target_competitor_index', 'risk_penalty_cap', 'global_price_adjustment_pct', 'listing_breadth_index'].includes(key)) return 'Risk & Demand Factors';
        return 'Financials & Pass Thresholds';
    };

    const groupedSettings = Object.entries(settings).reduce((acc, [key, val]) => {
        const cat = categorizeSetting(key);
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push({ key, val });
        return acc;
    }, {});

    Object.values(groupedSettings).forEach(arr => arr.sort((a, b) => a.key.localeCompare(b.key)));

    const formatLabel = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    if (loading) return <div style={{ padding: '2rem' }}>Loading Configuration...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h2 className="page-title">Configuration Library</h2>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Manage 3-Tier Multi-Dimensional Configuration (Global → Market → Channel → Category)
                    </p>
                </div>
            </div>

            {message.text && (
                <div style={{
                    marginBottom: '1.5rem', padding: '1rem', borderRadius: '0.5rem',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    backgroundColor: message.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                    color: message.type === 'success' ? 'var(--success)' : 'var(--danger)'
                }}>
                    {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    {message.text}
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                <button
                    onClick={() => setActiveTab('settings')}
                    className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                    style={{
                        padding: '0.75rem 1rem', background: 'none', border: 'none',
                        borderBottom: activeTab === 'settings' ? '2px solid var(--primary)' : '2px solid transparent',
                        color: activeTab === 'settings' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'settings' ? 600 : 500, cursor: 'pointer'
                    }}
                >
                    Global Settings
                </button>
                <button
                    onClick={() => setActiveTab('markets')}
                    style={{
                        padding: '0.75rem 1rem', background: 'none', border: 'none',
                        borderBottom: activeTab === 'markets' ? '2px solid var(--primary)' : '2px solid transparent',
                        color: activeTab === 'markets' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'markets' ? 600 : 500, cursor: 'pointer'
                    }}
                >
                    Market Economics
                </button>
                <button
                    onClick={() => setActiveTab('channels')}
                    style={{
                        padding: '0.75rem 1rem', background: 'none', border: 'none',
                        borderBottom: activeTab === 'channels' ? '2px solid var(--primary)' : '2px solid transparent',
                        color: activeTab === 'channels' ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'channels' ? 600 : 500, cursor: 'pointer'
                    }}
                >
                    Channel Data Matrix
                </button>
            </div>

            <div className="card">
                {/* 1. Global Settings Tab */}
                {activeTab === 'settings' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>System-Wide Fallbacks</h3>
                            <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
                                <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                            {['Scoring Weights (Layers B, C, D)', 'Scenario Multipliers (Base, Best, Worst)', 'Risk & Demand Factors', 'Financials & Pass Thresholds'].map(category => (
                                groupedSettings[category] && groupedSettings[category].length > 0 && (
                                    <div key={category}>
                                        <h4 style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>{category}</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                                            {groupedSettings[category].map(({ key, val }) => (
                                                <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                                                    <label className="form-label">{formatLabel(key)}</label>
                                                    <input
                                                        type="number" step="0.01" className="form-input" value={val}
                                                        onChange={(e) => handleSettingChange(key, e.target.value)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                )}

                {/* 2. Market Economics Tab */}
                {activeTab === 'markets' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Country-Level Economics (Taxes & Freight)</h3>
                            <button className="btn btn-primary" onClick={saveMarkets} disabled={saving}>
                                <Save size={16} /> {saving ? 'Saving...' : 'Save Markets'}
                            </button>
                        </div>
                        <div className="data-table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Market Name</th>
                                        <th>Currency</th>
                                        <th>Price Multiplier</th>
                                        <th>Import Freight %</th>
                                        <th>Duties & Taxes %</th>
                                        <th>DOC Distributor</th>
                                        <th>DOC Retail</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {markets.map((m, i) => (
                                        <tr key={m.market_name}>
                                            <td style={{ fontWeight: 600 }}>{m.market_name}</td>
                                            <td><input type="text" className="form-input" style={{ width: '80px' }} value={m.currency} onChange={e => handleMarketChange(m.market_name, 'currency', e.target.value)} /></td>
                                            <td><input type="number" step="0.01" className="form-input" value={m.price_multiplier} onChange={e => handleMarketChange(m.market_name, 'price_multiplier', e.target.value)} /></td>
                                            <td><input type="number" step="0.01" className="form-input" value={m.import_freight_pct} onChange={e => handleMarketChange(m.market_name, 'import_freight_pct', e.target.value)} /></td>
                                            <td><input type="number" step="0.01" className="form-input" value={m.duties_taxes_pct} onChange={e => handleMarketChange(m.market_name, 'duties_taxes_pct', e.target.value)} /></td>
                                            <td><input type="number" step="1" className="form-input" value={m.doc_distributor} onChange={e => handleMarketChange(m.market_name, 'doc_distributor', e.target.value)} /></td>
                                            <td><input type="number" step="1" className="form-input" value={m.doc_retail} onChange={e => handleMarketChange(m.market_name, 'doc_retail', e.target.value)} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 3. Market-Channel Data Matrix */}
                {activeTab === 'channels' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <h3 style={{ margin: 0 }}>Matrix Data For:</h3>
                                <select
                                    className="form-input"
                                    style={{ width: '200px', fontWeight: 'bold' }}
                                    value={selectedMarket}
                                    onChange={(e) => handleMarketSelect(e.target.value)}
                                >
                                    {markets.map(m => (
                                        <option key={m.market_name} value={m.market_name}>{m.market_name}</option>
                                    ))}
                                </select>
                            </div>
                            <button className="btn btn-primary" onClick={saveChannels} disabled={saving}>
                                <Save size={16} /> {saving ? 'Saving...' : `Save ${selectedMarket} Channels`}
                            </button>
                        </div>

                        {selectedMarket && marketChannels[selectedMarket] ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {marketChannels[selectedMarket].map((channel, i) => (
                                    <div key={channel.channel} style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                        <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                                            {channel.channel} Channel Metrics
                                        </div>
                                        <div style={{ padding: '1.5rem' }}>
                                            <h5 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-muted)' }}>Performance Drivers</h5>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                                                <div className="form-group"><label className="form-label">Base Units/Mo</label><input type="number" className="form-input" value={channel.base_units_month} onChange={e => handleChannelChange(selectedMarket, i, 'base_units_month', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">Channel Weight</label><input type="number" step="0.01" className="form-input" value={channel.channel_weight} onChange={e => handleChannelChange(selectedMarket, i, 'channel_weight', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">Adoption Rate</label><input type="number" step="0.01" className="form-input" value={channel.retail_adoption_rate} onChange={e => handleChannelChange(selectedMarket, i, 'retail_adoption_rate', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">Marketing Lift</label><input type="number" step="0.01" className="form-input" value={channel.marketing_lift} onChange={e => handleChannelChange(selectedMarket, i, 'marketing_lift', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">Competitor Idx</label><input type="number" step="0.01" className="form-input" value={channel.competitor_activity_idx} onChange={e => handleChannelChange(selectedMarket, i, 'competitor_activity_idx', e.target.value)} /></div>
                                            </div>

                                            <h5 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-muted)' }}>Cost-To-Serve (CTS) Breakdown</h5>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                                <div className="form-group"><label className="form-label">Commission %</label><input type="number" step="0.01" className="form-input" value={channel.commission_pct} onChange={e => handleChannelChange(selectedMarket, i, 'commission_pct', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">Fulfillment %</label><input type="number" step="0.01" className="form-input" value={channel.fulfillment_pct} onChange={e => handleChannelChange(selectedMarket, i, 'fulfillment_pct', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">COD Surcharge %</label><input type="number" step="0.01" className="form-input" value={channel.cod_pct} onChange={e => handleChannelChange(selectedMarket, i, 'cod_pct', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">Returns %</label><input type="number" step="0.01" className="form-input" value={channel.returns_allowance_pct} onChange={e => handleChannelChange(selectedMarket, i, 'returns_allowance_pct', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">Listing Fees %</label><input type="number" step="0.01" className="form-input" value={channel.listing_fees_pct} onChange={e => handleChannelChange(selectedMarket, i, 'listing_fees_pct', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">Trade Terms %</label><input type="number" step="0.01" className="form-input" value={channel.trade_terms_pct} onChange={e => handleChannelChange(selectedMarket, i, 'trade_terms_pct', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">Rebates %</label><input type="number" step="0.01" className="form-input" value={channel.rebates_pct} onChange={e => handleChannelChange(selectedMarket, i, 'rebates_pct', e.target.value)} /></div>
                                                <div className="form-group"><label className="form-label">Promo Accrual %</label><input type="number" step="0.01" className="form-input" value={channel.promo_accrual_pct} onChange={e => handleChannelChange(selectedMarket, i, 'promo_accrual_pct', e.target.value)} /></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                Select a Market to view its Channel Matrix.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConfigLibrary;
