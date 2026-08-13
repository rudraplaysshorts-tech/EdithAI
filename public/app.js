const money=n=>"₹"+Number(n).toLocaleString("en-IN");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
function toast(msg){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
async function loadPlans(){const el=document.getElementById('plans');try{const r=await fetch('/api/plans');const d=await r.json();if(!r.ok)throw Error();el.innerHTML=d.plans.map((p,i)=>`<article class="plan ${i===0?'popular':''}">${i===0?'<span class="badge">CURRENT RELEASE</span>':''}<h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="price">${money(p.amount)} <small>one-time</small></div><ul>${(p.features||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><a class="buy" style="display:block;text-align:center;text-decoration:none" href="/checkout.html?plan=${encodeURIComponent(p.id)}">Purchase securely →</a></article>`).join('');}catch(e){el.innerHTML='<div class="plan"><h3>Store is preparing</h3><p>The product catalog will appear here after the free Cloudflare backend is configured.</p></div>'}}
async function loadRelease(){try{const r=await fetch('/api/releases/latest');const d=await r.json();if(!d.release)return;document.getElementById('releaseTitle').textContent=`E.D.I.T.H. ${d.release.version}`;document.getElementById('releaseText').textContent=d.release.notes||'Latest Android release is ready.';document.getElementById('releaseVersion').textContent=d.release.version;document.getElementById('releaseDate').textContent=new Date(d.release.published_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});}catch(e){}}
async function loadFreeStatus(){try{const r=await fetch('/api/free/status');const d=await r.json();if(d.active){$id=document.getElementById('freeDownloadBtn');$id.style.display='inline-block';document.getElementById('freeDownloadNote').style.display='block'}}catch(e){}}
function startTrialInfo(){toast('The 10-minute trial is delivered through the demo APK release configured by the admin.');location.hash='#pricing'}
document.getElementById('year').textContent=new Date().getFullYear();loadPlans();loadRelease();loadFreeStatus();
(function(){
  const btn=document.getElementById('hambBtn'),menu=document.getElementById('mobileMenu');
  if(!btn||!menu)return;
  function close(){menu.classList.remove('open');btn.setAttribute('aria-expanded','false');btn.textContent='☰'}
  function open(){menu.classList.add('open');btn.setAttribute('aria-expanded','true');btn.textContent='✕'}
  btn.addEventListener('click',()=>menu.classList.contains('open')?close():open());
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
})();
