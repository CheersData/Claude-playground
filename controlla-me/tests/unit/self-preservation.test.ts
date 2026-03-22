/**
 * Tests: lib/company/self-preservation.ts — Zombie Reaper
 *
 * Covers:
 * - reapZombies: no zombies found
 * - reapZombies: multiple killable zombies (5+), all killed
 * - reapZombies: mix of killable and protected — only killable killed
 * - reapZombies: kill failures counted in failed
 * - reapZombies: young processes (< 30 min) not killed
 * - reapZombies: sacred PID protection
 * - reapZombies: large number of zombies (25+)
 * - reapZombies: discovery failure → empty result
 * - reapZombies: processes without creationDate skipped (Unix path)
 * - reapZombies: custom ageThresholdMs
 * - getProcessCategory: command line classification
 * - CATEGORY_KILLABLE / CATEGORY_PROTECTED constants
 * - formatBytes / formatUptime helpers
 *
 * Strategy: Override process.platform to "win32" so discoverOSNodeProcesses
 * takes the wmic CSV path. Mock child_process.execSync to return controlled
 * wmic CSV output for discovery, empty strings for walkParentChain, and
 * success/failure for taskkill (killPid).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock child_process ───────────────────────────────────────────────────────

const mockExecSync = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({ execSync: mockExecSync }));

import {
  reapZombies,
  discoverOSNodeProcesses,
  getProcessCategory,
  formatBytes,
  formatUptime,
  CATEGORY_KILLABLE,
  CATEGORY_PROTECTED,
} from "@/lib/company/self-preservation";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a wmic creation date string from a Date. Format: yyyyMMddHHmmss.ffffff+offset */
function wmicDate(date: Date): string {
  const y = date.getFullYear().toString();
  const mo = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const h = date.getHours().toString().padStart(2, "0");
  const mi = date.getMinutes().toString().padStart(2, "0");
  const s = date.getSeconds().toString().padStart(2, "0");
  return `${y}${mo}${d}${h}${mi}${s}.000000+000`;
}

interface FakeProc {
  pid: number;
  ppid: number;
  cmd: string;
  creationDate: string;
  memBytes: number;
}

/**
 * Build wmic CSV output for discoverOSNodeProcesses (win32 path).
 * Headers: Node,CommandLine,CreationDate,ParentProcessId,ProcessId,WorkingSetSize
 */
