import type { AccessLogQuery } from "./accessLog.dto.js";
import type { AccessLogRepository } from "./accessLog.repository.js";

/** Masque partiellement une IP (dernier octet / fin IPv6). */
function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v4mapped = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4mapped) {
    const parts = v4mapped[1].split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    return `${parts.slice(0, 3).join(":")}:…`;
  }
  return "xxx";
}

export class AccessLogService {
  constructor(private readonly logs: AccessLogRepository) {}

  async list(query: AccessLogQuery) {
    const rows = await this.logs.findRecent(query.take ?? 200);
    // Pas d’userId / forwardedFor / UA complets vers le frontend.
    return rows.map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      ip: maskIp(l.ip),
      method: l.method,
      path: l.path,
      userRole: l.userRole,
      userAgent: l.userAgent ? String(l.userAgent).slice(0, 80) : null
    }));
  }
}
