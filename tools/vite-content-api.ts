import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { readContentFiles, writeContentFiles, type ContentBundle } from './content-files';

// 개발 서버 전용 API: 에디터가 content/ 폴더를 직접 읽고 쓴다.
//   GET /api/content  → { game, encounters: [...] }
//   PUT /api/content  → 같은 형식을 받아 저장
// 빌드 시에는 같은 형식의 content-bundle.json을 함께 내보내 (서버 없는) 에디터가 읽을 수 있게 한다.

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function contentApi(root: string): Plugin {
  return {
    name: 'insanity-content-api',
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'content-bundle.json', source: JSON.stringify(await readContentFiles(root)) });
    },
    configureServer(server) {
      server.middlewares.use('/api/content', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method === 'GET') {
            send(200, await readContentFiles(root));
          } else if (req.method === 'PUT') {
            const body = JSON.parse(await readBody(req)) as ContentBundle;
            if (!body || typeof body.game !== 'object' || !Array.isArray(body.encounters)) {
              send(400, { error: '잘못된 형식입니다' });
              return;
            }
            send(200, { ok: true, ...(await writeContentFiles(root, body)) });
          } else {
            send(405, { error: 'GET 또는 PUT만 지원합니다' });
          }
        } catch (err) {
          send(500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
