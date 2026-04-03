const http = require('http');
const fs = require('fs');

// Read token
let token = '';
try { token = fs.readFileSync('./admin-token.txt', 'utf8').trim(); } catch (e) { token = ''; }

if (!token) {
  // Try to login
  const loginBody = JSON.stringify({ username: 'admin', password: 'admin' });
  const loginReq = http.request({
    hostname: 'localhost', port: 4000, path: '/api/admin/login',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) }
  }, loginRes => {
    let d = '';
    loginRes.on('data', c => d += c);
    loginRes.on('end', () => {
      try { token = JSON.parse(d).token; } catch (_) {}
      testEndpoint(token);
    });
  });
  loginReq.write(loginBody);
  loginReq.end();
} else {
  testEndpoint(token);
}

function testEndpoint(tok) {
  const paths = ['/api/admin/dashboard', '/api/admin/stats/peak-hours'];
  let results = {};
  let done = 0;

  paths.forEach(p => {
    http.get({ hostname: 'localhost', port: 4000, path: p, headers: { Authorization: `Bearer ${tok}` } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { results[p] = { status: res.statusCode, body: JSON.parse(d) }; } 
        catch (_) { results[p] = { status: res.statusCode, raw: d.substring(0, 500) }; }
        done++;
        if (done === paths.length) {
          fs.writeFileSync('./scripts/_result.json', JSON.stringify(results, null, 2));
          process.exit(0);
        }
      });
    }).on('error', e => {
      results[p] = { error: e.message };
      done++;
      if (done === paths.length) {
        fs.writeFileSync('./scripts/_result.json', JSON.stringify(results, null, 2));
        process.exit(1);
      }
    });
  });
}
