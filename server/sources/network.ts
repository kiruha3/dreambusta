import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
export interface Remote {
  status: number;
  body: Buffer;
  contentType: string;
  url?: string;
}
export type FetchPublic = (
  url: string,
  limit?: number,
  request?: { json: unknown },
) => Promise<Remote>;
function publicIP(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    );
  }
  return (
    /^[23][0-9a-f]{3}:/i.test(ip) &&
    !/^2001:(?:db8|0):/i.test(ip) &&
    !/^2002:/i.test(ip)
  );
}
function privateNetworkIP(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    );
  }
  return isIP(ip) === 6 && /^f[cd][0-9a-f]{2}:/i.test(ip);
}
export async function validatePublicUrl(
  value: string,
  trustedOrigins: ReadonlySet<string> = new Set(),
) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error(
      "Нужен публичный HTTP(S) адрес без пароля и нестандартного порта",
    );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  const trusted = trustedOrigins.has(url.origin);
  if (
    !addresses.length ||
    addresses.some(
      (x) => !publicIP(x.address) && !(trusted && privateNetworkIP(x.address)),
    )
  )
    throw new Error(
      `Локальный или служебный адрес ${url.hostname} не разрешён для импорта. Корпоративный сервер можно явно разрешить в настройке источников сервера DreamBusta.`,
    );
  return { url, address: addresses[0] };
}
export function createSourceFetcher(
  origins: Iterable<string> = [],
): FetchPublic {
  const trustedOrigins = new Set(
    Array.from(origins, (value) => {
      if (typeof value !== "string")
        throw new Error("Доверенный источник должен быть HTTPS origin");
      const url = new URL(value);
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        !/^[a-z0-9.-]+$/i.test(host) ||
        isIP(host) ||
        host === "localhost" ||
        host.endsWith(".localhost")
      ) {
        throw new Error(
          "Доверенный источник должен быть точным HTTPS origin с DNS-именем, без пути, пароля и порта",
        );
      }
      return url.origin;
    }),
  );
  return async (value, limit = 20 * 1024 * 1024, init) => {
    const body = init ? JSON.stringify(init.json) : undefined;
    if (body && Buffer.byteLength(body) > 64 * 1024)
      throw new Error("Слишком большой запрос к источнику");
    const deadline = Date.now() + 20000;
    for (let redirects = 0; redirects <= 4; redirects++) {
      const { url, address } = await validatePublicUrl(value, trustedOrigins);
      const result = await new Promise<Remote & { redirect?: string }>(
        (resolve, reject) => {
          const request = (url.protocol === "https:" ? https : http).request(
            url,
            {
              method: init ? "POST" : "GET",
              headers: {
                "User-Agent": "DreamBusta/0.1 PublicSnapshot",
                "Accept-Encoding": "identity",
                Accept: "application/json,text/html,image/*,*/*;q=0.5",
                ...(body
                  ? {
                      "Content-Type": "application/json",
                      "Content-Length": Buffer.byteLength(body),
                    }
                  : {}),
              },
              lookup: (_host, options, callback) =>
                options.all
                  ? (callback as Function)(null, [address])
                  : callback(null, address.address, address.family as 4 | 6),
            },
            (response) => {
              const status = response.statusCode || 0;
              if (
                [301, 302, 303, 307, 308].includes(status) &&
                response.headers.location
              ) {
                response.resume();
                resolve({
                  status,
                  body: Buffer.alloc(0),
                  contentType: "",
                  redirect: new URL(response.headers.location, url).href,
                });
                return;
              }
              let count = 0;
              const chunks: Buffer[] = [];
              response.on("data", (chunk) => {
                count += chunk.length;
                if (count > limit)
                  request.destroy(
                    new Error("Источник превышает допустимый размер"),
                  );
                else chunks.push(chunk);
              });
              response.on("end", () =>
                resolve({
                  status,
                  body: Buffer.concat(chunks),
                  contentType: response.headers["content-type"] || "",
                  url: url.href,
                }),
              );
              response.on("error", reject);
            },
          );
          const timeout = setTimeout(
            () => request.destroy(new Error("Источник не ответил вовремя")),
            Math.max(1, deadline - Date.now()),
          );
          request.on("close", () => clearTimeout(timeout));
          request.on("error", reject);
          request.end(body);
        },
      );
      if (!result.redirect) return result;
      if (init)
        throw new Error(
          "Перенаправление запроса к источнику не поддерживается",
        );
      value = result.redirect;
    }
    throw new Error("Слишком много перенаправлений");
  };
}
export const fetchPublic: FetchPublic = createSourceFetcher();
