# 中国随机旅行目的地 v5（Netlify 数据库版）

本版本面向 Netlify 部署：静态转盘网页 + Netlify Functions + Netlify Blobs 持久化资料库。高德 Web 服务 Key 只存在服务端环境变量中。全国区县数据按六位 `adcode` 区分，区县/乡镇抽取不再用市级或省级内容冒充当地专属推荐。

## 目录结构

- `site/index.html`：随机目的地转盘及推荐结果页。
- `site/admin.html`：后台管理页面（部署后访问 `/admin.html`）。
- `site/china_travel_collage.png`：页面背景图。
- `netlify/functions/api.mjs`：公开读取接口及受令牌保护的管理 API。
- `netlify/functions/sync-batch-background.mjs`：后台批量采集函数，最多每批25个区县。
- `netlify.toml`：Netlify 构建、Functions 与 `/api/*` 路由配置。
- `scripts/check-project.mjs`：部署前结构检查。

## 一、Netlify 部署

1. 将本文件夹全部内容上传到 GitHub 仓库根目录，并将仓库连接到 Netlify；也可使用 Netlify CLI 从该目录部署。
2. Netlify Build settings：Build command=`npm run build`；Publish directory=`site`；Functions directory=`netlify/functions`。`netlify.toml` 已写好这些配置，并将 Functions 放在发布目录之外，避免把服务端源文件当作静态资源公开。
3. 在 Netlify 项目中打开 **Project configuration → Environment variables**，添加以下变量：
   - `AMAP_WEB_KEY`：高德开放平台申请的 **Web 服务 API Key**。
   - `ADMIN_TOKEN`：至少32位的随机长字符串，作为后台访问令牌。
4. 两个变量的 Scope 必须包含 Functions。不要写入 `index.html`、`netlify.toml` 或 Git 仓库。
5. 保存变量后，触发一次新的 Deploy。环境变量变更需要重新部署后才会被函数读取。
6. 部署成功后访问 `/api/health`，确认 `ok=true`、`amapConfigured=true`、`adminConfigured=true`。再访问 `/admin.html` 打开后台。

推荐使用 Node.js 22.12 或更新版本。Netlify Blobs 是站点级持久化存储，资料在新部署后仍可读取；不依赖函数临时文件系统。

## 二、申请高德 Key

在 https://console.amap.com/dev/key/app 创建应用，申请 Web 服务类型 Key。高德 POI 2.0 文档说明可用 `region` + `city_limit=true` 限定区县范围，`region` 可传区县 `adcode`；每页最多25条。高德不承诺搜索返回全量 POI，因此本系统只把搜索结果存为候选资料，不会自动公开为当地特色美食或景点。

## 三、后台操作流程

1. 打开 `https://你的域名/admin.html`。
2. 输入 `ADMIN_TOKEN`。
3. 在“批量采集”区域粘贴区县六位 `adcode`，每行一个，每批最多25个。建议先用5个区县测试。
4. 点击“开始后台采集”。任务在 Netlify Background Function 中运行；页面会显示任务进度和失败区县。
5. 采集完成后，在“查看候选资料”区域输入 adcode。候选项包含名称、地址、区县编码、类型、地图评分/标签等（以高德返回字段为准）。
6. 对每条美食、景点进一步查证，并为正式推荐补充可靠来源名称和 HTTPS 来源链接。地方文旅部门、景区官网、非遗名录、地方媒体等优先；高德 POI 只作为地点和商户线索。
7. 在“审核并发布”区域，为该区县分别填写至少3条美食和3条景点，点击发布。正式记录会写入 Netlify Blobs 的 `approved/{adcode}`。
8. 转盘抽中县区或乡镇时，按所属县区 adcode 读取已审核资料；未审核时明确显示暂无区县专属资料，不会用市级或省级推荐填充。市级抽取仍使用网站内已有的市级精选资料。

## 四、接口

- `GET /api/health`：服务健康状态和已发布区县数量（不暴露密钥）。
- `GET /api/recommendations?adcode=330106`：访客读取已审核资料。
- `GET /api/admin/coverage`：后台查看已审核区县数、候选区县数和任务数；需 Bearer Token。
- `GET /api/admin/candidates?adcode=330106`：读取区县候选资料；需 Bearer Token。
- `GET /api/admin/job?jobId=...`：查看后台采集任务状态；需 Bearer Token。
- `POST /.netlify/functions/sync-batch-background`：启动批量采集；需 Bearer Token。JSON 示例：

```json
{
  "jobId": "district-batch-20261119-01",
  "adcodes": ["330106", "330108", "330110"]
}
```

- `POST /api/admin/approve`：审核后发布。每条美食/景点必须包含 `name`、`source`、`sourceUrl`，且 `sourceUrl` 必须是 HTTPS 链接；每类至少3条。

```json
{
  "adcode": "330106",
  "districtName": "西湖区",
  "cityName": "杭州市",
  "verificationNote": "已核实区县归属、代表性和来源链接",
  "foods": [
    {"name":"经核实的当地美食1","source":"地方文旅部门","sourceUrl":"https://example.org/food1"},
    {"name":"经核实的当地美食2","source":"非遗名录","sourceUrl":"https://example.org/food2"},
    {"name":"经核实的当地美食3","source":"地方媒体","sourceUrl":"https://example.org/food3"}
  ],
  "sites": [
    {"name":"区内景点1","source":"景区官网","sourceUrl":"https://example.org/site1"},
    {"name":"区内景点2","source":"地方文旅部门","sourceUrl":"https://example.org/site2"},
    {"name":"区内景点3","source":"官方介绍","sourceUrl":"https://example.org/site3"}
  ]
}
```

管理 API 请求头：`Authorization: Bearer 你的ADMIN_TOKEN`；JSON POST 另加 `Content-Type: application/json`。

## 五、全国区县数据导入建议

1. 从网站首页导出行政区 CSV，筛选县区级（level 2），保留六位 `code` 列作为 adcode。
2. 将 adcode 按每批不超过25个分批粘贴到后台。先小批验证 Key 权限、配额和返回数据质量。
3. 采集任务完成只代表“已找到候选 POI”，不代表区县已完成。只有审核发布的区县才计入正式覆盖率。
4. 以 `已审核区县数 ÷ 当前有效县级行政区数` 统计覆盖率。行政区划会变化，应定期核对最新区划代码。
5. 高德 API 搜索不是全量数据，且餐饮商户不等于地方特色菜。微信、微博、B站、美团/大众点评可用于补充线索，但应核对其公开页面、授权和使用条款，不能把平台热度当作真实性证明。

## 六、重要限制与安全

- 本包已经适配 Netlify Functions，不再使用原先常驻 `server.js` 服务模式。
- Netlify Blobs 存储已审核资料、候选资料和任务状态，部署后不会因函数实例重启而丢失。
- `ADMIN_TOKEN` 是管理后台的访问凭证，请勿公开或提交到代码仓库；如泄露，应在 Netlify 更新并重新部署。
- 公开 API 只返回审核通过的区县资料。候选 POI 不会被访客直接看到。
- 目前数据库初始为空；没有高德 Key、完成部署、批量采集及人工审核之前，不会凭空生成“全国100%已核实”数据。
- 该服务提供资料采集和管理基础设施，并不自动绕过美团、微信、微博、B站等平台的登录、权限或反爬机制。对这些平台的内容需通过公开页面、合法授权或人工补录。
