# Offline-First Architecture & Synchronization Strategy (Finalized November 2026)

## 1. Core Principles

Cura is designed as an **offline-first** application:
1. All core user actions—creating, editing, and completing tasks, logging moods, viewing history, and calculating analytics—work immediately on device without network connectivity.
2. The local database (`expo-sqlite` with Drizzle ORM) is the primary source of truth for the user interface.
3. Network synchronization occurs asynchronously in the background.
4. Users can use the entire core application as a guest without creating an account.
5. User-authored data is strictly protected: AI services are **physically prevented at the database engine level** from modifying or overwriting user tasks and moods.

---

## 2. Synchronization Conflict Strategy

### 2.1 The Failure Mode of Pure Client-Timestamp Last-Write-Wins (LWW)
Relying strictly on client-generated `updated_at` timestamps for Last-Write-Wins is fragile in mobile applications:
- **Device Clock Drift:** Mobile clocks can drift by seconds or minutes.
- **Incorrect Clock Settings:** Users may intentionally or accidentally set their device clock forward or backward.
- **Timezone Mismatches:** Clocks traveling across time zones can introduce subtle ordering anomalies.
- If a client with a clock 1 hour in the future edits a task, its edits will permanently shadow any edits made by a properly synchronized device for the next hour.

### 2.2 The Improved Conflict Architecture: Monotonic Server Revisions + Ordered Outbox Mutations

To achieve reliable synchronization without the immense overhead of full CRDTs (Conflict-free Replicated Data Types), Cura adopts a **Monotonically Increasing Server Revision + Client Outbox Sequence** model:

```
[Mobile Client A]                                          [PostgreSQL Server]
      │                                                           │
      │ 1. Local Edit: Task 'Buy Milk'                            │
      │    Appends mutation to local `sync_outbox`                │
      │    client_sequence = 101, mutation_id = UUID              │
      │    is_dirty = true                                        │
      │                                                           │
      │ 2. POST /api/sync/push                                    │
      │    Payload: Outbox mutations in client_sequence order      │
      ├──────────────────────────────────────────────────────────>│
      │                                                           │ 3. Server processes mutations:
      │                                                           │    - Checks mutation_id (idempotency)
      │                                                           │    - Compares base_server_revision
      │                                                           │    - Applies field-aware merge
      │                                                           │    - Increments record server_revision
      │                                                           │    - Stamps server_updated_at = NOW()
      │ 4. HTTP 200: Confirmed mutation_ids + new server_revisions │
      │<──────────────────────────────────────────────────────────┤
      │ 5. Local DB updates local server_revision                 │
      │    Clears confirmed outbox mutations                      │
      ▼                                                           ▼
```

### 2.3 Key Mechanism Details

#### 1. Server-Assigned Monotonic Revisions (`server_revision`)
- Every synchronized table in PostgreSQL (`tasks`, `mood_entries`, `user_preferences`) includes an integer column: `server_revision INTEGER DEFAULT 1`.
- When an update is accepted on the server:
  ```sql
  UPDATE tasks 
  SET 
    title = :title,
    server_revision = server_revision + 1,
    server_updated_at = NOW()
  WHERE id = :id AND user_id = :userId;
  ```
- The server's clock and integer sequence are authoritative. Device clocks are never used to determine global record precedence.

#### 2. Client Mutation Sequencing (`sync_outbox`)
- The local SQLite database maintains a sequential `sync_outbox` table tracking `client_sequence`, `entity_type`, `entity_id`, `action`, `base_server_revision`, and `payload`.
- When syncing, mutations are pushed strictly in `client_sequence` order, preserving the user's chronological intent.

#### 3. Field-Aware Merge Resolution
- Non-overlapping concurrent edits merge cleanly:
  - If **Device A** updates `due_time` while offline, and **Device B** marks `status = 'completed'`, the server merges both: the task retains the new `due_time` AND the `completed` status.
  - If both devices edit the **same field** concurrently (e.g. both edit `title`), the update associated with the higher server transaction sequence wins.

#### 4. Tombstone Soft Deletion
- Deleting a task or mood writes a tombstone (`is_deleted = TRUE`, `deleted_at = NOW()`, `server_revision = server_revision + 1`).
- Tombstones replicate to other devices during delta pulls (`GET /api/sync/pull?since_revision=X`), prompting the local SQLite database to remove the deleted item from active views and avoid resurrecting zombie records.

#### 5. Idempotent Synchronization
- Every mutation sent carries a unique client-generated UUID `mutation_id`.
- The server tracks recent mutation IDs in an idempotency table. Retries resulting from network drops are acknowledged without re-applying the mutation.

