const crypto = require('crypto');

// Secret salt matching LicenseManager.cs in C#
const SECRET_SALT = 'DailyPCCleaner_Secret_2026_Keygen_Salt_#99!';
const DEFAULT_ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123';

// In-memory fallback cache
let initialSeed = [];
try {
  initialSeed = require('./initial_keys.json');
} catch (e) { }

let memoryKeys = initialSeed.length > 0 ? initialSeed : [
  {
    Key: 'PRO-TRIAL-3D-NETLIFY-DEMO',
    CustomerName: 'Khách Hàng Dùng Thử',
    PlanType: 'Dùng thử 3 ngày',
    DaysValid: 3,
    CreatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    ExpiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19),
    MaxActivations: 1,
    Notes: 'Mã khởi tạo sẵn khi triển khai Netlify',
    IsRevoked: false,
    ActivatedMachines: []
  }
];

// Active admin session tokens (In production, JWT or Netlify Blobs can be used)
const activeTokens = new Set();

// ==================== CRYPTO HELPERS (C# PARITY) ====================
function computeHmac(data) {
  return crypto.createHmac('sha256', Buffer.from(SECRET_SALT, 'utf8')).update(Buffer.from(data, 'utf8')).digest('base64');
}

function getAesKeyAndIv() {
  const key = crypto.createHash('sha256').update(Buffer.from(SECRET_SALT, 'utf8')).digest();
  const iv = key.subarray(0, 16);
  return { key, iv };
}

function encryptString(text) {
  const { key, iv } = getAesKeyAndIv();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let enc = cipher.update(Buffer.from(text, 'utf8'));
  enc = Buffer.concat([enc, cipher.final()]);
  return enc.toString('base64');
}

function decryptString(encryptedBase64) {
  const { key, iv } = getAesKeyAndIv();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let dec = decipher.update(Buffer.from(encryptedBase64, 'base64'));
  dec = Buffer.concat([dec, decipher.final()]);
  return dec.toString('utf8');
}

// ==================== DATABASE ABSTRACTION ====================
async function loadKeys() {
  // 1. Try Netlify Blobs (Primary storage)
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('license-keys');
    const data = await store.get('keys_db', { type: 'json' });
    if (data && Array.isArray(data)) {
      memoryKeys = data;
      return memoryKeys;
    } else {
      // First time deployment on Netlify: seed initial database!
      if (initialSeed && initialSeed.length > 0) {
        memoryKeys = initialSeed;
        await store.setJSON('keys_db', memoryKeys);
        return memoryKeys;
      }
    }
  } catch (e) {
    // Netlify Blobs not available in local test or unconfigured
  }

  // 2. Try Upstash Redis if configured
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/daily_pc_cleaner_keys`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
      });
      const json = await res.json();
      if (json && json.result) {
        const parsed = JSON.parse(json.result);
        if (Array.isArray(parsed)) {
          memoryKeys = parsed;
          return memoryKeys;
        }
      }
    } catch (e) { }
  }

  return memoryKeys;
}

async function saveKeys(keys) {
  memoryKeys = keys;

  // 1. Save to Netlify Blobs
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('license-keys');
    await store.setJSON('keys_db', keys);
  } catch (e) { }

  // 2. Save to Upstash Redis if configured
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/daily_pc_cleaner_keys`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(JSON.stringify(keys))
      });
    } catch (e) { }
  }
}

// ==================== AUTH HELPER ====================
function isAdminAuthenticated(event) {
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (activeTokens.has(token)) return true;
  }
  const cookies = event.headers['cookie'] || event.headers['Cookie'] || '';
  const match = cookies.match(/auth_token=([^;]+)/);
  if (match && activeTokens.has(match[1])) return true;
  return false;
}

