const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Open the tracker page by default.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'html', 'index.html'));
});

// MySQL Connection Pool
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',            // Add your MySQL root password here
    database: 'financial_tracker',
});

async function ensureSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS transactions (
            id VARCHAR(30) PRIMARY KEY,
            description VARCHAR(255) NOT NULL,
            type ENUM('income', 'expense') NOT NULL,
            amount DECIMAL(12, 2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS categories (
            category_id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS budgets (
            budget_id INT AUTO_INCREMENT PRIMARY KEY,
            category_id INT NOT NULL,
            monthly_limit DECIMAL(12, 2) NOT NULL,
            UNIQUE KEY unique_budget_category (category_id),
            CONSTRAINT fk_budgets_category
                FOREIGN KEY (category_id)
                REFERENCES categories(category_id)
                ON DELETE CASCADE
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS savings_goals (
            goal_id INT AUTO_INCREMENT PRIMARY KEY,
            goal_name VARCHAR(150) NOT NULL,
            target_amount DECIMAL(12, 2) NOT NULL,
            current_amount DECIMAL(12, 2) NOT NULL DEFAULT 0
        )
    `);

    const [columnRows] = await db.query(`
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'transactions'
          AND COLUMN_NAME = 'category_id'
    `);

    const hasCategoryColumn = Number(columnRows[0]?.count || 0) > 0;
    if (!hasCategoryColumn) {
        await db.query('ALTER TABLE transactions ADD COLUMN category_id INT NULL');
    }

    const [modeColumnRows] = await db.query(`
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'transactions'
          AND COLUMN_NAME = 'expense_mode'
    `);

    const hasExpenseModeColumn = Number(modeColumnRows[0]?.count || 0) > 0;
    if (!hasExpenseModeColumn) {
        await db.query("ALTER TABLE transactions ADD COLUMN expense_mode ENUM('budget_spend', 'savings_transfer') NULL");
    }

    const [goalColumnRows] = await db.query(`
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'transactions'
          AND COLUMN_NAME = 'transfer_goal_id'
    `);

    const hasTransferGoalColumn = Number(goalColumnRows[0]?.count || 0) > 0;
    if (!hasTransferGoalColumn) {
        await db.query('ALTER TABLE transactions ADD COLUMN transfer_goal_id INT NULL');
    }

    const [fkRows] = await db.query(`
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'transactions'
          AND CONSTRAINT_NAME = 'fk_transactions_transfer_goal'
    `);

    const hasTransferGoalFk = Number(fkRows[0]?.count || 0) > 0;
    if (!hasTransferGoalFk) {
        await db.query(`
            ALTER TABLE transactions
            ADD CONSTRAINT fk_transactions_transfer_goal
            FOREIGN KEY (transfer_goal_id)
            REFERENCES savings_goals(goal_id)
            ON DELETE SET NULL
        `);
    }
}

// ==========================================
// 1. TRANSACTIONS CRUD (Tracker Screen)
// ==========================================

// READ: Get all transactions + overview metrics
app.get('/api/transactions', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                t.*,
                c.name AS category_name,
                g.goal_name AS transfer_goal_name
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.category_id
            LEFT JOIN savings_goals g ON t.transfer_goal_id = g.goal_id
            ORDER BY t.created_at DESC
        `);
        
        // Calculate metrics
        let income = 0;
        let expense = 0;
        rows.forEach(t => {
            const amt = parseFloat(t.amount);
            if (t.type === 'income') income += amt;
            else if (t.type === 'expense') expense += amt;
        });

        res.json({
            transactions: rows,
            metrics: { income, expense, balance: income - expense }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE: Add new transaction
app.post('/api/transactions', async (req, res) => {
    const { description, type, amount, category_id, depositGoalId, expense_mode, transferGoalId } = req.body;
    const id = Date.now().toString();
    const parsedAmount = parseFloat(amount);
    const parsedCategoryId = category_id ? parseInt(category_id, 10) : null;
    const parsedGoalId = depositGoalId ? parseInt(depositGoalId, 10) : null;
    const parsedTransferGoalId = transferGoalId ? parseInt(transferGoalId, 10) : null;
    const normalizedExpenseMode = type === 'expense' ? (expense_mode || 'budget_spend') : null;

    if (!description || !type || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Invalid transaction payload.' });
    }

    if (type === 'expense') {
        if (!['budget_spend', 'savings_transfer'].includes(normalizedExpenseMode)) {
            return res.status(400).json({ error: 'Invalid expense mode.' });
        }

        if (normalizedExpenseMode === 'budget_spend' && !parsedCategoryId) {
            return res.status(400).json({ error: 'Expense category is required for budget spending.' });
        }

        if (normalizedExpenseMode === 'savings_transfer' && !parsedTransferGoalId) {
            return res.status(400).json({ error: 'Savings goal is required for savings transfer.' });
        }
    }

    const categoryForInsert = type === 'expense' && normalizedExpenseMode === 'budget_spend' ? parsedCategoryId : null;
    const transferGoalForInsert = type === 'expense' && normalizedExpenseMode === 'savings_transfer' ? parsedTransferGoalId : null;
    const modeForInsert = type === 'expense' ? normalizedExpenseMode : null;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await connection.query(
            'INSERT INTO transactions (id, description, type, amount, category_id, expense_mode, transfer_goal_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, description, type, parsedAmount, categoryForInsert, modeForInsert, transferGoalForInsert]
        );

        if (type === 'expense' && normalizedExpenseMode === 'savings_transfer' && transferGoalForInsert) {
            await connection.query(
                'UPDATE savings_goals SET current_amount = current_amount + ? WHERE goal_id = ?',
                [parsedAmount, transferGoalForInsert]
            );
        }

        // Optional: deposit income directly into a savings goal.
        if (type === 'income' && parsedGoalId) {
            await connection.query(
                'UPDATE savings_goals SET current_amount = current_amount + ? WHERE goal_id = ?',
                [parsedAmount, parsedGoalId]
            );
        }

        await connection.commit();

        res.status(201).json({ id, description, type, amount });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// UPDATE: Edit transaction
app.put('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    const { description, type, amount, category_id, expense_mode, transferGoalId } = req.body;
    const parsedAmount = parseFloat(amount);
    const parsedCategoryId = category_id ? parseInt(category_id, 10) : null;
    const parsedTransferGoalId = transferGoalId ? parseInt(transferGoalId, 10) : null;
    const normalizedExpenseMode = type === 'expense' ? (expense_mode || 'budget_spend') : null;

    if (!description || !type || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Invalid transaction payload.' });
    }

    if (type === 'expense') {
        if (!['budget_spend', 'savings_transfer'].includes(normalizedExpenseMode)) {
            return res.status(400).json({ error: 'Invalid expense mode.' });
        }

        if (normalizedExpenseMode === 'budget_spend' && !parsedCategoryId) {
            return res.status(400).json({ error: 'Expense category is required for budget spending.' });
        }

        if (normalizedExpenseMode === 'savings_transfer' && !parsedTransferGoalId) {
            return res.status(400).json({ error: 'Savings goal is required for savings transfer.' });
        }
    }

    const categoryForUpdate = type === 'expense' && normalizedExpenseMode === 'budget_spend' ? parsedCategoryId : null;
    const transferGoalForUpdate = type === 'expense' && normalizedExpenseMode === 'savings_transfer' ? parsedTransferGoalId : null;
    const modeForUpdate = type === 'expense' ? normalizedExpenseMode : null;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [existingRows] = await connection.query('SELECT * FROM transactions WHERE id = ?', [id]);
        if (existingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        const existing = existingRows[0];

        if (existing.type === 'expense' && existing.expense_mode === 'savings_transfer' && existing.transfer_goal_id) {
            await connection.query(
                'UPDATE savings_goals SET current_amount = current_amount - ? WHERE goal_id = ?',
                [parseFloat(existing.amount), existing.transfer_goal_id]
            );
        }

        await connection.query(
            'UPDATE transactions SET description = ?, type = ?, amount = ?, category_id = ?, expense_mode = ?, transfer_goal_id = ? WHERE id = ?',
            [description, type, parsedAmount, categoryForUpdate, modeForUpdate, transferGoalForUpdate, id]
        );

        if (type === 'expense' && normalizedExpenseMode === 'savings_transfer' && transferGoalForUpdate) {
            await connection.query(
                'UPDATE savings_goals SET current_amount = current_amount + ? WHERE goal_id = ?',
                [parsedAmount, transferGoalForUpdate]
            );
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// READ: Form options for categories and savings goals
app.get('/api/transaction-options', async (req, res) => {
    try {
        const [categories] = await db.query(`
            SELECT b.category_id, c.name AS category_name
            FROM budgets b
            JOIN categories c ON b.category_id = c.category_id
            ORDER BY c.name ASC
        `);

        const [goals] = await db.query(`
            SELECT goal_id, goal_name
            FROM savings_goals
            ORDER BY goal_name ASC
        `);

        res.json({ categories, goals });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Remove transaction
app.delete('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [existingRows] = await connection.query('SELECT * FROM transactions WHERE id = ?', [id]);
        if (existingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        const existing = existingRows[0];

        await connection.query('DELETE FROM transactions WHERE id = ?', [id]);

        if (existing.type === 'expense' && existing.expense_mode === 'savings_transfer' && existing.transfer_goal_id) {
            await connection.query(
                'UPDATE savings_goals SET current_amount = current_amount - ? WHERE goal_id = ?',
                [parseFloat(existing.amount), existing.transfer_goal_id]
            );
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// ==========================================
// 2. BUDGETS CRUD (Monthly Budgets Screen)
// ==========================================

// READ: Get all budgets with spent progress
app.get('/api/budgets', async (req, res) => {
    try {
        const query = `
            SELECT 
                b.budget_id,
                b.category_id,
                c.name AS category_name,
                b.monthly_limit,
                COALESCE(SUM(t.amount), 0) AS total_spent,
                (b.monthly_limit - COALESCE(SUM(t.amount), 0)) AS remaining_limit
            FROM budgets b
            JOIN categories c ON b.category_id = c.category_id
            LEFT JOIN transactions t
                ON t.category_id = c.category_id
               AND t.type = 'expense'
               AND (t.expense_mode = 'budget_spend' OR t.expense_mode IS NULL)
            GROUP BY b.budget_id, b.category_id, c.name, b.monthly_limit
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE / UPSERT: Set budget limit
app.post('/api/budgets', async (req, res) => {
    const { categoryName, monthlyLimit } = req.body;

    try {
        // Find or create category
        let [cats] = await db.query('SELECT category_id FROM categories WHERE name = ?', [categoryName]);
        let categoryId;

        if (cats.length === 0) {
            const [insertCat] = await db.query('INSERT INTO categories (name) VALUES (?)', [categoryName]);
            categoryId = insertCat.insertId;
        } else {
            categoryId = cats[0].category_id;
        }

        // Insert or update limit
        await db.query(`
            INSERT INTO budgets (category_id, monthly_limit) 
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)
        `, [categoryId, parseFloat(monthlyLimit)]);

        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Remove budget
app.delete('/api/budgets/:id', async (req, res) => {
    const budgetId = parseInt(req.params.id, 10);
    if (!Number.isInteger(budgetId)) {
        return res.status(400).json({ error: 'Invalid budget ID.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [budgetRows] = await connection.query(
            'SELECT category_id FROM budgets WHERE budget_id = ?',
            [budgetId]
        );

        if (budgetRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Budget not found.' });
        }

        const categoryId = budgetRows[0].category_id;

        // Explicit cleanup (does not rely on FK cascades, which may be missing on older tables).
        // 1. Detach transactions from this category
        await connection.query('UPDATE transactions SET category_id = NULL WHERE category_id = ?', [categoryId]);
        // 2. Remove the budget row
        await connection.query('DELETE FROM budgets WHERE budget_id = ?', [budgetId]);
        // 3. Remove the category itself
        await connection.query('DELETE FROM categories WHERE category_id = ?', [categoryId]);

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// ==========================================
// 3. SAVINGS GOALS CRUD (Savings Goals Screen)
// ==========================================

// READ: Get all goals
app.get('/api/goals', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM savings_goals');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE: Add new goal vault
app.post('/api/goals', async (req, res) => {
    const { goalName, targetAmount, currentAmount } = req.body;

    try {
        const [result] = await db.query(
            'INSERT INTO savings_goals (goal_name, target_amount, current_amount) VALUES (?, ?, ?)',
            [goalName, parseFloat(targetAmount), parseFloat(currentAmount) || 0]
        );
        res.status(201).json({ goal_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE: Add funds or edit goal
app.put('/api/goals/:id', async (req, res) => {
    const { id } = req.params;
    const { goalName, targetAmount, currentAmount } = req.body;

    try {
        const updates = [];
        const values = [];

        if (goalName !== undefined) {
            updates.push('goal_name = ?');
            values.push(goalName);
        }

        if (targetAmount !== undefined) {
            updates.push('target_amount = ?');
            values.push(parseFloat(targetAmount));
        }

        if (currentAmount !== undefined) {
            updates.push('current_amount = ?');
            values.push(parseFloat(currentAmount));
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields provided for update.' });
        }

        values.push(id);
        await db.query(`UPDATE savings_goals SET ${updates.join(', ')} WHERE goal_id = ?`, values);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Remove goal vault
app.delete('/api/goals/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM savings_goals WHERE goal_id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. ANALYTICS (Analytics Screen)
// ==========================================

app.get('/api/analytics', async (req, res) => {
    try {
        const [summaryRows] = await db.query(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
                COALESCE(MAX(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS largest_expense,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END), 0) AS expense_count
            FROM transactions
        `);

        const [distributionRows] = await db.query(`
            SELECT
                COALESCE(c.name, 'Uncategorized') AS category_name,
                SUM(t.amount) AS total_spent
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.category_id
                        WHERE t.type = 'expense'
                            AND (t.expense_mode = 'budget_spend' OR t.expense_mode IS NULL)
            GROUP BY COALESCE(c.name, 'Uncategorized')
            ORDER BY total_spent DESC
        `);

        const summary = summaryRows[0] || {
            total_income: 0,
            total_expense: 0,
            largest_expense: 0,
            expense_count: 0
        };

        const totalIncome = parseFloat(summary.total_income) || 0;
        const totalExpense = parseFloat(summary.total_expense) || 0;
        const largestExpense = parseFloat(summary.largest_expense) || 0;
        const expenseCount = Number(summary.expense_count) || 0;

        const savingsRate = totalIncome > 0
            ? ((totalIncome - totalExpense) / totalIncome) * 100
            : 0;

        const dailyAvgSpend = expenseCount > 0 ? totalExpense / expenseCount : 0;

        const distribution = distributionRows.map(row => {
            const spent = parseFloat(row.total_spent) || 0;
            return {
                category_name: row.category_name,
                total_spent: spent,
                share: totalExpense > 0 ? (spent / totalExpense) * 100 : 0
            };
        });

        res.json({
            metrics: {
                savingsRate,
                dailyAvgSpend,
                largestExpense,
                totalIncome,
                totalExpense,
                netCashFlow: totalIncome - totalExpense
            },
            distribution
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
(async () => {
    try {
        await ensureSchema();
        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Failed to initialize database schema:', err.message);
        process.exit(1);
    }
})();