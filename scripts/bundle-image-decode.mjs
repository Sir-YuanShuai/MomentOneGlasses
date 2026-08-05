import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'scripts/image-decode-source.js' });
await bundle.write({ file: 'services/image-decode.js', format: 'es', minify: false });
await bundle.close();
