import { getStore } from '@netlify/blobs';

const store = getStore({ name: 'china-travel-district-db', consistency: 'strong' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const readBody = async req => { const text = await req.text(); if (text.length > 1_000_000) throw new Error('请求内容过大'); return text ? JSON.parse(text) : {}; };
const isAdcode = value => /^\d{6}$/.test(String(value || ''));
const isAdmin = req => { const expected = process.env.ADMIN_TOKEN || ''; const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); return expected.length >= 24 && got.length === expected.length && timingSafeEqual(got, expected); };
function timingSafeEqual(a,b){ let diff=a.length^b.length; for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0); return diff===0; }
function routePath(req){ const p = new URL(req.url).pathname; const marker = p.indexOf('/api/'); return marker >= 0 ? p.slice(marker) : p.replace(/.*\/\.netlify\/functions\/api/, '/api'); }

export default async (req) => {
  const route = routePath(req);
  try {
    if (req.method === 'GET' && route === '/api/health') {
      const items = await store.list({ prefix: 'approved/' });
      return json({ ok: true, amapConfigured: !!process.env.AMAP_WEB_KEY, adminConfigured: !!process.env.ADMIN_TOKEN, approvedDistricts: items.blobs.length, storage: 'Netlify Blobs' });
    }
    if (req.method === 'GET' && route === '/api/recommendations') {
      const adcode = new URL(req.url).searchParams.get('adcode');
      if (!isAdcode(adcode)) return json({ error: '需要六位行政区划 adcode' }, 400);
      const record = await store.get(`approved/${adcode}`, { type: 'json', consistency: 'strong' });
      return record ? json({ adcode, approved: true, ...record }) : json({ adcode, approved: false, message: '该区县暂无已审核的专属推荐资料', foods: [], sites: [] });
    }
    if (req.method === 'GET' && route === '/api/admin/job') {
      if (!isAdmin(req)) return json({ error: 'Unauthorized' }, 401);
      const jobId = new URL(req.url).searchParams.get('jobId') || '';
      if (!/^[a-zA-Z0-9_-]{8,80}$/.test(jobId)) return json({ error: '无效的 jobId' }, 400);
      const job = await store.get(`jobs/${jobId}`, { type: 'json', consistency: 'strong' });
      return job ? json(job) : json({ error: '任务不存在' }, 404);
    }
    if (req.method === 'GET' && route === '/api/admin/candidates') {
      if (!isAdmin(req)) return json({ error: 'Unauthorized' }, 401);
      const adcode = new URL(req.url).searchParams.get('adcode');
      if (!isAdcode(adcode)) return json({ error: '需要六位行政区划 adcode' }, 400);
      const candidate = await store.get(`candidates/${adcode}`, { type: 'json', consistency: 'strong' });
      return candidate ? json(candidate) : json({ error: '尚无候选资料' }, 404);
    }
    if (req.method === 'GET' && route === '/api/admin/coverage') {
      if (!isAdmin(req)) return json({ error: 'Unauthorized' }, 401);
      const [approved, candidates, jobs] = await Promise.all([store.list({ prefix: 'approved/' }), store.list({ prefix: 'candidates/' }), store.list({ prefix: 'jobs/' })]);
      return json({ approvedDistricts: approved.blobs.length, candidateDistricts: candidates.blobs.length, jobs: jobs.blobs.length, approvedKeys: approved.blobs.map(x => x.key.replace('approved/','')) });
    }
    if (req.method === 'POST' && route === '/api/admin/approve') {
      if (!isAdmin(req)) return json({ error: 'Unauthorized' }, 401);
      const b = await readBody(req); const adcode = String(b.adcode || '');
      if (!isAdcode(adcode)) return json({ error: 'adcode 必须是六位数字' }, 400);
      

const clean = (items, kind) => {
  if (!Array.isArray(items) || items.length < 3) {
    throw new Error(`${kind}至少需要3条记录`);
  }

  return items.map((x, i) => {
    const item = typeof x === 'string' ? { name: x } : x;

    if (!item || typeof item.name !== 'string' || !item.name.trim()) {
      throw new Error(`${kind}第${i + 1}条缺少有效名称`);
    }

    return {
      name: item.name.trim(),
      category: String(item.category || '').trim(),
      description: String(item.description || '').trim(),
      address: String(item.address || '').trim(),
      rating: item.rating ?? null,
      recommendationType: String(item.recommendationType || '').trim(),
      note: String(item.note || '').trim()
    };
  });
};
      const record = { districtName: String(b.districtName || '').trim(), cityName: String(b.cityName || '').trim(), foods: clean(b.foods, '美食'), sites: clean(b.sites, '景点'), scope: '区县级推荐', verifiedAt: new Date().toISOString(), verificationNote: String(b.verificationNote || '已人工核实区县归属及推荐代表性') };
      await store.setJSON(`approved/${adcode}`, record);
      return json({ ok: true, adcode, message: '区县级推荐已发布' });
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) { return json({ error: error.message || 'Server error' }, 500); }
};
