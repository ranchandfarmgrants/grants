// ==== Data loader ====
async function loadGrants(){
  const parts = [
    "data/grants_part1.json",
    "data/grants_part2.json",
    "data/grants_part3.json",
    "data/grants_part4.json"
  ];
  let all = [];
  for(const p of parts){
    const res = await fetch(p);
    const j = await res.json();
    all = all.concat(j);
  }
  return all;
}

const $ = sel => document.querySelector(sel);

// ==== Helpers ====
function uniqueSorted(arr){ return Array.from(new Set(arr)).filter(Boolean).sort(); }
function norm(v){ return (v??'').toString().toLowerCase(); }
function matchText(hay,needle){ if(!needle) return true; return norm(hay).includes(norm(needle)); }
function anyIntersect(arr, selected){ if(!selected?.length) return true; return selected.some(v=>arr?.includes(v)); }
function money(v){ if(v==null) return '—'; try {return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);} catch {return `$${v}`;} }

// Payout label + kind
function payoutLabel(g){
  const t = (g.coverage_type||'').toLowerCase();
  if (t.includes('cost_share') || t.includes('reimbursement')) {
    return g.advance_allowed ? 'reimbursement (advance possible)' : 'reimbursement';
  }
  if (t.includes('fixed_payment')) return 'direct payment';
  if (t.includes('grant')) return 'usually reimbursement';
  return 'varies';
}
function payoutKind(g){
  const t = (g.coverage_type||'').toLowerCase();
  if (t.includes('fixed_payment')) return 'direct';
  if (t.includes('cost_share') || t.includes('reimbursement') || t.includes('grant')) return 'reimbursement';
  return '';
}

// Window helpers
function isOpenNow(g){
  if(g.rolling) return true;
  if(!g.opens_at || !g.due_at) return false;
  const now = new Date(), o = new Date(g.opens_at), d = new Date(g.due_at);
  return now>=o && now<=d;
}
function dueWithin(g, days){
  if(!g.due_at) return false;
  const d = new Date(g.due_at), now = new Date();
  const diffDays = (d - now) / (1000*60*60*24);
  return diffDays >= 0 && diffDays <= days;
}

// Planning ETA (not a promise)
function estimatedWindow(g){
  const t = (g.coverage_type||'').toLowerCase();
  if (t.includes('fixed_payment')) return 'often weeks–few months';
  if (t.includes('cost_share') || t.includes('reimbursement') || t.includes('grant')) return 'plan for ~3–6 months; complex items can take 6–12 months';
  return 'varies by program';
}

