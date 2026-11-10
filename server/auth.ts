import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Store } from "./store.ts";
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, value] = hash.split(":");
  return timingSafeEqual(
    Buffer.from(value, "hex"),
    scryptSync(password, salt, 64),
  );
}
export function getSession(store: Store, req: IncomingMessage) {
  const token = /(?:^|;\s*)db_session=([a-f0-9]+)/.exec(
    req.headers.cookie || "",
  )?.[1];
  return token
    ? (store.db
        .prepare("SELECT email,csrf FROM sessions WHERE token=? AND expires>?")
        .get(digest(token), Date.now()) as
        { email: string; csrf: string } | undefined)
    : undefined;
}
export function login(
  store: Store,
  req: IncomingMessage,
  res: ServerResponse,
  email: string,
) {
  const token = randomBytes(32).toString("hex");
  const csrf = randomBytes(24).toString("hex");
  store.db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
  store.db
    .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
    .run(digest(token), email, csrf, Date.now() + 7 * 86400000);
  res.setHeader(
    "Set-Cookie",
    `db_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.SECURE_COOKIE === "1" || "encrypted" in req.socket ? "; Secure" : ""}`,
  );
  return {
    editor: true,
    setupRequired: false,
    csrf,
    email,
    closed: store.setting("closed") === "true",
  };
}
export function logout(
  store: Store,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const token = /(?:^|;\s*)db_session=([a-f0-9]+)/.exec(
    req.headers.cookie || "",
  )?.[1];
  if (token)
    store.db.prepare("DELETE FROM sessions WHERE token=?").run(digest(token));
  res.setHeader(
    "Set-Cookie",
    "db_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
}
