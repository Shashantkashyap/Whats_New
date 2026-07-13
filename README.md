<p align="center">
  <h1 align="center">📰 What's New — UPSC News Intelligence Platform</h1>
  <p align="center">
    <strong>AI-powered microservices backend that curates, enriches, and delivers UPSC-relevant news content using Google Gemini and smart NLP pipelines.</strong>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-v5-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Gemini_AI-2.5_Flash-4285F4?logo=google&logoColor=white" alt="Gemini AI" />
  <img src="https://img.shields.io/badge/Architecture-Microservices-FF6F00" alt="Architecture" />
</p>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Services Breakdown](#-services-breakdown)
  - [Content Service](#1-content-service)
  - [User Service](#2-user-service)
- [API Reference](#-api-reference)
- [Database Schemas](#-database-schemas)
- [Content Pipeline Deep Dive](#-content-pipeline-deep-dive)
- [Environment Variables](#-environment-variables)
- [Getting Started](#-getting-started)
- [Development](#-development)
- [License](#-license)

---

## 🌟 Overview

**What's New** is a backend platform purpose-built for **UPSC (Civil Services)** aspirants. It automates the daily grind of news curation by:

1. **Fetching** the top 5 most UPSC-relevant news stories daily from premium Indian sources (The Hindu, Indian Express, PIB, Economic Times, Livemint).
2. **Enriching** each article with AI-generated UPSC study material — summaries, flowcharts, MCQs, Mains questions, exam relevance tags, and significance analysis — using **Google Gemini 2.5 Flash** with native structured output.
3. **Scoring** every article with a smart relevance algorithm based on subject priority, recency, and source credibility.
4. **Serving** the enriched content through clean REST APIs with filtering, date-based pagination, and full-text search.
5. **Managing** user accounts with secure JWT authentication, OTP email verification, profile management, and interest-based personalization.

The system follows a **microservices architecture** with independent `content-service` and `user-service`, each backed by its own **MongoDB** database, ensuring separation of concerns and independent scalability.

---

## 🏛️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       Client Applications                        │
│                  (Mobile App / Web Frontend)                     │
└────────────────────────┬────────────────┬────────────────────────┘
                         │                │
                         ▼                ▼
              ┌──────────────────┐ ┌──────────────────┐
              │  Content Service │ │   User Service   │
              │   (Port 5000)    │ │   (Port 4001)    │
              │                  │ │                  │
              │  ┌────────────┐  │ │  ┌────────────┐  │
              │  │ News CRUD  │  │ │  │    Auth    │  │
              │  │    API     │  │ │  │  (JWT/OTP) │  │
              │  └────────────┘  │ │  └────────────┘  │
              │  ┌────────────┐  │ │  ┌────────────┐  │
              │  │  Content   │  │ │  │  Profile   │  │
              │  │  Pipeline  │  │ │  │ Management │  │
              │  └─────┬──────┘  │ │  └────────────┘  │
              │        │         │ │  ┌────────────┐  │
              │  ┌─────▼──────┐  │ │  │ Interests  │  │
              │  │ Gemini AI  │  │ │  │   Mgmt     │  │
              │  │ + Unsplash │  │ │  └────────────┘  │
              │  └────────────┘  │ │                  │
              └────────┬─────────┘ └────────┬─────────┘
                       │                    │
                       ▼                    ▼
              ┌──────────────────┐ ┌──────────────────┐
              │    MongoDB       │ │    MongoDB       │
              │  (News Content)  │ │  (Users/Auth)    │
              └──────────────────┘ └──────────────────┘
```

---

## 🛠️ Tech Stack

| Layer              | Technology                                        | Purpose                                      |
| :----------------- | :------------------------------------------------ | :------------------------------------------- |
| **Runtime**        | Node.js (v18+)                                    | JavaScript server runtime                    |
| **Framework**      | Express.js v5                                     | HTTP server and routing                       |
| **Content DB**     | MongoDB + Mongoose v8                             | NoSQL storage for news articles               |
| **User DB**        | MongoDB + Mongoose v8                             | NoSQL storage for users, OTPs & auth          |
| **AI Engine**      | Google Gemini 2.5 Flash (`@google/generative-ai`) | Structured content generation & enrichment    |
| **Image API**      | Unsplash API                                      | Context-relevant article images               |
| **Auth**           | JWT (Access + Refresh tokens) + bcrypt            | Stateless authentication with token rotation  |
| **Email**          | Nodemailer (Gmail SMTP)                           | OTP delivery for signup & password reset      |
| **Scraping**       | Puppeteer + Cheerio                               | Web scraping capabilities (pipeline-ready)    |
| **HTTP Client**    | Axios                                             | External API requests                         |
| **Scheduling**     | node-cron                                         | Scheduled pipeline execution (scaffolded)     |
| **Dev Tools**      | Nodemon                                           | Hot-reload server                             |

---

## 📁 Project Structure

```
Whats_New/
├── package.json                    # Root-level shared dependencies
├── .gitignore                      # Ignores node_modules and .env files
├── README.md                       # This file
├── migrations/                     # Root-level Sequelize migrations (legacy)
│   └── 20250825151555-add-purpose-to-otp.js
│
└── services/
    ├── content-service/            # 🔵 AI-Powered News Content Microservice
    │   ├── index.js                #    Entry point — connects MongoDB, starts server
    │   ├── app.js                  #    Express app setup with CORS and routes
    │   ├── package.json            #    Service-specific dependencies
    │   ├── config/
    │   │   ├── db.js               #    MongoDB connection via Mongoose
    │   │   ├── gemni.js            #    Google Gemini model configuration
    │   │   └── newsConfig.js       #    Sources, feeds, timeouts, provider selection
    │   ├── controllers/
    │   │   └── newsController.js   #    CRUD operations for News articles
    │   ├── models/
    │   │   └── News.js             #    Mongoose schema — News with UPSC fields
    │   ├── routes/
    │   │   ├── newsRoutes.js       #    REST routes for /api/v1/news
    │   │   └── contentRoutes.js    #    Pipeline trigger route /api/v1/content
    │   ├── pipeline/
    │   │   └── contentPipeline.js  #    🧠 Core AI pipeline (fetch → enrich → store)
    │   ├── providers/              #    Pluggable news providers (RSS default, Chrome MCP)
    │   ├── services/               #    Scrape, dedup, quality-filter, cache, Gemini tools
    │   ├── utils/
    │   │   ├── concurrency.js      #    mapLimit + withRetry helpers
    │   │   ├── logger.js           #    Structured JSON logger
    │   │   └── rssParser.js        #    Dependency-free RSS/Atom parser
    │   ├── docs/                   #    Architecture docs
    │   └── test/                   #    node:test unit suites
    │
    └── user-service/               # 🟢 User Authentication & Profile Microservice
        ├── index.js                #    Entry point — connects MongoDB, starts server
        ├── package.json            #    Service-specific dependencies
        ├── config/
        │   └── db.js               #    MongoDB connection via Mongoose
        ├── controllers/
        │   ├── authController.js   #    Register, Login, OTP, Token refresh, Password reset
        │   └── userController.js   #    Profile CRUD, Interest management
        ├── middleware/
        │   └── auth.js             #    JWT access-token authentication middleware
        ├── models/
        │   ├── User.js             #    Mongoose user schema (embeds interests[])
        │   └── Otp.js              #    Mongoose OTP schema (TTL-indexed, purpose-based)
        ├── routes/
        │   ├── auth.js             #    Public auth routes (/register, /login, etc.)
        │   └── user.js             #    Protected user routes (/me, /interests)
        └── utils/
            ├── response.js         #    Standardized API response helpers
            ├── sendEmail.js        #    Nodemailer email sender (Gmail SMTP)
            ├── sendTestMail.js     #    Email configuration test script
            └── tokenfunction.js    #    JWT token generation & verification
```

---

## 🔍 Services Breakdown

### 1. Content Service

> **Port:** `5000` &nbsp;|&nbsp; **Database:** MongoDB &nbsp;|&nbsp; **AI:** Google Gemini 1.5 Flash

The Content Service is the brain of the platform. It handles all news content lifecycle — from AI-powered fetching and enrichment to storage, querying, and maintenance.

#### Key Features

| Feature                     | Description                                                                             |
| :-------------------------- | :-------------------------------------------------------------------------------------- |
| **News CRUD**               | Full Create / Read / Update / Delete operations on enriched news articles                |
| **AI Content Pipeline**     | End-to-end pipeline that fetches, processes, enriches, and stores UPSC-relevant news     |
| **Gemini Integration**      | Uses Google Gemini 1.5 Flash for generating summaries, MCQs, flowcharts, and analysis    |
| **Smart Image Selection**   | Generates contextual Unsplash search terms based on news tags, title, and content        |
| **Relevance Scoring**       | Multi-factor scoring algorithm (0-10) based on subject priority, recency, and source     |
| **Date-Based Pagination**   | Page 1 = today's news, Page 2 = yesterday's, etc.                                       |
| **Full-Text Search**        | MongoDB text indexes on `title`, `content`, and `description` for keyword search         |
| **Duplicate Detection**     | Detects and deduplicates news articles by title or URL before insertion                  |
| **Emergency Backup**        | Export all content to JSON backups with timestamped files                                |
| **Content Analytics**       | Aggregation-based analytics — tag distribution, score distribution, quality metrics       |
| **Schema Validation**       | Validates AI-generated content for completeness (summary points, MCQ format, etc.)        |

#### Content Pipeline Flow

```
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Fetch News  │────▶│  Tag & Score  │────▶│  Gemini Enrich   │────▶│  Unsplash Image │
│  (5 articles)│     │  (0-10 scale) │     │  (Summary, MCQs, │     │  (Contextual)   │
│              │     │               │     │   Flowchart, Why) │     │                 │
└──────────────┘     └───────────────┘     └──────────────────┘     └────────┬────────┘
                                                                            │
                                           ┌──────────────────┐            │
                                           │   Store to DB    │◀───────────┘
                                           │  (MongoDB News)  │
                                           └──────────────────┘
```

**Pipeline Modes:**
- **`dev`** — Uses 5 hardcoded sample UPSC news articles for testing
- **`prod`** — Collects **real** articles by browsing approved newspaper sites via Chrome MCP. Gemini decides *when* news is needed and calls the `scrape_news` tool; it never invents articles. See [`services/content-service/docs/NEWS_PIPELINE_ARCHITECTURE.md`](services/content-service/docs/NEWS_PIPELINE_ARCHITECTURE.md).

---

### 2. User Service

> **Port:** `4001` &nbsp;|&nbsp; **Database:** MongoDB &nbsp;|&nbsp; **ODM:** Mongoose

The User Service handles all authentication, profile management, and user personalization.

#### Key Features

| Feature                   | Description                                                                           |
| :------------------------ | :------------------------------------------------------------------------------------ |
| **Email Registration**    | User registers with email + password → receives OTP via Gmail SMTP                    |
| **OTP Verification**      | 6-digit OTP with 10-minute expiry, purpose-based (`signup` / `forgot_password`)        |
| **Secure Login**          | bcrypt password hashing + JWT access token (59 min) & refresh token (7 days)           |
| **Token Rotation**        | Refresh tokens are hashed (bcrypt) in DB, rotated on each refresh request              |
| **Cookie-Based Auth**     | HttpOnly, Secure, SameSite=Strict cookies for both access and refresh tokens           |
| **Password Reset**        | Forgot password → OTP sent → Verify → Reset with new password                         |
| **Profile Management**    | Update first name, last name, username (unique), bio, avatar URL                       |
| **Interest Tracking**     | JSON-based interest storage with separate CRUD endpoints                                |
| **Standardized Responses**| All responses follow `{ success, message, data }` or `{ success, error }` format       |

#### Authentication Flow

```
  Register                   Verify OTP                  Login
  ────────                   ──────────                  ─────
  POST /auth/register        POST /auth/verify-otp       POST /auth/login
       │                          │                           │
       ▼                          ▼                           ▼
  Create User (unverified)   Mark user verified          Verify password
  Generate OTP               Delete OTP record           Generate JWT tokens
  Send OTP via email          Set JWT cookies             Set JWT cookies
       │                          │                           │
       ▼                          ▼                           ▼
  "Verify your email"        "Logged in ✅"              "Logged in ✅"


  Token Refresh               Forgot Password            Reset Password
  ─────────────               ───────────────            ──────────────
  POST /auth/refresh-token    POST /auth/forgot-password POST /auth/reset-password
       │                           │                          │
       ▼                           ▼                          ▼
  Verify refresh token        Generate forgot OTP        Verify forgot OTP
  Compare hashed token        Send OTP via email         Hash new password
  Rotate both tokens                                     Update user record
```

---

## 📡 API Reference

### Content Service — Base URL: `http://localhost:5000/api/v1`

#### News Endpoints (`/news`)

| Method   | Endpoint     | Description                          | Auth |
| :------- | :----------- | :----------------------------------- | :--- |
| `POST`   | `/news`      | Create a new news article            | ❌   |
| `GET`    | `/news`      | Get all news (with filters & paging) | ❌   |
| `GET`    | `/news/:id`  | Get a single news article by ID      | ❌   |
| `PUT`    | `/news/:id`  | Update a news article                | ❌   |
| `DELETE` | `/news/:id`  | Delete a news article                | ❌   |

**GET `/news` Query Parameters:**

| Parameter  | Type   | Default | Description                                       |
| :--------- | :----- | :------ | :------------------------------------------------ |
| `page`     | number | `1`     | Date-based page (1=today, 2=yesterday, etc.)       |
| `limit`    | number | `20`    | Max articles per page                               |
| `category` | string | —       | Comma-separated categories (e.g., `Polity,Economy`) |
| `source`   | string | —       | Filter by source name                               |
| `keywords` | string | —       | Search in title, content, and description            |

#### Content Pipeline Endpoints (`/content`)

| Method | Endpoint          | Description                            | Auth |
| :----- | :---------------- | :------------------------------------- | :--- |
| `POST` | `/content/fetch-now` | Manually trigger the content pipeline | ❌   |

---

### User Service — Base URL: `http://localhost:4001/api/v1`

#### Auth Endpoints (`/auth`) — 🔓 Public

| Method | Endpoint               | Body                          | Description                    |
| :----- | :--------------------- | :---------------------------- | :----------------------------- |
| `POST` | `/auth/register`       | `{ email, password }`         | Register new user + send OTP   |
| `POST` | `/auth/verify-otp`     | `{ email, code }`             | Verify signup OTP              |
| `POST` | `/auth/login`          | `{ email, password }`         | Login and receive JWT cookies  |
| `POST` | `/auth/logout`         | —                             | Clear tokens and cookies       |
| `POST` | `/auth/forgot-password`| `{ email }`                   | Send password reset OTP        |
| `POST` | `/auth/reset-password` | `{ email, otp, newPassword }` | Reset password with OTP        |
| `POST` | `/auth/refresh-token`  | — (uses cookie)               | Refresh access token           |

#### User Endpoints (`/users`) — 🔒 Protected (JWT Required)

| Method | Endpoint           | Body                                          | Description             |
| :----- | :----------------- | :-------------------------------------------- | :---------------------- |
| `GET`  | `/users/me`        | —                                             | Get current user profile |
| `PUT`  | `/users/me`        | `{ email?, firstName?, lastName?, username?, bio?, avatar? }` | Update profile |
| `GET`  | `/users/interests` | —                                             | Get user interests      |
| `PUT`  | `/users/interests` | `{ interests: ["Polity", "Economy", ...] }`   | Update interests        |

---

## 🗄️ Database Schemas

### MongoDB — News Schema (`content-service`)

```javascript
{
  title:           String (required, trimmed),
  description:     String (required, trimmed),       // "Why" explanation or headline
  content:         String (required, trimmed),       // Joined summary points
  url:             String,                           // Original article URL
  source:          String,                           // e.g., "The Hindu"
  author:          String,
  publishedAt:     Date (indexed),

  // 🎓 UPSC-Specific Fields
  why:             String,                           // Significance & context analysis
  summary:         [String],                         // 8-10 bullet points
  flowchart:       String,                           // Plain-text flowchart fallback
  flowchartNodes:  [{                                // Interactive flowchart data
    id:            String,                           //   Unique node ID ("step1")
    label:         String,                           //   Node title
    content:       String,                           //   2-3 sentence explanation
    connections:   [String]                          //   Connected node IDs
  }],
  examRelevance:   [String],                         // e.g., ["GS-II: Polity", "Prelims"]
  mcqs:            [{                                // Multiple choice questions
    question:      String,
    options:       [String],                         //   Exactly 4 options
    answer:        String                            //   Matches one option exactly
  }],
  mainsQuestion:   {                                 // UPSC Mains practice question
    question:      String,
    hints:         [String]
  },
  imageUrl:        String,                           // Unsplash or placeholder URL

  // 🏷️ Classification
  tags:            [String],                         // Subject tags
  categories:      [String],                         // e.g., ["UPSC", "Current Affairs"]
  relevanceScore:  Number (0-10),                    // Smart relevance score

  // Timestamps
  createdAt:       Date (auto),
  updatedAt:       Date (auto)
}
```

**Indexes:** `{ relevanceScore: -1, publishedAt: -1 }`, `{ categories: 1 }`, `{ source: 1 }`, Text index on `title + content + description`

---

### MongoDB — User & OTP Collections (`user-service`)

**User Schema:**

```javascript
{
  email:        String (required, unique, lowercased),
  password:     String (required, bcrypt hashed),
  isVerified:   Boolean (default: false),
  refreshToken: String (nullable, bcrypt hashed, rotated on refresh),

  // Optional profile
  firstName:    String,
  lastName:     String,
  username:     String (unique, sparse),
  bio:          String,
  avatar:       String,                              // URL

  interests:    [String] (default: []),             // embedded, no join table

  createdAt:    Date (auto),
  updatedAt:    Date (auto)
}
```

**OTP Schema:**

```javascript
{
  code:      String (required),                      // 6-digit OTP
  expiresAt: Date (required, TTL index — auto-purged after expiry),
  purpose:   String (required, default "signup" | "forgot_password"),
  user:      ObjectId (ref: "User", required),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}
```

> Interests are embedded on the user document (a small, bounded, read-as-a-whole list), so there is no separate collection. OTPs self-clean via a TTL index on `expiresAt`.

---

## 🧠 Content Pipeline Deep Dive

The `contentPipeline.js` is the heart of the platform — a production-ready pipeline that orchestrates the entire content enrichment workflow. Gemini calls use **native structured output** (`responseSchema`) so responses are always valid JSON, and articles are enriched with **bounded concurrency** rather than a strictly serial loop.

### Subject Tag Priority System

Tags are classified into three priority tiers that directly affect relevance scoring:

| Priority | Tags | Score Bonus |
| :------- | :--- | :---------- |
| 🔴 **High** | Polity, Economy, IR, Environment, Science & Tech, Internal Security, Governance, Ethics | +3 per tag |
| 🟡 **Medium** | Social Issues, Health, Education, Agriculture, Infrastructure, Energy, Climate Change | +2 per tag |
| 🟢 **Low** | Transport, Technology, Cybersecurity, Culture, Disaster Management, Legal Affairs, Judiciary, Finance, Trade, Public Administration, Innovation | +1 per tag |

### Relevance Score Calculation (0-10)

```
Score = Σ(tag_priority_bonus) + recency_bonus + source_bonus

Recency Bonus:
  ≤ 1 day old  → +3
  ≤ 3 days old → +2
  ≤ 7 days old → +1

Source Bonus:
  Premium sources (The Hindu, Indian Express, PIB, ET, Livemint, Business Standard) → +2

Final score is clamped to [0, 10]
```

### AI-Generated Content Structure

For each news article, Gemini generates:

1. **Headline** — Concise, exam-focused (max 80 chars)
2. **Why** — Real controversy/context/significance with specific scenarios
3. **Summary** — 8-10 comprehensive bullet points (~200 words total)
4. **Flowchart Nodes** — 5 interconnected steps (Background → Current Development → Government Response → Stakeholders Impact → Future Implications)
5. **Exam Relevance** — Specific GS papers and topics (e.g., "GS-II: Polity and Constitution")
6. **MCQs** — Multiple choice questions with 4 options and correct answer
7. **Mains Question** — Analytical question with 3 answer hints

### Smart Image Selection

The pipeline generates intelligent Unsplash search terms:

1. Maps UPSC tags to relevant visual concepts (e.g., `Polity` → "indian parliament government building")
2. Extracts meaningful keywords from the article title
3. Falls back to topic-based visual concepts
4. Uses the "why" field keywords as a last resort
5. Default: "india government news current affairs"

### Utilities & Maintenance

| Function | Description |
| :--- | :--- |
| `cleanupDuplicateNews()` | Aggregates and removes duplicate news entries by title |
| `updateRelevanceScores()` | Recalculates scores for all existing articles |
| `batchUpdateCategories()` | Auto-assigns categories based on tags for uncategorized articles |
| `getContentAnalytics()` | Returns total content, daily stats, tag distribution, avg scores |
| `getDetailedAnalytics()` | Advanced analytics — source stats, daily trends, score distribution, content quality |
| `emergencyBackup()` | Exports all news to `backups/news-backup-<timestamp>.json` |
| `restoreFromBackup(file)` | Restores all news data from a backup file (destructive operation) |

---

## 🔐 Environment Variables

Create a `.env` file at the root and/or within each service directory.

### Content Service (`services/content-service/.env`)

```env
# Server
PORT=5000

# MongoDB
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# OpenAI (optional, alternative AI provider)
OPENAI_API_KEY=your_openai_api_key

# Unsplash (for article images)
UNSPLASH_ACCESS_KEY=your_unsplash_access_key
```

### User Service (`services/user-service/.env`)

```env
# Server
PORT=4001

# MongoDB
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>

# JWT Secrets
JWT_SECRET=your_jwt_secret_key
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key

# Email (Gmail SMTP)
EMAIL_USER=your_gmail_address@gmail.com
EMAIL_PASS=your_gmail_app_password

# Environment
NODE_ENV=development
```

> **⚠️ Note:** For Gmail SMTP, you need to generate an [App Password](https://myaccount.google.com/apppasswords) (not your regular password). This requires 2-Factor Authentication to be enabled on your Google account.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **MongoDB** instance (local or Atlas) — used by both services
- **Google Gemini API Key** — [Get one here](https://aistudio.google.com/app/apikey)
- **Unsplash API Key** — [Register here](https://unsplash.com/developers)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Shashantkashyap/Whats_New.git
cd Whats_New

# 2. Install root dependencies
npm install

# 3. Install Content Service dependencies
cd services/content-service
npm install

# 4. Install User Service dependencies
cd ../user-service
npm install
```

### Configure Environment

```bash
# 5. Create .env files (see Environment Variables section above)
# Content Service
cp services/content-service/.env.example services/content-service/.env

# User Service
cp services/user-service/.env.example services/user-service/.env
```

> **No migrations needed.** Both services use MongoDB; Mongoose creates
> collections and indexes on first write. Just set `MONGO_URI` in each service's
> `.env` and start the servers.

### Start the Services

```bash
# Terminal 1 — Content Service
cd services/content-service
node index.js

# Terminal 2 — User Service
cd services/user-service
npm run dev    # Uses nodemon for hot-reload
```

### Verify Setup

```bash
# Test Content Service
curl http://localhost:5000/api/v1/news

# Test User Service (register a user)
curl -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Test@123"}'

# Trigger Content Pipeline (manual)
curl -X POST http://localhost:5000/api/v1/content/fetch-now

# Test Gemini Connection
cd services/content-service
node testgemni.js
```

---

## 💻 Development

### Running in Development Mode

```bash
# User Service (with hot-reload via nodemon)
cd services/user-service
npm run dev

# Content Service (manual restart needed)
cd services/content-service
node index.js
```

### Testing the Content Pipeline

```javascript
// In your Node.js REPL or script:
const { runContentPipeline, testGeminiConnection } = require("./pipeline/contentPipeline");

// Test Gemini connectivity
await testGeminiConnection();

// Run pipeline in dev mode (sample data)
await runContentPipeline("dev");

// Run pipeline in prod mode (real news from Gemini)
await runContentPipeline("prod");
```

### Testing Email Configuration

```bash
cd services/user-service
node utils/sendTestMail.js
```

---

## 📝 License

This project is licensed under the **ISC License**.

---

<p align="center">
  <strong>Built with ❤️ for UPSC aspirants</strong><br/>
  <sub>Automate the news. Focus on the preparation.</sub>
</p>
