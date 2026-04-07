# Yuvaraja Portfolio

Simple personal portfolio site with a Node.js backend for the contact form.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Environment variables

Create a `.env` file locally or set environment variables in your hosting platform:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE
PORT=3000
```

For local PostgreSQL, SSL is not required. For Render Postgres, the app enables SSL automatically.

## Deploy on Render

This repo includes [`render.yaml`](./render.yaml), so Render can detect the service automatically and provision both the web service and its PostgreSQL database.

### Steps

1. Push this project to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Render will provision:
   - a web service named `yuvaraja-portfolio`
   - a Postgres database named `yuvaraja-portfolio-db`
4. Render will inject `DATABASE_URL` into the web service automatically.
5. The service will use:
   - Build command: `npm install`
   - Start command: `npm start`
6. After deploy, open:
   - `/` for the site
   - `/healthz` for a basic health check

## Database behavior

On startup, the server automatically creates a `contact_submissions` table if it does not already exist.

Each contact form submission stores:

- name
- email
- message
- received timestamp
