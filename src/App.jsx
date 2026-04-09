import React, { useState, useMemo, useRef, useEffect } from 'react';
import Chart from 'chart.js/auto';
import { Analytics } from '@vercel/analytics/react';

// ---------- Helper functions ----------
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Math.abs(value));
};

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ---------- Initial Mock Data ----------
const getInitialTransactions = () => [
  { id: 101, date: "2025-03-18", description: "Salary Deposit", category: "Income", amount: 4850.00 },
  { id: 102, date: "2025-03-15", description: "Whole Foods Market", category: "Food", amount: -124.35 },
  { id: 103, date: "2025-03-14", description: "Uber Ride", category: "Transport", amount: -18.50 },
  { id: 104, date: "2025-03-12", description: "Netflix Subscription", category: "Entertainment", amount: -15.99 },
  { id: 105, date: "2025-03-10", description: "Electric Bill", category: "Bills", amount: -89.40 },
  { id: 106, date: "2025-03-08", description: "Weekend Brunch", category: "Food", amount: -47.80 },
  { id: 107, date: "2025-03-05", description: "Freelance Project", category: "Income", amount: 650.00 },
  { id: 108, date: "2025-03-02", description: "Zara Fashion", category: "Shopping", amount: -99.99 },
  { id: 109, date: "2025-02-28", description: "Spotify Premium", category: "Entertainment", amount: -11.99 },
  { id: 110, date: "2025-02-25", description: "Gas Station", category: "Transport", amount: -45.20 },
  { id: 111, date: "2025-02-22", description: "Internet Bill", category: "Bills", amount: -74.99 },
  { id: 112, date: "2025-02-20", description: "Cinema Tickets", category: "Entertainment", amount: -32.50 },
  { id: 113, date: "2025-03-01", description: "Pharmacy", category: "Health", amount: -28.45 }
];

// ---------- Helper to get last 7 days (for time trend) ----------
const getLast7Days = () => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0,10));
  }
  return days;
};

