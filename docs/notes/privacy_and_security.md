# Privacy, AI Data Policy & Safety Architecture (Finalized November 2026)

## 1. Principles of Privacy in Cura

Because mood entries, personal reflections, and daily tasks can contain deeply intimate details, Cura adopts a **realistic, privacy-conscious architecture**:
- **Acknowledge User-Generated Content Reality:** While Cura strips explicit system metadata (such as user email, account ID, device identifiers, and IP addresses) before sending prompts to AI providers, user-authored task titles, mood notes, and chat messages may themselves contain personally identifiable or sensitive personal information (names of family members, medical details, workplace information).
- **Data Minimization:** AI context packets are strictly bounded to the minimal temporal window necessary for the interaction.
- **Configurable Privacy:** Users have granular controls in Settings to select which data categories (e.g. task titles, mood history) are allowed into AI context.
- **Zero Third-Party Telemetry of Private Content:** Task titles, mood notes, and conversation transcripts are never passed to third-party product analytics, ad networks, or crash reporters.

---

## 2. AI Provider Policies & Data Handling Realities

It is critical to distinguish **commercial developer APIs** from **consumer chatbot subscriptions**:
- In consumer subscriptions (e.g. free ChatGPT web or consumer Gemini apps), user conversations may be used for model training by default unless explicitly opted out.
- Developer APIs operate under distinct developer terms of service. However, policies vary by provider and tier:

### 2.1 Google Gemini API
- **Free Tier:** Per Google's Gemini API terms, data submitted via the **free tier** may be logged, reviewed by human reviewers, and utilized to improve Google products and technologies.
- **Paid Tier (Google Cloud Vertex AI or Pay-As-You-Go API):** Under Google Cloud's paid terms, customer data is treated as confidential: prompts and responses are **not** logged for human review and are **not** used to train Google's foundation models.
- **Architectural Mitigation:** In Phase 5, Cura will document this tier distinction clearly in the app settings, allowing self-hosted backend administrators to configure paid API keys to ensure non-training guarantees.

### 2.2 Groq API
- **Developer Terms:** Groq provides high-speed LPU inference for open models (such as Llama 3.x).
- **Data Policy:** Per Groq's official API terms, input prompts and completions are **not** used to train models. Groq retains request payloads for up to 30 days solely for security and abuse monitoring purposes before automatic deletion.

### 2.3 OpenRouter
- **Aggregator Terms:** OpenRouter acts as an API proxy routing requests to upstream model hosts (Together AI, Fireworks, Anthropic, etc.).
- **Data Policy:** OpenRouter does not train models on prompt data, but downstream host policies apply depending on the specific model endpoint selected. OpenRouter allows passing a `no-store` header to request that downstream providers do not retain data beyond request execution where supported.

### 2.4 Minimal Context Construction (`ContextBuilder`)
When generating an AI response, the backend gathers only:
1. **Current Local Time & Date:** Required for contextual greetings and temporal awareness.
2. **Today's Active Tasks:** Titles and completion status for today only (past completed task archives are excluded).
3. **Recent Mood Tags:** Mood categories logged over the last 3 days (e.g. `["tired", "calm"]`). Detailed user notes are omitted from background summaries unless the user is specifically discussing them in active chat.
4. **Active Thread History:** The last 6 to 10 conversational turns of the current conversation session.
5. **Stripped Metadata:** User account UUID, email, password hashes, and network IPs are never injected into prompt payloads.

---

## 3. Country-Aware Emergency and Crisis Resource Handling

### 3.1 Country Selection: Manual User Preference over Device Locale
**Device locale is NOT proof of geographical residency or physical location.** A user residing in the UK, Japan, or Germany may have their phone set to an `en-US` locale; displaying US-specific emergency numbers to that user would be unhelpful and dangerous.

**Cura's Country Selection Architecture:**
1. **Manual Selection:** The emergency resource provider relies on an explicit, user-selected country setting stored in `user_preferences.selected_country`.
2. **Initial Suggestion:** The device locale may only be used to pre-highlight an initial suggestion in the selection dropdown, but the setting is not locked or assumed without explicit user selection.
3. **Editable Anytime:** Users can update, change, or clear their country setting at any time in Settings.
4. **Unknown Location Handling:** If the country setting is unselected, unknown, or unlisted, Cura **never** presents an unverified local number. Instead, it provides universal emergency guidance to dial local emergency services and displays direct links to verified international crisis directories.