function buildWmicCSV(procs: FakeProc[]): string {
  const header = "Node,CommandLine,CreationDate,ParentProcessId,ProcessId,WorkingSetSize";
  const lines = procs.map(
    (p) => `MYPC,${p.cmd},${p.creationDate},${p.ppid},${p.pid},${p.memBytes}`
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}

/** Shorthand: create a killable process (daemon/runner/worker/unknown) */
function proc(pid: number, cmd: string, ageMinutes: number): FakeProc {
  return {
    pid,
    ppid: 1,
    cmd,
    creationDate: wmicDate(new Date(Date.now() - ageMinutes * 60_000)),
    memBytes: 50_000_000,
  };
}

const CMD = {
  daemon: "node cme-autorun.ts --watch",
  runner: "node task-runner.ts",
  worker: "node postcss-worker.js",
  unknown: "node some-random-script.js",
  vscode: "node code helper vscode extensionhost",
  claude: "node claude-code cli.js",
  nextjs: "node next dev",
} as const;

/**
 * Configure mockExecSync with wmic CSV data and optional kill behavior.
 * @param wmicCSV  — output for the wmic discovery call
 * @param killBehavior — function that takes a PID and returns true (kill ok) or throws (fail)
 */
function setupMocks(wmicCSV: string, killBehavior: (pid: number) => void = () => {}) {
  mockExecSync.mockImplementation((cmd: unknown) => {
    const cmdStr = String(cmd);
    // Main wmic discovery — MUST come before ParentProcessId check
    // because the discovery command also contains "ParentProcessId" as a column name
    if (cmdStr.includes("name='node.exe'")) return wmicCSV;
    // walkParentChain — getSacredPIDs (uses /VALUE format, not /FORMAT:CSV)
    if (cmdStr.includes("ParentProcessId")) return "";
    // taskkill for killPid
    if (cmdStr.includes("taskkill")) {
      const match = cmdStr.match(/\/PID\s+(\d+)/);
      if (match) killBehavior(parseInt(match[1], 10));
      return "";
    }
    // tasklist fallback
    if (cmdStr.includes("tasklist")) return "";
    return "";
  });
}

// ── Platform control ─────────────────────────────────────────────────────────

let originalPlatform: string;

function forcePlatform(p: string) {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("self-preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalPlatform = process.platform;
    // Force win32 so reapZombies uses the wmic path with creationDate
    forcePlatform("win32");
    // Default: no processes
    setupMocks(buildWmicCSV([]));
  });

  afterEach(() => {
    forcePlatform(originalPlatform);
  });

  // ── reapZombies ──

  describe("reapZombies", () => {
    it("returns empty result when no processes found", () => {
      setupMocks(buildWmicCSV([]));
      const result = reapZombies();
      expect(result.scanned).toBe(0);
      expect(result.killed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it("returns empty result when discovery throws", () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes("name='node.exe'")) throw new Error("wmic crashed");
        if (cmdStr.includes("ParentProcessId")) return "";
        if (cmdStr.includes("tasklist")) throw new Error("tasklist crashed");
        return "";
      });

      const result = reapZombies();
      expect(result.scanned).toBe(0);
      expect(result.killed).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it("kills multiple killable zombies (6 processes)", () => {
      const csv = buildWmicCSV([
        proc(1001, CMD.daemon, 45),
        proc(1002, CMD.runner, 60),
        proc(1003, CMD.worker, 90),
        proc(1004, CMD.unknown, 120),
        proc(1005, CMD.daemon, 35),
        proc(1006, CMD.unknown, 50),
      ]);
      setupMocks(csv);

      const result = reapZombies();

      expect(result.scanned).toBe(6);
      expect(result.killed).toBe(6);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(6);
      for (const d of result.details) {
        expect(d.killed).toBe(true);
        expect(d.ageMs).toBeGreaterThan(30 * 60_000);
      }
    });

    it("kills only killable, skips protected processes", () => {
      const csv = buildWmicCSV([
        proc(2001, CMD.daemon, 60),         // killable
        proc(2002, CMD.vscode, 120),        // protected
        proc(2003, CMD.runner, 45),         // killable
        proc(2004, CMD.claude, 90),         // protected
        proc(2005, CMD.nextjs, 60),         // protected
        proc(2006, CMD.unknown, 50),        // killable
      ]);
      setupMocks(csv);

      const result = reapZombies();

      expect(result.scanned).toBe(6);
      expect(result.killed).toBe(3); // daemon, runner, unknown
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(3);

      const killedPids = result.details.map((d) => d.pid);
      expect(killedPids).toContain(2001);
      expect(killedPids).toContain(2003);
      expect(killedPids).toContain(2006);
      expect(killedPids).not.toContain(2002); // vscode
      expect(killedPids).not.toContain(2004); // claude-code
      expect(killedPids).not.toContain(2005); // nextjs-dev
    });

    it("counts kill failures in failed field", () => {
      const csv = buildWmicCSV([
        proc(3001, CMD.daemon, 60),
        proc(3002, CMD.runner, 45),
        proc(3003, CMD.unknown, 90),
        proc(3004, CMD.worker, 50),
      ]);
      // PIDs 3002 and 3004 fail to kill
      const failPids = new Set([3002, 3004]);
      setupMocks(csv, (pid) => {
        if (failPids.has(pid)) throw new Error("Access denied");
      });

      const result = reapZombies();

      expect(result.scanned).toBe(4);
      expect(result.killed).toBe(2);
      expect(result.failed).toBe(2);
      expect(result.details).toHaveLength(4);
      expect(result.details.find((d) => d.pid === 3001)?.killed).toBe(true);
      expect(result.details.find((d) => d.pid === 3002)?.killed).toBe(false);
      expect(result.details.find((d) => d.pid === 3003)?.killed).toBe(true);
      expect(result.details.find((d) => d.pid === 3004)?.killed).toBe(false);
    });

    it("does not kill young processes (< 30 min)", () => {
      const csv = buildWmicCSV([
        proc(4001, CMD.daemon, 5),          // 5 min — too young
        proc(4002, CMD.unknown, 15),        // 15 min — too young
        proc(4003, CMD.worker, 29),         // 29 min — too young
        proc(4004, CMD.runner, 31),         // 31 min — old enough
        proc(4005, CMD.daemon, 60),         // 60 min — old enough
      ]);
      setupMocks(csv);

      const result = reapZombies();

      expect(result.scanned).toBe(5);
      expect(result.killed).toBe(2);
      const killedPids = result.details.map((d) => d.pid);
      expect(killedPids).toContain(4004);
      expect(killedPids).toContain(4005);
      expect(killedPids).not.toContain(4001);
      expect(killedPids).not.toContain(4002);
      expect(killedPids).not.toContain(4003);
    });

    it("protects sacred PIDs (current process)", () => {
      const selfPid = process.pid;
      const csv = buildWmicCSV([
        // Current process — should NOT be killed regardless of age
        { pid: selfPid, ppid: 1, cmd: CMD.unknown, creationDate: wmicDate(new Date(Date.now() - 120 * 60_000)), memBytes: 50_000_000 },
        proc(5001, CMD.daemon, 60),
      ]);
      setupMocks(csv);

      const result = reapZombies();

      // self PID gets category "self" → killable=false → skipped
      expect(result.killed).toBe(1);
      const killedPids = result.details.map((d) => d.pid);
      expect(killedPids).not.toContain(selfPid);
      expect(killedPids).toContain(5001);
    });

    it("handles large number of zombies (25)", () => {
      const procs: FakeProc[] = [];
      const cmds = [CMD.daemon, CMD.runner, CMD.worker, CMD.unknown];
      for (let i = 0; i < 25; i++) {
        procs.push(proc(6000 + i, cmds[i % 4], 35 + i * 5));
      }
      setupMocks(buildWmicCSV(procs));

      const result = reapZombies();

      expect(result.scanned).toBe(25);
      expect(result.killed).toBe(25);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(25);
      for (const d of result.details) {
        expect(d.pid).toBeGreaterThanOrEqual(6000);
        expect(d.pid).toBeLessThan(6025);
        expect(d.killed).toBe(true);
        expect(d.ageMs).toBeGreaterThan(30 * 60_000);
        expect(["daemon", "task-runner", "worker", "unknown"]).toContain(d.category);
      }
    });

    it("handles large mixed scenario (25 processes: killable + protected + young + failures)", () => {
      const procs: FakeProc[] = [];

      // 10 old killable daemons (PIDs 7000-7009)
      for (let i = 0; i < 10; i++) {
        procs.push(proc(7000 + i, CMD.daemon, 60 + i * 10));
      }
      // 5 protected old processes (PIDs 7100-7104)
      const protectedCmds = [CMD.vscode, CMD.claude, CMD.nextjs, CMD.vscode, CMD.claude];
      for (let i = 0; i < 5; i++) {
        procs.push(proc(7100 + i, protectedCmds[i], 120));
      }
      // 5 young killable processes (PIDs 7200-7204)
      for (let i = 0; i < 5; i++) {
        procs.push(proc(7200 + i, CMD.unknown, 10 + i * 3));
      }
      // 5 old killable task-runners that fail to kill (PIDs 7300-7304)
      for (let i = 0; i < 5; i++) {
        procs.push(proc(7300 + i, CMD.runner, 45));
      }

      const failPids = new Set([7300, 7301, 7302, 7303, 7304]);
      setupMocks(buildWmicCSV(procs), (pid) => {
        if (failPids.has(pid)) throw new Error("Access denied");
      });

      const result = reapZombies();

      expect(result.scanned).toBe(25);
      expect(result.killed).toBe(10);   // 10 old daemons
      expect(result.failed).toBe(5);    // 5 task-runners that failed
      expect(result.details).toHaveLength(15); // 10 + 5 (protected and young excluded)
    });

    it("on Unix: processes without creationDate are skipped by reapZombies", () => {
      forcePlatform("linux");

      // discoverUnixNodeProcesses calls: ps -eo pid,ppid,rss,etime,args | grep '[n]ode'
      const psOutput = [
        "  8001  1  50000  01:30:00  node cme-autorun.ts",
        "  8002  1  40000  00:45:00  node unknown-script.js",
      ].join("\n") + "\n";

      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes("ps -eo")) return psOutput;
        if (cmdStr.includes("ParentProcessId")) return "";
        return "";
      });

      const result = reapZombies();

      // Unix path: creationDate="" → all processes skipped by age check
      expect(result.scanned).toBe(2);
      expect(result.killed).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it("respects custom ageThresholdMs parameter", () => {
      const csv = buildWmicCSV([
        proc(9001, CMD.daemon, 10),     // 10 min
        proc(9002, CMD.daemon, 20),     // 20 min
        proc(9003, CMD.daemon, 60),     // 60 min
      ]);
      setupMocks(csv);

      // Use 15 min threshold
      const result = reapZombies(15 * 60_000);

      expect(result.scanned).toBe(3);
      expect(result.killed).toBe(2);
      const killedPids = result.details.map((d) => d.pid);
      expect(killedPids).toContain(9002);
      expect(killedPids).toContain(9003);
      expect(killedPids).not.toContain(9001);
    });

    it("details include correct ageMs values", () => {
      const csv = buildWmicCSV([proc(10001, CMD.daemon, 90)]);
      setupMocks(csv);

      const result = reapZombies();

      expect(result.details).toHaveLength(1);
      const detail = result.details[0];
      // Allow 30s tolerance for test execution
      expect(detail.ageMs).toBeGreaterThan(89 * 60_000);
      expect(detail.ageMs).toBeLessThan(91 * 60_000);
      expect(detail.pid).toBe(10001);
      expect(detail.category).toBe("daemon");
    });

    it("details report correct category per process type", () => {
      const csv = buildWmicCSV([
        proc(11001, CMD.daemon, 60),
        proc(11002, CMD.runner, 45),
        proc(11003, CMD.worker, 50),
        proc(11004, CMD.unknown, 90),
      ]);
      setupMocks(csv);

      const result = reapZombies();

      expect(result.details).toHaveLength(4);
      expect(result.details.find((d) => d.pid === 11001)?.category).toBe("daemon");
      expect(result.details.find((d) => d.pid === 11002)?.category).toBe("task-runner");
      expect(result.details.find((d) => d.pid === 11003)?.category).toBe("worker");
      expect(result.details.find((d) => d.pid === 11004)?.category).toBe("unknown");
    });

    it("scans all processes even when none are killable", () => {
      const csv = buildWmicCSV([
        proc(12001, CMD.vscode, 120),
        proc(12002, CMD.claude, 90),
        proc(12003, CMD.nextjs, 60),
      ]);
      setupMocks(csv);

      const result = reapZombies();

      expect(result.scanned).toBe(3);
      expect(result.killed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it("handles all kill failures gracefully", () => {
      const csv = buildWmicCSV([
        proc(13001, CMD.daemon, 60),
        proc(13002, CMD.runner, 45),
        proc(13003, CMD.unknown, 90),
      ]);
      setupMocks(csv, () => {
        throw new Error("Permission denied");
      });

      const result = reapZombies();

      expect(result.scanned).toBe(3);
      expect(result.killed).toBe(0);
      expect(result.failed).toBe(3);
      expect(result.details).toHaveLength(3);
      for (const d of result.details) {
        expect(d.killed).toBe(false);
      }
    });
  });

  // ── getProcessCategory ──

  describe("getProcessCategory", () => {
    it("detects VS Code processes", () => {
      expect(getProcessCategory("C:\\Program Files\\Microsoft VS Code\\code.exe --type=renderer")).toBe("vscode");
      expect(getProcessCategory("node /usr/share/code/extensionHost.js")).toBe("vscode");
      expect(getProcessCategory("node electron code helper")).toBe("vscode");
    });

    it("detects Claude Code processes", () => {
      expect(getProcessCategory("node /home/user/.claude-code/cli.js")).toBe("claude-code");
      expect(getProcessCategory("node claude code session")).toBe("claude-code");
    });

    it("detects Next.js dev server", () => {
      expect(getProcessCategory("node /app/node_modules/.bin/next dev")).toBe("nextjs-dev");
      expect(getProcessCategory("node next-server.js")).toBe("nextjs-dev");
      expect(getProcessCategory("node start-server.js")).toBe("nextjs-dev");
    });

    it("detects daemon processes", () => {
      expect(getProcessCategory("node scripts/cme-autorun.ts --watch")).toBe("daemon");
      expect(getProcessCategory("npx tsx cme-daemon")).toBe("daemon");
    });

    it("detects task-runner processes", () => {
      expect(getProcessCategory("claude -p 'do something'")).toBe("task-runner");
      expect(getProcessCategory("node task-runner.ts")).toBe("task-runner");
      expect(getProcessCategory("npx tsx company-tasks.ts exec")).toBe("task-runner");
    });

    it("detects worker processes", () => {
      expect(getProcessCategory("node postcss-worker.js")).toBe("worker");
      expect(getProcessCategory("node turbopack-dev-server")).toBe("worker");
      expect(getProcessCategory("node esbuild --bundle")).toBe("worker");
      expect(getProcessCategory("node swc compile")).toBe("worker");
      expect(getProcessCategory("node tailwindcss --watch")).toBe("worker");
      expect(getProcessCategory("node lightningcss build")).toBe("worker");
    });

    it("returns unknown for unrecognized command lines", () => {
      expect(getProcessCategory("node my-random-script.js")).toBe("unknown");
      expect(getProcessCategory("node index.js")).toBe("unknown");
      expect(getProcessCategory("")).toBe("unknown");
    });
  });

  // ── Constants ──

  describe("CATEGORY_KILLABLE", () => {
    it("marks killable categories", () => {
      expect(CATEGORY_KILLABLE["daemon"]).toBe(true);
      expect(CATEGORY_KILLABLE["task-runner"]).toBe(true);
      expect(CATEGORY_KILLABLE["worker"]).toBe(true);
      expect(CATEGORY_KILLABLE["unknown"]).toBe(true);
    });

    it("marks non-killable categories", () => {
      expect(CATEGORY_KILLABLE["self"]).toBe(false);
      expect(CATEGORY_KILLABLE["vscode"]).toBe(false);
      expect(CATEGORY_KILLABLE["claude-code"]).toBe(false);
      expect(CATEGORY_KILLABLE["nextjs-dev"]).toBe(false);
    });
  });

  describe("CATEGORY_PROTECTED", () => {
    it("marks protected categories", () => {
      expect(CATEGORY_PROTECTED["self"]).toBe(true);
      expect(CATEGORY_PROTECTED["vscode"]).toBe(true);
      expect(CATEGORY_PROTECTED["claude-code"]).toBe(true);
      expect(CATEGORY_PROTECTED["nextjs-dev"]).toBe(true);
    });

    it("marks non-protected categories", () => {
      expect(CATEGORY_PROTECTED["daemon"]).toBe(false);
      expect(CATEGORY_PROTECTED["task-runner"]).toBe(false);
      expect(CATEGORY_PROTECTED["worker"]).toBe(false);
      expect(CATEGORY_PROTECTED["unknown"]).toBe(false);
    });
  });

  // ── formatBytes ──

  describe("formatBytes", () => {
    it("formats bytes", () => expect(formatBytes(500)).toBe("500 B"));
    it("formats kilobytes", () => {
      expect(formatBytes(2048)).toBe("2 KB");
      expect(formatBytes(1500)).toBe("1 KB");
    });
    it("formats megabytes", () => expect(formatBytes(50 * 1024 * 1024)).toBe("50.0 MB"));
    it("formats gigabytes", () => expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.00 GB"));
  });

  // ── formatUptime ──

  describe("formatUptime", () => {
    it("formats negative as N/A", () => expect(formatUptime(-1)).toBe("N/A"));
    it("formats seconds", () => expect(formatUptime(30_000)).toBe("30s"));
    it("formats minutes and seconds", () => expect(formatUptime(90_000)).toBe("1m 30s"));
    it("formats hours and minutes", () => expect(formatUptime(3_660_000)).toBe("1h 1m"));
    it("formats days and hours", () => expect(formatUptime(90_000_000)).toBe("1d 1h"));
  });
});
