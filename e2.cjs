const fs=require('fs');
function sub(f,a,b){let s=fs.readFileSync(f,'utf8');if(!s.includes(a))throw new Error('missing in '+f+': '+a.slice(0,50));fs.writeFileSync(f,s.replace(a,b));}
sub('public/js/library-model.js','    createdAt: run?.createdAt ?? null,\n  };','    createdAt: run?.createdAt ?? null,\n    seconds: runSeconds(run),\n  };');
sub('public/js/library-model.js','export function runFacts(run) {',`// How long the recorded run took, in seconds: the latest event time. 0 when the run has no event times.
export function runSeconds(run) {
  const times = Array.isArray(run?.events) ? run.events.map((e) => e?.t).filter((x) => Number.isFinite(x) && x >= 0) : [];
  return times.length > 0 ? Math.max(...times) / 1000 : 0;
}

export function runFacts(run) {`);
sub('public/js/replay/about.js','export function createAboutPanel({ doc, t, getAbout, editable, onSave }) {','export function createAboutPanel({ doc, t, getAbout, editable, onSave, headingKey = "about.heading" }) {');
let s=fs.readFileSync('public/js/replay/about.js','utf8');s=s.split('t("about.heading")').join('t(headingKey)');fs.writeFileSync('public/js/replay/about.js',s);
sub('public/js/library-page.js','        editable: own,\n        onSave:','        editable: own,\n        headingKey: own ? "about.heading" : "about.headingPattern",\n        onSave:');
sub('public/js/library-page.js',`"edit-description": () => panel?.element.querySelector('[data-ui="about-edit"]')?.click(),`,`"edit-description": () => {
        body.querySelector('[data-ui="detail-tab-pattern"]')?.click();
        panel?.element.querySelector('[data-ui="about-edit"]')?.click();
      },`);
