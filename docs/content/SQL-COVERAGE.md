# SQL exercise coverage — 7 October 2026

All 100 additions are executable SQLite questions in `stage-7`, the existing Databases & SQL stage on the Developer path. Each uses two separately initialized datasets. Frozen, independently computed expected rows are in `src/modules/challenges/authoring/sql-expected.json`; reference queries and explanations are in `sql-exercises.ts`.

| ID | Title | Reading topic | Difficulty | Task |
| --- | --- | --- | --- | --- |
| stage-7-d01 | Project two product columns | select | easy | Return product id and name, ordered by id ascending. |
| stage-7-d02 | Affordable products | where | easy | Return name and price for products costing less than 30, ordered by price then id ascending. |
| stage-7-d03 | Available technology | where | easy | Return id and name of tech products with stock greater than zero, ordered by id. |
| stage-7-d04 | An inclusive price band | where | easy | Return id and price where price is between 5 and 80 inclusive, ordered by id. |
| stage-7-d05 | Two chosen categories | in | easy | Return id and category for paper or furniture products, ordered by id. |
| stage-7-d06 | Exclude technology | where | easy | Return id and name for products whose category is not tech, ordered by id. |
| stage-7-d07 | Largest prices first | order-by | easy | Return name and price for all products, ordered by price descending then id ascending. |
| stage-7-d08 | The two cheapest products | order-by | easy | Return id and price for the two cheapest products, breaking equal prices by id ascending. |
| stage-7-d09 | The second most expensive | order-by | easy | Return id and price for the second row when products are sorted by price descending and id ascending. |
| stage-7-d10 | Unique categories | distinct | easy | Return each distinct product category once, in alphabetical order. |
| stage-7-d11 | Unknown stock | null | easy | Return id and name for products with unknown (NULL) stock, ordered by id. |
| stage-7-d12 | Sold out is not unknown | null | easy | Return id and name only for products with stock exactly zero, ordered by id. Do not include unknown stock. |
| stage-7-d13 | Default missing stock | null | easy | Return id and stock for every product, displaying unknown stock as zero, ordered by id. |
| stage-7-d14 | Uppercase product names | sql-strings | easy | Return id and uppercase name for every product, ordered by id. |
| stage-7-d15 | Names containing a | sql-strings | easy | Return id and name for products whose ASCII name contains a, case-insensitively, ordered by id. |
| stage-7-d16 | Measure name length | sql-strings | easy | Return id and character length of each product name, ordered by id. |
| stage-7-d17 | Stock value per product | select | easy | Return id and price multiplied by stock, treating unknown stock as zero, ordered by id. |
| stage-7-d18 | Classify price bands | sql-case | medium | Return id and a band: 'budget' below 10, 'standard' from 10 through 99, otherwise 'premium'. Order by id. |
| stage-7-d19 | Count known stock values | count | easy | Return one row containing the number of products and the number with non-NULL stock, in that order. |
| stage-7-d20 | Summarize product prices | aggregates | easy | Return one row containing minimum price, maximum price and sum of all prices, in that order. |
| stage-7-d21 | Count products by category | group-by | easy | Return category and product count for each category, ordered by category. |
| stage-7-d22 | Categories with expensive stock | having | medium | Return category and sum of prices only for categories whose sum exceeds 100, ordered by category. Sum price, not inventory value. |
| stage-7-d23 | Average category price | aggregates | medium | Return category and average price rounded to two decimal places, ordered by category. |
| stage-7-d24 | Inventory units by category | aggregates | easy | Return category and total known stock, treating unknown stock as zero, ordered by category. |
| stage-7-d25 | Cities with assigned staff | null | easy | Return distinct non-NULL employee cities in alphabetical order. |
| stage-7-d26 | Employee salary range | where | easy | Return id and name of employees earning at least 80, ordered by id. |
| stage-7-d27 | Unassigned employees | null | easy | Return id and name of employees without a department, ordered by id. |
| stage-7-d28 | Top-level managers | null | easy | Return id and name of employees whose manager_id is NULL, ordered by id. |
| stage-7-d29 | Salary totals by department | group-by | medium | Return department_id and salary total for assigned employees only, ordered by department_id. |
| stage-7-d30 | Multi-person departments | having | medium | Return department_id and employee count for assigned departments with at least two employees, ordered by department_id. |
| stage-7-d31 | Give missing cities a label | null | easy | Return id and city for each employee, using 'Unknown' for NULL, ordered by id. |
| stage-7-d32 | Employees hired during 2024 | sql-dates | easy | Return id and hired_at for dates in calendar year 2024, ordered by id. |
| stage-7-d33 | Extract hire year | sql-dates | easy | Return id and hire year as text for each employee, ordered by id. |
| stage-7-d34 | Annualize salaries | select | easy | Treat salary as a monthly amount. Return id and salary multiplied by 12, ordered by id. |
| stage-7-d35 | Compare with company average | subquery | medium | Return id and salary for employees earning strictly more than the company average, ordered by id. |
| stage-7-d36 | Departments with names | inner-join | medium | Return employee id, employee name and department name for assigned employees, ordered by employee id. |
| stage-7-d37 | Keep unassigned employees | left-join | medium | Return every employee's id and department name, using 'Unassigned' when no department matches. Order by employee id. |
| stage-7-d38 | Include empty departments | left-join | medium | Return department name and employee count for every department, including empty ones, ordered by department id. |
| stage-7-d39 | Find each reporting manager | join | medium | Return employee id and manager name only for employees with a manager, ordered by employee id. |
| stage-7-d40 | Count direct reports | join | medium | Return manager id and number of direct reports, including only managers with at least one report, ordered by manager id. |
| stage-7-d41 | Paid order lines | where | easy | Return id and quantity for orders with status 'paid', ordered by id. |
| stage-7-d42 | Order totals at catalog prices | join | medium | Return order id and quantity multiplied by current product price for every order, ordered by order id. Include all statuses. |
| stage-7-d43 | Customer names on orders | join | medium | Return order id and customer name for every order, ordered by order id. |
| stage-7-d44 | Customers without orders | left-join | medium | Return customer id and name for customers with no orders of any status, ordered by customer id. |
| stage-7-d45 | Count every customer order | left-join | medium | Return customer id and order count for every customer, including zero counts, ordered by customer id. |
| stage-7-d46 | Paid quantity per product | group-by | medium | Return product_id and total quantity from paid orders only, excluding products with no paid order, ordered by product_id. |
| stage-7-d47 | Total paid catalog value | aggregates | medium | Return one row with the sum of quantity times current price for paid orders, or zero if none. |
| stage-7-d48 | Paid catalog value per customer | group-by | medium | Return customer_id and sum of quantity times price for paid orders, only customers with paid orders, ordered by customer_id. |
| stage-7-d49 | Include customers with no paid orders | left-join | hard | Return every customer id and total paid catalog value, using zero for customers without paid orders. Order by customer id. |
| stage-7-d50 | Count statuses together | sql-case | medium | Return one row with counts of paid, pending and cancelled orders, in that order. |
| stage-7-d51 | Order counts by month | sql-dates | medium | Return year-month text (YYYY-MM) and order count for all statuses, ordered by year-month. |
| stage-7-d52 | Orders in February | sql-dates | easy | Return id and ordered_at for orders during February 2024, ordered by id. |
| stage-7-d53 | Products never ordered | subquery | medium | Return id and name of products that have no order of any status, ordered by id. |
| stage-7-d54 | Customers with paid orders | subquery | medium | Return customer id and name once each for customers with at least one paid order, ordered by id. |
| stage-7-d55 | Ordered product categories | distinct | medium | Return each category represented in any order once, in alphabetical order. |
| stage-7-d56 | Product order frequency | left-join | medium | Return every product id and number of order rows referencing it, including zero, ordered by product id. Count orders, not quantities. |
| stage-7-d57 | High-quantity customers | having | medium | Return customer_id and total ordered quantity for customers with total quantity at least 5, across all statuses, ordered by customer_id. |
| stage-7-d58 | Largest single order line | order-by | medium | Return order id and quantity times price for the most valuable single line across all statuses; break ties by order id ascending. |
| stage-7-d59 | Customer-category combinations | distinct | medium | Return distinct pairs of customer_id and product category found in orders, ordered by customer_id then category. |
| stage-7-d60 | Revenue by category | group-by | medium | Return category and paid catalog value (quantity times current price), only categories with paid orders, ordered by category. |
| stage-7-d61 | More expensive than category average | subquery | hard | Return product id and price when price is strictly above the average within its category, ordered by id. |
| stage-7-d62 | Best-paid staff per department | subquery | hard | Return id, department_id and salary for assigned employees tied for the highest salary in their department, ordered by id. |
| stage-7-d63 | Departments with nobody assigned | subquery | medium | Return department id and name for departments with no employees, ordered by department id. |
| stage-7-d64 | The second distinct salary | subquery | hard | Return one row with the second-highest distinct salary, or NULL if there is none. |
| stage-7-d65 | A CTE for paid orders | sql-cte | medium | Using a query, return customer_id and count of paid order rows, only customers with paid orders, ordered by customer_id. |
| stage-7-d66 | Categories above overall average | sql-cte | hard | Return category and its average price for categories whose average is strictly above the overall product average, ordered by category. |
| stage-7-d67 | Number products by price | sql-window | medium | Return id and a row number starting at 1 for products ordered by price descending then id ascending. Return rows in that same order. |
| stage-7-d68 | Dense salary ranks | sql-window | medium | Return employee id, salary and dense rank by salary descending, ordered by employee id. Equal salaries share a rank. |
| stage-7-d69 | Salary ranks with gaps | sql-window | medium | Return employee id and RANK by salary descending, ordered by employee id. Ties share rank and the next rank may have a gap. |
| stage-7-d70 | Running product price sum | sql-window | medium | Return product id and cumulative sum of price in id order, ordered by id. |
| stage-7-d71 | Previous employee salary | sql-window | medium | Return employee id and the previous employee salary in id order, with NULL for the first employee. Order by id. |
| stage-7-d72 | Next employee hire date | sql-window | medium | Return employee id and the next employee hired_at value in id order, with NULL on the final row. Order by id. |
| stage-7-d73 | Department payroll beside each employee | sql-window | medium | Return id and total salary of that employee department for assigned employees only, ordered by id. |
| stage-7-d74 | Cheapest product per category | sql-window | hard | Return category, id and price of exactly one cheapest product per category; break ties by id ascending and order by category. |
| stage-7-d75 | First order for each buyer | sql-window | hard | Return customer_id, order id and ordered_at for the earliest order per customer, breaking date ties by order id. Only customers with orders; order by customer_id. |
| stage-7-d76 | Paid quantity running total | sql-window | hard | For paid orders only, return customer_id, order id and cumulative quantity per customer in ordered_at then id order. Return rows by customer_id, ordered_at, id. |
| stage-7-d77 | Employees sharing a city | join | hard | Return pairs of employee ids sharing the same non-NULL city, each pair once with the smaller id first. Order by the first id then second id. |
| stage-7-d78 | Recursive number series | sql-cte | medium | Return integers 1 through 5 inclusive as five one-column rows, ascending, without reading a fixture table. |
| stage-7-d79 | Walk the reporting hierarchy | sql-cte | hard | Return employee id and hierarchy depth, where NULL-manager roots have depth 0 and each direct report adds 1. Order by employee id. |
| stage-7-d80 | Customer paid share as a percentage | sql-case | hard | Return customer_id and percentage of their order rows that are paid, rounded to one decimal, for customers with orders. Order by customer_id. |
| stage-7-d81 | Add a sample product | sql-dml | medium | Insert product (99, 'Sticker', 'paper', 1, 100), then return its id, name and stock as one result set. |
| stage-7-d82 | Restock sold-out products | sql-dml | medium | Add 10 units only to products with stock exactly zero; leave unknown stock untouched. Then return id and stock for every product, ordered by id. |
| stage-7-d83 | Raise paper prices | sql-dml | medium | Increase every paper product price by 3, then return id and price of all products, ordered by id. |
| stage-7-d84 | Remove cancelled orders | sql-dml | medium | Delete only cancelled orders, then return all remaining order ids and statuses, ordered by id. |
| stage-7-d85 | Undo a temporary price change | transactions | medium | Begin a transaction, set every product price to zero, then roll it back. Return all product ids and original prices, ordered by id. |
| stage-7-d86 | Commit a stock correction | transactions | medium | Within a transaction, replace NULL product stock with zero and commit. Return id and stock for all products, ordered by id. |
| stage-7-d87 | Roll back only part of a transaction | savepoint | hard | Add 1 to every price, create savepoint trial, multiply prices by 2, roll back to trial, then commit. Return id and price ordered by id. |
| stage-7-d88 | Copy just the cheap products | ddl | medium | Create cheap_products from products costing below 30, with only id and name columns. Return its rows ordered by id. |
| stage-7-d89 | Add a column with a default | ddl | medium | Add active INTEGER NOT NULL DEFAULT 1 to products, then return id and active for all products ordered by id. |
| stage-7-d90 | Query through a view | ddl | medium | Create a view paid_orders selecting paid orders, then return id and quantity from that view ordered by id. |
| stage-7-d91 | Index without changing results | indexes | medium | Create an index on products(category, price), then return id and price of tech products ordered by price then id. |
| stage-7-d92 | Combine unique known cities | sql-sets | medium | Return the union of non-NULL cities in employees and customers, once each, ordered alphabetically. |
| stage-7-d93 | Cities shared by both tables | sql-sets | medium | Return non-NULL cities that appear in both employees and customers, once each, alphabetically. |
| stage-7-d94 | Cities unique to employees | sql-sets | medium | Return non-NULL employee cities that do not occur among non-NULL customer cities, once each, alphabetically. |
| stage-7-d95 | Preserve duplicate city occurrences | sql-sets | medium | Return every non-NULL city occurrence from employees and customers, preserving duplicates, sorted alphabetically. |
| stage-7-d96 | Seven days after each order | sql-dates | easy | Return order id and the date seven days after ordered_at as YYYY-MM-DD text, ordered by id. |
| stage-7-d97 | Month-end order dates | sql-dates | medium | Return order id and the final calendar date of its month, ordered by id. |
| stage-7-d98 | Create constrained inventory | constraints | medium | Create bins with code TEXT PRIMARY KEY and quantity INTEGER NOT NULL CHECK(quantity >= 0). Insert ('A',3) and ('B',0), then return code and quantity ordered by code. |
| stage-7-d99 | Upsert an existing counter | sql-dml | hard | Create counters(name TEXT PRIMARY KEY, value INTEGER NOT NULL), insert ('runs',2), then upsert ('runs',3) by adding the incoming value to the existing one. Return name and value. |
| stage-7-d100 | Two independent totals without a fan-out | subquery | hard | Return one row with total product stock (NULL treated as zero) and total order quantity across all statuses, in that order. Do not multiply rows by joining the tables. |