// Slug + deep links
function slugify(s){ return (s||'').toLowerCase().trim()
  .replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-'); }
function programUrl(slug){
  const base = location.origin + location.pathname.replace(/index\.html?$/,'');
  return `${base}#${slug}?utm_source=share&utm_medium=card&utm_campaign=guide`;
}
function scrollToHash(){
  const hash = (location.hash||'').replace('#','').split('?')[0];
  if(!hash) return;
  const el = document.getElementById(hash);
  if(el){
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.style.outline = '2px solid #1d4ed8';
    setTimeout(()=> el.style.outline='none', 2000);
  }
}
window.addEventListener('hashchange', scrollToHash);

// Share + copy helpers
function buildShareLinks(title, url){
  const text = encodeURIComponent(`${title} – Free, plain-English farm & ranch grants guide`);
  const u = encodeURIComponent(url);
  return {
    fb:  `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x:   `https://twitter.com/intent/tweet?text=${text}&url=${u}`,
    wa:  `https://api.whatsapp.com/send?text=${text}%20${u}`,
    mail:`mailto:?subject=${encodeURIComponent('Ranch & Farm Grants – Free Guide')}&body=${text}%0A%0A${u}`
  };
}
async function share(title, url){
  try{
    if(navigator.share){
      await navigator.share({ title, url, text: title });
      return;
    }
  }catch(e){ /* fallback below */ }
  const links = buildShareLinks(title, url);
  const html = `
    <div style="padding:12px 14px;max-width:320px">
      <div style="margin-bottom:8px;font-weight:600">Share</div>
      <div class="sharebar">
        <a class="button small" href="${links.fb}" target="_blank" rel="noopener">Facebook</a>
        <a class="button small" href="${links.x}" target="_blank" rel="noopener">X</a>
        <a class="button small" href="${links.wa}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="button small" href="${links.mail}">Email</a>
      </div>
    </div>`;
  const w = window.open('', '_blank', 'width=360,height=320');
  if(w && !w.closed){ w.document.write(`<!doctype html><meta charset="utf-8"><body style="background:#0b0f1a;color:#e5e7eb;font-family:system-ui">${html}</body>`); }
}
async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    showToast('Link copied');
  }catch(e){
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    showToast('Link copied');
  }
}
function showToast(msg){
  const el = document.getElementById('toast'); if(!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(showToast._t); showToast._t = setTimeout(()=>el.classList.remove('show'), 1600);
}

// ==== Render ====
function render(list){
  const out = $('#list'); out.innerHTML = '';
  $('#count').textContent = `${list.length} program${list.length===1?'':'s'} shown`;

  list.forEach(g=>{
    const slug = slugify(g.program_name||'program');
    const cardUrl = programUrl(slug);

    const cats  = (g.categories||[]).map(c=>`<span class="badge">${c}</span>`).join('');
    const prods = (g.producer_types||[]).map(p=>`<span class="badge">${p}</span>`).join('');

    const windowChip = g.rolling
      ? '<span class="badge">rolling</span>'
      : (g.opens_at && g.due_at ? `<span class="badge">window: ${g.opens_at} → ${g.due_at}</span>` : '');

    const needsApplyBefore = ((g.coverage_type||'').toLowerCase().includes('cost_share') ||
                              (g.coverage_type||'').toLowerCase().includes('reimbursement'));
    const startBadge = needsApplyBefore ? '<span class="badge">apply before work</span>' : '';

    const costshare = (g.cost_share_min!=null || g.cost_share_max!=null)
      ? `${g.cost_share_min??''}${g.cost_share_min!=null?'–':''}${g.cost_share_max??''}%`
      : '—';

    const eligibilityNote = `
      <div class="meta">
        Eligibility: current FSA Form 578, AD-1026, AGI within limits, and no delinquent federal debts
        (taxes, student loans, USDA/SBA) or child-support arrears. Don’t start work before approval.
      </div>
    `;
    const orderNote = `
      <div class="meta">
        Smoothest path: apply for the grant first, then line up bridge funding if needed. If you can’t complete, approval expires (no payment; advances may need to be returned).
      </div>
    `;
    const timeline = g.decision_timeline ? `<div class="meta">Decision timeline: ${g.decision_timeline}</div>` : '';
    const eta = `<div class="meta">Estimated total timeframe: ${estimatedWindow(g)}</div>`;

    const googleLink  = `https://www.google.com/search?q=${encodeURIComponent((g.program_name||'').trim() + ' site:.gov')}`;
    const locatorLink = 'https://offices.sc.egov.usda.gov/locator/app';

    const el = document.createElement('div');
    el.className = 'card';
    el.id = slug;
    el.innerHTML = `
      <h3>${g.program_name}</h3>
      <div class="meta">${g.agency||''} • ${g.level||''}</div>
      <div class="row">${cats}</div>
      <div class="row">${prods}</div>
      ${windowChip || startBadge ? `<div class="row">${windowChip||''} ${startBadge||''}</div>` : ''}

      <p>${g.what_it_covers||''}</p>
      ${eligibilityNote}
      ${orderNote}
      ${timeline}
      ${eta}

      <div class="meta">Payout: ${payoutLabel(g)} • Coverage: ${g.coverage_type||'—'} • Cost-share: ${costshare} • Match required: ${g.match_required?'yes':'no'} • Advance: ${g.advance_allowed?'yes':'no'}</div>
      <div class="meta">Max award: ${money(g.max_award)}</div>
      ${g.required_docs ? `<div class="meta">Required docs: ${g.required_docs}</div>` : ''}

      ${g.disqualifiers ? `<div class="meta">Common disqualifiers:</div><ul>${g.disqualifiers.split(';').map(s=>`<li>${s.trim()}</li>`).join('')}</ul>` : ''}

      ${g.tax_notes ? `<div class="meta">Tips:</div><ul>${g.tax_notes.split(';').map(s=>`<li>${s.trim()}</li>`).join('')}</ul>` : ''}

      <div class="meta">Last verified: ${g.last_verified || '—'}</div>

      <div class="actions">
        ${
          g.official_link
            ? `<a class="button" href="${g.official_link}" target="_blank" rel="noopener">Official info</a>`
            : `<a class="button" href="${googleLink}" target="_blank" rel="noopener">Search on Google</a>`
        }
        <a class="button" href="${locatorLink}" target="_blank" rel="noopener">Find Local USDA Office</a>
        ${g.apply_link?`<a class="button" href="${g.apply_link}" target="_blank" rel="noopener">Apply</a>`:''}
        <a class="button outline" href="#" data-share="${encodeURIComponent(cardUrl)}" data-title="${encodeURIComponent(g.program_name||'Farm grant')}">Share</a>
        <a class="button ghost"  href="#" data-copy="${encodeURIComponent(cardUrl)}">Copy link</a>
      </div>
    `;
    out.appendChild(el);

    // Attach share/copy handlers
    const shareBtn = el.querySelector('[data-share]');
    if(shareBtn){
      shareBtn.addEventListener('click',(e)=>{
        e.preventDefault();
        const url = decodeURIComponent(shareBtn.getAttribute('data-share'));
        const title = decodeURIComponent(shareBtn.getAttribute('data-title'));
        share(`${title} – Ranch & Farm Grants`, url);
      });
    }
    const copyBtn = el.querySelector('[data-copy]');
    if(copyBtn){
      copyBtn.addEventListener('click',(e)=>{
        e.preventDefault();
        const url = decodeURIComponent(copyBtn.getAttribute('data-copy'));
        copyToClipboard(url);
      });
    }
  });
}

// ==== Filtering ====
function applyFilters(all){
  const q = $('#q').value.trim();
  const selectedProds = Array.from(document.querySelectorAll('input[name="producer"]:checked')).map(i=>i.value);
  const selectedCats  = Array.from(document.querySelectorAll('input[name="cat"]:checked')).map(i=>i.value);
  const rollingOnly = $('#rollingOnly').checked;
  const noMatchOnly = $('#noMatchOnly').checked;
  const openNow = $('#openNow').checked;
  const due30 = $('#due30').checked;
  const payoutWanted = (document.querySelector('input[name="payout"]:checked')||{}).value || '';

  const filtered = all.filter(g=>{
    const text = [g.program_name,g.agency,g.what_it_covers,g.notes].join(' ');
    if(!matchText(text,q)) return false;
    if(!anyIntersect(g.producer_types||[], selectedProds)) return false;
    if(!anyIntersect(g.categories||[], selectedCats)) return false;
    if(rollingOnly && !g.rolling) return false;
    if(noMatchOnly && g.match_required) return false;
    if(openNow && !isOpenNow(g)) return false;
    if(due30 && !dueWithin(g,30)) return false;
    if(payoutWanted && payoutKind(g)!==payoutWanted) return false;
    return true;
  });

  // prioritize open and soonest due
  const now = new Date();
  filtered.sort((a,b)=>{
    const ao=isOpenNow(a)?1:0, bo=isOpenNow(b)?1:0;
    if(bo!==ao) return bo-ao;
    const ad=a.due_at?Math.max(0,(new Date(a.due_at)-now)):Infinity;
    const bd=b.due_at?Math.max(0,(new Date(b.due_at)-now)):Infinity;
    if(ad!==bd) return ad-bd;
    return (a.program_name||'').localeCompare(b.program_name||'');
  });

  render(filtered);
}

// ==== Init ====
async function init(){
  const all = await loadGrants();

  // Build filter chips from data
  const producers = uniqueSorted(all.flatMap(g=>g.producer_types||[]));
  document.querySelector('#producerWrap').innerHTML = producers.map(p=>`<label><input type="checkbox" name="producer" value="${p}"> ${p}</label>`).join(' ');

  const cats = uniqueSorted(all.flatMap(g=>g.categories||[]));
  document.querySelector('#catWrap').innerHTML = cats.map(c=>`<label><input type="checkbox" name="cat" value="${c}"> ${c}</label>`).join(' ');

  // Wire inputs + radios
  document.querySelectorAll('input').forEach(el=>{
    el.addEventListener('input',()=>applyFilters(all));
    el.addEventListener('change',()=>applyFilters(all));
  });

  // First render
  applyFilters(all);

  // Autofocus search on load
  document.querySelector('#q')?.focus();

  // Global share buttons
  ['globalShareBtnTop','globalShareBtnFooter'].forEach(id=>{
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('click', (e)=>{
        e.preventDefault();
        const url = location.href.split('#')[0] + '?utm_source=share&utm_medium=site&utm_campaign=guide';
        share('Ranch & Farm Grants – Free Guide', url);
      });
    }
  });

  // Global copy-link buttons
  ['globalCopyBtnTop','globalCopyBtnFooter'].forEach(id=>{
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('click',(e)=>{
        e.preventDefault();
        const url = location.href.split('#')[0] + '?utm_source=copy&utm_medium=site&utm_campaign=guide';
        copyToClipboard(url);
      });
    }
  });

  // Deep link scroll/highlight
  scrollToHash();
}
document.addEventListener('DOMContentLoaded', init);
