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

// ==================== STATELESS TOKEN HELPERS (HMAC-SHA256) ====================
function createAdminToken(username) {
  const payload = {
    user: username,
    role: 'admin',
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days session
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', Buffer.from(SECRET_SALT, 'utf8')).update(payloadStr).digest('hex');
  return `jwt_${payloadStr}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  // Support legacy tokens during transition
  if (token.startsWith('token_') && token.length >= 20) return true;
  if (!token.startsWith('jwt_')) return false;
  const raw = token.substring(4);
  const parts = raw.split('.');
  if (parts.length !== 2) return false;
  const [payloadStr, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', Buffer.from(SECRET_SALT, 'utf8')).update(payloadStr).digest('hex');
  if (signature !== expectedSig) return false;
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64').toString('utf8'));
    if (payload.role !== 'admin') return false;
    if (payload.exp && payload.exp < Date.now()) return false;
    return true;
  } catch (e) {
    return false;
  }
}

// Memory fallbacks
let memoryOrders = [];
let memoryBankConfig = {
  bankId: 'MB',
  bankName: 'MB Bank (Ngân hàng Quân Đội)',
  accountNo: '0987654321',
  accountName: 'DAILY PC CLEANER'
};

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

// ==================== BLOB STORE LOADER (ESM COMPATIBLE) ====================
let _blobsMod = null;
async function getBlobsStore(name) {
  const storeName = name || 'license-keys';
  if (!_blobsMod) {
    try {
      _blobsMod = await import('@netlify/blobs');
    } catch (e1) {
      try {
        _blobsMod = require('@netlify/blobs');
      } catch (e2) { }
    }
  }
  if (_blobsMod && typeof _blobsMod.getStore === 'function') {
    try {
      return _blobsMod.getStore({ name: storeName, consistency: 'strong' });
    } catch (e) {
      return _blobsMod.getStore(storeName);
    }
  }
  return null;
}

// ==================== DATABASE ABSTRACTION ====================
async function loadKeys() {
  // 1. Try Netlify Blobs (Primary storage)
  try {
    const store = await getBlobsStore('license-keys');
    if (store) {
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
    }
  } catch (e) { }

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
    const store = await getBlobsStore('license-keys');
    if (store) {
      await store.setJSON('keys_db', keys);
    }
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

// ==================== ORDERS & BANK STORAGE ====================
async function loadOrders() {
  try {
    const store = await getBlobsStore('license-keys');
    if (store) {
      const data = await store.get('orders_db', { type: 'json' });
      if (data && Array.isArray(data)) {
        memoryOrders = data;
        return memoryOrders;
      }
    }
  } catch (e) { }
  return memoryOrders;
}

async function saveOrders(orders) {
  memoryOrders = orders;
  try {
    const store = await getBlobsStore('license-keys');
    if (store) {
      await store.setJSON('orders_db', orders);
    }
  } catch (e) { }
}

async function loadBankConfig() {
  try {
    const store = await getBlobsStore('license-keys');
    if (store) {
      const data = await store.get('bank_config', { type: 'json' });
      if (data && data.accountNo) {
        memoryBankConfig = data;
        return memoryBankConfig;
      }
    }
  } catch (e) { }
  return memoryBankConfig;
}

async function saveBankConfig(config) {
  memoryBankConfig = config;
  try {
    const store = await getBlobsStore('license-keys');
    if (store) {
      await store.setJSON('bank_config', config);
    }
  } catch (e) { }
}

// ==================== ADMIN CREDENTIALS STORAGE ====================
let memoryAdminAuth = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'admin123'
};

async function loadAdminAuth() {
  try {
    const store = await getBlobsStore('license-keys');
    if (store) {
      const data = await store.get('admin_auth', { type: 'json' });
      if (data && data.username && data.password) {
        memoryAdminAuth = data;
        return memoryAdminAuth;
      }
    }
  } catch (e) { }

  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    memoryAdminAuth = {
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD
    };
  }
  return memoryAdminAuth;
}

async function saveAdminAuth(auth) {
  memoryAdminAuth = auth;
  try {
    const store = await getBlobsStore('license-keys');
    if (store) {
      await store.setJSON('admin_auth', auth);
    }
  } catch (e) { }
}

// ==================== AUTH HELPER ====================
function isAdminAuthenticated(event) {
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (verifyAdminToken(token)) return true;
  }
  const cookies = event.headers['cookie'] || event.headers['Cookie'] || '';
  const match = cookies.match(/auth_token=([^;]+)/);
  if (match && verifyAdminToken(match[1])) return true;
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

  // ---------------- PUBLIC ORDERS & BANK APIs ----------------
  // GET /api/debug/blobs
  if (path === '/api/debug/blobs' && event.httpMethod === 'GET') {
    try {
      const { getStore } = require('@netlify/blobs');
      const store = getStore('license-keys');
      await store.setJSON('test_blob', { ok: true, time: Date.now() });
      const read = await store.get('test_blob', { type: 'json' });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          read,
          env: {
            hasBlobsContext: !!process.env.NETLIFY_BLOBS_CONTEXT,
            siteId: !!process.env.SITE_ID,
            token: !!process.env.NETLIFY_BLOBS_TOKEN
          }
        })
      };
    } catch (err) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: err.message,
          name: err.name,
          stack: err.stack
        })
      };
    }
  }

  // GET /api/config/bank
  if (path === '/api/config/bank' && event.httpMethod === 'GET') {
    const bank = await loadBankConfig();
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, bank }) };
  }

  // POST /api/orders/create
  if (path === '/api/orders/create' && event.httpMethod === 'POST') {
    const email = (body.email || '').trim().toLowerCase();
    const planId = (body.planId || '').trim();
    const planName = (body.planName || '').trim();
    const price = parseInt(body.price, 10) || 0;
    const customerName = (body.customerName || '').trim() || email.split('@')[0];
    const phone = (body.phone || '').trim();

    if (!email || !email.includes('@')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Vui lòng cung cấp địa chỉ Email (Gmail) hợp lệ để nhận mã bản quyền!' })
      };
    }

    const orders = await loadOrders();

    // Limit free/trial plans to 1-time per email
    if (planId === 'trial-1d' || planId === 'trial-3d') {
      const existingTrial = orders.find(o => o.Email === email && (o.PlanId === 'trial-1d' || o.PlanId === 'trial-3d') && o.Status !== 'cancelled');
      if (existingTrial) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Email này đã từng đăng ký gói Dùng Thử. Mỗi khách hàng chỉ được dùng thử 1 lần duy nhất. Quý khách vui lòng chọn gói 30 ngày, 1 năm hoặc Vĩnh viễn!'
          })
        };
      }
    }

    // Generate Order ID: DPCC-XXXX
    const randCode = Math.floor(1000 + Math.random() * 9000);
    const orderId = `DPCC-${randCode}`;
    const now = new Date();
    const createdAt = now.toISOString().replace('T', ' ').substring(0, 19);
    // 15 minutes timeout
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

    const order = {
      OrderId: orderId,
      CustomerName: customerName,
      Email: email,
      Phone: phone,
      PlanId: planId,
      PlanName: planName,
      Price: price,
      Status: 'pending', // 'pending' | 'awaiting_approval' | 'completed' | 'cancelled'
      CreatedAt: createdAt,
      ExpiresAt: expiresAt,
      AssignedKey: null
    };

    orders.unshift(order);
    await saveOrders(orders);

    const bank = await loadBankConfig();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order,
        bank
      })
    };
  }

  // POST /api/orders/confirm
  if (path === '/api/orders/confirm' && event.httpMethod === 'POST') {
    const orderId = (body.orderId || '').trim().toUpperCase();
    const orders = await loadOrders();
    const target = orders.find(o => o.OrderId.toUpperCase() === orderId);
    if (!target) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Đơn hàng không tồn tại!' }) };
    }

    if (target.Status === 'completed') {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, status: 'completed', assignedKey: target.AssignedKey }) };
    }

    target.Status = 'awaiting_approval';
    target.PaidAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    await saveOrders(orders);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, status: target.Status }) };
  }

  // GET /api/orders/status
  if (path.startsWith('/api/orders/status') && event.httpMethod === 'GET') {
    const orderId = (event.queryStringParameters && event.queryStringParameters.id ? event.queryStringParameters.id : '').trim().toUpperCase();
    const orders = await loadOrders();
    const target = orders.find(o => o.OrderId.toUpperCase() === orderId);
    if (!target) return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Không tìm thấy đơn hàng' }) };
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, order: target }) };
  }

  // ---------------- ADMIN API: /api/login ----------------
  if (path === '/api/login' && event.httpMethod === 'POST') {
    const { username, password } = body;
    const auth = await loadAdminAuth();
    if (username === auth.username && password === auth.password) {
      const token = createAdminToken(username);
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
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

  // ---------------- PROTECTED ORDERS & BANK APIs ----------------
  // GET /api/orders
  if (path === '/api/orders' && event.httpMethod === 'GET') {
    const orders = await loadOrders();
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, orders }) };
  }

  // POST /api/orders/approve
  if (path === '/api/orders/approve' && event.httpMethod === 'POST') {
    const orderId = (body.orderId || '').trim().toUpperCase();
    const orders = await loadOrders();
    const order = orders.find(o => o.OrderId.toUpperCase() === orderId);
    if (!order) return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Không tìm thấy đơn hàng!' }) };

    // Determine plan properties
    let days = 30;
    let maxActivations = 1;
    let planType = 'Gói 30 ngày';

    if (order.PlanId === 'trial-1d') {
      days = 1;
      maxActivations = 1;
      planType = 'Dùng thử 1 ngày';
    } else if (order.PlanId === 'trial-3d') {
      days = 3;
      maxActivations = 1;
      planType = 'Dùng thử 3 ngày';
    } else if (order.PlanId === 'monthly-30d') {
      days = 30;
      maxActivations = 1;
      planType = 'Gói 30 ngày';
    } else if (order.PlanId === 'yearly-365d') {
      days = 365;
      maxActivations = 2;
      planType = 'Gói 1 năm';
    } else if (order.PlanId === 'lifetime') {
      days = 0;
      maxActivations = 5;
      planType = 'Vĩnh viễn';
    }

    const rawRnd = crypto.randomBytes(6).toString('hex').toUpperCase();
    const k1 = rawRnd.substring(0, 4);
    const k2 = rawRnd.substring(4, 8);
    const k3 = rawRnd.substring(8, 12);
    const key = `PRO-${k1}-${k2}-${k3}`;

    const now = new Date();
    const createdAt = now.toISOString().replace('T', ' ').substring(0, 19);
    let expiresAt = null;
    const isLifetime = planType === 'Vĩnh viễn' || days === 0;
    if (!isLifetime && days > 0) {
      const exp = new Date(now.getTime() + days * 24 * 3600 * 1000);
      expiresAt = exp.toISOString().replace('T', ' ').substring(0, 19);
    }

    const newKeyRecord = {
      Key: key,
      CustomerName: order.CustomerName || order.Email,
      PlanType: planType,
      DaysValid: isLifetime ? 0 : days,
      CreatedAt: createdAt,
      ExpiresAt: expiresAt,
      MaxActivations: maxActivations,
      Notes: `Đơn hàng ${order.OrderId} (${order.Email})`,
      IsRevoked: false,
      ActivatedMachines: []
    };

    keys.unshift(newKeyRecord);
    await saveKeys(keys);

    order.Status = 'completed';
    order.AssignedKey = key;
    order.CompletedAt = createdAt;
    await saveOrders(orders);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        key,
        order
      })
    };
  }

  // POST /api/orders/delete
  if (path === '/api/orders/delete' && event.httpMethod === 'POST') {
    const orderId = (body.orderId || '').trim().toUpperCase();
    const orders = await loadOrders();
    const idx = orders.findIndex(o => o.OrderId.toUpperCase() === orderId);
    if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Đơn hàng không tồn tại' }) };
    orders.splice(idx, 1);
    await saveOrders(orders);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  // POST /api/config/bank
  if (path === '/api/config/bank' && event.httpMethod === 'POST') {
    const { bankId, bankName, accountNo, accountName } = body;
    const config = {
      bankId: (bankId || 'MB').trim(),
      bankName: (bankName || 'MB Bank').trim(),
      accountNo: (accountNo || '').trim(),
      accountName: (accountName || '').trim().toUpperCase()
    };
    await saveBankConfig(config);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, bank: config }) };
  }

  // POST /api/admin/change-password
  if (path === '/api/admin/change-password' && event.httpMethod === 'POST') {
    const { currentPassword, newUsername, newPassword } = body;
    const auth = await loadAdminAuth();
    if (currentPassword !== auth.password) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Mật khẩu hiện tại không chính xác!' }) };
    }
    if (!newPassword || newPassword.length < 6) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự!' }) };
    }
    const updated = {
      username: (newUsername || auth.username).trim(),
      password: newPassword.trim()
    };
    await saveAdminAuth(updated);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Đã đổi mật khẩu thành công!' }) };
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: 'Endpoint không tồn tại' }) };
};
