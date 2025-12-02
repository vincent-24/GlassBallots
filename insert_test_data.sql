-- Create test users
INSERT OR IGNORE INTO users (username, email, password_hash, wallet_address, role) 
VALUES 
  ('alice', 'alice@test.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSUhXeO6', 'test-wallet-alice', 'student'),
  ('bob', 'bob@test.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSUhXeO6', 'test-wallet-bob', 'student'),
  ('charlie', 'charlie@test.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSUhXeO6', 'test-wallet-charlie', 'student'),
  ('diana', 'diana@test.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSUhXeO6', 'test-wallet-diana', 'student'),
  ('eve', 'eve@test.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSUhXeO6', 'test-wallet-eve', 'student'),
  ('frank', 'frank@test.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYILSUhXeO6', 'test-wallet-frank', 'student');

-- Cast votes on Proposal 5 (Sunsetting Classics): 4 deny, 2 approve = DENIED
INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 5, 0, 'test-wallet-alice' FROM users WHERE username = 'alice';  -- deny

INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 5, 0, 'test-wallet-bob' FROM users WHERE username = 'bob';  -- deny

INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 5, 1, 'test-wallet-charlie' FROM users WHERE username = 'charlie';  -- approve

INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 5, 0, 'test-wallet-diana' FROM users WHERE username = 'diana';  -- deny

INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 5, 0, 'test-wallet-eve' FROM users WHERE username = 'eve';  -- deny

INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 5, 1, 'test-wallet-frank' FROM users WHERE username = 'frank';  -- approve

-- Cast votes on Proposal 6 (Clear Air): 3 approve, 3 deny = RECAST
INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 6, 1, 'test-wallet-alice' FROM users WHERE username = 'alice';  -- approve

INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 6, 0, 'test-wallet-bob' FROM users WHERE username = 'bob';  -- deny

INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 6, 1, 'test-wallet-charlie' FROM users WHERE username = 'charlie';  -- approve

INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 6, 0, 'test-wallet-diana' FROM users WHERE username = 'diana';  -- deny

INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 6, 1, 'test-wallet-eve' FROM users WHERE username = 'eve';  -- approve

INSERT OR IGNORE INTO votes (user_id, proposal_id, vote_value, wallet_address)
SELECT id, 6, 0, 'test-wallet-frank' FROM users WHERE username = 'frank';  -- deny

-- Show results
SELECT '=== USERS CREATED ===' as info;
SELECT username, email FROM users WHERE username IN ('alice', 'bob', 'charlie', 'diana', 'eve', 'frank');

SELECT '' as blank;
SELECT '=== VOTE TALLIES ===' as info;
SELECT 
  p.id,
  p.title,
  COALESCE(vt.yes_count, 0) as approvals,
  COALESCE(vt.no_count, 0) as denials,
  COALESCE(vt.total_votes, 0) as total,
  CASE 
    WHEN COALESCE(vt.yes_count, 0) > COALESCE(vt.no_count, 0) THEN 'APPROVED'
    WHEN COALESCE(vt.no_count, 0) > COALESCE(vt.yes_count, 0) THEN 'DENIED'
    WHEN COALESCE(vt.total_votes, 0) > 0 THEN 'RECAST'
    ELSE 'PENDING'
  END as status
FROM proposals p
LEFT JOIN vote_tallies vt ON p.id = vt.proposal_id
WHERE p.id IN (5, 6);
