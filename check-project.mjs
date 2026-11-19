import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const required = ['site/index.html','site/admin.html','site/china_travel_collage.png','netlify.toml','netlify/functions/api.mjs','netlify/functions/sync-batch-background.mjs','package.json'];
for (const file of required) if (!existsSync(resolve(file))) throw new Error(`Missing ${file}`);
JSON.parse(readFileSync('package.json','utf8'));
console.log('Project structure check passed.');
