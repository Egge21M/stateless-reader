CREATE TABLE `access_grants` (
	`article_id` text NOT NULL,
	`public_key` text NOT NULL,
	`protocol_version` integer NOT NULL,
	PRIMARY KEY(`article_id`, `public_key`, `protocol_version`)
);
