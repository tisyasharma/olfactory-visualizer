#!/usr/bin/env node

/**
 * Scan code/web/styles.css for class/id selectors that never appear
 * in the web HTML/JS. Uses simple regex matching; it intentionally
 * ignores vendor-prefixed selectors.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const cssFile = path.join(repoRoot, 'code', 'web', 'styles.css');
const searchRoot = path.join(repoRoot, 'code', 'web');
const searchExts = new Set(['.html', '.js']);

const cssText = fs.readFileSync(cssFile, 'utf8');

const classRegex = /\.([A-Za-z_-][A-Za-z0-9_-]*)/g;
const idRegex = /#([A-Za-z_-][A-Za-z0-9_-]*)/g;
const vendorPrefixes = ['webkit', 'moz', 'ms'];

const classes = collectSelectors(classRegex).filter(notVendor);
const ids = collectSelectors(idRegex).filter(sel => notVendor(sel) && !isHexColor(sel));

const files = listFiles(searchRoot).filter(f => searchExts.has(path.extname(f)));
const texts = files.map(f => fs.readFileSync(f, 'utf8'));

const unusedClasses = findUnused(classes, texts);
const unusedIds = findUnused(ids, texts);

console.log(`Scanned ${classes.length} classes and ${ids.length} ids across ${files.length} files.`);
if(unusedClasses.length === 0 && unusedIds.length === 0){
  console.log('No unused selectors found.');
  process.exit(0);
}

if(unusedClasses.length){
  console.log(`Unused classes (${unusedClasses.length}):`);
  unusedClasses.forEach(c => console.log(`  .${c}`));
}
if(unusedIds.length){
  console.log(`Unused ids (${unusedIds.length}):`);
  unusedIds.forEach(id => console.log(`  #${id}`));
}

function collectSelectors(regex){
  const out = new Set();
  let m;
  while((m = regex.exec(cssText)) !== null){
    const sel = m[1];
    if(isHexColor(sel)) continue;
    out.add(sel);
  }
  return Array.from(out);
}

function notVendor(name){
  return !vendorPrefixes.some(p => name.startsWith(p));
}

function listFiles(dir){
  return fs.readdirSync(dir, { withFileTypes:true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()){
      return listFiles(full);
    }
    return [full];
  });
}

function escapeRegex(str){
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findUnused(selectors, texts){
  return selectors.filter(sel => {
    const re = new RegExp(`\\b${escapeRegex(sel)}\\b`);
    return !texts.some(t => re.test(t));
  });
}

function isHexColor(str){
  return /^[0-9a-fA-F]{3,8}$/.test(str);
}