// ==================== MAIN HANDLER ====================
exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Parse path
  let path = event.path;
  if (path.includes('/.netlify/functions/api')) {
    path = path.replace('/.netlify/functions/api', '');
  }
  if (!path.startsWith('/')) path = '/' + path;
  if (!path.startsWith('/api')) path = '/api' + (path === '/' ? '' : path);

  const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body) : {};
  const keys = await loadKeys();

  // ---------------- PUBLIC CLIENT API: /api/activate ----------------
  if (path === '/api/activate' && event.httpMethod === 'POST') {
    const key = (body.key || '').trim().toUpperCase();
    const hwid = (body.hwid || '').trim();
    const machineName = (body.machineName || '').trim();

    if (!key || !hwid) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Thiếu mã bản quyền hoặc HWID!' }) };
    }

    const record = keys.find(k => k.Key.toUpperCase() === key);
    if (!record) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Mã bản quyền không tồn tại trên máy chủ!' }) };
    }

    if (record.IsRevoked) {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, error: 'Mã bản quyền này đã bị THU HỒI bởi quản trị viên!' }) };
    }

    // Check expiration
    if (record.ExpiresAt) {
      const expDate = new Date(record.ExpiresAt.replace(' ', 'T'));
      if (expDate < new Date() && record.PlanType !== 'Lifetime' && record.PlanType !== 'Vĩnh viễn') {
        return { statusCode: 403, headers, body: JSON.stringify({ success: false, error: 'Mã bản quyền này đã HẾT HẠN sử dụng!' }) };
      }
    }

    // Check activation slot
    if (!record.ActivatedMachines) record.ActivatedMachines = [];
    let existing = record.ActivatedMachines.find(m => m.Hwid === hwid);
    if (!existing) {
      if (record.ActivatedMachines.length >= (record.MaxActivations || 1)) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: `Mã bản quyền đã vượt quá số lượt kích hoạt tối đa (${record.MaxActivations} máy)!`
          })
        };
      }
      record.ActivatedMachines.push({
        Hwid: hwid,
        MachineName: machineName || 'Client PC',
        ActivatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });
      await saveKeys(keys);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        customer: record.CustomerName || 'Khách hàng PRO',
        plan: record.PlanType || 'Lifetime',
        expires: record.ExpiresAt || null
      })
    };
  }

  // ---------------- PUBLIC CLIENT API: /api/check ----------------
  if (path === '/api/check' && event.httpMethod === 'POST') {
    const key = (body.key || '').trim().toUpperCase();
    const hwid = (body.hwid || '').trim();

    const record = keys.find(k => k.Key.toUpperCase() === key);
    if (!record) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Key không tồn tại' }) };
    }

    if (record.IsRevoked) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Bản quyền đã bị thu hồi' }) };
    }

    if (record.ExpiresAt) {
      const expDate = new Date(record.ExpiresAt.replace(' ', 'T'));
      if (expDate < new Date() && record.PlanType !== 'Lifetime' && record.PlanType !== 'Vĩnh viễn') {
        return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Bản quyền đã hết hạn' }) };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        key: record.Key,
        plan: record.PlanType,
        expires: record.ExpiresAt
      })
    };
  }

  // ---------------- ADMIN API: /api/login ----------------
  if (path === '/api/login' && event.httpMethod === 'POST') {
    const { username, password } = body;
    if (username === DEFAULT_ADMIN_USER && password === DEFAULT_ADMIN_PASS) {
      const token = 'token_' + crypto.randomBytes(16).toString('hex');
      activeTokens.add(token);
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
        },
        body: JSON.stringify({ success: true, token })
      };
    }
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng!' }) };
  }

  // ---------------- PROTECTED ADMIN APIs ----------------
  if (!isAdminAuthenticated(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: 'Chưa đăng nhập quyền quản trị!' }) };
  }

  // GET /api/keys
  if (path === '/api/keys' && event.httpMethod === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, keys }) };
  }

  // POST /api/keys/generate
  if (path === '/api/keys/generate' && event.httpMethod === 'POST') {
    const customer = (body.customer || 'Khách hàng').trim();
    const plan = (body.plan || '30 Ngày').trim();
    const days = body.days !== undefined && body.days !== null ? parseInt(body.days, 10) : 30;
    const maxActivations = parseInt(body.maxActivations) || 1;
    const notes = (body.notes || '').trim();

    // Generate Key Format: PRO-XXXX-XXXX-XXXX
    const rawRnd = crypto.randomBytes(6).toString('hex').toUpperCase();
    const k1 = rawRnd.substring(0, 4);
    const k2 = rawRnd.substring(4, 8);
    const k3 = rawRnd.substring(8, 12);
    const key = `PRO-${k1}-${k2}-${k3}`;

    const now = new Date();
    const createdAt = now.toISOString().replace('T', ' ').substring(0, 19);
    let expiresAt = null;

    const isLifetime = plan.toLowerCase().includes('vĩnh viễn') || plan.toLowerCase().includes('vinh vien') || plan.toLowerCase().includes('lifetime') || days === 0;
    if (!isLifetime && days > 0) {
      const exp = new Date(now.getTime() + days * 24 * 3600 * 1000);
      expiresAt = exp.toISOString().replace('T', ' ').substring(0, 19);
    }

    const newRecord = {
      Key: key,
      CustomerName: customer,
      PlanType: isLifetime ? 'Vĩnh viễn' : plan,
      DaysValid: isLifetime ? 0 : days,
      CreatedAt: createdAt,
      ExpiresAt: expiresAt,
      MaxActivations: maxActivations,
      Notes: notes,
      IsRevoked: false,
      ActivatedMachines: []
    };

    keys.unshift(newRecord);
    await saveKeys(keys);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, key, record: newRecord }) };
  }

  // POST /api/keys/revoke
  if (path === '/api/keys/revoke' && event.httpMethod === 'POST') {
    const key = (body.key || '').trim().toUpperCase();
    const target = keys.find(k => k.Key.toUpperCase() === key);
    if (!target) return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Key không tồn tại' }) };

    target.IsRevoked = !target.IsRevoked; // Toggle
    await saveKeys(keys);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, isRevoked: target.IsRevoked }) };
  }

  // POST /api/keys/delete
  if (path === '/api/keys/delete' && event.httpMethod === 'POST') {
    const key = (body.key || '').trim().toUpperCase();
    const idx = keys.findIndex(k => k.Key.toUpperCase() === key);
    if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Key không tồn tại' }) };

    keys.splice(idx, 1);
    await saveKeys(keys);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  // POST /api/keys/offline-token
  if (path === '/api/keys/offline-token' && event.httpMethod === 'POST') {
    const key = (body.key || '').trim().toUpperCase();
    const hwid = (body.hwid || '').trim();

    if (!key || !hwid) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Thiếu mã Key hoặc HWID!' }) };
    }

    const rec = keys.find(k => k.Key.toUpperCase() === key);
    if (!rec) return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Key không tồn tại!' }) };

    const expStr = rec.ExpiresAt || '9999-12-31 23:59:59';
    const sig = computeHmac(`${rec.Key}|${rec.CustomerName}|${rec.PlanType}|${expStr}|${hwid}`);
    const raw = `${rec.Key}|${rec.CustomerName}|${rec.PlanType}|${expStr}|${hwid}|${sig}`;
    const token = encryptString(raw);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, offlineToken: token }) };
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: 'Endpoint không tồn tại' }) };
};
