import crypto from 'node:crypto';
import fs from 'node:fs';
import { getStore } from '@netlify/blobs';

// Secret salt matching LicenseManager.cs in C#
const SECRET_SALT = 'DailyPCCleaner_Secret_2026_Keygen_Salt_#99!';
const DEFAULT_ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123';

// ==================== INITIAL DATA SEED ====================
let initialSeed = [];
try {
  const seedUrl = new URL('./initial_keys.json', import.meta.url);
  initialSeed = JSON.parse(fs.readFileSync(seedUrl, 'utf8'));
} catch (e) {
  initialSeed = [];
}

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

let memoryOrders = [
  {
    OrderId: 'DPCC-4708',
    CreatedAt: '2026-11-04 11:36:50',
    CompletedAt: '2026-11-04 11:36:50',
    CustomerName: 'Đức Anh Nguyễn',
    Phone: '0332618488',
    Email: 'ducanh25820@gmail.com',
    PlanId: 'trial-3d',
    PlanName: 'Dùng Thử 3 Ngày (72h)',
    Amount: 19000,
    Status: 'completed',
    AssignedKey: 'PRO-ED50-9C87-7D8C'
  }
];

let memoryBankConfig = {
  bankId: 'MB',
  bankName: 'MB Bank (Ngân hàng Quân Đội)',
  accountNo: '0987654321',
  accountName: 'DAILY PC CLEANER'
};

let memoryAdminAuth = {
  username: DEFAULT_ADMIN_USER,
  password: DEFAULT_ADMIN_PASS
};

// ==================== NETLIFY BLOBS HELPERS ====================
function getDbStore(name = 'license-keys') {
  try {
    return getStore({ name, consistency: 'strong' });
  } catch (e) {
    try {
      return getStore(name);
    } catch (e2) {
      return null;
    }
  }
}

// ==================== DATABASE LOADERS & PERSISTENCE ====================
async function loadKeys() {
  try {
    const store = getDbStore('license-keys');
    if (store) {
      const data = await store.get('keys_db', { type: 'json' });
      // If keys_db exists in Blobs (even if empty [] because user deleted all keys), use it!
      if (Array.isArray(data)) {
        memoryKeys = data;
        return memoryKeys;
      }
      // Only seed on initial run if keys_db does not exist in store at all (null)
      if (initialSeed.length > 0) {
        memoryKeys = initialSeed;
        await store.setJSON('keys_db', memoryKeys);
        return memoryKeys;
      }
    }
  } catch (e) {
    console.error('loadKeys Blobs error:', e);
  }
  return memoryKeys;
}

async function saveKeys(keys) {
  memoryKeys = keys;
  try {
    const store = getDbStore('license-keys');
    if (store) {
      await store.setJSON('keys_db', keys);
    }
  } catch (e) {
    console.error('saveKeys Blobs error:', e);
  }
}

async function loadOrders() {
  try {
    const store = getDbStore('license-keys');
    if (store) {
      const data = await store.get('orders_db', { type: 'json' });
      if (Array.isArray(data)) {
        memoryOrders = data;
        return memoryOrders;
      } else if (memoryOrders.length > 0) {
        await store.setJSON('orders_db', memoryOrders);
      }
    }
  } catch (e) {
    console.error('loadOrders Blobs error:', e);
  }
  return memoryOrders;
}

async function saveOrders(orders) {
  memoryOrders = orders;
  try {
    const store = getDbStore('license-keys');
    if (store) {
      await store.setJSON('orders_db', orders);
    }
  } catch (e) {
    console.error('saveOrders Blobs error:', e);
  }
}

async function loadBankConfig() {
  try {
    const store = getDbStore('license-keys');
    if (store) {
      const data = await store.get('bank_config', { type: 'json' });
      if (data && data.accountNo) {
        memoryBankConfig = data;
        return memoryBankConfig;
      }
    }
  } catch (e) {
    console.error('loadBankConfig Blobs error:', e);
  }
  return memoryBankConfig;
}

