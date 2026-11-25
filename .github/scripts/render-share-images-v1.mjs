#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const readArg = name => {
  const value = process.argv.slice(2).find(arg => arg.startsWith(`--${name}=`));
  if (!value) throw new Error(`--${name} is required`);
  return value.slice(name.length + 3);
};
const catalog = JSON.parse(fs.readFileSync(readArg('catalog'), 'utf8'));
const out = path.resolve(readArg('out'));

for (const cultivar of catalog.cultivars) {
  const id = cultivar.id;
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`invalid cultivar id: ${id}`);
  const visual = cultivar.visuals?.find(item => item?.role === 'primary') || cultivar.visuals?.[0];
  const src = visual?.src;
  if (!/^assets\/cultivars\/[a-z0-9-]+\/[a-z0-9._-]+\.(webp|svg)$/.test(src || '') ||
      !src.startsWith(`assets/cultivars/${id}/`)) throw new Error(`invalid share visual: ${id}`);
  const input = path.join(out, src);
  if (!fs.existsSync(input)) throw new Error(`missing share visual: ${id}`);
  if (src.endsWith('.webp')) continue;
  const output = path.join(out, 'assets', 'cultivars', id, 'share.webp');
  // Render SVG first: ImageMagick's SVG delegate varies across environments.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csw-share-'));
  const png = path.join(tempDir, 'image.png');
  try {
    if (process.env.CSW_SVG_RENDERER === 'inkscape') {
      execFileSync('inkscape', [input, '--export-type=png', `--export-filename=${png}`]);
    } else {
      execFileSync('rsvg-convert', ['-o', png, input]);
    }
    execFileSync(process.env.CSW_MAGICK_BIN || 'convert', [png, '-resize', '1200x630',
      '-background', '#06100c', '-gravity', 'center', '-extent', '1200x630',
      '-quality', '82', output]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  if (!fs.existsSync(output) || fs.statSync(output).size === 0) throw new Error(`share conversion failed: ${id}`);
  console.log(`Rendered share image for ${id}`);
}
