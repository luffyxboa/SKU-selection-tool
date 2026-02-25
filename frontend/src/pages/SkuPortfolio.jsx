import React, { useState, useEffect } from 'react';
import { Search, Filter, Eye, Edit2, Save, X, Download, TrendingUp, LayoutList, Trash2 } from 'lucide-react';
import api from '../services/api';

const SkuPortfolio = () => {
    const [skus, setSkus] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // View Mode Toggle
    const [viewMode, setViewMode] = useState('scoring'); // 'scoring' | 'financial'

    // Filters
    const [brandFilter, setBrandFilter] = useState('');
    const [marketFilter, setMarketFilter] = useState('');
    const [channelFilter, setChannelFilter] = useState('');

    // Filter options
    const [brands, setBrands] = useState([]);
    const [dbMarkets, setDbMarkets] = useState([]);
    const [channels, setChannels] = useState([]);

    // Modal state
    const [selectedSku, setSelectedSku] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editFormData, setEditFormData] = useState({});
    const [modalTab, setModalTab] = useState('inputs'); // 'inputs' | 'financials'

    // Selection & Export
    const [selectedRows, setSelectedRows] = useState([]);
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 20;

    useEffect(() => {
        fetchSkus();
        fetchMarkets();
    }, []);

    const fetchMarkets = async () => {
        try {
            const res = await api.get('/markets/');
            setDbMarkets(res.data.map(m => m.market_name));
        } catch (err) {
            console.error("Error fetching markets", err);
        }
    };

    const fetchSkus = async () => {
        setLoading(true);
        try {
            const res = await api.get('/skus/');
            const data = res.data;
            setSkus(data);

            const uniqueBrands = [...new Set(data.map(sku => sku.brand).filter(Boolean))].sort();
            setBrands(uniqueBrands);

            const uniqueChannels = [...new Set(data.map(sku => sku.primary_channel).filter(Boolean))].sort();
            setChannels(uniqueChannels);
        } catch (err) {
            console.error("Error fetching SKUs:", err);
            setError("Failed to load SKU data from the database.");
        } finally {
            setLoading(false);
        }
    };

    const filteredSkus = skus.filter(sku => {
        const matchBrand = brandFilter ? sku.brand === brandFilter : true;
        const matchMarket = marketFilter ? sku.target_market === marketFilter : true;
        const matchChannel = channelFilter ? sku.primary_channel === channelFilter : true;
        return matchBrand && matchMarket && matchChannel;
    });

    const totalPages = Math.ceil(filteredSkus.length / rowsPerPage);
    const paginatedSkus = filteredSkus.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedRows(filteredSkus.map(s => s.sku_id));
        } else {
            setSelectedRows([]);
        }
    };

    const handleSelectRow = (skuId) => {
        setSelectedRows(prev =>
            prev.includes(skuId) ? prev.filter(id => id !== skuId) : [...prev, skuId]
        );
    };

    const handleExport = async () => {
        if (selectedRows.length === 0) return;
        setExporting(true);
        try {
            const res = await api.post('/skus/export', selectedRows, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sku_export.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Export error", err);
            setError("Failed to export SKUs.");
        } finally {
            setExporting(false);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedRows.length === 0) return;
        if (!window.confirm(`Are you sure you want to permanently delete exactly ${selectedRows.length} SKUs?`)) return;

        setDeleting(true);
        try {
            await api.post('/skus/delete-bulk', selectedRows);
            // Remove them locally
            setSkus(prev => prev.filter(s => !selectedRows.includes(s.sku_id)));
            setSelectedRows([]);
        } catch (err) {
            console.error("Delete error", err);
            setError("Failed to delete selected SKUs.");
        } finally {
            setDeleting(false);
        }
    };

    const handleViewClick = (sku) => {
        setSelectedSku(sku);
        setIsEditing(false);
        setModalTab('financials'); // Default to insights
    };

    const handleEditClick = (sku) => {
        setSelectedSku(sku);
        setEditFormData({ ...sku });
        setIsEditing(true);
        setModalTab('inputs');
    };

    const handleEditChange = (field, value) => {
        setEditFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveEdit = async () => {
        try {
            setLoading(true);
            const res = await api.put(`/skus/${selectedSku.sku_id}`, editFormData);
            setSkus(prev => prev.map(s => s.sku_id === selectedSku.sku_id ? res.data : s));
            setSelectedSku(null);
            setIsEditing(false);

            const updatedSkus = skus.map(s => s.sku_id === selectedSku.sku_id ? res.data : s);
            const uniqueChannels = [...new Set(updatedSkus.map(sku => sku.primary_channel).filter(Boolean))].sort();
            setChannels(uniqueChannels);
            const uniqueBrands = [...new Set(updatedSkus.map(sku => sku.brand).filter(Boolean))].sort();
            setBrands(uniqueBrands);

        } catch (err) {
            console.error("Error updating SKU:", err);
            setError("Failed to update SKU properties.");
        } finally {
            setLoading(false);
        }
    };

    // Calculate Live Aggregations
    const selectedSkuData = skus.filter(s => selectedRows.includes(s.sku_id));
    const totalRevenue = selectedSkuData.reduce((sum, sku) => sum + (sku.cache?.monthly_revenue || 0), 0);
    const totalVolume = selectedSkuData.reduce((sum, sku) => sum + (sku.cache?.adj_units_base || 0), 0);
    const totalGM = selectedSkuData.reduce((sum, sku) => sum + (sku.cache?.monthly_gm_dollar || 0), 0);
    const blendedGMPct = totalRevenue > 0 ? (totalGM / totalRevenue) * 100 : 0;

    const renderEditableCell = (field, type = 'text') => {
        if (!isEditing) {
            let val = selectedSku[field];
            if (val === true) val = 'Yes';
            if (val === false) val = 'No';
            if (val === null || val === undefined || val === '') val = '-';

            if (field === 'regulatory_eligible' || field === 'supply_ready') {
                return <td style={{ fontWeight: 500, textAlign: 'right', color: selectedSku[field] ? 'var(--success)' : 'inherit' }}>{val}</td>;
            }
            if (field === 'regulatory_prohibition' || field === 'ip_risk_high') {
                return <td style={{ fontWeight: 500, textAlign: 'right', color: selectedSku[field] ? 'var(--danger)' : 'inherit' }}>{val}</td>;
            }
            if (field === 'local_list_price' || field === 'landed_cost') {
                return <td style={{ fontWeight: 500, textAlign: 'right' }}>{val !== '-' ? `$${Number(val).toFixed(2)}` : val}</td>;
            }
            return <td style={{ fontWeight: 500, textAlign: 'right' }}>{val}</td>;
        }

        if (field === 'target_market') {
            return (
                <td style={{ textAlign: 'right' }}>
                    <select className="form-input" style={{ margin: 0, padding: '0.2rem', width: '130px', display: 'inline-block' }} value={editFormData[field] || ''} onChange={(e) => handleEditChange(field, e.target.value)}>
                        <option value="">- Select -</option>
                        {dbMarkets.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </td>
            );
        }

        if (type === 'boolean') {
            return (
                <td style={{ textAlign: 'right' }}>
                    <select className="form-input" style={{ margin: 0, padding: '0.2rem', width: '100px', display: 'inline-block' }} value={editFormData[field] === true ? 'true' : editFormData[field] === false ? 'false' : ''} onChange={(e) => { const val = e.target.value; handleEditChange(field, val === 'true' ? true : val === 'false' ? false : null); }}>
                        <option value="">-</option><option value="true">Yes</option><option value="false">No</option>
                    </select>
                </td>
            );
        }

        return (
            <td style={{ textAlign: 'right' }}>
                <input type={type} className="form-input" style={{ margin: 0, padding: '0.2rem', width: '100px', display: 'inline-block' }} value={editFormData[field] === null || editFormData[field] === undefined ? '' : editFormData[field]} onChange={(e) => { let val = e.target.value; if (type === 'number') val = val === '' ? null : Number(val); handleEditChange(field, val); }} />
            </td>
        );
    };

    if (loading && skus.length === 0) return <div style={{ padding: '2rem' }}>Loading SKUs...</div>;

    const formatMoney = (val) => val != null ? `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
    const formatPct = (val) => val != null ? `${(Number(val) * 100).toFixed(1)}%` : '-';
    const formatNum = (val) => val != null ? Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-';

    return (
        <div style={{ position: 'relative', paddingBottom: selectedRows.length > 0 ? '80px' : '0' }}>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>SKU Portfolio</h2>
                    <p className="text-muted" style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
                        Showing {filteredSkus.length} of {skus.length} imported SKUs.
                        {error && <span style={{ color: 'var(--danger)', marginLeft: '1rem' }}>{error}</span>}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    {/* View Toggles */}
                    <div style={{ display: 'flex', background: 'var(--bg-card)', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                        <button
                            onClick={() => setViewMode('scoring')}
                            style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: viewMode === 'scoring' ? 'var(--bg-main)' : 'transparent', border: 'none', borderRadius: '0.25rem', color: viewMode === 'scoring' ? 'var(--text)' : 'var(--text-muted)', fontWeight: viewMode === 'scoring' ? 600 : 500, cursor: 'pointer' }}
                        >
                            <LayoutList size={16} /> Scoring & Logistics
                        </button>
                        <button
                            onClick={() => setViewMode('financial')}
                            style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: viewMode === 'financial' ? 'var(--primary)' : 'transparent', border: 'none', borderRadius: '0.25rem', color: viewMode === 'financial' ? '#fff' : 'var(--text-muted)', fontWeight: viewMode === 'financial' ? 600 : 500, cursor: 'pointer' }}
                        >
                            <TrendingUp size={16} /> Financial Analytics
                        </button>
                    </div>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', alignItems: 'center' }}>
                        <Filter size={16} color="var(--text-muted)" />
                        <select className="form-input" style={{ margin: 0, padding: '0.3rem', minWidth: '120px' }} value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setCurrentPage(1); }}>
                            <option value="">All Brands</option>{brands.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <select className="form-input" style={{ margin: 0, padding: '0.3rem', minWidth: '120px' }} value={marketFilter} onChange={(e) => { setMarketFilter(e.target.value); setCurrentPage(1); }}>
                            <option value="">All Markets</option>{dbMarkets.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select className="form-input" style={{ margin: 0, padding: '0.3rem', minWidth: '120px' }} value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value); setCurrentPage(1); }}>
                            <option value="">All Channels</option>{channels.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="card">
                {/* Pagination Controls (Top) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-main)', borderTopLeftRadius: '0.5rem', borderTopRightRadius: '0.5rem' }}>
                    <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                        Showing {filteredSkus.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0} to {Math.min(currentPage * rowsPerPage, filteredSkus.length)} of {filteredSkus.length} entries
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                            className="btn btn-outline"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                        >
                            Previous
                        </button>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500, margin: '0 0.5rem' }}>
                            Page {currentPage} of {Math.max(1, totalPages)}
                        </span>
                        <button
                            className="btn btn-outline"
                            disabled={currentPage >= totalPages || totalPages === 0}
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                        >
                            Next
                        </button>
                    </div>
                </div>

                <div className="data-table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}><input type="checkbox" checked={filteredSkus.length > 0 && selectedRows.length === filteredSkus.length} onChange={handleSelectAll} style={{ cursor: 'pointer' }} /></th>
                                <th>SKU ID</th>
                                <th>Name</th>
                                {viewMode === 'scoring' ? (
                                    <>
                                        <th>Brand</th>
                                        <th>Market</th>
                                        <th>Channel</th>
                                        <th>Calculated Score</th>
                                    </>
                                ) : (
                                    <>
                                        <th style={{ textAlign: 'right' }}>List Price</th>
                                        <th style={{ textAlign: 'right' }}>Landed Cost</th>
                                        <th style={{ textAlign: 'right' }}>GM $ (Unit)</th>
                                        <th style={{ textAlign: 'right' }}>GM %</th>
                                        <th style={{ textAlign: 'right' }}>Adj. Vol/Mo</th>
                                        <th style={{ textAlign: 'right' }}>Month Rev</th>
                                    </>
                                )}
                                <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedSkus.length === 0 ? (
                                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>No SKUs match the current filters.</td></tr>
                            ) : (
                                paginatedSkus.map(sku => (
                                    <tr key={sku.sku_id}>
                                        <td><input type="checkbox" checked={selectedRows.includes(sku.sku_id)} onChange={() => handleSelectRow(sku.sku_id)} style={{ cursor: 'pointer' }} /></td>
                                        <td style={{ fontWeight: 500, color: 'var(--primary)' }}>{sku.sku_id}</td>
                                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sku.sku_name}</td>

                                        {viewMode === 'scoring' ? (
                                            <>
                                                <td>{sku.brand || '-'}</td>
                                                <td>{sku.target_market || '-'}</td>
                                                <td>{sku.primary_channel || '-'}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{ width: '40px', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                                            <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, (sku.cache?.channel_weighted_score || sku.cache?.weighted_score_layer_b || 0) * 10))}%`, backgroundColor: 'var(--primary)' }} />
                                                        </div>
                                                        <span style={{ fontWeight: 600 }}>{((sku.cache?.channel_weighted_score || sku.cache?.weighted_score_layer_b) || 0).toFixed(1)}</span>
                                                    </div>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td style={{ textAlign: 'right' }}>{formatMoney(sku.local_list_price)}</td>
                                                <td style={{ textAlign: 'right' }}>{formatMoney(sku.landed_cost)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 500, color: (sku.cache?.gm_dollar_per_unit || 0) > 0 ? 'var(--success)' : 'var(--danger)' }}>{formatMoney(sku.cache?.gm_dollar_per_unit)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatPct(sku.cache?.gm_pct)}</td>
                                                <td style={{ textAlign: 'right' }}>{formatNum(sku.cache?.adj_units_base)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{formatMoney(sku.cache?.monthly_revenue)}</td>
                                            </>
                                        )}

                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                <button className="btn btn-outline" style={{ padding: '0.35rem 0.5rem' }} onClick={() => handleViewClick(sku)} title="View Financials"><Eye size={14} /></button>
                                                <button className="btn btn-outline" style={{ padding: '0.35rem 0.5rem' }} onClick={() => handleEditClick(sku)} title="Edit Configuration"><Edit2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    {/* Pagination Controls */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-main)' }}>
                        <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                            Showing {filteredSkus.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0} to {Math.min(currentPage * rowsPerPage, filteredSkus.length)} of {filteredSkus.length} entries
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button
                                className="btn btn-outline"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                            >
                                Previous
                            </button>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, margin: '0 0.5rem' }}>
                                Page {currentPage} of {Math.max(1, totalPages)}
                            </span>
                            <button
                                className="btn btn-outline"
                                disabled={currentPage >= totalPages || totalPages === 0}
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Live Aggregator Bar (Bottom Docked) */}
            {selectedRows.length > 0 && (
                <div style={{
                    position: 'fixed', bottom: 0, left: '260px', right: 0,
                    backgroundColor: 'var(--bg-card)', borderTop: '2px solid var(--primary)',
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.05)', padding: '1rem 2rem',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 500
                }}>
                    <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
                        <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>SKUs Selected</div><div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedRows.length}</div></div>
                        <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Monthly Vol</div><div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatNum(totalVolume)} <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--text-muted)' }}>units</span></div></div>
                        <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Mo. Revenue</div><div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success)' }}>{formatMoney(totalRevenue)}</div></div>
                        <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Blended GM%</div><div style={{ fontSize: '1.25rem', fontWeight: 700, color: blendedGMPct > 30 ? 'var(--success)' : 'var(--danger)' }}>{blendedGMPct.toFixed(1)}%</div></div>
                        <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total GM$ / Mo</div><div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatMoney(totalGM)}</div></div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', fontSize: '1rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleDeleteSelected} disabled={deleting || exporting}>
                            <Trash2 size={18} /> {deleting ? 'Deleting...' : 'Delete Selected'}
                        </button>
                        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', fontSize: '1rem' }} onClick={handleExport} disabled={exporting || deleting}>
                            <Download size={18} /> {exporting ? 'Exporting...' : 'Export Scenario to Excel'}
                        </button>
                    </div>
                </div>
            )}

            {/* View/Edit Details Modal */}
            {selectedSku && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', padding: 0 }}>
                        <button onClick={() => setSelectedSku(null)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', zIndex: 10 }}>
                            <X size={24} />
                        </button>

                        <div style={{ padding: '2rem 2rem 0 2rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-main)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingRight: '2rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.5rem', width: '100%' }}>
                                    {isEditing ? <input type="text" className="form-input" style={{ fontSize: '1.5rem', fontWeight: 600, padding: '0.2rem 0.5rem', margin: 0, width: '100%' }} value={editFormData.sku_name || ''} onChange={(e) => handleEditChange('sku_name', e.target.value)} /> : selectedSku.sku_name}
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
                                <span><span style={{ color: 'var(--text-muted)' }}>SKU ID:</span> <strong>{selectedSku.sku_id}</strong></span>
                                <span><span style={{ color: 'var(--text-muted)' }}>Market:</span> <strong>{isEditing ? <input type="text" className="form-input" style={{ width: '100px', display: 'inline', padding: '0.1rem 0.3rem' }} value={editFormData.target_market || ''} onChange={(e) => handleEditChange('target_market', e.target.value)} /> : selectedSku.target_market}</strong></span>
                                <span><span style={{ color: 'var(--text-muted)' }}>Channel:</span> <strong>{isEditing ? <input type="text" className="form-input" style={{ width: '100px', display: 'inline', padding: '0.1rem 0.3rem' }} value={editFormData.primary_channel || ''} onChange={(e) => handleEditChange('primary_channel', e.target.value)} /> : selectedSku.primary_channel}</strong></span>
                                {isEditing && (
                                    <button className="btn btn-primary" onClick={handleSaveEdit} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                                        <Save size={14} /> Save Changes
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '1.5rem' }}>
                                <button onClick={() => setModalTab('financials')} style={{ padding: '0.75rem 1rem', background: 'none', border: 'none', borderBottom: modalTab === 'financials' ? '3px solid var(--primary)' : '3px solid transparent', color: modalTab === 'financials' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: modalTab === 'financials' ? 600 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <TrendingUp size={16} /> Advanced Analytics & P&L
                                </button>
                                <button onClick={() => setModalTab('inputs')} style={{ padding: '0.75rem 1rem', background: 'none', border: 'none', borderBottom: modalTab === 'inputs' ? '3px solid var(--primary)' : '3px solid transparent', color: modalTab === 'inputs' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: modalTab === 'inputs' ? 600 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <LayoutList size={16} /> Config & Logic Scores
                                </button>
                            </div>
                        </div>

                        <div style={{ padding: '2rem' }}>
                            {modalTab === 'financials' && (
                                <div>
                                    <h4 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Calculated P&L For Primary Target ({selectedSku.target_market} {selectedSku.primary_channel})</h4>

                                    {/* 4 Block KPIs */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2.5rem' }}>
                                        <div style={{ background: 'var(--bg-main)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>GM Margin %</div>
                                            <div style={{ fontSize: '2rem', fontWeight: 700, color: (selectedSku.cache?.gm_pct || 0) > 0.35 ? 'var(--success)' : 'var(--danger)' }}>{formatPct(selectedSku.cache?.gm_pct)}</div>
                                        </div>
                                        <div style={{ background: 'var(--bg-main)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>GM $ Per Unit</div>
                                            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{formatMoney(selectedSku.cache?.gm_dollar_per_unit)}</div>
                                        </div>
                                        <div style={{ background: 'var(--bg-main)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>Base Est. Volume / Mo</div>
                                            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{formatNum(selectedSku.cache?.adj_units_base)}</div>
                                        </div>
                                        <div style={{ background: 'var(--bg-main)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>Base Est. Revenue / Mo</div>
                                            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>{formatMoney(selectedSku.cache?.monthly_revenue)}</div>
                                        </div>
                                    </div>

                                    {/* Deep Breakdown Tables */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                        <div>
                                            <h5 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Item Economics</h5>
                                            <table style={{ width: '100%', fontSize: '0.875rem' }}>
                                                <tbody>
                                                    <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Local List Price</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(selectedSku.local_list_price)}</td></tr>
                                                    <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Landed Cost (Base)</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(selectedSku.landed_cost)}</td></tr>
                                                    <tr><td colSpan="2"><hr style={{ borderColor: 'var(--border)', margin: '0.5rem 0' }} /></td></tr>
                                                    <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Channel Fit Score (B)</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{((selectedSku.cache?.channel_weighted_score || selectedSku.cache?.weighted_score_layer_b) || 0).toFixed(2)} / 5.0</td></tr>
                                                    <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Synergy Score (C)</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{(selectedSku.cache?.synergy_score_layer_c || 0).toFixed(2)} / 5.0</td></tr>
                                                    <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Risk Score Penalty (D)</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>{(selectedSku.cache?.risk_score_layer_d || 0).toFixed(2)} / 5.0</td></tr>
                                                    <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Demand Risk Factor</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatPct(selectedSku.cache?.risk_factor)}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                        <div>
                                            <h5 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Scenario Offsets</h5>
                                            <table style={{ width: '100%', fontSize: '0.875rem' }}>
                                                <thead>
                                                    <tr><th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Scenario</th><th style={{ textAlign: 'right' }}>Est. Volume</th><th style={{ textAlign: 'right' }}>GM $</th></tr>
                                                </thead>
                                                <tbody>
                                                    <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Worst Case (+20% Price)</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNum(selectedSku.cache?.adj_units_worst)}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(selectedSku.cache?.monthly_gm_worst)}</td></tr>
                                                    <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Base Case</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNum(selectedSku.cache?.adj_units_base)}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(selectedSku.cache?.monthly_gm_base)}</td></tr>
                                                    <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Best Case (-10% Price)</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNum(selectedSku.cache?.adj_units_best)}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(selectedSku.cache?.monthly_gm_best)}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {modalTab === 'inputs' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                    <div>
                                        <h5 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>General Configuration & Inputs</h5>
                                        <table style={{ width: '100%', fontSize: '0.875rem' }}>
                                            <tbody>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Ramp Month</td>{renderEditableCell('ramp_month', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>MOQ</td>{renderEditableCell('moq', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Lead Time (Days)</td>{renderEditableCell('lead_time_days', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Shelf Life (Months)</td>{renderEditableCell('shelf_life_months', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Local List Price (Raw Input)</td>{renderEditableCell('local_list_price', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Landed Cost (Raw Input)</td>{renderEditableCell('landed_cost', 'number')}</tr>
                                            </tbody>
                                        </table>

                                        <h5 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem', marginTop: '2rem' }}>Regulatory & Supply Hurdles</h5>
                                        <table style={{ width: '100%', fontSize: '0.875rem' }}>
                                            <tbody>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Regulatory Eligible</td>{renderEditableCell('regulatory_eligible', 'boolean')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Regulatory Prohibition</td>{renderEditableCell('regulatory_prohibition', 'boolean')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>High IP Risk</td>{renderEditableCell('ip_risk_high', 'boolean')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Supply Ready</td>{renderEditableCell('supply_ready', 'boolean')}</tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    <div>
                                        <h5 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Raw Logic Scores (1 to 5)</h5>
                                        <table style={{ width: '100%', fontSize: '0.875rem' }}>
                                            <tbody>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Consumer Trend</td>{renderEditableCell('score_consumer_trend', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Point of Diff</td>{renderEditableCell('score_point_of_diff', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Channel Suitability</td>{renderEditableCell('score_channel_suitability', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Strategic Role</td>{renderEditableCell('score_strategic_role', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Marketing Leverage</td>{renderEditableCell('score_marketing_leverage', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Price Ladder</td>{renderEditableCell('score_price_ladder', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Usage Occasion</td>{renderEditableCell('score_usage_occasion', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Channel Diff</td>{renderEditableCell('score_channel_diff', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Story Cohesion</td>{renderEditableCell('score_story_cohesion', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Op. Synergy</td>{renderEditableCell('score_operational_synergy', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Reg. Delay Risk</td>{renderEditableCell('score_regulatory_delay', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Retail Listing Risk</td>{renderEditableCell('score_retail_listing', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Competitive Risk</td>{renderEditableCell('score_competitive', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Supply Chain Risk</td>{renderEditableCell('score_supply_chain', 'number')}</tr>
                                                <tr><td style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}>Price War Risk</td>{renderEditableCell('score_price_war', 'number')}</tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SkuPortfolio;
