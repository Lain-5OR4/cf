DROP TABLE IF EXISTS post_images;
DROP TABLE IF EXISTS posts;

CREATE TABLE posts (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	caption    TEXT NOT NULL DEFAULT '',
	posted_on  TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_posts_feed ON posts(posted_on DESC, id DESC);

CREATE TABLE post_images (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
	r2_key     TEXT    NOT NULL UNIQUE,
	sort_order INTEGER NOT NULL DEFAULT 0,
	width      INTEGER,
	height     INTEGER
);
CREATE INDEX idx_post_images_post ON post_images(post_id, sort_order);