### 3.2 Dynamic Crisis Helpline Architecture

```
[User Expresses Crisis / Danger Intent]
                  │
                  ▼
   [Backend Deterministic Safety Guard]
                  │
     Detects emergency / crisis markers
                  │
                  ▼
     Inspect User Manually Selected Country
                  │
       ┌──────────┼──────────┬──────────┬──────────┐
       ▼          ▼          ▼          ▼          ▼
    [ US ]     [ UK ]     [ CA ]     [ AU ]    [ Unset / Unknown ]
       │          │          │          │          │
   988 Lifeline  999 /    988 Canada  13 11 14    International
   Call/Text 988 111 NHS  Call/Text   Lifeline    Directories:
                 Samaritans                       - findahelpline.com
                 116 123                          - befrienders.org
                                                  - iasp.info
```

- **United States:** 988 Suicide & Crisis Lifeline (call/text 988).
- **United Kingdom:** 999 (Emergency), 111 (NHS mental health services), Samaritans (116 123).
- **Canada:** 988 Suicide Crisis Helpline (call/text 988).
- **Australia:** 000 (Emergency), 13 11 14 (Lifeline Australia).
- **European Union:** 112 (Universal emergency number across EU member states).
- **Verified Global Fallbacks:**
  - [Find A Helpline](https://findahelpline.com/) (Global directory searchable by country)
  - [Befrienders Worldwide](https://www.befrienders.org/)
  - [International Association for Suicide Prevention (IASP)](https://www.iasp.info/resources/Crisis_Centres/)

### 3.3 Explicit Disclaimers & Detection Limits
- **Not a Clinical Service:** The UI clearly communicates that Cura is an emotional companion, not a clinical healthcare professional or crisis hotline.
- **Honest Detection Limits:** The app explicitly documents that automated keyword or heuristic safety filters **cannot reliably detect every emergency or crisis nuance**.

---

## 4. Infrastructure Security: Clear Boundary of Responsibilities

Security guarantees have been categorized into concrete operational tiers:

| Tier | Security Implementation & Responsibility |
| :--- | :--- |
| **Application Level** *(Implemented in Cura repo)* | - Input validation with Zod schemas on all API endpoints.<br>- Parameterized SQL queries via Drizzle ORM (SQL injection immunity).<br>- Password hashing with `bcrypt` (work factor 12).<br>- JWT verification with short-lived access tokens and user-scoped queries (`WHERE user_id = req.user.id`).<br>- Sensitive message exclusion from server application logs.<br>- **Database-enforced role separation (`ai_service_role` strictly read-only on tasks and moods).** |
| **Operating System Level** *(Platform guarantees)* | - Hardware-backed cryptographic key protection via `expo-secure-store` (iOS Keychain & Android KeyStore).<br>- Application sandboxing isolating local SQLite database files from other installed mobile apps.<br>- System-level notification and alarm permission enforcement. |
| **Hosting Infrastructure** *(Verified upon cloud deployment)* | - TLS 1.3 termination and automated SSL certificates (e.g. Cloudflare, AWS ALB).<br>- PostgreSQL managed disk encryption at rest (AWS KMS / Cloud Disks).<br>- Private network / VPC isolation for PostgreSQL (no open public ports).<br>- Automated database backup snapshots and point-in-time recovery. |

---

## 5. Data Retention, Export, and Permanent Deletion

### 5.1 User Data Export (`/api/user/export`)
- Users have the right to data portability.
- Authenticated endpoint generating machine-readable JSON and CSV bundles containing all tasks, mood logs, analytics summaries, and saved conversations.

### 5.2 Permanent Account & Data Deletion (`/api/user/delete`)
- Users can permanently delete their account at any time from Settings.
- Executed via an immediate **hard cascade delete** across all PostgreSQL tables:
  ```sql
  DELETE FROM users WHERE id = :userId;
  ```
- Local client storage drops all SQLite tables and clears `expo-secure-store`.

### 5.3 Guest Data Wipe
- Guest users who never created an account can trigger a **"Reset All Local Data"** button in Settings, dropping all SQLite tables, clearing AsyncStorage preferences, and canceling all scheduled OS notifications.
