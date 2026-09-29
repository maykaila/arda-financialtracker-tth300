-- ========================================================
-- FINANCIAL TRACKER (Mapped directly to script.js)
-- ========================================================

CREATE DATABASE IF NOT EXISTS financial_tracker;
USE financial_tracker;

DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS savings_goals;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS transactions;

-- --------------------------------------------------------
-- TRANSACTIONS TABLE
-- Mirrors: { id: Date.now().toString(), description, type, amount }
-- --------------------------------------------------------
CREATE TABLE transactions (
    -- Matches Date.now().toString() generated in JavaScript
    id VARCHAR(30) PRIMARY KEY,
    
    -- Maps to descriptionInput (trimmed string)
    description VARCHAR(255) NOT NULL,
    
    -- Matches JS lowercase values: 'income' and 'expense'
    type ENUM('income', 'expense') NOT NULL,
    
    -- Maps to parseFloat(amount) with 2-decimal currency precision
    amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),

    -- Optional category reference for budgets and analytics grouping
    category_id INT NULL,

    -- Distinguishes expense usage for reporting and budget effects
    expense_mode ENUM('budget_spend', 'savings_transfer') NULL,

    -- Savings goal target for expense transfers
    transfer_goal_id INT NULL,
    
    -- Creation timestamp for sorting (matches transactions.unshift behavior)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------
-- CATEGORIES TABLE
-- Used by budgets and optional transaction tagging
-- --------------------------------------------------------
CREATE TABLE categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

-- --------------------------------------------------------
-- BUDGETS TABLE
-- One monthly limit per category
-- --------------------------------------------------------
CREATE TABLE budgets (
    budget_id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    monthly_limit DECIMAL(12, 2) NOT NULL CHECK (monthly_limit >= 0),
    UNIQUE KEY unique_budget_category (category_id),
    CONSTRAINT fk_budgets_category
        FOREIGN KEY (category_id)
        REFERENCES categories(category_id)
        ON DELETE CASCADE
);

-- --------------------------------------------------------
-- SAVINGS GOALS TABLE
-- Stores target and current saved amounts
-- --------------------------------------------------------
CREATE TABLE savings_goals (
    goal_id INT AUTO_INCREMENT PRIMARY KEY,
    goal_name VARCHAR(150) NOT NULL,
    target_amount DECIMAL(12, 2) NOT NULL CHECK (target_amount >= 0),
    current_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0)
);

ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_category
    FOREIGN KEY (category_id)
    REFERENCES categories(category_id)
    ON DELETE SET NULL;

ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_transfer_goal
    FOREIGN KEY (transfer_goal_id)
    REFERENCES savings_goals(goal_id)
    ON DELETE SET NULL;

-- ========================================================
-- SQL EQUIVALENTS OF script.js FUNCTIONS
-- ========================================================

-- 1. createTransaction(description, type, amount)
-- Example:
-- INSERT INTO transactions (id, description, type, amount)
-- VALUES ('1727600000000', 'Freelance Project', 'income', 5000.00);

-- 2. render() / Read all transactions
-- unshift() puts the newest first, so we order by created_at DESC:
-- SELECT id, description, type, amount FROM transactions ORDER BY created_at DESC;

-- 3. updateTransaction(id, description, type, amount)
-- UPDATE transactions 
-- SET description = 'Updated description', type = 'expense', amount = 150.00 
-- WHERE id = '1727600000000';

-- 4. deleteTransaction(id)
-- DELETE FROM transactions WHERE id = '1727600000000';


-- ========================================================
-- METRICS VIEW (Replaces updateMetrics() in script.js)
-- Computes total-income, total-expense, and total-balance
-- ========================================================
CREATE OR REPLACE VIEW view_metrics AS
SELECT 
    -- incomeDisplay: total income
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0.00) AS total_income,
    
    -- expenseDisplay: total expense
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0.00) AS total_expense,
    
    -- balanceDisplay: income - expense
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0.00) AS total_balance
FROM transactions;


-- ========================================================
-- SAMPLE SEED DATA
-- ========================================================
INSERT INTO transactions (id, description, type, amount) VALUES 
('1727601200001', 'Monthly Salary', 'income', 3200.00),
('1727601200002', 'Grocery Run', 'expense', 420.00),
('1727601200003', 'Internet Bill', 'expense', 120.00);

INSERT INTO categories (name) VALUES
('Groceries'),
('Utilities');

UPDATE transactions t
JOIN categories c ON c.name = 'Groceries'
SET t.category_id = c.category_id
WHERE t.description = 'Grocery Run';

UPDATE transactions t
JOIN categories c ON c.name = 'Utilities'
SET t.category_id = c.category_id
WHERE t.description = 'Internet Bill';

INSERT INTO budgets (category_id, monthly_limit)
SELECT category_id, 1000.00
FROM categories
WHERE name = 'Groceries'
UNION ALL
SELECT category_id, 500.00
FROM categories
WHERE name = 'Utilities';

INSERT INTO savings_goals (goal_name, target_amount, current_amount) VALUES
('Emergency Fund', 10000.00, 2500.00),
('Laptop Upgrade', 5000.00, 750.00);