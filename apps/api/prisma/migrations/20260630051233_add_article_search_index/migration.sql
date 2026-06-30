CREATE INDEX "Article_search_idx" ON "Article"
USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '')));
