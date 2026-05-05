import Database from "better-sqlite3";
const db = new Database("./data/app.db");

try { db.exec("ALTER TABLE messages ADD COLUMN attachmentName TEXT"); } catch(e){}
try { db.exec("ALTER TABLE messages ADD COLUMN attachmentSize INTEGER"); } catch(e){}

console.log("DB upgraded");
