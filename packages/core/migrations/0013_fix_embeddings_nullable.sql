-- Allow visual embeddings that don't have transcript/chunk references.
-- The original embeddings table was created with NOT NULL on transcript_id and chunk_id,
-- but visual embeddings only reference frame_chunk_id.
ALTER TABLE embeddings ALTER COLUMN transcript_id DROP NOT NULL;
ALTER TABLE embeddings ALTER COLUMN chunk_id DROP NOT NULL;
