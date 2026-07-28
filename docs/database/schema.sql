CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE moment_category AS ENUM (
  'experience',
  'habit',
  'travel',
  'food',
  'growth',
  'emotion'
);

CREATE TYPE moment_status AS ENUM (
  'captured',
  'understanding',
  'ready',
  'embedded',
  'needs_review',
  'archived'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject TEXT UNIQUE NOT NULL,
  display_name TEXT,
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  location JSONB NOT NULL DEFAULT '{"source":"unknown"}'::jsonb,
  voice_input TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category moment_category NOT NULL DEFAULT 'experience',
  tags TEXT[] NOT NULL DEFAULT '{}',
  emotion JSONB NOT NULL DEFAULT '{"label":"平静"}'::jsonb,
  ai_summary TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  status moment_status NOT NULL DEFAULT 'captured',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_model_version TEXT,
  prompt_version TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE moment_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio')),
  mime_type TEXT NOT NULL,
  object_key TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memory_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  chunk_type TEXT NOT NULL DEFAULT 'moment_summary',
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (moment_id, chunk_type, model_version)
);

CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'active', 'paused', 'completed')),
  target_count INTEGER,
  current_streak INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE habit_moments (
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  PRIMARY KEY (habit_id, moment_id)
);

CREATE INDEX moments_user_timeline_idx
  ON moments (user_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX moments_category_idx
  ON moments (user_id, category, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX moments_tags_gin_idx ON moments USING gin (tags);
CREATE INDEX moments_location_gin_idx ON moments USING gin (location);
CREATE INDEX memory_embeddings_user_idx ON memory_embeddings (user_id);

-- Choose index parameters after measuring the production corpus.
CREATE INDEX memory_embeddings_vector_idx
  ON memory_embeddings
  USING hnsw (embedding vector_cosine_ops);
