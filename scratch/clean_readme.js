const fs = require('fs');
const path = require('path');
const readmePath = path.join(__dirname, '..', 'README.md');
let content = fs.readFileSync(readmePath, 'utf8');

const duplicateBlock = `- **Phase 1 (Application Foundation & Design System):** Completed & Verified on Android Emulator (Android 15, SDK 58).
- **Phase 2 (Backend, Database, and Authentication):** Completed & Verified.
  - Express 5 + TypeScript backend in \`backend/\`.
  - PostgreSQL database schema with 13 tables and Drizzle ORM migrations.
  - Guest-first authentication, account linking, and multi-batch idempotent migration endpoint (\`POST /api/auth/migrate-batch\`).
  - Security middleware (Helmet, CORS, JWT authentication, sanitized request logging, Zod validation).
  - 100% test pass rate across 23 backend automated tests in Vitest.
`;

content = content.replace(duplicateBlock, '');
fs.writeFileSync(readmePath, content, 'utf8');
console.log('Cleaned duplicate block in README.md');
