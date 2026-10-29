const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = process.env.SITE_FILE_MANIFEST;
const files = manifest ? JSON.parse(fs.readFileSync(manifest)) : execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
const paths = new Set(files);
let scripts = 0;
const failures = [];
for (const file of files.filter(f => /\.(html|css|js)$/.test(f) && !f.startsWith('tests/'))) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  if (file.endsWith('.js')) new vm.Script(text, { filename: file });
  for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (match[1].includes('application/ld+json')) JSON.parse(match[2]);
    else { new vm.Script(match[2], { filename: file }); scripts++; }
  }
  for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']|url\(["']?([^"')]+)["']?\)|["'](assets\/[^"']+)["']/g)) {
    const value = match[1] || match[2] || match[3];
    if (/^(https?:|mailto:|tel:|data:)/.test(value)) continue;
    const url = new URL(value, 'https://local/' + file);
    let target = decodeURIComponent(url.pathname.slice(1));
    if (!target || target.endsWith('/')) target += 'index.html';
    if (!paths.has(target)) failures.push(`${file}: missing ${target}`);
    if (url.hash && target.endsWith('.html') && paths.has(target)) {
      const html = fs.readFileSync(path.join(root, target), 'utf8');
      const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
      if (!ids.includes(decodeURIComponent(url.hash.slice(1)))) failures.push(`${file}: missing anchor ${value}`);
    }
  }
  if (file.endsWith('.html') && (text.match(/src="\/assets\/js\/site.js"/g) || []).length !== 1) failures.push(`${file}: shared script missing or duplicated`);
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Passed: local links, image references, anchors, shared script inclusion, JavaScript and JSON syntax (${scripts} inline scripts).`);
