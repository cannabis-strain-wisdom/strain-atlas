import fs from 'node:fs';

const path='app.min.js';
let text=fs.readFileSync(path,'utf8');
const needle='const t=e[i?.id];t&&(';
const guarded='const t=e[i?.id];"CURRENT"!==i?.publicPresentation?.state&&t&&(';
const count=text.split(needle).length-1;
if(count<1) throw new Error('NO_LEGACY_RUNTIME_OVERLAY_MUTATORS_FOUND');
if(text.includes(guarded)) throw new Error('CURRENT_RUNTIME_AUTHORITY_ALREADY_APPLIED');
text=text.split(needle).join(guarded);
fs.writeFileSync(path,text);
console.log(`GUARDED_LEGACY_RUNTIME_OVERLAY_MUTATORS=${count}`);
