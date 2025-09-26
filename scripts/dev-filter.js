#!/usr/bin/env node
// Small dev log filter: print only our `tag` JSON lines so you can keep a clean view.
process.stdin.setEncoding('utf8');

let buf = '';
process.stdin.on('data', chunk => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    try {
      const obj = JSON.parse(line);
      if (obj && obj.tag) {
        console.log(JSON.stringify(obj));
      }
    } catch (_) {
      // ignore non-JSON dev noise
    }
  }
});