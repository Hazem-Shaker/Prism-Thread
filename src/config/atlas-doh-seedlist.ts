import { ConnectionString } from "mongodb-connection-string-url";

/**
 * When `mongodb+srv://` fails with querySrv ETIMEOUT (common on Windows + Node),
 * resolve SRV + TXT via public DNS-over-HTTPS so the driver can use a standard
 * mongodb:// seed list without system SRV lookups.
 */

interface DohAnswer {
  type: number;
  data: string;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

const SRV_TYPE = 33;
const TXT_TYPE = 16;

async function dohQuery(
  provider: "google" | "cloudflare",
  name: string,
  type: "SRV" | "TXT"
): Promise<DohResponse> {
  const enc = encodeURIComponent(name);
  const url =
    provider === "google"
      ? `https://dns.google/resolve?name=${enc}&type=${type}`
      : `https://cloudflare-dns.com/dns-query?name=${enc}&type=${type}`;

  const res = await fetch(url, {
    headers: { Accept: "application/dns-json" },
  });
  if (!res.ok) {
    throw new Error(`DoH ${provider} HTTP ${res.status}`);
  }
  return res.json() as Promise<DohResponse>;
}

async function resolveWithFallback(
  name: string,
  type: "SRV" | "TXT"
): Promise<DohResponse> {
  try {
    const r = await dohQuery("google", name, type);
    if (r.Status === 0 && r.Answer?.length) return r;
  } catch {
    /* try cloudflare */
  }
  return dohQuery("cloudflare", name, type);
}

function parseSrvData(data: string): {
  priority: number;
  weight: number;
  port: number;
  target: string;
} | null {
  const parts = data.trim().split(/\s+/);
  if (parts.length < 4) return null;
  const priority = Number(parts[0]);
  const weight = Number(parts[1]);
  const port = Number(parts[2]);
  const target = parts
    .slice(3)
    .join(" ")
    .replace(/\.$/, "");
  if (!Number.isFinite(port) || !target) return null;
  return { priority, weight, port, target };
}

function srvHostsFromAnswers(answers: DohAnswer[]): string[] {
  const srv = answers.filter((a) => a.type === SRV_TYPE);
  const parsed = srv
    .map((a) => parseSrvData(a.data))
    .filter((x): x is NonNullable<typeof x> => x != null);
  parsed.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
  return parsed.map((p) => `${p.target}:${p.port}`);
}

/** Concatenate TXT strings the way seed-list discovery expects. */
function txtOptionsFromAnswers(answers: DohAnswer[]): Record<string, string> {
  const chunks: string[] = [];
  for (const a of answers) {
    if (a.type !== TXT_TYPE) continue;
    let d = a.data.trim();
    if (d.startsWith('"')) {
      const inner = d.match(/"((?:[^"\\]|\\.)*)"/g);
      if (inner) {
        for (const q of inner) {
          chunks.push(q.slice(1, -1).replace(/\\"/g, '"'));
        }
        continue;
      }
    }
    chunks.push(d.replace(/^"|"$/g, ""));
  }
  const merged = chunks.join("");
  const out: Record<string, string> = {};
  for (const part of merged.split("&")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

/**
 * Returns a `mongodb://` URI with explicit hosts, or `null` if DoH did not succeed.
 */
export async function rewriteMongoSrvUriWithDoh(
  mongodbSrvUri: string
): Promise<string | null> {
  if (!mongodbSrvUri.startsWith("mongodb+srv://")) return null;

  let cs: ConnectionString;
  try {
    cs = new ConnectionString(mongodbSrvUri);
  } catch {
    return null;
  }
  if (!cs.isSRV || cs.hosts.length !== 1) return null;

  const srvHostname = cs.hosts[0];
  const srvQuery = `_mongodb._tcp.${srvHostname}`;

  let srvJson: DohResponse;
  let txtJson: DohResponse;
  try {
    [srvJson, txtJson] = await Promise.all([
      resolveWithFallback(srvQuery, "SRV"),
      resolveWithFallback(srvHostname, "TXT"),
    ]);
  } catch {
    return null;
  }

  if (srvJson.Status !== 0 || !srvJson.Answer?.length) return null;

  const seeds = srvHostsFromAnswers(srvJson.Answer);
  if (!seeds.length) return null;

  const txtOpts = txtJson.Status === 0 && txtJson.Answer?.length
    ? txtOptionsFromAnswers(txtJson.Answer)
    : {};

  const params = new URLSearchParams(cs.searchParams.toString());
  for (const [k, v] of Object.entries(txtOpts)) {
    if (!params.has(k)) params.set(k, v);
  }
  if (!params.has("tls") && !params.has("ssl")) {
    params.set("tls", "true");
  }

  const user = cs.username;
  const pass = cs.password;
  const auth =
    user !== "" || pass !== ""
      ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
      : "";

  const path = cs.pathname || "/";
  const qs = params.toString();
  return `mongodb://${auth}${seeds.join(",")}${path}${qs ? `?${qs}` : ""}`;
}
