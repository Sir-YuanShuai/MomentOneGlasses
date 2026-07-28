async function readRequestBody(request, maxBytes = 20 * 1024 * 1024) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maxBytes) throw new Error('照片超过本地调试桥接的 20MB 限制');
    chunks.push(bytes);
  }

  return Buffer.concat(chunks);
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Cache-Control', 'no-store');
}

export function createPhotoBridgePlugin() {
  let latestPhoto = null;

  return {
    name: 'moment-one-local-photo-bridge',

    configureServer(server) {
      server.middlewares.use('/api/local-photo', async (request, response) => {
        setCors(response);

        if (request.method === 'OPTIONS') {
          response.statusCode = 204;
          response.end();
          return;
        }

        if (request.method === 'POST') {
          try {
            latestPhoto = {
              data: await readRequestBody(request),
              mimeType: String(request.headers['content-type'] || 'image/jpeg'),
              updatedAt: new Date().toISOString()
            };
            response.statusCode = 204;
            response.end();
          } catch (error) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ error: { message: error.message || String(error) } }));
          }
          return;
        }

        if (request.method === 'GET') {
          if (!latestPhoto) {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ error: { message: '尚未准备本地调试照片' } }));
            return;
          }

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({
            mimeType: latestPhoto.mimeType,
            base64: latestPhoto.data.toString('base64'),
            updatedAt: latestPhoto.updatedAt
          }));
          return;
        }

        if (request.method === 'DELETE') {
          latestPhoto = null;
          response.statusCode = 204;
          response.end();
          return;
        }

        response.statusCode = 405;
        response.end();
      });
    }
  };
}
