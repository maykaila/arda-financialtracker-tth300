// ==========================================
// 1. HELPER FUNCTIONS
// ==========================================
function formatCurrency(amount) {
    return '₱' + Math.abs(Number(amount) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// ==========================================
// 2. TRANSACTIONS CRUD (Tracker Screen)
// ==========================================
async function loadTransactions() {
    const list = document.getElementById('transaction-list');
    const balanceDisplay = document.getElementById('total-balance');
    const incomeDisplay = document.getElementById('total-income');
    const expenseDisplay = document.getElementById('total-expense');

    if (!list && !balanceDisplay) return;

    try {
        const res = await fetch('/api/transactions');
        const data = await res.json();

        // Update Overview Cards (Screen 1)
        if (balanceDisplay && incomeDisplay && expenseDisplay && data.metrics) {
            incomeDisplay.textContent = `+${formatCurrency(data.metrics.income)}`;
            expenseDisplay.textContent = `-${formatCurrency(data.metrics.expense)}`;
            balanceDisplay.textContent = data.metrics.balance < 0 
                ? `-${formatCurrency(data.metrics.balance)}` 
                : formatCurrency(data.metrics.balance);
        }

        // Render List items
        if (list) {
            list.innerHTML = '';
            if (!data.transactions || data.transactions.length === 0) {
                list.innerHTML = '<li class="empty-state">No transactions recorded yet.</li>';
                return;
            }

            data.transactions.forEach(t => {
                const isIncome = t.type === 'income';
                const sign = isIncome ? '+' : '-';
                const item = document.createElement('li');
                item.className = `transaction-item ${t.type}`;

                item.innerHTML = `
                    <div class="item-info">
                        <span class="desc">${t.description}</span>
                        <span class="type-label">${t.type}</span>
                    </div>
                    <div class="item-actions">
                        <span class="amount">${sign}${formatCurrency(t.amount)}</span>
                        <button class="action-btn edit" onclick="startEdit('${t.id}', '${t.description.replace(/'/g, "\\'")}', '${t.type}', ${t.amount})">Edit</button>
                        <button class="action-btn delete" onclick="deleteTransaction('${t.id}')">Delete</button>
                    </div>
                `;
                list.appendChild(item);
            });
        }
    } catch (err) {
        console.error('Error fetching transactions:', err);
    }
}

async function saveTransaction(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id')?.value;
    const description = document.getElementById('description')?.value;
    const type = document.getElementById('type')?.value;
    const amount = document.getElementById('amount')?.value;

    if (!description || !amount) return;

    const endpoint = id ? `/api/transactions/${id}` : '/api/transactions';
    const method = id ? 'PUT' : 'POST';

    try {
        await fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, type, amount })
        });
        resetTransactionForm();
        await loadTransactions();
    } catch (err) {
        console.error('Error saving transaction:', err);
    }
}

async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
        await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
        const editIdInput = document.getElementById('edit-id');
        if (editIdInput && editIdInput.value === id) {
            resetTransactionForm();
        }
        await loadTransactions();
    } catch (err) {
        console.error('Error deleting transaction:', err);
    }
}