async function saveBankConfig(config) {
  memoryBankConfig = config;
  try {
    const store = getDbStore('license-keys');
    if (store) {
      await store.setJSON('bank_config', config);
    }
  } catch (e) {
    console.error('saveBankConfig Blobs error:', e);
  }
}

async function loadAdminAuth() {
  try {
    const store = getDbStore('license-keys');
    if (store) {
      const data = await store.get('admin_auth', { type: 'json' });
      if (data && data.username && data.password) {
        memoryAdminAuth = data;
        return memoryAdminAuth;
      }
    }
  } catch (e) {
    console.error('loadAdminAuth Blobs error:', e);
  }
  return memoryAdminAuth;
}

async function saveAdminAuth(auth) {
  memoryAdminAuth = auth;
  try {
    const store = getDbStore('license-keys');
    if (store) {
      await store.setJSON('admin_auth', auth);
    }
  } catch (e) {
    console.error('saveAdminAuth Blobs error:', e);
  }
}

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

function isAdminAuthenticated(req) {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (verifyAdminToken(token)) return true;
  }
  const cookies = req.headers.get('cookie') || '';
  const match = cookies.match(/auth_token=([^;]+)/);
  if (match && verifyAdminToken(match[1])) return true;
  return false;
}

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

// ==================== MAIN FUNCTIONS V2 HANDLER ====================
export default async (req, context) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const jsonResponse = (data, status = 200, extraHeaders = {}) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, ...extraHeaders }
    });
  };

  const url = new URL(req.url);
  let path = url.pathname;
  if (path.includes('/.netlify/functions/api')) {
    path = path.replace('/.netlify/functions/api', '');
  }
  if (!path.startsWith('/')) path = '/' + path;
  if (!path.startsWith('/api')) path = '/api' + (path === '/' ? '' : path);

  const method = req.method;
  let body = {};
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }
  }

  // ---------------- DIAGNOSTIC API: /api/diag ----------------
  if (path === '/api/diag') {
    let diag = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      isFunctionsV2: true,
      hasBlobsContext: !!process.env.NETLIFY_BLOBS_CONTEXT,
      siteId: !!process.env.SITE_ID,
      storeStatus: null,
      keysCount: 0,
      ordersCount: 0,
      error: null
    };
    try {
      const store = getDbStore('license-keys');
      if (store) {
        await store.setJSON('test_diag_v2', { ok: true, now: Date.now() });
        const val = await store.get('test_diag_v2', { type: 'json' });
        diag.storeStatus = val && val.ok ? 'WORKING_AND_PERSISTED' : 'VAL_EMPTY';
        const k = await loadKeys();
        const o = await loadOrders();
        diag.keysCount = k.length;
        diag.ordersCount = o.length;
      } else {
        diag.storeStatus = 'STORE_NULL';
      }
    } catch (err) {
      diag.error = err.message || String(err);
    }
    return jsonResponse(diag);
  }

  const keys = await loadKeys();

  // ---------------- PUBLIC CLIENT API: /api/activate ----------------
  if (path === '/api/activate' && method === 'POST') {
    const key = (body.key || '').trim().toUpperCase();
    const hwid = (body.hwid || '').trim();
    const machineName = (body.machineName || '').trim();

    if (!key || !hwid) {
      return jsonResponse({ success: false, error: 'Thiếu mã bản quyền hoặc HWID!' }, 400);
    }

    const record = keys.find(k => k.Key.toUpperCase() === key);
    if (!record) {
      return jsonResponse({ success: false, error: 'Mã bản quyền không tồn tại trên máy chủ!' }, 404);
    }

    if (record.IsRevoked) {
      return jsonResponse({ success: false, error: 'Mã bản quyền này đã bị THU HỒI bởi quản trị viên!' }, 403);
    }

    // Check expiration
    if (record.ExpiresAt) {
      const expDate = new Date(record.ExpiresAt.replace(' ', 'T'));
      if (expDate < new Date() && record.PlanType !== 'Lifetime' && record.PlanType !== 'Vĩnh viễn') {
        return jsonResponse({ success: false, error: 'Mã bản quyền này đã HẾT HẠN sử dụng!' }, 403);
      }
    }

    // Check activation slot
    if (!record.ActivatedMachines) record.ActivatedMachines = [];
    let existing = record.ActivatedMachines.find(m => m.Hwid === hwid);
    if (!existing) {
      if (record.ActivatedMachines.length >= (record.MaxActivations || 1)) {
        return jsonResponse({
          success: false,
          error: `Mã bản quyền đã vượt quá số lượt kích hoạt tối đa (${record.MaxActivations} máy)!`
        }, 403);
      }
      record.ActivatedMachines.push({
        Hwid: hwid,
        MachineName: machineName || 'Client PC',
        ActivatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });
      await saveKeys(keys);
    }

    return jsonResponse({
      success: true,
      customer: record.CustomerName || 'Khách hàng PRO',
      plan: record.PlanType || 'Lifetime',
      expires: record.ExpiresAt || null
    });
  }

  // ---------------- PUBLIC CLIENT API: /api/check ----------------
  if (path === '/api/check' && method === 'POST') {
    const key = (body.key || '').trim().toUpperCase();
    const hwid = (body.hwid || '').trim();

    const record = keys.find(k => k.Key.toUpperCase() === key);
    if (!record) {
      return jsonResponse({ valid: false, error: 'Key không tồn tại' });
    }

    if (record.IsRevoked) {
      return jsonResponse({ valid: false, error: 'Bản quyền đã bị thu hồi' });
    }

    if (record.ExpiresAt) {
      const expDate = new Date(record.ExpiresAt.replace(' ', 'T'));
      if (expDate < new Date() && record.PlanType !== 'Lifetime' && record.PlanType !== 'Vĩnh viễn') {
        return jsonResponse({ valid: false, error: 'Bản quyền đã hết hạn' });
      }
    }

    return jsonResponse({
      valid: true,
      key: record.Key,
      plan: record.PlanType,
      expires: record.ExpiresAt
    });
  }

  // ---------------- PUBLIC ORDERS & BANK APIs ----------------
  // GET /api/config/bank
  if (path === '/api/config/bank' && method === 'GET') {
    const bank = await loadBankConfig();
    return jsonResponse({ success: true, bank });
  }

  // POST /api/orders/create
  if (path === '/api/orders/create' && method === 'POST') {
    const email = (body.email || '').trim().toLowerCase();
    const planId = (body.planId || '').trim();
    const planName = (body.planName || '').trim();
    const price = parseInt(body.price, 10) || 0;
    const customerName = (body.customerName || '').trim() || email.split('@')[0];
    const phone = (body.phone || '').trim();

    if (!email || !email.includes('@')) {
      return jsonResponse({ success: false, error: 'Vui lòng cung cấp địa chỉ Email (Gmail) hợp lệ để nhận mã bản quyền!' }, 400);
    }

    const orders = await loadOrders();

    if (planId === 'trial-1d' || planId === 'trial-3d') {
      const existingTrial = orders.find(o => o.Email === email && (o.PlanId === 'trial-1d' || o.PlanId === 'trial-3d') && o.Status !== 'cancelled');
      if (existingTrial) {
        return jsonResponse({
          success: false,
          error: 'Email này đã từng đăng ký gói Dùng Thử. Mỗi khách hàng chỉ được dùng thử 1 lần duy nhất. Quý khách vui lòng chọn gói 30 ngày, 1 năm hoặc Vĩnh viễn!'
        }, 400);
      }
    }

    const randCode = Math.floor(1000 + Math.random() * 9000);
    const orderId = `DPCC-${randCode}`;
    const now = new Date();
    const createdAt = now.toISOString().replace('T', ' ').substring(0, 19);
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

    const order = {
      OrderId: orderId,
      CustomerName: customerName,
      Email: email,
      Phone: phone,
      PlanId: planId,
      PlanName: planName,
      Price: price,
      Status: 'pending',
      CreatedAt: createdAt,
      ExpiresAt: expiresAt,
      AssignedKey: null
    };

    orders.unshift(order);
    await saveOrders(orders);

    const bank = await loadBankConfig();

    return jsonResponse({
      success: true,
      order,
      bank
    });
  }

  // POST /api/orders/confirm
  if (path === '/api/orders/confirm' && method === 'POST') {
    const orderId = (body.orderId || '').trim().toUpperCase();
    const orders = await loadOrders();
    const target = orders.find(o => o.OrderId.toUpperCase() === orderId);
    if (!target) {
      return jsonResponse({ success: false, error: 'Đơn hàng không tồn tại!' }, 404);
    }

    if (target.Status === 'completed') {
      return jsonResponse({ success: true, status: 'completed', assignedKey: target.AssignedKey });
    }

    target.Status = 'awaiting_approval';
    target.PaidAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    await saveOrders(orders);

    return jsonResponse({ success: true, status: target.Status });
  }

  // GET /api/orders/status
  if (path.startsWith('/api/orders/status') && method === 'GET') {
    const orderId = (url.searchParams.get('id') || '').trim().toUpperCase();
    const orders = await loadOrders();
    const target = orders.find(o => o.OrderId.toUpperCase() === orderId);
    if (!target) return jsonResponse({ success: false, error: 'Không tìm thấy đơn hàng' }, 404);
    return jsonResponse({ success: true, order: target });
  }

  // ---------------- ADMIN API: /api/login ----------------
  if (path === '/api/login' && method === 'POST') {
    const { username, password } = body;
    const auth = await loadAdminAuth();
    if (username === auth.username && password === auth.password) {
      const token = createAdminToken(username);
      return jsonResponse(
        { success: true, token },
        200,
        { 'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` }
      );
    }
    return jsonResponse({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng!' }, 401);
  }

  // ---------------- PROTECTED ADMIN APIs ----------------
  if (!isAdminAuthenticated(req)) {
    return jsonResponse({ success: false, error: 'Chưa đăng nhập quyền quản trị!' }, 401);
  }

  // GET /api/keys
  if (path === '/api/keys' && method === 'GET') {
    return jsonResponse({ success: true, keys });
  }

  // POST /api/keys/generate
  if (path === '/api/keys/generate' && method === 'POST') {
    const customer = (body.customer || 'Khách hàng').trim();
    const plan = (body.plan || '30 Ngày').trim();
    const days = body.days !== undefined && body.days !== null ? parseInt(body.days, 10) : 30;
    const maxActivations = parseInt(body.maxActivations) || 1;
    const notes = (body.notes || '').trim();

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

    return jsonResponse({ success: true, key, record: newRecord });
  }

  // POST /api/keys/revoke
  if (path === '/api/keys/revoke' && method === 'POST') {
    const key = (body.key || '').trim().toUpperCase();
    const target = keys.find(k => k.Key.toUpperCase() === key);
    if (!target) return jsonResponse({ success: false, error: 'Key không tồn tại' }, 404);

    target.IsRevoked = !target.IsRevoked;
    await saveKeys(keys);
    return jsonResponse({ success: true, isRevoked: target.IsRevoked });
  }

  // POST /api/keys/delete
  if (path === '/api/keys/delete' && method === 'POST') {
    const key = (body.key || '').trim().toUpperCase();
    const idx = keys.findIndex(k => k.Key.toUpperCase() === key);
    if (idx === -1) return jsonResponse({ success: false, error: 'Key không tồn tại' }, 404);

    keys.splice(idx, 1);
    await saveKeys(keys);
    return jsonResponse({ success: true });
  }

  // POST /api/keys/delete-all
  if (path === '/api/keys/delete-all' && method === 'POST') {
    keys.length = 0;
    await saveKeys(keys);
    return jsonResponse({ success: true, count: 0 });
  }

  // POST /api/keys/offline-token
  if (path === '/api/keys/offline-token' && method === 'POST') {
    const key = (body.key || '').trim().toUpperCase();
    const hwid = (body.hwid || '').trim();

    if (!key || !hwid) {
      return jsonResponse({ success: false, error: 'Thiếu mã Key hoặc HWID!' }, 400);
    }

    const rec = keys.find(k => k.Key.toUpperCase() === key);
    if (!rec) return jsonResponse({ success: false, error: 'Key không tồn tại!' }, 404);

    const expStr = rec.ExpiresAt || '9999-12-31 23:59:59';
    const sig = computeHmac(`${rec.Key}|${rec.CustomerName}|${rec.PlanType}|${expStr}|${hwid}`);
    const raw = `${rec.Key}|${rec.CustomerName}|${rec.PlanType}|${expStr}|${hwid}|${sig}`;
    const token = encryptString(raw);

    return jsonResponse({ success: true, offlineToken: token });
  }

  // ---------------- PROTECTED ORDERS & BANK APIs ----------------
  // GET /api/orders
  if (path === '/api/orders' && method === 'GET') {
    const orders = await loadOrders();
    return jsonResponse({ success: true, orders });
  }

  // POST /api/orders/approve
  if (path === '/api/orders/approve' && method === 'POST') {
    const orderId = (body.orderId || '').trim().toUpperCase();
    const orders = await loadOrders();
    const order = orders.find(o => o.OrderId.toUpperCase() === orderId);
    if (!order) return jsonResponse({ success: false, error: 'Không tìm thấy đơn hàng!' }, 404);

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

    return jsonResponse({
      success: true,
      key,
      order
    });
  }

  // POST /api/orders/delete
  if (path === '/api/orders/delete' && method === 'POST') {
    const orderId = (body.orderId || '').trim().toUpperCase();
    const orders = await loadOrders();
    const idx = orders.findIndex(o => o.OrderId.toUpperCase() === orderId);
    if (idx === -1) return jsonResponse({ success: false, error: 'Đơn hàng không tồn tại' }, 404);
    orders.splice(idx, 1);
    await saveOrders(orders);
    return jsonResponse({ success: true });
  }

  // POST /api/config/bank
  if (path === '/api/config/bank' && method === 'POST') {
    const { bankId, bankName, accountNo, accountName } = body;
    const config = {
      bankId: (bankId || 'MB').trim(),
      bankName: (bankName || 'MB Bank').trim(),
      accountNo: (accountNo || '').trim(),
      accountName: (accountName || '').trim().toUpperCase()
    };
    await saveBankConfig(config);
    return jsonResponse({ success: true, bank: config });
  }

  // POST /api/admin/change-password
  if (path === '/api/admin/change-password' && method === 'POST') {
    const { currentPassword, newUsername, newPassword } = body;
    const auth = await loadAdminAuth();
    if (currentPassword !== auth.password) {
      return jsonResponse({ success: false, error: 'Mật khẩu hiện tại không chính xác!' }, 400);
    }
    if (!newPassword || newPassword.length < 6) {
      return jsonResponse({ success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự!' }, 400);
    }
    const updated = {
      username: (newUsername || auth.username).trim(),
      password: newPassword.trim()
    };
    await saveAdminAuth(updated);
    return jsonResponse({ success: true, message: 'Đã đổi mật khẩu thành công!' });
  }

  return jsonResponse({ error: 'Endpoint không tồn tại' }, 404);
};

export const config = {
  path: "/api/*"
};