---

## 3. Database-Enforced AI Data Access Permissions

It is not sufficient to rely on code-level conventions (e.g. hoping an AI controller never calls an update task function). Software bugs, unexpected side-effects, or prompt injection exploits could otherwise corrupt user records.

Cura implements **engine-enforced permission boundaries** using separate PostgreSQL database roles:

```
                  ┌───────────────────────────────────────────────┐
                  │                 PostgreSQL DB                 │
                  └───────┬───────────────────────────────┬───────┘
                          │                               │
             GRANT SELECT, INSERT, UPDATE, DELETE         │ STRICT READ-ONLY ON USER DATA
                          │                               │ (GRANT SELECT ONLY)
                          ▼                               ▼
               [ app_user_role ]               [ ai_service_role ]
               Standard Web API                AI Background Workers &
               (User Task CRUD & Moods)        Context Construction Pipeline
```

### Enforceable Separation Rules:
1. **`app_user_role` (Standard User Actions):**
   - Used by the user-facing REST API.
   - `GRANT SELECT, INSERT, UPDATE, DELETE ON tasks, mood_entries, user_preferences, conversations, messages, ai_insights, daily_summaries;`
2. **`ai_service_role` (AI Subsystem & Background Workers):**
   - Used exclusively by AI context builders, failover engines, summary generators, and chat handlers.
   - **User Tables:** `GRANT SELECT ON tasks, mood_entries, user_preferences, conversations;`
   - **AI-Owned Tables:** `GRANT SELECT, INSERT, UPDATE ON ai_insights, daily_summaries, messages;`
   - **Strict Revocation:** `REVOKE INSERT, UPDATE, DELETE ON tasks, mood_entries, user_preferences FROM ai_service_role;`

**Engine Guarantee:** If any AI process, background job, or compromised prompt attempts to execute an `UPDATE` or `DELETE` query against `tasks` or `mood_entries`, the PostgreSQL engine itself immediately aborts the transaction with error `42501: insufficient_privilege`.

---

## 4. Reliable & Idempotent Guest-to-Account Migration Flow

Rather than treating the entire guest-to-cloud migration as a single fragile monolithic action that risks data loss if interrupted, Cura adopts a **multi-batch, idempotent, verified migration process**:

```
[Mobile Device (Guest Data)]                               [Backend Server]
             │                                                     │
             │ 1. User registers/signs in                          │
             │    Obtains authenticated JWT & user_id              │
             │                                                     │
             │ 2. Read local guest records (tasks, moods)          │
             │    Divide into idempotent batches (e.g., 50 items)  │
             │                                                     │
             │ 3. POST /api/auth/migrate-batch                     │
             │    Payload: batch_id, client_mutation_ids, entities │
             ├────────────────────────────────────────────────────>│
             │                                                     │ 4. Process Batch Transaction:
             │                                                     │    BEGIN TRANSACTION;
             │                                                     │    UPSERT entities with new user_id
             │                                                     │    ON CONFLICT (id) DO NOTHING;
             │                                                     │    Record processed mutation_ids;
             │                                                     │    COMMIT;
             │ 5. HTTP 200: Confirmed entity IDs & batch hash      │
             │<────────────────────────────────────────────────────┤
             │                                                     │
             │ 6. Verification Phase:                              │
             │    Client verifies server confirmed IDs match local │
             │                                                     │
             │ 7. SAFE LOCAL STATE UPDATE:                         │
             │    Update local user_id = :auth_user_id             │
             │    Clear local outbox pending status                │
             │    *** NEVER DELETE LOCAL RECORDS ***               │
             ▼                                                     ▼
```

### Reliability Guarantees:
1. **Never Delete Before Verification:** Local guest data is **never deleted** during migration. Instead, local records are safely updated in-place from `user_id = 'guest'` to the authenticated `user_id` only *after* the server confirms receipt and verification.
2. **Batch Processing:** Datasets are migrated in manageable batches with individual server-side transactions (`BEGIN ... COMMIT`), preventing timeout failures on slow connections.
3. **Idempotent Retry Safety:** If a network timeout occurs during batch transmission, retrying the migration batch is completely safe: the server's `ON CONFLICT (id) DO NOTHING` or `DO UPDATE` ensures that no duplicate tasks or mood entries are ever created.
4. **Resilience to Interruption:** If a user closes the app mid-migration, unmigrated batches remain tagged as `migration_pending` locally and automatically resume on the next app launch.
