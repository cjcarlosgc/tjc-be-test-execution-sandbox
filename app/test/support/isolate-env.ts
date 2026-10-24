import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ConfigModule.forRoot lee `.env` del directorio actual al importar AppModule, antes de que cada spec fije su
// entorno; un `app/.env` local pisaba la configuración de los e2e (401). Se ejecutan desde un directorio vacío.
process.chdir(mkdtempSync(join(tmpdir(), 'sandbox-e2e-cwd-')));
