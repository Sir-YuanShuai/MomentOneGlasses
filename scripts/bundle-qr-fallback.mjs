import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'scripts/qr-fallback-source.js' });
await bundle.write({ file: 'services/qr-fallback.js', format: 'es', minify: false });
await bundle.close();
