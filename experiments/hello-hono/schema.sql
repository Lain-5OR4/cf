DROP TABLE IF EXISTS messages;

CREATE TABLE messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	text TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO messages (text) VALUES
	('hello from D1 👋'),
	('this row was seeded from schema.sql'),
	('try editing schema.sql and re-running wrangler d1 execute');
