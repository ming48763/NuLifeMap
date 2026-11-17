/**
 * 雙重限流：IP 與帳號（userId）各自計數，兩者都須通過。
 * 白名單 IP 不限流。本機可用 X-Simulate-Client-Ip 模擬一般客戶端。
 */

function normalizeIp(ip) {
  if (!ip) return '';
  let value = String(ip).trim();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  if (value === '::1') return '127.0.0.1';
  return value;
}

function normalizeAccount(userId) {
  const value = String(userId || '').trim();
  return value || 'anonymous';
}

function parseWhitelist(raw) {
  const defaults = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
  const extra = String(raw || '')
    .split(',')
    .map((s) => normalizeIp(s))
    .filter(Boolean);
  return new Set([...defaults.map(normalizeIp), ...extra]);
}

function createBucketTracker() {
  const hits = new Map(); // key -> { count, resetAt }

  function peek(key, max, windowMs, now = Date.now()) {
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      return { key, unlimited: false, limit: max, remaining: max, resetAt: now + windowMs, count: 0 };
    }
    return {
      key,
      unlimited: false,
      limit: max,
      remaining: Math.max(0, max - entry.count),
      resetAt: entry.resetAt,
      count: entry.count,
    };
  }

  function consume(key, max, windowMs, now = Date.now()) {
    let entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    if (entry.count >= max) {
      return {
        allowed: false,
        status: {
          key,
          unlimited: false,
          limit: max,
          remaining: 0,
          resetAt: entry.resetAt,
          count: entry.count,
        },
      };
    }
    entry.count += 1;
    return {
      allowed: true,
      status: {
        key,
        unlimited: false,
        limit: max,
        remaining: Math.max(0, max - entry.count),
        resetAt: entry.resetAt,
        count: entry.count,
      },
    };
  }

  return { peek, consume };
}

function createScrapeRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs) || 60 * 60 * 1000; // 1 hour
  const ipMax = Number(options.ipMax ?? options.max) || 10;
  const accountMax = Number(options.accountMax) || 100;
  const whitelist = parseWhitelist(options.whitelist);
  const ipTracker = createBucketTracker();
  const accountTracker = createBucketTracker();

  function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const raw =
      (typeof forwarded === 'string' && forwarded.split(',')[0]) ||
      req.socket?.remoteAddress ||
      req.ip ||
      '';
    const realIp = normalizeIp(raw);
    const simulate = normalizeIp(req.headers['x-simulate-client-ip'] || '');

    if (simulate && whitelist.has(realIp)) {
      return { ip: simulate, realIp, simulated: true };
    }
    return { ip: realIp || 'unknown', realIp, simulated: false };
  }

  function getAccountId(req) {
    return normalizeAccount(req.body?.userId ?? req.query?.userId);
  }

  function isWhitelisted(ip) {
    return whitelist.has(normalizeIp(ip));
  }

  function unlimitedStatus(key, kind) {
    return {
      key,
      kind,
      unlimited: true,
      limit: null,
      remaining: null,
      resetAt: null,
      count: null,
    };
  }

  function getStatus(ip, accountId) {
    const ipKey = normalizeIp(ip) || 'unknown';
    if (isWhitelisted(ipKey)) {
      return {
        unlimited: true,
        ip: unlimitedStatus(ipKey, 'ip'),
        account: unlimitedStatus(accountId, 'account'),
        // 向下相容舊 client：頂層欄位代表 IP
        limit: null,
        remaining: null,
        resetAt: null,
      };
    }

    const ipStatus = { ...ipTracker.peek(ipKey, ipMax, windowMs), kind: 'ip' };
    const accountStatus = {
      ...accountTracker.peek(accountId, accountMax, windowMs),
      kind: 'account',
    };

    return {
      unlimited: false,
      ip: ipStatus,
      account: accountStatus,
      limit: ipStatus.limit,
      remaining: ipStatus.remaining,
      resetAt: ipStatus.resetAt,
    };
  }

  function setRateHeaders(res, ipStatus, accountStatus) {
    res.setHeader('X-RateLimit-IP-Limit', String(ipStatus.limit ?? ''));
    res.setHeader('X-RateLimit-IP-Remaining', String(ipStatus.remaining ?? ''));
    res.setHeader('X-RateLimit-IP-Reset', String(ipStatus.resetAt ?? ''));
    res.setHeader('X-RateLimit-Account-Limit', String(accountStatus.limit ?? ''));
    res.setHeader('X-RateLimit-Account-Remaining', String(accountStatus.remaining ?? ''));
    res.setHeader('X-RateLimit-Account-Reset', String(accountStatus.resetAt ?? ''));
    // 向下相容：頂層用較嚴格／IP 額度
    res.setHeader('X-RateLimit-Limit', String(ipStatus.limit ?? ''));
    res.setHeader('X-RateLimit-Remaining', String(ipStatus.remaining ?? ''));
    res.setHeader('X-RateLimit-Reset', String(ipStatus.resetAt ?? ''));
  }

  function middleware(req, res, next) {
    const { ip, realIp, simulated } = getClientIp(req);
    const accountId = getAccountId(req);
    req.scrapeClient = { ip, realIp, simulated, accountId };

    if (isWhitelisted(ip)) {
      res.setHeader('X-RateLimit-Unlimited', '1');
      return next();
    }

    const now = Date.now();
    const windowMin = Math.round(windowMs / 60000);

    // 先檢查、再消耗：任一超限就不扣另一邊
    const ipPeek = ipTracker.peek(ip, ipMax, windowMs, now);
    const accountPeek = accountTracker.peek(accountId, accountMax, windowMs, now);

    if (ipPeek.remaining <= 0) {
      const retryAfterSec = Math.max(1, Math.ceil((ipPeek.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      setRateHeaders(res, { ...ipPeek, remaining: 0 }, accountPeek);
      return res.status(429).json({
        error: `此 IP 爬蟲次數已達上限（每 ${windowMin} 分鐘 ${ipMax} 次），請稍後再試`,
        scope: 'ip',
        limit: ipMax,
        remaining: 0,
        resetAt: ipPeek.resetAt,
        ip: { ...ipPeek, remaining: 0 },
        account: accountPeek,
      });
    }

    if (accountPeek.remaining <= 0) {
      const retryAfterSec = Math.max(1, Math.ceil((accountPeek.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      setRateHeaders(res, ipPeek, { ...accountPeek, remaining: 0 });
      return res.status(429).json({
        error: `此帳號爬蟲次數已達上限（每 ${windowMin} 分鐘 ${accountMax} 次），請稍後再試`,
        scope: 'account',
        limit: accountMax,
        remaining: 0,
        resetAt: accountPeek.resetAt,
        ip: ipPeek,
        account: { ...accountPeek, remaining: 0 },
      });
    }

    const ipResult = ipTracker.consume(ip, ipMax, windowMs, now);
    const accountResult = accountTracker.consume(accountId, accountMax, windowMs, now);
    setRateHeaders(res, ipResult.status, accountResult.status);
    return next();
  }

  middleware.getStatusForRequest = (req) => {
    const { ip, realIp, simulated } = getClientIp(req);
    const accountId = getAccountId(req);
    const status = getStatus(ip, accountId);
    return {
      ...status,
      clientIp: ip,
      accountId,
      realIp,
      simulated,
    };
  };

  return middleware;
}

module.exports = { createScrapeRateLimiter, normalizeIp, normalizeAccount };
