# Smart Campus Management (MERN)

A modular full-stack Smart Campus web platform using MongoDB, Express, React, and Node.js.

## Monorepo Structure
..
- `client/` React + Vite frontend
- `server/` Express + MongoDB backend
- `docs/` architecture and planning notes

## Features Included

- Modern landing page with dynamic 3D motion effects
- White/cream themed UI with clean layout
- Scalable backend folder structure (config, db, modules, middleware)
- REST API starter modules (`health`, `campus`)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Setup environment:

```bash
cp .env.example .env
```

3. Run backend:

```bash
npm run dev:server
```

4. Run frontend (new terminal):

```bash
npm run dev:client
```

## API Endpoints

- `GET /api/v1/health`
- `GET /api/v1/campus/overview`

## Stack

- Frontend: React, Vite, CSS (custom animations + 3D interactions)
- Backend: Node.js, Express, Mongoose
- DB: MongoDB Atlas

