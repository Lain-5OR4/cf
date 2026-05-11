-- Dev-only seed data. Applied to local D1 with:
--   bunx wrangler d1 execute photo-diary-db --local --file=seed-dev.sql --yes
-- Image bytes live in local R2 under matching keys (see README or git log).

DELETE FROM post_images;
DELETE FROM posts;

INSERT INTO posts (id, caption, posted_on) VALUES
	(1, '晴れた日のコーヒー ☕', '2026-05-08'),
	(2, '窓辺の猫', '2026-05-09'),
	(3, '山の景色を眺めながら', '2026-05-10'),
	(4, '今日のまとめ — コーヒー、猫、山', '2026-05-11');

INSERT INTO post_images (post_id, r2_key, sort_order) VALUES
	(1, 'posts/1/0-abc123.jpg', 0),
	(2, 'posts/2/0-def456.jpg', 0),
	(3, 'posts/3/0-ghi789.jpg', 0),
	(4, 'posts/4/0-jkl012.jpg', 0),
	(4, 'posts/4/1-mno345.jpg', 1),
	(4, 'posts/4/2-pqr678.jpg', 2);
