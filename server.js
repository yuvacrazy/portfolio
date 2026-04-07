const http = require("http");
const path = require("path");
const { URL } = require("url");
const fs = require("fs");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATABASE_URL = process.env.DATABASE_URL;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".ico": "image/x-icon"
};

if (!DATABASE_URL) {
    console.warn("DATABASE_URL is not set. Contact form submissions will be unavailable.");
}

const pool = DATABASE_URL
    ? new Pool({
        connectionString: DATABASE_URL,
        ssl: shouldUseSsl(DATABASE_URL) ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000
    })
    : null;

let databaseReady = false;
let databaseError = null;

const server = http.createServer(async (req, res) => {
    const host = req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `http://${host}`);

    if (req.method === "GET" && url.pathname === "/healthz") {
        return sendJson(res, 200, {
            ok: true,
            status: "healthy",
            database: databaseReady ? "connected" : (DATABASE_URL ? "connecting" : "not-configured")
        });
    }

    if (req.method === "POST" && url.pathname === "/api/contact") {
        return handleContact(req, res);
    }

    if (req.method === "GET") {
        return serveStatic(url.pathname, res);
    }

    sendJson(res, 405, { ok: false, message: "Method not allowed." });
});

start();

function handleContact(req, res) {
    collectJson(req)
        .then(async (payload) => {
            const name = String(payload.name || "").trim();
            const email = String(payload.email || "").trim();
            const message = String(payload.message || "").trim();

            if (!name || !email || !message) {
                return sendJson(res, 400, {
                    ok: false,
                    message: "Name, email, and message are required."
                });
            }

            if (!isValidEmail(email)) {
                return sendJson(res, 400, {
                    ok: false,
                    message: "Please enter a valid email address."
                });
            }

            const entry = {
                name,
                email,
                message,
                receivedAt: new Date().toISOString()
            };

            if (!pool) {
                throw new Error("Database is not configured.");
            }

            if (!databaseReady) {
                throw new Error(databaseError || "Database is still connecting.");
            }

            await pool.query(
                `INSERT INTO contact_submissions (name, email, message, received_at)
                 VALUES ($1, $2, $3, $4)`,
                [entry.name, entry.email, entry.message, entry.receivedAt]
            );

            sendJson(res, 200, {
                ok: true,
                message: "Message received successfully."
            });
        })
        .catch((error) => {
            if (error && error.code === "INVALID_JSON") {
                return sendJson(res, 400, {
                    ok: false,
                    message: "Invalid request body."
                });
            }

            console.error("Contact submission failed:", error);
            sendJson(res, 500, {
                ok: false,
                message: "Unable to save your message right now."
            });
        });
}

function collectJson(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", (chunk) => {
            body += chunk;

            if (body.length > 1e6) {
                req.destroy();
                reject(new Error("Payload too large"));
            }
        });

        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                const parseError = new Error("Invalid JSON");
                parseError.code = "INVALID_JSON";
                reject(parseError);
            }
        });

        req.on("error", reject);
    });
}

function serveStatic(pathname, res) {
    const safePath = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.normalize(path.join(ROOT, safePath));

    if (!filePath.startsWith(ROOT)) {
        return sendText(res, 403, "Forbidden");
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            return sendText(res, 404, "Not found");
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
        });
        res.end(data);
    });
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8"
    });
    res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
    res.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8"
    });
    res.end(message);
}

async function start() {
    console.log(`Starting portfolio server on port ${PORT}...`);
    console.log(`Database configured: ${DATABASE_URL ? "yes" : "no"}`);

    server.listen(PORT, () => {
        console.log(`Portfolio server running at http://localhost:${PORT}`);
    });

    initializeDatabase().catch((error) => {
        console.error("Database initialization failed:", error);
    });
}

async function initializeDatabase() {
    if (!pool) {
        return;
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS contact_submissions (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    databaseReady = true;
    databaseError = null;
    console.log("Database initialization complete.");
}

function shouldUseSsl(connectionString) {
    return !/localhost|127\.0\.0\.1/i.test(connectionString);
}
