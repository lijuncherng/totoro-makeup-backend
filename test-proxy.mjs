import fetch from 'node-fetch';

const body = JSON.stringify({
  campusId: 'QJXQ',
  schoolId: 'cqifs',
  stuNumber: '202413006775',
  token: 'APP/nLQu1o40L9ReCShZgfZNxikSh0KFIeFEafwXOxovvgkgQJ9Ou9MYBG0Aflnn7GR8ojmtkgAAjTaNptIuT2rodXTf9SEEfJx'
});

console.log('测试 Nuxt /api/totoro 代理...');
const r = await fetch('http://localhost:3000/api/totoro/sunrun/getFreerunPaper', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body,
});
const text = await r.text();
console.log(`状态: ${r.status}`);
console.log(`响应 (${text.length}字节): ${text.slice(0, 500)}`);
