-- =====================================================================
-- DSA Customer Service Database — Schema Migration
-- Project: seatcover-oms (Supabase: nvqhgkqjlvymnwcsfbee)
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- =====================================================================

-- Enable pgvector for semantic similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================================
-- TABLE: historical_qa
-- Past customer Q&A pairs from eBay, Gmail, WhatsApp.
-- These are the "knowledge base" — what we search against when a new
-- message comes in. Each row = one customer question + the rep's answer.
-- =====================================================================
CREATE TABLE IF NOT EXISTS historical_qa (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL CHECK (source IN ('ebay', 'gmail', 'whatsapp')),
  source_thread_id TEXT,              -- original thread/conversation ID from source
  customer_handle TEXT,               -- email, phone, or eBay username (no real names stored)
  language        TEXT,               -- ISO 639-1: 'en', 'fr', 'de', 'it', 'es', etc.
  customer_text   TEXT NOT NULL,      -- what the customer said (original language)
  rep_text        TEXT NOT NULL,      -- what the rep replied (original language)
  rep_signature   TEXT,               -- "Nora", "Pejman", etc., extracted from sign-off
  occurred_at     TIMESTAMPTZ,        -- when the Q was asked
  embedding       VECTOR(1536),       -- OpenAI text-embedding-3-small vector
  metadata        JSONB DEFAULT '{}', -- anything extra: product, vehicle, etc.
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historical_qa_source ON historical_qa(source);
CREATE INDEX IF NOT EXISTS idx_historical_qa_language ON historical_qa(language);
CREATE INDEX IF NOT EXISTS idx_historical_qa_occurred ON historical_qa(occurred_at DESC);

-- Vector similarity index (cosine distance)
-- ivfflat needs at least some rows before it's useful; if errors on empty table,
-- you can defer this until after first insert
CREATE INDEX IF NOT EXISTS idx_historical_qa_embedding 
  ON historical_qa USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =====================================================================
-- TABLE: incoming_messages
-- New messages from customers, ingested live from eBay/Gmail/(WhatsApp later).
-- Each row = one customer message we need to potentially reply to.
-- =====================================================================
CREATE TABLE IF NOT EXISTS incoming_messages (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL CHECK (source IN ('ebay', 'gmail', 'whatsapp')),
  source_message_id TEXT NOT NULL,    -- unique ID from source system
  source_thread_id TEXT,              -- for threading multi-message conversations
  customer_handle TEXT,
  subject         TEXT,               -- for emails
  body            TEXT NOT NULL,      -- customer's message
  language        TEXT,               -- detected language
  body_en         TEXT,               -- exact English translation (NULL if already English)
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'drafted', 'sent', 'skipped', 'flagged')),
  received_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source, source_message_id) -- prevents duplicate ingestion
);

CREATE INDEX IF NOT EXISTS idx_incoming_status ON incoming_messages(status);
CREATE INDEX IF NOT EXISTS idx_incoming_received ON incoming_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_incoming_source ON incoming_messages(source);

-- =====================================================================
-- TABLE: drafts
-- AI-generated draft replies, one per incoming message.
-- Reps review these and either send, edit, or reject.
-- =====================================================================
CREATE TABLE IF NOT EXISTS drafts (
  id              BIGSERIAL PRIMARY KEY,
  incoming_message_id BIGINT NOT NULL REFERENCES incoming_messages(id) ON DELETE CASCADE,
  draft_text      TEXT NOT NULL,      -- draft in customer's language
  draft_text_en   TEXT,               -- exact English translation of the draft
  reference_qa_ids BIGINT[],          -- which historical_qa rows informed this draft
  model_used      TEXT,               -- e.g. 'claude-sonnet-4-5-20250929'
  prompt_tokens   INTEGER,
  completion_tokens INTEGER,
  generated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_incoming ON drafts(incoming_message_id);

-- =====================================================================
-- TABLE: feedback
-- Rep feedback on draft quality. Used to improve the system over time.
-- =====================================================================
CREATE TABLE IF NOT EXISTS feedback (
  id              BIGSERIAL PRIMARY KEY,
  draft_id        BIGINT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  action          TEXT NOT NULL CHECK (action IN ('sent_as_is', 'sent_edited', 'rejected', 'flagged')),
  final_text      TEXT,               -- what was actually sent (if edited)
  rep_id          TEXT,               -- which rep took the action
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_draft ON feedback(draft_id);
CREATE INDEX IF NOT EXISTS idx_feedback_action ON feedback(action);

-- =====================================================================
-- FUNCTION: match_historical_qa
-- Vector similarity search. Given a query embedding, returns top N most
-- similar historical Q&A pairs across all languages (pgvector handles
-- multilingual matching when using a multilingual embedding model).
-- =====================================================================
CREATE OR REPLACE FUNCTION match_historical_qa(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  filter_language TEXT DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  source TEXT,
  language TEXT,
  customer_text TEXT,
  rep_text TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    h.id,
    h.source,
    h.language,
    h.customer_text,
    h.rep_text,
    1 - (h.embedding <=> query_embedding) AS similarity
  FROM historical_qa h
  WHERE h.embedding IS NOT NULL
    AND (filter_language IS NULL OR h.language = filter_language)
  ORDER BY h.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =====================================================================
-- Row-Level Security (optional for pilot, recommended for production)
-- For pilot: keep RLS disabled, access controlled at app layer.
-- Uncomment when ready to lock down:
-- =====================================================================
-- ALTER TABLE historical_qa ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE incoming_messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Done. Verify by running:
--   SELECT COUNT(*) FROM historical_qa;
--   SELECT COUNT(*) FROM incoming_messages;
--   SELECT COUNT(*) FROM drafts;
--   SELECT COUNT(*) FROM feedback;
