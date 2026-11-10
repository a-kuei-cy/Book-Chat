'use strict';
let galleryRecords = [], galleryLoaded = false, galleryRequest = null, shownCount = 12;
let previewUrl = null;
const byId = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeURL(value) { try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function dateKey(value) { const raw = String(value ?? '').replace(/^'/,''); const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); return match ? `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}` : ''; }
function showError(message) { if (typeof Swal !== 'undefined') Swal.fire('無法完成', message, 'error'); else alert(message); }
async function apiCall(action, payload = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), payload ? 90000 : 30000);
  try {
    const response = await fetch(payload ? GAS_API_URL : `${GAS_API_URL}?action=${encodeURIComponent(action)}`, payload ? {method:'POST',body:JSON.stringify({action,payload}),headers:{'Content-Type':'text/plain;charset=utf-8'},signal:controller.signal} : {signal:controller.signal});
    if (!response.ok) throw new Error(`連線失敗（${response.status}）`);
    const result = await response.json();
    if (result && result.status === 'error') throw new Error(result.message || '伺服器無法完成此操作');
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(payload ? '等待回應逾時。資料可能已送達，請先重新整理成果牆確認，再決定是否重送。' : '讀取逾時，請檢查網路後重試。');
    throw error;
  } finally { clearTimeout(timer); }
}
// Legacy admin actions also recover from failed requests, without leaving a blocking overlay.
window.addEventListener('unhandledrejection', event => { event.preventDefault(); byId('loadingOverlay').style.display='none'; showError(event.reason?.message || '連線失敗，請稍後再試。'); });
async function loadMethods() {
  try {
    const methods = await apiCall('getMethodList');
    if (!Array.isArray(methods)) throw new Error('實施方式資料格式不正確');
    currentMethods = methods.map(String); updateMethodDropdowns(currentMethods); renderAdminMethodsList(currentMethods);
    byId('methodRetry')?.remove();
  } catch {
    byId('method').replaceChildren(new Option('載入失敗，請按下方按鈕重試',''));
    if (!byId('methodRetry')) { const b=document.createElement('button'); b.id='methodRetry'; b.type='button'; b.className='btn btn-link'; b.textContent='重新載入實施方式'; b.onclick=loadMethods; byId('method').after(b); }
  }
}
function updateMethodDropdowns(methods) {
  ['method','editMethod'].forEach(id=>{const el=byId(id), value=el.value; el.replaceChildren(new Option('請選擇實施方式','')); methods.forEach(m=>el.add(new Option(m,m))); if(methods.includes(value)) el.value=value;});
}
function renderAdminMethodsList(methods) {
  const el=byId('methodsListContainer'); el.replaceChildren();
  methods.forEach(m=>{const b=document.createElement('button');b.type='button';b.className='btn badge-method bg-light text-dark border';b.textContent=`${m} ×`;b.setAttribute('aria-label',`刪除實施方式：${m}`);b.onclick=()=>handleDeleteMethod(m);el.append(b);});
  if(!methods.length) el.textContent='尚未設定實施方式';
}
async function loadGalleryData() {
  if(galleryRequest) return galleryRequest;
  galleryRequest = (async()=>{
    byId('galleryContainer').setAttribute('aria-busy','true'); byId('refreshGallery').disabled=true;
    byId('connectionStatus').textContent='正在更新閱讀成果…';
    try {
      const data=await apiCall('getGalleryData');
      if(!Array.isArray(data.records)) throw new Error('成果資料格式不正確');
      galleryRecords=data.records;galleryLoaded=true;
      byId('classCount').textContent=new Set(data.records.map(r=>String(r.className??'').trim()).filter(Boolean)).size;
      renderPieChart(data.records);
      const filter=byId('galleryMethod'), previous=filter.value;
      filter.replaceChildren(new Option('全部方式',''));
      [...new Set(data.records.map(r=>String(r.method||'')).filter(Boolean))].sort().forEach(m=>filter.add(new Option(m,m)));
      if([...filter.options].some(o=>o.value===previous))filter.value=previous;
      shownCount=12;renderGallery();
      byId('connectionStatus').classList.remove('is-error');
      byId('connectionStatus').textContent=`已更新 · 共 ${data.records.length} 則閱讀成果`;
    } catch(error) {
      const status=byId('connectionStatus');status.classList.add('is-error');status.textContent=galleryLoaded?'更新失敗，目前顯示上次載入的成果。':'暫時無法取得資料，請檢查網路後重試。';
      const retry=document.createElement('button');retry.type='button';retry.className='btn btn-sm btn-outline-secondary';retry.textContent='重試';retry.onclick=loadGalleryData;status.append(retry);
      if(!galleryLoaded) byId('galleryContainer').innerHTML='<div class="empty-state"><h3>成果暫時無法載入</h3><p>請按「重新整理」再試一次。</p></div>';
    } finally { byId('galleryContainer').setAttribute('aria-busy','false');byId('refreshGallery').disabled=false;galleryRequest=null; }
  })();
  return galleryRequest;
}
function filteredRecords(){
  const q=byId('gallerySearch').value.trim().toLocaleLowerCase(), method=byId('galleryMethod').value;
  const direction=byId('gallerySort').value==='oldest'?1:-1;
  return galleryRecords.filter(r=>(!method||String(r.method)===method)&&(!q||[r.className,r.bookTitle,r.content].some(v=>String(v??'').toLocaleLowerCase().includes(q)))).sort((a,b)=>direction*dateKey(a.date).localeCompare(dateKey(b.date)));
}
function renderGallery(){
  const records=filteredRecords();byId('galleryCount').textContent=`共 ${records.length} 則成果${records.length>shownCount?`，已顯示 ${shownCount} 則`:''}`;
  byId('loadMore').hidden=records.length<=shownCount;
  if(!records.length){byId('galleryContainer').innerHTML=`<div class="empty-state"><h3>${galleryRecords.length?'找不到符合條件的成果':'第一段閱讀故事，等你來分享'}</h3><p>${galleryRecords.length?'試試其他關鍵字，或選擇全部方式。':'到導師上傳區記錄班上的聊書時光。'}</p></div>`;return;}
  byId('galleryContainer').innerHTML=records.slice(0,shownCount).map(r=>{
    const photo=safeURL(r.photoUrl),original=safeURL(r.originalPhotoUrl),worksheet=safeURL(r.worksheetUrl);
    const link=(url,text)=>url?`<a class="btn btn-sm btn-outline-primary" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${text}<span class="visually-hidden">（另開視窗）</span></a>`:'';
    return `<div class="col"><article class="card h-100 result-card">${photo?`<img src="${escapeHTML(photo)}" class="card-img-top" loading="lazy" decoding="async" alt="${escapeHTML(r.className)}的聊書成果照片">`:'<div class="photo-placeholder">尚無可顯示的照片</div>'}<div class="card-body p-4"><div class="d-flex justify-content-between align-items-start gap-2 mb-3"><strong class="text-primary">${escapeHTML(r.className||'未填班級')}</strong><span class="badge bg-light text-dark">${escapeHTML(r.method||'未分類')}</span></div><h3>${escapeHTML(r.bookTitle||'未填書名')}</h3><p class="result-meta">${escapeHTML(dateKey(r.date)||'日期未填')}</p><details><summary>閱讀聊書紀錄</summary><p class="result-content mt-2">${escapeHTML(r.content)}</p></details><div class="result-actions">${link(original,'查看照片')}${link(worksheet,'下載學習單')}</div></div></article></div>`;
  }).join('');
  byId('galleryContainer').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{const p=document.createElement('div');p.className='photo-placeholder';p.textContent='照片暫時無法顯示，請點「查看照片」';img.replaceWith(p);},{once:true}));
}
function validateFile(file, photo=false){
  if(!file) {if(photo) throw new Error('請選擇一張成果照片。');return;}
  if(file.size>5*1024*1024)throw new Error(`${file.name} 超過 5MB，請縮小檔案後再選擇。`);
  const images=['image/jpeg','image/png','image/webp','image/gif'];
  if(!(images.includes(file.type)||(!photo&&file.type==='application/pdf')))throw new Error(photo?'成果照片請使用 JPG、PNG、WebP 或 GIF。':'學習單請使用 PDF、JPG、PNG、WebP 或 GIF。');
}
function fileToDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({data:reader.result,name:file.name});reader.onerror=()=>reject(new Error('讀取檔案失敗，請重新選擇。'));reader.onabort=()=>reject(new Error('檔案讀取已中止。'));reader.readAsDataURL(file);});}
function clearPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;byId('photoPreview').hidden=true;byId('photoPreview').querySelector('img').removeAttribute('src');}
document.addEventListener('DOMContentLoaded',()=>{
  byId('refreshGallery').onclick=loadGalleryData;
  ['gallerySearch','galleryMethod','gallerySort'].forEach(id=>byId(id).addEventListener(id==='gallerySearch'?'input':'change',()=>{shownCount=12;renderGallery();}));
  byId('loadMore').onclick=()=>{shownCount+=12;renderGallery();};
  byId('adminPassword').addEventListener('keydown',e=>{if(e.key==='Enter')performLogin();});
  byId('photoFile').addEventListener('change',()=>{clearPreview();const file=byId('photoFile').files[0];if(!file)return;try{validateFile(file,true);previewUrl=URL.createObjectURL(file);const el=byId('photoPreview');el.querySelector('img').src=previewUrl;el.querySelector('span').textContent=`${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;el.hidden=false;}catch(error){byId('photoFile').value='';showError(error.message);}});
  byId('worksheetFile').addEventListener('change',()=>{try{validateFile(byId('worksheetFile').files[0]);}catch(error){byId('worksheetFile').value='';showError(error.message);}});
  byId('uploadForm').addEventListener('reset',clearPreview);
  byId('uploadForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');if(button.disabled)return;
    try{
      const payload={};for(const id of ['className','date','method','bookTitle','content']){payload[id]=byId(id).value.trim();if(!payload[id])throw new Error('請完整填寫必填欄位，內容不能只有空白。');}
      const photo=byId('photoFile').files[0],worksheet=byId('worksheetFile').files[0];validateFile(photo,true);validateFile(worksheet);
      button.disabled=true;button.textContent='正在送出…';byId('loadingOverlay').style.display='flex';
      for(const [file,key]of [[photo,'photo'],[worksheet,'worksheet']])if(file){const result=await fileToDataURL(file);payload[key+'Data']=result.data;payload[key+'Name']=result.name;}
      const result=await apiCall('processForm',payload);if(result.status!=='success')throw new Error(result.message||'未取得上傳成功回應');
      form.reset();byId('loadingOverlay').style.display='none';
      await Swal.fire({icon:'success',title:'成果已送出',text:'感謝分享！一起到成果牆看看這段閱讀時光。',confirmButtonColor:'#24645b'});
      byId('pills-gallery-tab').click();loadGalleryData();
    }catch(error){showError(error.message||'上傳失敗，已保留填寫內容，請稍後再試。');}
    finally{button.disabled=false;button.textContent='確認送出成果';byId('loadingOverlay').style.display='none';}
  });
});
function renderAdminTable(data){
 const tbody=document.querySelector('#adminTable tbody');tbody.replaceChildren();
 if(!Array.isArray(data)||!data.length){tbody.innerHTML='<tr><td colspan="6" class="text-center py-4">目前沒有資料</td></tr>';return;}
 data.forEach(row=>{const tr=document.createElement('tr');[row.className,dateKey(row.date),row.method,row.bookTitle,row.content].forEach(value=>{const td=document.createElement('td');td.textContent=String(value??'');tr.append(td);});const td=document.createElement('td');for(const [label,handler]of [['編輯',()=>openEditModal(row.rowIndex,row.className,dateKey(row.date),row.method,row.bookTitle,row.content)],['刪除',()=>deleteItem(row.rowIndex)]]){const b=document.createElement('button');b.type='button';b.className='btn btn-sm btn-outline-secondary me-1';b.textContent=label;b.setAttribute('aria-label',`${label} ${row.className} 的 ${row.bookTitle}`);b.onclick=handler;td.append(b);}tr.append(td);tbody.append(tr);});
}
function csvCell(value){let text=String(value??'');if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function exportToCSV(){
 if(!adminDataCache.length)return showError('目前沒有資料可匯出。');
 const rows=[['班級','實施日期','實施方式','閱讀書目','聊書內容','照片連結','學習單連結'],...adminDataCache.map(r=>[r.className,dateKey(r.date),r.method,r.bookTitle,r.content,r.photoUrl,r.worksheetUrl])];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='聊書成果.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
