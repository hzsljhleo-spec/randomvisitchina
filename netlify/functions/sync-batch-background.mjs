import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';

const store = getStore({ name: 'china-travel-district-db', consistency: 'strong' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const valid = x => /^\d{6}$/.test(String(x || ''));
const authorized = req => { const expected=process.env.ADMIN_TOKEN||''; const got=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,''); let d=got.length^expected.length; for(let i=0;i<Math.max(got.length,expected.length);i++) d|=(got.charCodeAt(i)||0)^(expected.charCodeAt(i)||0); return expected.length>=24 && d===0; };
async function amap(path, params) {
  const key = process.env.AMAP_WEB_KEY; if (!key) throw new Error('AMAP_WEB_KEY 未配置');
  const u = new URL(`https://restapi.amap.com${path}`); for (const [k,v] of Object.entries({ ...params, key, output: 'JSON' })) u.searchParams.set(k, String(v));
  const response = await fetch(u); if (!response.ok) throw new Error(`高德 HTTP ${response.status}`);
  const data = await response.json(); if (data.status !== '1') throw new Error(data.info || '高德 API 请求失败'); return data;
}
async function collect(adcode, keywords) {
  const results = new Map();
  for (const keyword of keywords) {
    const data = await amap('/v5/place/text', { keywords: keyword, region: adcode, city_limit: 'true', page_size: 25, page_num: 1, show_fields: 'business,photos' });
    for (const p of data.pois || []) {
      // Strictly discard records that the provider did not map to this county code.
      if (String(p.adcode || '') !== adcode) continue;
      const id = p.id || `${p.name}|${p.address}`;
      if (!results.has(id)) results.set(id, { id: p.id || '', name: p.name || '', address: p.address || '', adcode: p.adcode || '', province: p.pname || '', city: p.cityname || '', district: p.adname || '', type: p.type || '', typecode: p.typecode || '', location: p.location || '', tag: p.business?.tag || '', rating: p.business?.rating || '', cost: p.business?.cost || '', photos: (p.photos || []).slice(0,3).map(x=>x.url).filter(Boolean), keyword, source: '高德地图 POI', fetchedAt: new Date().toISOString(), reviewStatus: '待人工核实' });
    }
    await pause(180);
  }
  return [...results.values()];
}

export default async (req) => {
  if (!authorized(req)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  let body; try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
  const jobId = typeof body.jobId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(body.jobId) ? body.jobId : randomUUID();
  const adcodes = [...new Set((Array.isArray(body.adcodes) ? body.adcodes : []).map(String))];
  if (!adcodes.length || adcodes.length > 25 || adcodes.some(x => !valid(x))) return new Response(JSON.stringify({ error: '每批需提供1–25个有效的六位区县 adcode' }), { status: 400, headers: { 'content-type': 'application/json' } });
  if (!process.env.AMAP_WEB_KEY) return new Response(JSON.stringify({ error: 'AMAP_WEB_KEY 未配置' }), { status: 503, headers: { 'content-type': 'application/json' } });
  await store.setJSON(`jobs/${jobId}`, { jobId, status: 'running', total: adcodes.length, completed: 0, failed: [], startedAt: new Date().toISOString() });
  for (const adcode of adcodes) {
    try {
      const districtResult = await amap('/v3/config/district', { keywords: adcode, subdistrict: 0, extensions: 'base' });
      const district = districtResult.districts?.[0];
      if (!district) throw new Error('高德未返回该行政区');
      const [foodCandidates, siteCandidates] = await Promise.all([
        collect(adcode, ['地方特色美食', '特色小吃']),
        collect(adcode, ['旅游景点', '风景名胜'])
      ]);
      await store.setJSON(`candidates/${adcode}`, { adcode, name: district.name, citycode: district.citycode, level: district.level, center: district.center, fetchedAt: new Date().toISOString(), source: '高德地图 Web 服务 API', foodCandidates, siteCandidates, limitations: 'POI 搜索并非全量目录；餐饮商户不等于地方特色菜。所有候选项必须人工核实区县归属、地方代表性、来源和当前状态。' });
    } catch (error) {
      const job = await store.get(`jobs/${jobId}`, { type: 'json' }); job.failed.push({ adcode, error: error.message }); await store.setJSON(`jobs/${jobId}`, job);
    }
    const job = await store.get(`jobs/${jobId}`, { type: 'json' }); job.completed += 1; job.updatedAt = new Date().toISOString(); await store.setJSON(`jobs/${jobId}`, job);
  }
  const job = await store.get(`jobs/${jobId}`, { type: 'json' }); job.status = job.failed.length ? 'completed_with_errors' : 'completed'; job.finishedAt = new Date().toISOString(); await store.setJSON(`jobs/${jobId}`, job);
  return new Response('Batch research finished');
};
