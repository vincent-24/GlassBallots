# Proposal Data Files

This directory contains the proposal JSON files that are seeded into the database.

## Structure

Each proposal file (1.json, 2.json, etc.) contains:

```json
{
  "id": 1,
  "title": "Proposal Title",
  "original_text": "Full proposal text...",
  "creator": "Creator Name",
  "authorized_by": "Authorizing Body",
  "decision_date": "YYYY-MM-DD"
}
```

## Usage

These files are automatically imported into the database when you run:

```bash
# From blockchain-service directory
node database/seed_proposals.js
```

Or via the migration script:

```bash
# From blockchain-service/database/migrations directory
node 001_seed_proposals.js
```

## Adding New Proposals

1. Create a new JSON file with the next sequential number (e.g., `17.json`)
2. Follow the structure shown above
3. Run the seed script to import into the database

## Note

These files serve as the source of truth for initial proposal data. Once imported into the database, proposals are managed through the API.
