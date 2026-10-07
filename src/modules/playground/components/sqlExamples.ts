export const SQL_EXAMPLES: Record<string, string> = {
  'Hello World': "SELECT 'Hello, SQL!' AS greeting, 6 * 7 AS answer;",
  'Filter and sort': `CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price INTEGER, stock INTEGER);
INSERT INTO products VALUES (1, 'Keyboard', 80, 4), (2, 'Cable', 12, 0), (3, 'Monitor', 240, 2);
SELECT name, price FROM products WHERE stock > 0 ORDER BY price DESC, id;`,
  'Join and aggregate': `CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), total INTEGER);
INSERT INTO customers VALUES (1, 'Ada'), (2, 'Lin'), (3, 'Sam');
INSERT INTO orders VALUES (1, 1, 50), (2, 1, 30), (3, 2, 20);
SELECT customers.name, COUNT(orders.id) AS orders, COALESCE(SUM(orders.total), 0) AS total
FROM customers LEFT JOIN orders ON customers.id = orders.customer_id
GROUP BY customers.id, customers.name ORDER BY total DESC, customers.id;`,
  'Transactions': `CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER CHECK(balance >= 0));
INSERT INTO accounts VALUES (1, 100), (2, 40);
BEGIN;
UPDATE accounts SET balance = balance - 25 WHERE id = 1;
UPDATE accounts SET balance = balance + 25 WHERE id = 2;
COMMIT;
SELECT id, balance FROM accounts ORDER BY id;`,
  'Window functions': `CREATE TABLE scores (name TEXT, points INTEGER);
INSERT INTO scores VALUES ('Ada', 90), ('Lin', 90), ('Sam', 70);
SELECT name, points, DENSE_RANK() OVER (ORDER BY points DESC) AS rank
FROM scores ORDER BY points DESC, name;`
};
