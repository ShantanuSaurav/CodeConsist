-- ============================================================================
-- CodeQuest — Database Schema
-- Run this in Supabase SQL Editor to initialize your database
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    xp INT DEFAULT 0,
    level INT DEFAULT 1,
    streak INT DEFAULT 1,
    last_activity_date DATE DEFAULT CURRENT_DATE,
    is_premium BOOLEAN DEFAULT FALSE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Learning Stages (Dynamic Paths)
CREATE TABLE IF NOT EXISTS public.stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_index INT NOT NULL,
    index_label VARCHAR(10) NOT NULL, -- e.g. '01', '02', '03'
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    is_premium BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Dynamic Challenges / Games (Add new games purely via database)
CREATE TABLE IF NOT EXISTS public.challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
    order_index INT NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'quiz' | 'code_runner' | 'debug'
    language VARCHAR(50) DEFAULT 'javascript', -- 'javascript', 'python', 'go', 'cpp'
    prompt TEXT NOT NULL,
    starter_code TEXT,
    solution_code TEXT,
    xp_reward INT DEFAULT 50,
    -- Dynamic JSON payload for extensible game formats & test cases:
    -- For Quiz: { "options": [...], "correct_index": 0, "explanation": "..." }
    -- For Code Runner: { "test_cases": [{ "input": "...", "expected": "..." }], "entry_function": "fnName", "explanation": "..." }
    game_payload JSONB NOT NULL,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. User Progress Tracking
CREATE TABLE IF NOT EXISTS public.user_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    score INT DEFAULT 100,
    attempts INT DEFAULT 1,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, challenge_id)
);

-- 5. Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Stages & Challenges: Public Read (Anyone can read active content)
CREATE POLICY "Allow public read on active stages" 
    ON public.stages FOR SELECT USING (is_active = true);

CREATE POLICY "Allow public read on published challenges" 
    ON public.challenges FOR SELECT USING (is_published = true);

-- Profiles: Authenticated users can view and edit their own profile
CREATE POLICY "Allow users to view own profile" 
    ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Allow users to update own profile" 
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- User Progress: Users can manage their own completed challenges
CREATE POLICY "Allow users to view own progress" 
    ON public.user_progress FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert own progress" 
    ON public.user_progress FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Trigger: Auto-create Profile on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name, avatar_url, xp, level, streak)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'user_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Developer'),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
        100,
        1,
        1
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
