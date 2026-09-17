-- ============================================================================
-- CodeQuest — Seed Data
-- Pre-populates stages and dynamic games (Quizzes & Code Runners)
-- ============================================================================

-- Clear existing data if needed
TRUNCATE TABLE public.challenges CASCADE;
TRUNCATE TABLE public.stages CASCADE;

-- 1. Insert Stages
INSERT INTO public.stages (id, order_index, index_label, slug, name, description, is_premium) VALUES
('11111111-1111-1111-1111-111111111111', 1, '01', 'programming-basics', 'Programming Basics', 'Variables, types, control flow, and fundamental logic.', false),
('22222222-2222-2222-2222-222222222222', 2, '02', 'python-fundamentals', 'Python Fundamentals', 'Lists, dictionaries, comprehensions, and clean idiomatic Python.', false),
('33333333-3333-3333-3333-333333333333', 3, '03', 'problem-solving', 'Problem Solving', 'Two pointers, hash tables, stack patterns, and asymptotic optimization.', false),
('44444444-4444-4444-4444-444444444444', 4, '04', 'web-development', 'Web Development', 'DOM manipulation, async event loops, modern CSS grid/flex, and API fetching.', false),
('55555555-5555-5555-5555-555555555555', 5, '05', 'backend-development', 'Backend Development', 'RESTful architecture, databases, auth, security, and concurrency.', true),
('66666666-6666-6666-6666-666666666666', 6, '06', 'build-real-projects', 'Build Real Projects', 'Full-stack integration, production deployments, testing, and CI/CD.', true);

-- 2. Insert Challenges (Notice the flexible game_payload JSONB format!)
-- Stage 1: Programming Basics (Quiz games)
INSERT INTO public.challenges (id, stage_id, order_index, title, type, language, prompt, starter_code, xp_reward, game_payload) VALUES
(
    'c1111111-0001-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    1,
    'Variable Scoping & Hoisting',
    'quiz',
    'javascript',
    'What will be the console output of the following JavaScript snippet?',
    'console.log(typeof score);\nvar score = 100;',
    50,
    '{
        "options": [
            "undefined",
            "number",
            "ReferenceError: score is not defined",
            "null"
        ],
        "correct_index": 0,
        "explanation": "Due to var hoisting, the declaration is hoisted to the top and initialized with undefined until execution reaches the assignment."
    }'::jsonb
),
(
    'c1111111-0002-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    2,
    'Strict Equality Truthiness',
    'quiz',
    'javascript',
    'Which of the following comparisons evaluates to false in JavaScript?',
    '// Check type coercion vs strict equality\nconst a = [] == false;\nconst b = [] === false;\nconst c = "" == 0;',
    50,
    '{
        "options": [
            "[] == false",
            "[] === false",
            "\"\" == 0",
            "null == undefined"
        ],
        "correct_index": 1,
        "explanation": "[] === false checks both type and value without coercion. An empty array is an object, so object === boolean is strictly false."
    }'::jsonb
);

-- Stage 2: Python Fundamentals (Quiz + Online Compiler Code Runner)
INSERT INTO public.challenges (id, stage_id, order_index, title, type, language, prompt, starter_code, xp_reward, game_payload) VALUES
(
    'c2222222-0001-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    1,
    'List Comprehension Magic',
    'quiz',
    'python',
    'What does this Python list comprehension produce?',
    'nums = [1, 2, 3, 4, 5]\nres = [x * 2 for x in nums if x % 2 != 0]\nprint(res)',
    60,
    '{
        "options": [
            "[2, 6, 10]",
            "[4, 8]",
            "[2, 4, 6, 8, 10]",
            "[1, 3, 5]"
        ],
        "correct_index": 0,
        "explanation": "It filters for odd numbers (1, 3, 5) and multiplies each by 2, resulting in [2, 6, 10]."
    }'::jsonb
),
(
    'c2222222-0002-0000-0000-000000000002',
    '22222222-2222-2222-2222-222222222222',
    2,
    'Live Code: Reverse Words in String',
    'code_runner',
    'python',
    'Write a Python function `reverse_words(sentence: str) -> str` that reverses the order of words in a space-delimited sentence.',
    'def reverse_words(sentence: str) -> str:\n    # Return the words in reverse order\n    words = sentence.split()\n    return " ".join(reversed(words))\n',
    75,
    '{
        "entry_function": "reverse_words",
        "test_cases": [
            { "input": "\"hello world\"", "expected": "\"world hello\"" },
            { "input": "\"code build learn\"", "expected": "\"learn build code\"" },
            { "input": "\"single\"", "expected": "\"single\"" }
        ],
        "explanation": "Splitting by whitespace and joining in reverse order runs in linear O(n) time."
    }'::jsonb
);

-- Stage 3: Problem Solving (Interactive Online Compiler)
INSERT INTO public.challenges (id, stage_id, order_index, title, type, language, prompt, starter_code, xp_reward, game_payload) VALUES
(
    'c3333333-0001-0000-0000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    1,
    'Live Code: Two Sum Challenge',
    'code_runner',
    'javascript',
    'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`. Must run in O(n) time.',
    'function twoSum(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n  return [];\n}',
    100,
    '{
        "entry_function": "twoSum",
        "test_cases": [
            { "input": "[2, 7, 11, 15], 9", "expected": "[0, 1]" },
            { "input": "[3, 2, 4], 6", "expected": "[1, 2]" },
            { "input": "[3, 3], 6", "expected": "[0, 1]" }
        ],
        "explanation": "A hash map tracks visited values and their indices for instant O(1) complement checks."
    }'::jsonb
),
(
    'c3333333-0002-0000-0000-000000000002',
    '33333333-3333-3333-3333-333333333333',
    2,
    'Detecting Loop Invariants & Midpoint Overflow',
    'quiz',
    'javascript',
    'In binary search `while (left <= right)`, what is the standard fix to prevent integer overflow when calculating midpoint?',
    'int mid = (left + right) / 2; // Can overflow in C++/Java',
    75,
    '{
        "options": [
            "int mid = left + (right - left) / 2;",
            "int mid = (left * right) / 2;",
            "int mid = right - left / 2;",
            "int mid = (left + right) >> 2;"
        ],
        "correct_index": 0,
        "explanation": "left + (right - left) / 2 calculates the midpoint without summing two large positive numbers, preventing overflow."
    }'::jsonb
);
