-- ========================================================
-- FINANCIAL TRACKER (Mapped directly to script.js)
-- ========================================================

CREATE DATABASE IF NOT EXISTS financial_tracker;
USE financial_tracker;

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
    
    -- Creation timestamp for sorting (matches transactions.unshift behavior)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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