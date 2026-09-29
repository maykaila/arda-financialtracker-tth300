// ==========================================
// 1. HELPER FUNCTIONS
// ==========================================
function formatCurrency(amount) {
    return '₱' + Math.abs(Number(amount) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

let transactionOptions = {
    categories: [],
    goals: []
};

function updateTransactionTypeFields() {
    const type = document.getElementById('type')?.value;
    const expenseMode = document.getElementById('expense-mode')?.value || 'budget_spend';
    const expenseModeGroup = document.getElementById('expense-mode-group');
    const expenseCategoryGroup = document.getElementById('expense-category-group');
    const expenseGoalGroup = document.getElementById('expense-goal-group');
    const incomeGoalGroup = document.getElementById('income-goal-group');
    const categorySelect = document.getElementById('transaction-category');
    const expenseGoalSelect = document.getElementById('expense-goal-id');

    if (expenseModeGroup) {
        expenseModeGroup.style.display = type === 'expense' ? 'block' : 'none';
    }

    if (expenseCategoryGroup) {
        expenseCategoryGroup.style.display = type === 'expense' && expenseMode === 'budget_spend' ? 'block' : 'none';
    }

    if (expenseGoalGroup) {
        expenseGoalGroup.style.display = type === 'expense' && expenseMode === 'savings_transfer' ? 'block' : 'none';
    }

    if (incomeGoalGroup) {
        incomeGoalGroup.style.display = type === 'income' ? 'block' : 'none';
    }

    if (categorySelect) {
        categorySelect.required = type === 'expense' && expenseMode === 'budget_spend';
    }

    if (expenseGoalSelect) {
        expenseGoalSelect.required = type === 'expense' && expenseMode === 'savings_transfer';
    }
}

async function loadTransactionOptions() {
    const categorySelect = document.getElementById('transaction-category');
    const goalSelect = document.getElementById('income-goal-id');
    const expenseGoalSelect = document.getElementById('expense-goal-id');

    if (!categorySelect && !goalSelect && !expenseGoalSelect) return;

    try {
        const res = await fetch('/api/transaction-options');
        const data = await res.json();
        transactionOptions.categories = Array.isArray(data.categories) ? data.categories : [];
        transactionOptions.goals = Array.isArray(data.goals) ? data.goals : [];

        if (categorySelect) {
            categorySelect.innerHTML = '<option value="">Select category</option>';
            transactionOptions.categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.category_id;
                option.textContent = cat.category_name;
                categorySelect.appendChild(option);
            });
        }

        if (goalSelect) {
            goalSelect.innerHTML = '<option value="">Keep as cash (no goal deposit)</option>';
            transactionOptions.goals.forEach(goal => {
                const option = document.createElement('option');
                option.value = goal.goal_id;
                option.textContent = goal.goal_name;
                goalSelect.appendChild(option);
            });
        }

        if (expenseGoalSelect) {
            expenseGoalSelect.innerHTML = '<option value="">Select savings goal</option>';
            transactionOptions.goals.forEach(goal => {
                const option = document.createElement('option');
                option.value = goal.goal_id;
                option.textContent = goal.goal_name;
                expenseGoalSelect.appendChild(option);
            });
        }

        updateTransactionTypeFields();
    } catch (err) {
        console.error('Error loading transaction options:', err);
    }
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
                const categoryLine = t.category_name ? `<span class="type-label">Category: ${t.category_name}</span>` : '';
                const effectiveExpenseMode = t.expense_mode || 'budget_spend';
                const modeLine = t.type === 'expense'
                    ? `<span class="type-label">Mode: ${effectiveExpenseMode === 'savings_transfer' ? 'Savings Transfer' : 'Budget Spend'}</span>`
                    : '';
                const transferGoalLine = t.transfer_goal_name
                    ? `<span class="type-label">Goal: ${t.transfer_goal_name}</span>`
                    : '';

                item.innerHTML = `
                    <div class="item-info">
                        <span class="desc">${t.description}</span>
                        <span class="type-label">${t.type}</span>
                        ${modeLine}
                        ${categoryLine}
                        ${transferGoalLine}
                    </div>
                    <div class="item-actions">
                        <span class="amount">${sign}${formatCurrency(t.amount)}</span>
                        <button class="action-btn edit" onclick="startEdit('${t.id}', '${t.description.replace(/'/g, "\\'")}', '${t.type}', ${t.amount}, ${t.category_id || 'null'}, '${effectiveExpenseMode}', ${t.transfer_goal_id || 'null'})">Edit</button>
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
    const expenseMode = document.getElementById('expense-mode')?.value || 'budget_spend';
    const categoryId = document.getElementById('transaction-category')?.value || null;
    const expenseGoalId = document.getElementById('expense-goal-id')?.value || null;
    const depositGoalId = document.getElementById('income-goal-id')?.value || null;

    if (!description || !amount) return;

    if (type === 'expense') {
        if (expenseMode === 'budget_spend' && !categoryId) {
            alert('Please select which budget category this expense should be deducted from.');
            return;
        }

        if (expenseMode === 'savings_transfer' && !expenseGoalId) {
            alert('Please select which savings goal this transfer should be deposited to.');
            return;
        }
    }

    const endpoint = id ? `/api/transactions/${id}` : '/api/transactions';
    const method = id ? 'PUT' : 'POST';

    try {
        await fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description,
                type,
                amount,
                category_id: type === 'expense' && expenseMode === 'budget_spend' ? categoryId : null,
                expense_mode: type === 'expense' ? expenseMode : null,
                transferGoalId: type === 'expense' && expenseMode === 'savings_transfer' ? expenseGoalId : null,
                depositGoalId: type === 'income' ? depositGoalId : null
            })
        });
        resetTransactionForm();
        await loadTransactions();
        await loadBudgets();
        await loadGoals();
        await loadAnalytics();
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
        await loadBudgets();
        await loadGoals();
        await loadAnalytics();
    } catch (err) {
        console.error('Error deleting transaction:', err);
    }
}

window.startEdit = function(id, description, type, amount, categoryId, expenseMode, transferGoalId) {
    const editIdInput = document.getElementById('edit-id');
    const descriptionInput = document.getElementById('description');
    const typeSelect = document.getElementById('type');
    const amountInput = document.getElementById('amount');
    const expenseModeSelect = document.getElementById('expense-mode');
    const categorySelect = document.getElementById('transaction-category');
    const expenseGoalSelect = document.getElementById('expense-goal-id');
    const goalSelect = document.getElementById('income-goal-id');
    const submitBtn = document.getElementById('submit-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const formHeading = document.getElementById('form-heading');

    if (editIdInput) editIdInput.value = id;
    if (descriptionInput) descriptionInput.value = description;
    if (typeSelect) typeSelect.value = type;
    if (amountInput) amountInput.value = amount;
    if (expenseModeSelect) expenseModeSelect.value = expenseMode || 'budget_spend';

    updateTransactionTypeFields();

    if (categorySelect) categorySelect.value = categoryId || '';
    if (expenseGoalSelect) expenseGoalSelect.value = transferGoalId || '';
    if (goalSelect) goalSelect.value = '';

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
    const expenseModeSelect = document.getElementById('expense-mode');
    const categorySelect = document.getElementById('transaction-category');
    const expenseGoalSelect = document.getElementById('expense-goal-id');
    const goalSelect = document.getElementById('income-goal-id');

    if (editIdInput) editIdInput.value = '';
    if (expenseModeSelect) expenseModeSelect.value = 'budget_spend';
    if (categorySelect) categorySelect.value = '';
    if (expenseGoalSelect) expenseGoalSelect.value = '';
    if (goalSelect) goalSelect.value = '';
    if (formHeading) formHeading.textContent = 'Add New Transaction';
    if (submitBtn) submitBtn.textContent = 'Add Transaction';
    if (cancelBtn) cancelBtn.style.display = 'none';

    updateTransactionTypeFields();
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
            if (budgets.length === 0) {
                budgetList.innerHTML = '<p class="empty-state">No budget categories yet. Add your first limit to start tracking.</p>';
                return;
            }

            budgets.forEach(b => {
                const spent = parseFloat(b.total_spent) || 0;
                const limit = parseFloat(b.monthly_limit) || 0;
                const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;
                const remaining = limit - spent;

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
                    <div style="display: flex; justify-content: space-between; margin-top: 6px; gap: 8px; align-items: center;">
                        <small>${pct}% used · ${remaining < 0 ? '-' : ''}${formatCurrency(remaining)} left</small>
                        <div>
                            <button class="action-btn edit" onclick="prefillBudgetForm('${b.category_name.replace(/'/g, "\\'")}', ${limit})">Edit</button>
                            <button class="action-btn delete" onclick="deleteBudget(${b.budget_id})">Delete</button>
                        </div>
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
    const categoryName = document.getElementById('budget-category')?.value?.trim();
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

window.prefillBudgetForm = function(categoryName, monthlyLimit) {
    const categoryInput = document.getElementById('budget-category');
    const limitInput = document.getElementById('budget-limit');

    if (categoryInput) categoryInput.value = categoryName;
    if (limitInput) limitInput.value = Number(monthlyLimit) || 0;

    categoryInput?.focus();
};

async function deleteBudget(id) {
    if (!confirm('Delete this budget category?')) return;
    try {
        const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert('Delete failed: ' + (data.error || res.statusText));
            return;
        }
        await loadBudgets();
        if (typeof loadTransactionOptions === 'function') loadTransactionOptions();
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
            if (goals.length === 0) {
                vaultList.innerHTML = '<p class="empty-state">No savings goals yet. Create one to start building progress.</p>';
                return;
            }

            goals.forEach(g => {
                const current = parseFloat(g.current_amount) || 0;
                const target = parseFloat(g.target_amount) || 0;
                const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;
                const escapedName = String(g.goal_name || '').replace(/'/g, "\\'");

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
                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
                        <button class="action-btn" onclick="addFundsToGoal(${g.goal_id}, ${current})">Add Funds</button>
                        <button class="action-btn edit" onclick="startGoalEdit(${g.goal_id}, '${escapedName}', ${target}, ${current})">Edit</button>
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
    const editId = document.getElementById('goal-edit-id')?.value;
    const goalName = document.getElementById('goal-name')?.value?.trim();
    const targetAmount = document.getElementById('goal-target')?.value;
    const currentAmount = document.getElementById('goal-current')?.value || 0;

    if (!goalName || !targetAmount) return;

    try {
        await fetch(editId ? `/api/goals/${editId}` : '/api/goals', {
            method: editId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goalName, targetAmount, currentAmount })
        });
        resetGoalForm();
        await loadGoals();
    } catch (err) {
        console.error('Error saving goal:', err);
    }
}

window.startGoalEdit = function(id, goalName, targetAmount, currentAmount) {
    const editInput = document.getElementById('goal-edit-id');
    const nameInput = document.getElementById('goal-name');
    const targetInput = document.getElementById('goal-target');
    const currentInput = document.getElementById('goal-current');
    const heading = document.getElementById('goal-form-heading');
    const submitBtn = document.getElementById('goal-submit-btn');
    const cancelBtn = document.getElementById('goal-cancel-btn');

    if (editInput) editInput.value = id;
    if (nameInput) nameInput.value = goalName;
    if (targetInput) targetInput.value = targetAmount;
    if (currentInput) currentInput.value = currentAmount;
    if (heading) heading.textContent = 'Edit Goal';
    if (submitBtn) submitBtn.textContent = 'Save Changes';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';

    nameInput?.focus();
};

function resetGoalForm() {
    const form = document.getElementById('goal-form');
    const editInput = document.getElementById('goal-edit-id');
    const heading = document.getElementById('goal-form-heading');
    const submitBtn = document.getElementById('goal-submit-btn');
    const cancelBtn = document.getElementById('goal-cancel-btn');

    form?.reset();
    if (editInput) editInput.value = '';
    if (heading) heading.textContent = 'Create New Goal';
    if (submitBtn) submitBtn.textContent = 'Create Vault';
    if (cancelBtn) cancelBtn.style.display = 'none';
}

window.addFundsToGoal = async function(goalId, currentAmount) {
    const input = prompt('How much do you want to add to this goal?', '0');
    if (input === null) return;

    const amountToAdd = Number(input);
    if (!Number.isFinite(amountToAdd) || amountToAdd <= 0) {
        alert('Please enter a valid amount greater than 0.');
        return;
    }

    const newAmount = (Number(currentAmount) || 0) + amountToAdd;

    try {
        await fetch(`/api/goals/${goalId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentAmount: newAmount })
        });
        await loadGoals();
    } catch (err) {
        console.error('Error adding funds to goal:', err);
    }
};

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
// 5. ANALYTICS (Analytics Screen)
// ==========================================
async function loadAnalytics() {
    const savingsRateDisplay = document.getElementById('analytics-savings-rate');
    const dailyAvgDisplay = document.getElementById('analytics-daily-avg');
    const largestExpenseDisplay = document.getElementById('analytics-largest-expense');
    const distributionTable = document.getElementById('analytics-distribution');
    const cashflowText = document.getElementById('analytics-cashflow-text');
    const topExpenseText = document.getElementById('analytics-top-expense-text');

    if (!savingsRateDisplay && !distributionTable) return;

    try {
        const res = await fetch('/api/analytics');
        const data = await res.json();

        const metrics = data.metrics || {};
        const distribution = Array.isArray(data.distribution) ? data.distribution : [];

        if (savingsRateDisplay) {
            const rate = Number(metrics.savingsRate) || 0;
            savingsRateDisplay.textContent = `${rate.toFixed(1)}%`;
        }

        if (dailyAvgDisplay) {
            dailyAvgDisplay.textContent = formatCurrency(metrics.dailyAvgSpend || 0);
        }

        if (largestExpenseDisplay) {
            largestExpenseDisplay.textContent = formatCurrency(metrics.largestExpense || 0);
        }

        if (distributionTable) {
            distributionTable.innerHTML = `
                <div class="table-row table-head">
                    <span>Category</span>
                    <span>Share</span>
                    <span>Total Spent</span>
                </div>
            `;

            if (distribution.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'table-row';
                empty.innerHTML = '<span>No expenses yet</span><span>0.0%</span><span>₱0.00</span>';
                distributionTable.appendChild(empty);
            } else {
                distribution.forEach(row => {
                    const item = document.createElement('div');
                    item.className = 'table-row';
                    item.innerHTML = `
                        <span>${row.category_name}</span>
                        <span>${(Number(row.share) || 0).toFixed(1)}%</span>
                        <span>${formatCurrency(row.total_spent)}</span>
                    `;
                    distributionTable.appendChild(item);
                });
            }
        }

        if (cashflowText) {
            const netCashFlow = Number(metrics.netCashFlow) || 0;
            const amount = formatCurrency(netCashFlow);
            cashflowText.textContent = netCashFlow >= 0
                ? `Your income is currently outpacing your expenses by ${amount} this cycle.`
                : `Your expenses are currently exceeding your income by ${amount} this cycle.`;
        }

        if (topExpenseText) {
            if (distribution.length === 0) {
                topExpenseText.textContent = 'Add expense transactions with categories to see top spending alerts.';
            } else {
                const top = distribution[0];
                topExpenseText.textContent = `${top.category_name} represents ${(Number(top.share) || 0).toFixed(1)}% of your total outflow.`;
            }
        }
    } catch (err) {
        console.error('Error fetching analytics:', err);
    }
}

// ==========================================
// 6. INITIALIZATION & EVENT BINDINGS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Transaction event listeners (Screen 1)
    const txForm = document.getElementById('transaction-form');
    if (txForm) txForm.addEventListener('submit', saveTransaction);

    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', resetTransactionForm);

    const typeSelect = document.getElementById('type');
    if (typeSelect) typeSelect.addEventListener('change', updateTransactionTypeFields);

    const expenseModeSelect = document.getElementById('expense-mode');
    if (expenseModeSelect) expenseModeSelect.addEventListener('change', updateTransactionTypeFields);

    // Budget event listeners (Screen 2)
    const budgetForm = document.getElementById('budget-form');
    if (budgetForm) budgetForm.addEventListener('submit', saveBudget);

    // Goal event listeners (Screen 3)
    const goalForm = document.getElementById('goal-form');
    if (goalForm) goalForm.addEventListener('submit', saveGoal);

    const goalCancelBtn = document.getElementById('goal-cancel-btn');
    if (goalCancelBtn) goalCancelBtn.addEventListener('click', resetGoalForm);

    // Initial page load checks
    loadTransactionOptions();
    loadTransactions();
    loadBudgets();
    loadGoals();
    loadAnalytics();
});