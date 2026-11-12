const paths={
 grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 chart:'M4 19V5 M4 19h16 M8 14l4-5 4 2 4-6',
 team:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
 folder:'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z M3 10h18',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3z',
 arrow:'M5 12h14 M13 6l6 6-6 6',
 refresh:'M20 7v5h-5 M4 17v-5h5 M6.1 7a7 7 0 0 1 11.5-2L20 8 M4 16l2.4 3A7 7 0 0 0 18 17',
 plus:'M12 5v14 M5 12h14',
 shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z M8 12l3 3 5-6',
 menu:'M4 6h16 M4 12h16 M4 18h16',
 bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
 layers:'M12 3l10 6-10 6L2 9l10-6z M2 13l10 6 10-6 M2 17l10 6 10-6',
 clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 book:'M4 3h7v18H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M11 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-9 M6 7h2 M15 7h4 M15 11h4',
 spark:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z'
};
export function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('icon');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]??paths.grid);svg.append(path);return svg;}
/** @returns {any} */
export function element(tag,text,className=''){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
const navigation=[['/','市場總覽','grid'],['/workspace','團隊研究','team'],['/data','官方資料中心','chart'],['/ai','AI 團隊配置','layers'],['/research','研究工具','settings']];
const active=navigation.find(n=>n[0]===location.pathname)??navigation[0];document.body.classList.add('page-'+(location.pathname.slice(1)||'home'));
const sidebar=element('aside',undefined,'app-sidebar');sidebar.id='app-navigation';const brand=element('a',undefined,'app-brand');brand.href='/';const mark=element('span',undefined,'brand-mark');mark.append(icon('chart'));const name=element('div');name.append(element('strong','衡研'),element('small','HENGYAN RESEARCH'));brand.append(mark,name);
const nav=element('nav',undefined,'app-nav');nav.setAttribute('aria-label','主要導覽');for(const [href,label,glyph] of navigation){const a=element('a',undefined,href===active[0]?'active':'');a.href=href;if(href===active[0])a.setAttribute('aria-current','page');a.append(icon(glyph),element('span',label));nav.append(a);}
const note=element('div',undefined,'sidebar-note');const label=element('span','本機研究空間');label.style.fontSize='11px';label.prepend(element('i',undefined,'local-dot'));note.append(label,element('p','以可追溯的證據，\n連結每一次研究判斷。'));const profile=element('div',undefined,'sidebar-profile');const profileInfo=element('div');profileInfo.append(element('strong','個人工作空間'),element('small','LOCAL WORKSPACE'));profile.append(element('span','研','profile-icon'),profileInfo);sidebar.append(brand,element('div','工作台 / WORKSPACE','nav-label'),nav,note,profile);
const topbar=element('header',undefined,'app-topbar');const crumbs=element('div',undefined,'breadcrumbs');const menu=element('button',undefined,'menu-button');menu.type='button';menu.setAttribute('aria-label','開啟導覽選單');menu.setAttribute('aria-controls','app-navigation');menu.setAttribute('aria-expanded','false');menu.append(icon('menu'));crumbs.append(menu,element('span','工作空間'),element('span','/'),element('strong',active[1]));const tools=element('div',undefined,'topbar-tools');tools.append(element('span',new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric'}).format(new Date()),'date'));const badge=element('span','本機測試版','badge');const settings=element('a',undefined,'topbar-link');settings.href='/ai';settings.setAttribute('aria-label','AI 團隊設定');settings.append(icon('settings'));tools.append(badge,settings);topbar.append(crumbs,tools);
const scrim=element('button',undefined,'nav-scrim');scrim.type='button';scrim.setAttribute('aria-label','關閉導覽選單');scrim.tabIndex=-1;function close(){document.body.classList.remove('nav-open');menu.setAttribute('aria-expanded','false');}menu.onclick=()=>{const open=document.body.classList.toggle('nav-open');menu.setAttribute('aria-expanded',String(open));if(open)nav.querySelector('a.active')?.focus();};scrim.onclick=close;document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('nav-open')){close();menu.focus();}});document.body.prepend(sidebar,topbar,scrim);
if(location.pathname!=='/'){const main=document.querySelector('main');const h1=main.querySelector('h1');if(h1){const intro=h1.nextElementSibling;const heading=element('div',undefined,'page-heading');const text=element('div');text.append(element('div','RESEARCH WORKSPACE','eyebrow'),h1);if(intro?.tagName==='P')text.append(intro);heading.append(text);main.prepend(heading);}const footer=element('footer','衡研 HENGYAN · 個人金融研究工作台','app-footer');main.append(footer);}
try{
 const response=await fetch('/api/auth/me');const account=await response.json();
 if(!account.local){
  if(!account.user){location.assign('/login');}
  else{
   badge.textContent='雲端測試版';label.lastChild.textContent='私人研究空間';
   profileInfo.replaceChildren(element('strong',account.user.email),element('small','PRIVATE WORKSPACE'));
   profileInfo.style.overflowWrap='anywhere';
   const logout=element('button','登出','secondary');logout.type='button';
   logout.onclick=async()=>{logout.disabled=true;try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw new Error('登出失敗，請稍後重試');location.assign('/login');}catch(e){logout.textContent=e.message;logout.disabled=false;}};
   note.append(element('p','私人文件與 AI 設定保存在你的雲端空間。免費服務會休眠，請保留原始文件。'),logout);
   const footer=document.querySelector('.dashboard-footer');if(footer)footer.lastElementChild.textContent='私人資料依帳號保存；分析時文件節錄會傳送給你配置的 AI。';
  }
 }
}catch{/* 登入狀態服務暫時不可用時，不改寫既有研究內容。 */}