// ---------- Main App Component ----------
function App() {
  // ----- State -----
  const [transactions, setTransactions] = useState(getInitialTransactions());
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("date_desc");
  const [showAddForm, setShowAddForm] = useState(false);
  const [role, setRole] = useState("admin"); // "admin" or "viewer"
  const [newTx, setNewTx] = useState({
    description: "",
    amount: "",
    category: "Food",
    date: new Date().toISOString().slice(0,10),
    type: "expense"
  });
  const [formError, setFormError] = useState("");

  // Chart refs
  const doughnutChartRef = useRef(null);
  const trendChartRef = useRef(null);
  const doughnutCanvas = useRef(null);
  const trendCanvas = useRef(null);

  // ----- Financial Summary -----
  const summary = useMemo(() => {
    if (!transactions.length) return { balance: 0, income: 0, expenses: 0, count: 0 };
    let balance = 0, income = 0, expenses = 0;
    transactions.forEach(tx => {
      balance += tx.amount;
      if (tx.amount > 0) income += tx.amount;
      else if (tx.amount < 0) expenses += Math.abs(tx.amount);
    });
    return { balance, income, expenses, count: transactions.length };
  }, [transactions]);

  // ----- Expense Categories for Doughnut Chart -----
  const expenseCategories = useMemo(() => {
    const map = new Map();
    transactions.forEach(tx => {
      if (tx.amount < 0) {
        const cat = tx.category;
        const val = Math.abs(tx.amount);
        map.set(cat, (map.get(cat) || 0) + val);
      }
    });
    return Array.from(map.entries()).map(([cat, total]) => ({ category: cat, total })).sort((a,b) => b.total - a.total);
  }, [transactions]);

  // ----- Time-based data: last 7 days balance trend -----
  const balanceTrend = useMemo(() => {
    const last7 = getLast7Days();
    const dailyBalance = {};
    last7.forEach(day => { dailyBalance[day] = 0; });
    // accumulate balance per day (running balance is tricky; we compute net sum per day)
    // But for "balance trend" we can show daily net change or cumulative? Better: show daily net (income - expenses)
    transactions.forEach(tx => {
      const txDate = tx.date;
      if (dailyBalance[txDate] !== undefined) {
        dailyBalance[txDate] += tx.amount;
      }
    });
    // convert to array in order
    return last7.map(day => ({ date: day, net: dailyBalance[day] }));
  }, [transactions]);

  // ----- Monthly comparison (current month vs previous month expenses) -----
  const monthlyComparison = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    let currentExpenses = 0;
    let prevExpenses = 0;

    transactions.forEach(tx => {
      if (tx.amount >= 0) return;
      const d = new Date(tx.date);
      const month = d.getMonth();
      const year = d.getFullYear();
      const absAmount = Math.abs(tx.amount);
      if (year === currentYear && month === currentMonth) {
        currentExpenses += absAmount;
      }
      if (year === prevYear && month === prevMonth) {
        prevExpenses += absAmount;
      }
    });

    const percentChange = prevExpenses === 0 
      ? (currentExpenses > 0 ? 100 : 0)
      : ((currentExpenses - prevExpenses) / prevExpenses * 100);
    return {
      currentMonth: currentMonth + 1,
      prevMonth: prevMonth + 1,
      currentExpenses,
      prevExpenses,
      percentChange: percentChange.toFixed(1)
    };
  }, [transactions]);

  // ----- All categories for filter dropdown -----
  const allCategories = useMemo(() => {
    const cats = new Set(transactions.map(tx => tx.category));
    return ["All", ...Array.from(cats).sort()];
  }, [transactions]);

  // ----- Filtered & sorted transactions -----
  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];
    if (categoryFilter !== "All") filtered = filtered.filter(tx => tx.category === categoryFilter);
    if (searchTerm.trim() !== "") {
      const term = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(tx => tx.description.toLowerCase().includes(term));
    }
    if (sortOption === "date_desc") filtered.sort((a,b) => new Date(b.date) - new Date(a.date));
    else if (sortOption === "date_asc") filtered.sort((a,b) => new Date(a.date) - new Date(b.date));
    else if (sortOption === "amount_desc") filtered.sort((a,b) => b.amount - a.amount);
    else if (sortOption === "amount_asc") filtered.sort((a,b) => a.amount - b.amount);
    return filtered;
  }, [transactions, categoryFilter, searchTerm, sortOption]);

  // ----- Chart.js: Doughnut (spending breakdown) -----
  useEffect(() => {
    if (doughnutChartRef.current) doughnutChartRef.current.destroy();
    if (!doughnutCanvas.current) return;
    const ctx = doughnutCanvas.current.getContext('2d');
    if (expenseCategories.length === 0 || transactions.length === 0) {
      ctx.clearRect(0, 0, doughnutCanvas.current.width, doughnutCanvas.current.height);
      return;
    }
    const labels = expenseCategories.map(item => item.category);
    const data = expenseCategories.map(item => item.total);
    doughnutChartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: ['#3b71ca', '#4f9e7a', '#e9b35f', '#d97777', '#8b6cb0', '#5fa7c6', '#e68a2e', '#6c8e6f'],
          borderWidth: 0,
          hoverOffset: 8,
          cutout: '60%',
          borderRadius: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` } }
        }
      }
    });
    return () => { if (doughnutChartRef.current) doughnutChartRef.current.destroy(); };
  }, [expenseCategories, transactions]);

  // ----- Chart.js: Line chart (balance trend over last 7 days) -----
  useEffect(() => {
    if (trendChartRef.current) trendChartRef.current.destroy();
    if (!trendCanvas.current) return;
    const ctx = trendCanvas.current.getContext('2d');
    if (transactions.length === 0) {
      ctx.clearRect(0, 0, trendCanvas.current.width, trendCanvas.current.height);
      return;
    }
    const labels = balanceTrend.map(item => new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const data = balanceTrend.map(item => item.net);
    trendChartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Net Balance Change',
          data: data,
          borderColor: '#3b71ca',
          backgroundColor: 'rgba(59,113,202,0.05)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#2c6e9e',
          pointBorderColor: 'white',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          tooltip: { callbacks: { label: (ctx) => `Net: ${formatCurrency(ctx.raw)}` } },
          legend: { position: 'top' }
        },
        scales: {
          y: { ticks: { callback: (val) => formatCurrency(val) } }
        }
      }
    });
    return () => { if (trendChartRef.current) trendChartRef.current.destroy(); };
  }, [balanceTrend, transactions]);

  // ----- Insights: highest spending category -----
  const highestSpendingCategory = useMemo(() => {
    if (expenseCategories.length === 0) return null;
    return expenseCategories[0];
  }, [expenseCategories]);

  // ----- CRUD (with role check) -----
  const deleteTransaction = (id) => {
    if (role !== "admin") {
      alert("Viewer role cannot delete transactions.");
      return;
    }
    if (window.confirm("Remove this transaction?")) {
      setTransactions(prev => prev.filter(tx => tx.id !== id));
    }
  };

  const resetToMock = () => {
    setTransactions(getInitialTransactions());
    setCategoryFilter("All");
    setSearchTerm("");
    setSortOption("date_desc");
    setShowAddForm(false);
  };

  const clearAllData = () => {
    if (role !== "admin") {
      alert("Viewer role cannot delete all transactions.");
      return;
    }
    if (window.confirm("⚠️ Delete ALL transactions?")) {
      setTransactions([]);
    }
  };

  const handleAddTransaction = (e) => {
    e.preventDefault();
    if (role !== "admin") {
      alert("Only Admin can add transactions.");
      return;
    }
    setFormError("");
    if (!newTx.description.trim()) {
      setFormError("Please enter a description");
      return;
    }
    let amountNum = parseFloat(newTx.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError("Amount must be a positive number");
      return;
    }
    if (!newTx.date) {
      setFormError("Please select a date");
      return;
    }
    const finalAmount = newTx.type === "expense" ? -amountNum : amountNum;
    const finalCategory = newTx.type === "income" ? "Income" : newTx.category;
    const newId = Date.now() + Math.floor(Math.random() * 10000);
    const newTransaction = {
      id: newId,
      date: newTx.date,
      description: newTx.description.trim(),
      category: finalCategory,
      amount: finalAmount
    };
    setTransactions(prev => [newTransaction, ...prev]);
    setNewTx({
      description: "",
      amount: "",
      category: "Food",
      date: new Date().toISOString().slice(0,10),
      type: "expense"
    });
    setShowAddForm(false);
    setFormError("");
  };

  const updateNewTx = (field, value) => {
    setNewTx(prev => ({ ...prev, [field]: value }));
    if (formError) setFormError("");
  };

  return (
    <div className="container-lg px-2 px-lg-3 py-3">
      {/* Header with Role Switcher */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 pb-1">
        <div>
          <h1 className="display-5 fw-bold" style={{ color: '#162b3a', letterSpacing: '-0.3px' }}>
            <i className="bi bi-wallet2 me-2" style={{ color: '#2c6e9e' }}></i>Zorvyn Finance
          </h1>
          <p className="text-secondary-emphasis mt-1 fw-medium">Real-time insights • Track spending patterns</p>
        </div>
        <div className="mt-2 mt-sm-0 d-flex gap-3 align-items-center">
          <div className="role-toggle d-flex">
            <button 
              className={`btn ${role === 'admin' ? 'btn-primary' : 'btn-outline-primary'} btn-sm`}
              onClick={() => setRole('admin')}
            >
              👑 Admin
            </button>
            <button 
              className={`btn ${role === 'viewer' ? 'btn-primary' : 'btn-outline-primary'} btn-sm`}
              onClick={() => setRole('viewer')}
            >
              👁️ Viewer
            </button>
          </div>
          <button onClick={resetToMock} className="btn btn-outline-secondary btn-outline-custom"><i className="bi bi-arrow-repeat me-1"></i>Reset</button>
          <button onClick={clearAllData} className="btn btn-outline-danger btn-outline-custom" disabled={role !== 'admin'}><i className="bi bi-trash me-1"></i>Clear all</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-lg-3">
          <div className="glass-card p-3 h-100">
            <div className="d-flex align-items-center">
              <div className="summary-icon bg-soft-primary me-3"><i className="bi bi-piggy-bank-fill"></i></div>
              <div><span className="text-secondary text-uppercase small fw-semibold">Total Balance</span>
                <h3 className={`fw-bold mb-0 ${summary.balance >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(summary.balance)}</h3>
              </div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="glass-card p-3 h-100">
            <div className="d-flex align-items-center">
              <div className="summary-icon bg-soft-success me-3"><i className="bi bi-graph-up-arrow"></i></div>
              <div><span className="text-secondary text-uppercase small fw-semibold">Income</span><h3 className="fw-bold mb-0 text-success">{formatCurrency(summary.income)}</h3></div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="glass-card p-3 h-100">
            <div className="d-flex align-items-center">
              <div className="summary-icon bg-soft-danger me-3"><i className="bi bi-cart-x-fill"></i></div>
              <div><span className="text-secondary text-uppercase small fw-semibold">Expenses</span><h3 className="fw-bold mb-0 text-danger">{formatCurrency(summary.expenses)}</h3></div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="glass-card p-3 h-100">
            <div className="d-flex align-items-center">
              <div className="summary-icon bg-soft-warning me-3"><i className="bi bi-list-check"></i></div>
              <div><span className="text-secondary text-uppercase small fw-semibold">Transactions</span><h3 className="fw-bold mb-0">{summary.count}</h3></div>
            </div>
          </div>
        </div>
      </div>

      {/* Two charts row: Time trend + Categorical */}
      <div className="row g-4 mb-4">
        <div className="col-md-6">
          <div className="glass-card p-3 p-md-4 h-100">
            <h5 className="fw-semibold mb-3"><i className="bi bi-graph-up me-2"></i>Balance Trend (Last 7 Days)</h5>
            <div className="chart-container">
              {transactions.length === 0 ? (
                <div className="empty-state py-4">No data for trend chart.</div>
              ) : (
                <canvas ref={trendCanvas} style={{ maxHeight: '220px', width: '100%' }}></canvas>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="glass-card p-3 p-md-4 h-100">
            <h5 className="fw-semibold mb-3"><i className="bi bi-pie-chart-fill me-2"></i>Spending Breakdown</h5>
            <div className="chart-container">
              {transactions.length === 0 ? (
                <div className="empty-state py-4">No spending data.</div>
              ) : expenseCategories.length === 0 ? (
                <div className="empty-state py-4">No expense records yet.</div>
              ) : (
                <canvas ref={doughnutCanvas} style={{ maxHeight: '220px', width: '100%' }}></canvas>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Insights Section */}
      <div className="row g-4 mb-4">
        <div className="col-12">
          <div className="glass-card p-3 p-md-4">
            <h5 className="fw-semibold mb-3"><i className="bi bi-lightbulb me-2"></i>Insights</h5>
            <div className="row g-3">
              <div className="col-md-4">
                <div className="insight-badge d-inline-flex align-items-center gap-2 p-2 w-100 justify-content-between">
                  <span>🏆 Highest spending category</span>
                  <strong>{highestSpendingCategory ? `${highestSpendingCategory.category} (${formatCurrency(highestSpendingCategory.total)})` : '—'}</strong>
                </div>
              </div>
              <div className="col-md-4">
                <div className="insight-badge d-inline-flex align-items-center gap-2 p-2 w-100 justify-content-between">
                  <span>📅 Monthly comparison (expenses)</span>
                  <strong className={monthlyComparison.percentChange > 0 ? 'text-danger' : 'text-success'}>
                    {monthlyComparison.currentExpenses === 0 && monthlyComparison.prevExpenses === 0 ? 'No data' : 
                      `${formatCurrency(monthlyComparison.currentExpenses)} vs last month ${formatCurrency(monthlyComparison.prevExpenses)} (${monthlyComparison.percentChange}%)`}
                  </strong>
                </div>
              </div>
              <div className="col-md-4">
                <div className="insight-badge d-inline-flex align-items-center gap-2 p-2 w-100 justify-content-between">
                  <span>💡 Saving rate</span>
                  <strong>{summary.income > 0 ? ((summary.income - summary.expenses)/summary.income * 100).toFixed(0) : 0}%</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Explorer */}
      <div className="row g-4">
        <div className="col-12">
          <div className="glass-card p-3 p-md-4">
            <div className="d-flex justify-content-between align-items-center flex-wrap mb-3">
              <h5 className="fw-semibold mb-2 mb-sm-0"><i className="bi bi-receipt me-2"></i>Transaction Explorer</h5>
              <button 
                onClick={() => setShowAddForm(!showAddForm)} 
                className="btn btn-sm btn-primary rounded-pill px-3"
                disabled={role !== 'admin'}
              >
                <i className="bi bi-plus-circle me-1"></i> {showAddForm ? "Cancel" : "Add transaction"}
              </button>
            </div>

            {showAddForm && role === 'admin' && (
              <div className="add-transaction-form mb-4 p-3 border rounded-4 bg-white shadow-sm">
                <h6 className="mb-3 fw-semibold"><i className="bi bi-pencil-square"></i> New transaction</h6>
                <form onSubmit={handleAddTransaction}>
                  <div className="row g-2">
                    <div className="col-md-6">
                      <input type="text" className="form-control form-control-sm" placeholder="Description *" value={newTx.description} onChange={e => updateNewTx("description", e.target.value)} />
                    </div>
                    <div className="col-md-3">
                      <input type="number" step="0.01" className="form-control form-control-sm" placeholder="Amount *" value={newTx.amount} onChange={e => updateNewTx("amount", e.target.value)} />
                    </div>
                    <div className="col-md-3">
                      <input type="date" className="form-control form-control-sm" value={newTx.date} onChange={e => updateNewTx("date", e.target.value)} />
                    </div>
                    <div className="col-md-4">
                      <select className="form-select form-select-sm" value={newTx.type} onChange={e => updateNewTx("type", e.target.value)}>
                        <option value="expense">💸 Expense</option>
                        <option value="income">💰 Income</option>
                      </select>
                    </div>
                    <div className="col-md-5">
                      <select className="form-select form-select-sm" value={newTx.category} onChange={e => updateNewTx("category", e.target.value)} disabled={newTx.type === "income"}>
                        {newTx.type === "income" ? (<option>Income</option>) : (["Food","Transport","Bills","Entertainment","Shopping","Health","Other"].map(cat => <option key={cat}>{cat}</option>))}
                      </select>
                    </div>
                    <div className="col-md-3 d-flex align-items-end">
                      <button type="submit" className="btn btn-sm btn-success w-100 rounded-pill"><i className="bi bi-check-lg"></i> Add</button>
                    </div>
                  </div>
                  {formError && <div className="text-danger small mt-2"><i className="bi bi-exclamation-triangle"></i> {formError}</div>}
                </form>
              </div>
            )}

            {/* Filters */}
            <div className="row g-2 mb-3">
              <div className="col-md-4">
                <div className="filter-input-group d-flex align-items-center p-1 ps-3">
                  <i className="bi bi-search text-muted"></i>
                  <input type="text" className="form-control border-0 bg-transparent" placeholder="Search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
              </div>
              <div className="col-md-4">
                <select className="form-select form-select-sm rounded-pill" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                  {allCategories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-md-4">
                <select className="form-select form-select-sm rounded-pill" value={sortOption} onChange={e => setSortOption(e.target.value)}>
                  <option value="date_desc">📅 Newest first</option>
                  <option value="date_asc">📅 Oldest first</option>
                  <option value="amount_desc">💰 Highest amount</option>
                  <option value="amount_asc">💰 Lowest amount</option>
                </select>
              </div>
            </div>

            {/* Transaction Table */}
            <div className="scrollable-table">
              {filteredTransactions.length === 0 ? (
                <div className="empty-state">
                  <i className="bi bi-inbox fs-1 text-secondary"></i>
                  <p className="mt-2 fw-medium">No transactions found</p>
                  <small className="text-muted">{transactions.length === 0 ? "Click 'Reset' to load demo data or add a transaction." : "Try adjusting filters."}</small>
                  {transactions.length === 0 && <div className="mt-2"><button className="btn btn-sm btn-outline-primary rounded-pill" onClick={resetToMock}>Load sample data</button></div>}
                </div>
              ) : (
                <table className="table transaction-table table-borderless align-middle mb-0">
                  <thead className="border-bottom">
                    <tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map(tx => (
                      <tr key={tx.id}>
                        <td className="text-muted small">{formatDate(tx.date)}</td>
                        <td className="fw-medium">{tx.description}</td>
                        <td><span className="badge-category">{tx.category}</span></td>
                        <td className={tx.amount >= 0 ? "amount-positive" : "amount-negative"}>
                          {tx.amount >= 0 ? '+' : '-'}{formatCurrency(tx.amount)}
                        </td>
                        <td>
                          <button onClick={() => deleteTransaction(tx.id)} className="btn-icon" disabled={role !== 'admin'}>
                            <i className="bi bi-trash3"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="mt-3 small text-secondary"><i className="bi bi-info-circle"></i> {role === 'admin' ? 'Admin: you can add/delete transactions.' : 'Viewer: read-only mode.'}</div>
          </div>
        </div>
      </div>

      <footer className="text-center mt-5 pt-3 border-top d-flex flex-wrap justify-content-between">
        <span>📊 Zorvyn Screening Dashboard • React + Vite + Chart.js</span>
        <span>⚡ Full RBAC simulation • Time trend • Monthly insights</span>
      </footer>
      <Analytics />
    </div>
  );
}

export default App;
