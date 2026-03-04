import { Database } from "bun:sqlite";

const dbPath = process.env.SCHEDULER_DB_PATH ?? "./intent_scheduler.db";

export const db = new Database(dbPath, { create: true, strict: true });

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
