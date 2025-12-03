# GlassBallots - Database Quick Reference

## Database Location
**Path:** `./blockchain-service/database/glassballots.db`

### Query Database Directly
```bash
# View all users
sqlite3 blockchain-service/database/glassballots.db "SELECT * FROM users;"

# View user details
sqlite3 blockchain-service/database/glassballots.db "SELECT id, username, email, role, created_at FROM users;"

# Count users
sqlite3 blockchain-service/database/glassballots.db "SELECT COUNT(*) FROM users;"

# View proposals
sqlite3 blockchain-service/database/glassballots.db "SELECT id, title, status FROM proposals;"
```

## Authentication

### Signup (Create Account)
- Go to: http://localhost:3000/signup
- Required: Username (3+ chars, unique), Email (valid, unique), Password (6+ chars)
- Password is encrypted with bcrypt (12 rounds)
- Returns: User object + session token

### Login
- Go to: http://localhost:3000
- Required: Username/Email + Password
- Only existing users can login
- Error messages:
  - "Invalid credentials" - Wrong password or user doesn't exist
  - "Username/email and password are required" - Missing fields

## Services

### Start All Services
```bash
./start_services.sh
```

### Stop All Services
Press Ctrl+C in the terminal running start_services.sh, or:
```bash
kill $(cat .pids/*.pid) 2>/dev/null
```

### Service URLs
- **Frontend:** http://localhost:3000
- **API:** http://localhost:3001
- **AI Service:** http://localhost:5001
- **Blockchain RPC:** http://127.0.0.1:8545

### View Logs
```bash
tail -f logs/frontend.log
tail -f logs/blockchain-api.log
tail -f logs/ai-service.log
tail -f logs/hardhat.log
```

## Testing

### Test Signup
```bash
curl -X POST http://localhost:3001/api/users/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"test123"}'
```

### Test Login
```bash
curl -X POST http://localhost:3001/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"testuser","password":"test123"}'
```

### Test Get Proposals
```bash
curl http://localhost:3001/api/proposals
```

## Security Features

- **Password Encryption:** bcrypt with 12 rounds (salt included)
- **Unique Constraints:** Username and email must be unique
- **Wallet Generation:** SHA-256 hash of username+email+timestamp
- **Session Tokens:** Secure 64-character hex tokens
- **Session Expiry:** 7 days (configurable in .env)

### Verify Password Encryption
```bash
sqlite3 blockchain-service/database/glassballots.db \
  "SELECT username, password_hash FROM users WHERE username='testuser';"
```
You should see: `$2b$12$...` (bcrypt hash)
