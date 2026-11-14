// Used by the Docker HEALTHCHECK: exits 0 when /health answers 200, 1 otherwise.
const http = require('http');

const port = process.env.PORT || 3000;

const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 3000 }, (res) => {
    process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on('timeout', () => req.destroy());
req.on('error', () => process.exit(1));
