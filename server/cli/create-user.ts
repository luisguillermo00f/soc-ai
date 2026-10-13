// Crea un usuario desde la terminal:  npm run user:create -- correo@soc.com "Nombre" admin
import { createUser, validatePassword } from '../auth.ts';
import { createInterface } from 'node:readline/promises';

const [email, name, role = 'analista'] = process.argv.slice(2);
if (!email || !name || !['admin', 'analista', 'lector'].includes(role)) {
  console.error('Uso: npm run user:create -- <correo> "<nombre>" [admin|analista|lector]');
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question('Contraseña (mín. 10 caracteres, letras y números): ');
rl.close();
const err = validatePassword(password);
if (err) { console.error(err); process.exit(1); }
const u = createUser(email, name, role as 'admin', password);
console.log(`Usuario creado: ${u.email} (${u.role})`);
