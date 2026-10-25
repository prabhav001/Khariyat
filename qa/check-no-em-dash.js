// Reports every U+2014 (em dash) in the delivered product and documentation files.
// Usage: node qa/check-no-em-dash.js [extra files...]   Exit code 1 if any are found.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EM_DASH = String.fromCharCode(0x2014);
const DEFAULT = ['index.html', 'styles.css', 'app.js', 'README.md', 'docs', 'qa', 'submission'];

function walk(p, out) {
  const st = fs.statSync(p);
  if (st.isDirectory()) fs.readdirSync(p).forEach((n) => walk(path.join(p, n), out));
  else if (/\.(html|css|js|md|txt|csv|json|py)$/i.test(p)) out.push(p);
  return out;
}

function scan(files) {
  let total = 0;
  files.forEach((file) => {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const n = line.split(EM_DASH).length - 1;
      if (n) {
        total += n;
        console.log(`${path.relative(ROOT, file)}:${i + 1}: ${n} em dash${n > 1 ? 'es' : ''}`);
      }
    });
  });
  return total;
}

if (require.main === module) {
  const targets = DEFAULT.map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p)).concat(process.argv.slice(2).map((p) => path.resolve(p)));
  const files = targets.reduce((acc, p) => walk(p, acc), []);
  const total = scan(files);
  console.log(`${total} em dash${total === 1 ? '' : 'es'} (U+2014) in ${files.length} files`);
  process.exit(total ? 1 : 0);
}

module.exports = { scan, walk, ROOT, DEFAULT };
