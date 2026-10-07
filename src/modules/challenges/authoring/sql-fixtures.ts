export const SQL_SCHEMA = `CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL, department_id INTEGER REFERENCES departments(id), salary INTEGER NOT NULL, manager_id INTEGER REFERENCES employees(id), city TEXT, hired_at TEXT NOT NULL);
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER);
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, status TEXT NOT NULL, ordered_at TEXT NOT NULL);`;

export const SQL_FIXTURES = [
  `${SQL_SCHEMA}
INSERT INTO departments VALUES (1,'Engineering'),(2,'Design'),(3,'Operations');
INSERT INTO employees VALUES (1,'Ada',1,100,NULL,'Pune','2022-01-10'),(2,'Ben',1,80,1,'Delhi','2023-02-15'),(3,'Cy',2,80,NULL,'Pune','2023-06-01'),(4,'Di',2,60,3,NULL,'2024-01-20'),(5,'Eve',NULL,40,1,'Delhi','2024-03-05');
INSERT INTO products VALUES (1,'Keyboard','tech',80,5),(2,'Mouse','tech',25,0),(3,'Notebook','paper',5,20),(4,'Pen','paper',2,50),(5,'Desk','furniture',150,2),(6,'Lamp','furniture',40,NULL);
INSERT INTO customers VALUES (1,'Ana','Pune'),(2,'Bo','Delhi'),(3,'Cal','Pune'),(4,'Dee',NULL);
INSERT INTO orders VALUES (1,1,1,2,'paid','2024-01-02'),(2,1,3,4,'paid','2024-02-01'),(3,2,2,1,'pending','2024-02-02'),(4,3,1,1,'paid','2024-02-05'),(5,2,4,10,'cancelled','2024-03-01'),(6,3,3,2,'paid','2024-03-03');`,
  `${SQL_SCHEMA}
INSERT INTO departments VALUES (1,'Engineering'),(2,'Design'),(3,'Operations');
INSERT INTO employees VALUES (10,'Ira',1,90,NULL,'Mumbai','2021-05-01'),(11,'Jay',1,90,10,'Pune','2023-05-10'),(12,'Kim',3,50,NULL,'Pune','2024-02-29'),(13,'Leo',NULL,30,10,NULL,'2024-04-01');
INSERT INTO products VALUES (10,'Cable','tech',12,8),(11,'Screen','tech',200,1),(12,'Pad','paper',4,0),(13,'Chair','furniture',90,3),(14,'Clip','paper',2,NULL),(15,'Stand','furniture',40,8);
INSERT INTO customers VALUES (10,'Ian','Mumbai'),(11,'Jo','Pune'),(12,'Kai','Mumbai'),(13,'Lea',NULL);
INSERT INTO orders VALUES (10,10,10,3,'paid','2024-01-05'),(11,11,11,1,'pending','2024-01-07'),(12,10,12,5,'paid','2024-02-01'),(13,12,13,2,'paid','2024-02-29'),(14,12,10,1,'cancelled','2024-03-01'),(15,11,15,2,'paid','2024-03-02');`
];
