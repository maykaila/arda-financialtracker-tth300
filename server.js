const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve HTML/CSS/JS

// MySQL Connection Pool
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',            // Add your MySQL root password here
    database: 'financial_tracker',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ==========================================
// 1. TRANSACTIONS CRUD (Tracker Screen)
// ==========================================

// READ: Get all transactions + overview metrics
app.get('/api/transactions', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM transactions ORDER BY created_at DESC');
        
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
    const { description, type, amount, category_id } = req.body;
    const id = Date.now().toString();

    try {
        await db.query(
            'INSERT INTO transactions (id, description, type, amount, category_id) VALUES (?, ?, ?, ?, ?)',
            [id, description, type, parseFloat(amount), category_id || null]
        );
        res.status(201).json({ id, description, type, amount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE: Edit transaction
app.put('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    const { description, type, amount } = req.body;

    try {
        await db.query(
            'UPDATE transactions SET description = ?, type = ?, amount = ? WHERE id = ?',
            [description, type, parseFloat(amount), id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Remove transaction
app.delete('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await db.query('DELETE FROM transactions WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
            LEFT JOIN transactions t ON t.category_id = c.category_id AND t.type = 'expense'
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
    try {
        await db.query('DELETE FROM budgets WHERE budget_id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
    const { currentAmount } = req.body;

    try {
        await db.query('UPDATE savings_goals SET current_amount = ? WHERE goal_id = ?', [parseFloat(currentAmount), id]);
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

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});