/**
 * Shared session store for Company chat.
 * Stores active Claude Code child processes for multi-turn interactive chat.
 *
 * Each session = a running `claude -p` subprocess with stdin/stdout open.
 * Follow-up messages write to stdin in stream-json format.
 */

import type { ChildProcess } from "child_process";

interface ActiveSession {
  child: ChildProcess;
  target: string;
}

const sessions = new Map<string, ActiveSession>();

export function setSession(id: string, session: ActiveSession) {
  sessions.set(id, session);
}

export function getSession(id: string) {
  return sessions.get(id);
}

export function deleteSession(id: string) {
  sessions.delete(id);
}
