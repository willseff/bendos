#!/usr/bin/env node
// Example external tool. Receives JSON on stdin, writes JSON to stdout.
// Register it by placing echo.json in the tools/ directory.

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const data = JSON.parse(input || '{}');
  process.stdout.write(JSON.stringify({ echo: data.message ?? '', timestamp: Date.now() }));
});
