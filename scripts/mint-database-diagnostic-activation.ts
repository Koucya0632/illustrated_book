// Offline only. Never prints key or activation token.
import fs from 'node:fs';
import { mintDiagnosticActivation } from '../lib/database-target-diagnostic';

function readPrivate(file: string): string {
  const keyFd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(keyFd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.() || stat.size > 128) throw new Error('invalid key file');
    return fs.readFileSync(keyFd, 'utf8').trim();
  } finally { fs.closeSync(keyFd); }
}
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 8 || args[0] !== '--key-file' || args[2] !== '--ref-file' || args[4] !== '--digest-file' || args[6] !== '--output') throw new Error('invalid arguments');
  const activation = mintDiagnosticActivation(readPrivate(args[1]), readPrivate(args[3]), readPrivate(args[5]), Date.now());
  const outFd = fs.openSync(args[7], fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(outFd, activation + '\n'); } finally { fs.closeSync(outFd); }
  console.log('Short-lived activation saved to a private local file.');
}
try { main(); } catch { console.error('Could not create diagnostic activation.'); process.exitCode = 1; }
