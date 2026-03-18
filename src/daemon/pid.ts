import fs from 'fs';
import path from 'path';

const PID_PATH = path.join(process.cwd(), 'data', 'daemon.pid');

export function writePid(pid: number): void {
  fs.writeFileSync(PID_PATH, String(pid), 'utf8');
}

export function readPid(): number | null {
  if (!fs.existsSync(PID_PATH)) return null;
  const pid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim(), 10);
  return isNaN(pid) ? null : pid;
}

export function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 checks existence without sending a real signal.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function clearPid(): void {
  if (fs.existsSync(PID_PATH)) fs.unlinkSync(PID_PATH);
}

export function daemonStatus(): { running: boolean; pid?: number } {
  const pid = readPid();
  if (!pid) return { running: false };
  if (isProcessAlive(pid)) return { running: true, pid };
  // Stale PID file — clean it up.
  clearPid();
  return { running: false };
}
