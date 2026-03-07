'use strict';

const fs = require('fs');
const path = require('path');

function rmRecursive(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stat = fs.lstatSync(targetPath);
  if (!stat.isDirectory()) {
    fs.unlinkSync(targetPath);
    return;
  }

  for (const entry of fs.readdirSync(targetPath)) {
    rmRecursive(path.join(targetPath, entry));
  }
  fs.rmdirSync(targetPath);
}

function copyRecursive(fromPath, toPath) {
  const stat = fs.lstatSync(fromPath);
  if (stat.isDirectory()) {
    if (!fs.existsSync(toPath)) {
      fs.mkdirSync(toPath, { recursive: true });
    }
    for (const entry of fs.readdirSync(fromPath)) {
      copyRecursive(path.join(fromPath, entry), path.join(toPath, entry));
    }
    return;
  }

  fs.copyFileSync(fromPath, toPath);
}

function main() {
  const packageRoot = path.resolve(__dirname, '..');
  const srcDir = path.join(packageRoot, 'src');
  const distDir = path.join(packageRoot, 'dist');

  rmRecursive(distDir);
  fs.mkdirSync(distDir, { recursive: true });
  copyRecursive(srcDir, distDir);

  process.stdout.write(`Built dist directory: ${distDir}\n`);
}

main();