window.startEdit = function(id, description, type, amount) {
    const editIdInput = document.getElementById('edit-id');
    const descriptionInput = document.getElementById('description');
    const typeSelect = document.getElementById('type');
    const amountInput = document.getElementById('amount');
    const submitBtn = document.getElementById('submit-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const formHeading = document.getElementById('form-heading');

    if (editIdInput) editIdInput.value = id;
    if (descriptionInput) descriptionInput.value = description;
    if (typeSelect) typeSelect.value = type;
    if (amountInput) amountInput.value = amount;

    if (formHeading) formHeading.textContent = 'Edit Transaction';
    if (submitBtn) submitBtn.textContent = 'Save Changes';
    if (cancelBtn) cancelBtn.style.display = 'block';

    descriptionInput?.focus();
};

function resetTransactionForm() {
    const form = document.getElementById('transaction-form');
    if (form) form.reset();

    const editIdInput = document.getElementById('edit-id');
    const submitBtn = document.getElementById('submit-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const formHeading = document.getElementById('form-heading');

    if (editIdInput) editIdInput.value = '';
    if (formHeading) formHeading.textContent = 'Add New Transaction';
    if (submitBtn) submitBtn.textContent = 'Add Transaction';
    if (cancelBtn) cancelBtn.style.display = 'none';
}

// ==========================================
// 3. BUDGETS CRUD (Monthly Budgets Screen)
// ==========================================
async function loadBudgets() {
    const budgetList = document.getElementById('budget-category-list') || document.querySelector('.active-categories-list');
    const totalLimitDisplay = document.getElementById('budget-total-limit');
    const totalSpentDisplay = document.getElementById('budget-total-spent');
    const remainingDisplay = document.getElementById('budget-remaining');

    if (!budgetList && !totalLimitDisplay) return;

    try {
        const res = await fetch('/api/budgets');
        const budgets = await res.json();

        let totalLimit = 0;
        let totalSpent = 0;

        budgets.forEach(b => {
            totalLimit += parseFloat(b.monthly_limit) || 0;
            totalSpent += parseFloat(b.total_spent) || 0;
        });

        if (totalLimitDisplay) totalLimitDisplay.textContent = formatCurrency(totalLimit);
        if (totalSpentDisplay) totalSpentDisplay.textContent = formatCurrency(totalSpent);
        if (remainingDisplay) {
            const rem = totalLimit - totalSpent;
            remainingDisplay.textContent = rem < 0 ? `-${formatCurrency(rem)}` : formatCurrency(rem);
        }

        if (budgetList) {
            budgetList.innerHTML = '';
            budgets.forEach(b => {
                const spent = parseFloat(b.total_spent) || 0;
                const limit = parseFloat(b.monthly_limit) || 0;
                const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;

                const item = document.createElement('div');
                item.className = 'budget-item';
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <strong>${b.category_name}</strong>
                        <span>${formatCurrency(spent)} / ${formatCurrency(limit)}</span>
                    </div>
                    <div style="background: #fff; height: 16px; border: 2px solid #000; border-radius: 4px; overflow: hidden; position: relative;">
                        <div style="background: ${pct >= 100 ? '#f06292' : '#64b5f6'}; width: ${pct}%; height: 100%;"></div>
                    </div>
                    <div style="text-align: right; margin-top: 4px;">
                        <button class="action-btn delete" onclick="deleteBudget(${b.budget_id})">Delete</button>
                    </div>
                `;
                budgetList.appendChild(item);
            });
        }
    } catch (err) {
        console.error('Error fetching budgets:', err);
    }
}

async function saveBudget(e) {
    e.preventDefault();
    const categoryName = document.getElementById('budget-category')?.value;
    const monthlyLimit = document.getElementById('budget-limit')?.value;

    if (!categoryName || !monthlyLimit) return;

    try {
        await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryName, monthlyLimit })
        });
        document.getElementById('budget-form')?.reset();
        await loadBudgets();
    } catch (err) {
        console.error('Error saving budget:', err);
    }
}

async function deleteBudget(id) {
    if (!confirm('Delete this budget category?')) return;
    try {
        await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
        await loadBudgets();
    } catch (err) {
        console.error('Error deleting budget:', err);
    }
}

// ==========================================
// 4. SAVINGS GOALS CRUD (Savings Goals Screen)
// ==========================================
async function loadGoals() {
    const vaultList = document.getElementById('vault-list') || document.querySelector('.target-vaults-list');
    const savedDisplay = document.getElementById('goal-total-saved');
    const targetDisplay = document.getElementById('goal-total-target');
    const progressDisplay = document.getElementById('goal-total-progress');

    if (!vaultList && !savedDisplay) return;

    try {
        const res = await fetch('/api/goals');
        const goals = await res.json();

        let totalSaved = 0;
        let totalTarget = 0;

        goals.forEach(g => {
            totalSaved += parseFloat(g.current_amount) || 0;
            totalTarget += parseFloat(g.target_amount) || 0;
        });

        const overallProgress = totalTarget > 0 ? ((totalSaved / totalTarget) * 100).toFixed(1) : '0.0';

        if (savedDisplay) savedDisplay.textContent = formatCurrency(totalSaved);
        if (targetDisplay) targetDisplay.textContent = formatCurrency(totalTarget);
        if (progressDisplay) progressDisplay.textContent = `${overallProgress}%`;

        if (vaultList) {
            vaultList.innerHTML = '';
            goals.forEach(g => {
                const current = parseFloat(g.current_amount) || 0;
                const target = parseFloat(g.target_amount) || 0;
                const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;

                const item = document.createElement('div');
                item.className = 'vault-item';
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <strong>${g.goal_name}</strong>
                        <span>${formatCurrency(current)} / ${formatCurrency(target)} (${pct}%)</span>
                    </div>
                    <div style="background: #fff; height: 16px; border: 2px solid #000; border-radius: 4px; overflow: hidden;">
                        <div style="background: ${pct >= 100 ? '#f06292' : '#64b5f6'}; width: ${pct}%; height: 100%;"></div>
                    </div>
                    <div style="text-align: right; margin-top: 4px;">
                        <button class="action-btn delete" onclick="deleteGoal(${g.goal_id})">Delete</button>
                    </div>
                `;
                vaultList.appendChild(item);
            });
        }
    } catch (err) {
        console.error('Error fetching savings goals:', err);
    }
}

async function saveGoal(e) {
    e.preventDefault();
    const goalName = document.getElementById('goal-name')?.value;
    const targetAmount = document.getElementById('goal-target')?.value;
    const currentAmount = document.getElementById('goal-current')?.value || 0;

    if (!goalName || !targetAmount) return;

    try {
        await fetch('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goalName, targetAmount, currentAmount })
        });
        document.getElementById('goal-form')?.reset();
        await loadGoals();
    } catch (err) {
        console.error('Error saving goal:', err);
    }
}

async function deleteGoal(id) {
    if (!confirm('Delete this goal vault?')) return;
    try {
        await fetch(`/api/goals/${id}`, { method: 'DELETE' });
        await loadGoals();
    } catch (err) {
        console.error('Error deleting goal:', err);
    }
}

// ==========================================
// 5. INITIALIZATION & EVENT BINDINGS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Transaction event listeners (Screen 1)
    const txForm = document.getElementById('transaction-form');
    if (txForm) txForm.addEventListener('submit', saveTransaction);

    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', resetTransactionForm);

    // Budget event listeners (Screen 2)
    const budgetForm = document.getElementById('budget-form');
    if (budgetForm) budgetForm.addEventListener('submit', saveBudget);

    // Goal event listeners (Screen 3)
    const goalForm = document.getElementById('goal-form');
    if (goalForm) goalForm.addEventListener('submit', saveGoal);

    // Initial page load checks
    loadTransactions();
    loadBudgets();
    loadGoals();
});