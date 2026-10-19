package main

// 管理页：概览 / 云仓管理 / 设置 三个 tab（单文件嵌入，无外部依赖）

const adminPageHTML = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>云仓中转管理</title>
<style>
:root{color-scheme:light}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f3f4f6;color:#111827;margin:0;padding:24px}
.wrap{max-width:1100px;margin:0 auto}
h1{font-size:20px;margin:0 0 14px}
.tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid #e5e7eb}
.tabs button{border:0;background:none;padding:10px 16px;font-size:14px;color:#6b7280;cursor:pointer;border-bottom:2px solid transparent}
.tabs button.on{color:#059669;font-weight:600;border-bottom-color:#059669}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.card{background:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.card .k{font-size:12px;color:#9ca3af}.card .v{font-size:22px;font-weight:700;margin-top:2px;word-break:break-all}
.panel{background:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px rgba(0,0,0,.05);margin-bottom:20px}
.panel h2{font-size:15px;margin:0 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:#9ca3af;font-weight:500;font-size:12px;padding:6px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap}
td{padding:7px 8px;border-bottom:1px solid #f9fafb;white-space:nowrap}
.r{text-align:right}.mono{font-family:ui-monospace,monospace;font-size:12px;color:#6b7280}
.btn{border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:5px 11px;font-size:12px;cursor:pointer;color:#374151}
.btn:hover{background:#f9fafb}.btn.red{color:#dc2626;border-color:#fecaca}
.btn.pri{background:#059669;border-color:#059669;color:#fff}.btn.pri:hover{background:#047857}
.green{color:#059669;font-weight:600}.redtxt{color:#dc2626}.gray{color:#9ca3af}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
input[type=text],input[type=password],select{border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;font-size:13px;background:#fff}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);display:none;align-items:center;justify-content:center;z-index:9}
.overlay.on{display:flex}
.modal{background:#fff;border-radius:16px;padding:20px 22px;width:420px;max-width:92vw}
.modal h3{margin:0 0 14px;font-size:16px}
.modal label{display:block;font-size:13px;color:#374151;margin:10px 0 4px}
.modal input,.modal select{width:100%;box-sizing:border-box}
.modal .foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.err{font-size:11px;color:#dc2626}
.pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;font-size:12px;color:#6b7280;margin-top:10px}
a.exp{color:#059669;text-decoration:none;font-size:12px;margin-left:4px}
a.exp:hover{text-decoration:underline}
</style></head><body><div class="wrap">
<h1>云仓中转管理</h1>
<div class="tabs">
<button id="tabBtn0" class="on" onclick="showTab(0)">概览</button>
<button id="tabBtn1" onclick="showTab(1)">云仓管理</button>
<button id="tabBtn2" onclick="showTab(2)">消耗统计</button>
<button id="tabBtn3" onclick="showTab(3)">设置</button>
</div>

<div id="tab0">
<div class="row" style="justify-content:flex-end">
<button class="btn" onclick="loadStats()">刷新</button>
<button class="btn red" onclick="clearCache('all')">清空全部缓存</button></div>
<div class="cards" id="cards"></div>
<div class="panel"><h2>各类型缓存量</h2><table><thead><tr><th>类型</th><th class="r">缓存条数</th><th class="r">其中有效</th><th></th></tr></thead><tbody id="kinds"></tbody></table></div>
<div class="panel"><h2>最近代理任务</h2><table><thead><tr><th>编号</th><th>类型</th><th class="r">总数</th><th class="r">缓存命中</th><th>状态</th><th>时间</th></tr></thead><tbody id="recent"></tbody></table></div>
</div>

<div id="tab1" style="display:none">
<div class="panel">
<div class="row">
<input type="text" id="sKw" placeholder="名称">
<select id="sCountry"><option value="">全部国家</option></select>
<button class="btn" onclick="sPage=1;loadStores()">查询</button>
<button class="btn" onclick="document.getElementById('sKw').value='';document.getElementById('sCountry').value='';sPage=1;loadStores()">清空查询</button>
<span style="flex:1"></span>
<button class="btn pri" onclick="openStoreModal()">+ 添加云仓</button>
<button class="btn" onclick="loadStores()">刷新</button>
</div>
<table><thead><tr><th>ID</th><th>名称</th><th>说明</th><th>国家</th><th>检测类型</th>
<th class="r">待入仓</th><th class="r">有效</th><th class="r">无效</th><th>最后更新</th><th>操作</th></tr></thead>
<tbody id="stores"></tbody></table>
<div class="pager">
<span id="sTotal"></span>
<button class="btn" id="sPrev" onclick="sPage--;loadStores()">上一页</button>
<span id="sPageInfo"></span>
<button class="btn" id="sNext" onclick="sPage++;loadStores()">下一页</button>
</div>
<p class="gray" style="font-size:12px">上传号码后，后台工作器每 60 秒自动把「待入仓」号码先对缓存、再提交检测平台，完成后沉淀为有效/无效。需先在「设置」里保存上游 token。</p>
</div>
</div>

<div id="tab2" style="display:none">
<div class="row" style="justify-content:flex-end"><button class="btn" onclick="loadBilling()">刷新</button></div>
<div class="cards" id="bCards"></div>
<div class="panel"><h2>按商家（面板提交的检测）</h2>
<table><thead><tr><th>商家</th><th class="r">任务数</th><th class="r">提交号码</th><th class="r">缓存免检</th><th class="r">实际上游检测</th><th class="r">上游扣费</th></tr></thead>
<tbody id="bOwners"></tbody></table></div>
<div class="panel"><h2>按云仓（自动检测作业）</h2>
<table><thead><tr><th>云仓</th><th class="r">作业数</th><th class="r">检测条数</th><th class="r">上游扣费</th></tr></thead>
<tbody id="bStores"></tbody></table></div>
</div>

<div id="tab3" style="display:none">
<div class="panel" style="max-width:520px">
<h2>上游地址</h2>
<p class="gray" style="font-size:12px">检测平台的接口地址，保存后立即生效（代理转发、云仓自动检测都用它）。留空则使用默认：<span id="upDefault" class="mono">—</span>。当前生效：<span id="upNow" class="mono">—</span></p>
<div class="row">
<input type="text" id="upInput" placeholder="https://api.th333.cc" style="flex:1">
<button class="btn pri" onclick="saveUpstream()">保存</button>
</div>
<p id="upMsg" class="gray" style="font-size:12px"></p>
</div>
<div class="panel" style="max-width:520px">
<h2>上游 token</h2>
<p class="gray" style="font-size:12px">云仓自动检测使用这里保存的 token（面板发来的检测请求仍使用面板自己配置的 token）。当前：<span id="tokNow" class="mono">—</span></p>
<div class="row">
<input type="password" id="tokInput" placeholder="粘贴检测平台 token" style="flex:1">
<button class="btn pri" onclick="saveToken()">保存</button>
<button class="btn" onclick="testBalance()">查余额</button>
</div>
<p id="tokMsg" class="gray" style="font-size:12px"></p>
</div>
<div class="panel" style="max-width:520px">
<h2>USDT 收款地址（TRC20）</h2>
<p class="gray" style="font-size:12px">红浪漫充值中心的收款地址从这里读取（面板最多 60 秒同步一次）。T 开头 34 位；清空后面板充值中心将无法创建订单。</p>
<div class="row">
<input type="text" id="usdtInput" placeholder="T 开头的 TRC20 地址" style="flex:1">
<button class="btn pri" onclick="saveUsdt()">保存</button>
</div>
<p id="usdtMsg" class="gray" style="font-size:12px"></p>
</div>
</div>
</div>

<div class="overlay" id="storeOverlay">
<div class="modal">
<h3 id="mTitle">添加云仓</h3>
<input type="hidden" id="mId">
<label>名称</label><input type="text" id="mName">
<label>说明</label><input type="text" id="mRemark">
<label>检测类型</label><select id="mType"></select>
<label>国家</label><select id="mCountry"></select>
<div class="foot">
<button class="btn" onclick="closeStoreModal()">取消</button>
<button class="btn pri" onclick="saveStore()">保存</button>
</div>
</div>
</div>
<input type="file" id="upFile" accept=".txt,.csv" style="display:none">

<script>
var COUNTRIES=[['MY','马来西亚'],['SG','新加坡'],['ID','印度尼西亚'],['TH','泰国'],['VN','越南'],['PH','菲律宾'],['KH','柬埔寨'],['MM','缅甸'],['CN','中国大陆'],['HK','中国香港'],['TW','中国台湾'],['IN','印度'],['AE','阿联酋'],['US','美国'],['GB','英国'],['BR','巴西']];
var TYPE_GROUPS=[
['WhatsApp',[['wsValid','WS筛开通'],['wsSimpleValid','WS开通简筛'],['wsActive','WS筛活跃'],['wsGender','WS性别年龄']]],
['Telegram',[['tgValid','TG筛开通'],['tgActive','TG筛活跃'],['tgGender','TG性别年龄'],['tgNameValid','TG用户名筛活']]],
['社交媒体',[['fbValid','Facebook筛开通'],['fbGender','Facebook性别年龄'],['fbUid','Facebook UID检测'],['fbEmail','Facebook邮箱检测'],['insValid','Instagram筛开通'],['insEmail','Instagram邮箱检测'],['twitterValid','Twitter筛开通'],['twitterEmail','Twitter邮箱检测'],['snapchatValid','Snapchat筛开通'],['linkedinValid','领英筛开通'],['linkedinGender','领英性别年龄'],['tiktokUser','Tiktok用户名检测']]],
['通讯工具',[['lineValid','Line筛开通'],['lineGender','Line性别年龄'],['signalValid','Signal筛开通'],['viberValid','Viber筛开通'],['viberGender','Viber性别年龄'],['viberActive','Viber筛活跃'],['botimValid','Botim筛开通'],['botimGender','Botim性别年龄'],['zaloValid','Zalo筛开通'],['zaloGender','Zalo性别年龄'],['zaloGenderQuick','Zalo性别年龄极速'],['zaloActive','Zalo筛活跃'],['wxValid','微信筛开通'],['wxAll','微信全检测'],['rcsSystem','RCS系统检测']]],
['号码检测',[['phoneCheck','空号检测'],['phoneActive','号码活跃检测'],['operatorStandard','运营商检测'],['numberStatus','手机型号检测'],['phoneRoaming','开关机状态检测'],['phoneUsCarrier','美国运营商精准检测'],['phoneDnd','美国勿扰号码检测'],['iosBlueValid','iOS筛蓝号'],['iosValid','iOS筛开通'],['iosAll','iOS全检测']]],
['邮箱/其他',[['amazonEmail','亚马逊邮箱检测'],['amazonValid','亚马逊筛开通'],['teamsValid','Teams筛开通'],['sidelineValid','Sideline筛开通'],['dhlValid','DHL筛开通']]],
['交易所',[['binanceValid','币安筛开通'],['okxValid','OKX筛开通'],['htxValid','火币筛开通'],['kucoinValid','KuCoin筛开通'],['coinwValid','CoinW筛开通'],['mexcValid','MEXC筛开通']]]
];
var TYPE_LABEL={};TYPE_GROUPS.forEach(function(g){g[1].forEach(function(t){TYPE_LABEL[t[0]]=t[1]})});
var COUNTRY_NAME={};COUNTRIES.forEach(function(c){COUNTRY_NAME[c[0]]=c[1]});
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function showTab(i){for(var j=0;j<4;j++){document.getElementById('tab'+j).style.display=j===i?'':'none';document.getElementById('tabBtn'+j).className=j===i?'on':''}}
function fmt3(n){return Math.round((n||0)*1000)/1000}

// --- 概览 ---
function loadStats(){
  fetch('/admin/api/stats').then(function(r){return r.json()}).then(function(d){
    var cards=[['缓存号码数',d.cacheRows],['累计免检条数',d.savedTotal],['经手任务数',d.tasks],['上游',String(d.upstream||'').replace(/^https?:\/\//,'')]];
    document.getElementById('cards').innerHTML=cards.map(function(c){return '<div class="card"><div class="k">'+c[0]+'</div><div class="v">'+esc(c[1])+'</div></div>'}).join('');
    var ks=d.kinds||[];
    document.getElementById('kinds').innerHTML=ks.length?ks.map(function(k){return '<tr><td>'+esc(k.kind)+'</td><td class="r">'+k.rows+'</td><td class="r green">'+k.valid+'</td><td class="r"><button class="btn red" onclick="clearCache(\''+esc(k.kind)+'\')">清空</button></td></tr>'}).join(''):'<tr><td colspan="4" class="gray" style="text-align:center;padding:18px">暂无缓存</td></tr>';
    var rec=d.recent||[];
    document.getElementById('recent').innerHTML=rec.length?rec.map(function(t){return '<tr><td class="mono">'+esc(t.id)+'</td><td>'+esc(TYPE_LABEL[t.taskType]||t.taskType)+'</td><td class="r">'+t.total+'</td><td class="r green">'+t.cached+'</td><td>'+esc(t.state)+'</td><td class="mono">'+new Date(t.createdAt*1000).toLocaleString('zh-CN')+'</td></tr>'}).join(''):'<tr><td colspan="6" class="gray" style="text-align:center;padding:18px">暂无任务</td></tr>';
  });
}
function clearCache(kind){
  if(!confirm(kind==='all'?'清空全部缓存？之后所有号码都会重新提交上游检测':'清空类型 '+kind+' 的缓存？'))return;
  fetch('/admin/api/clear?kind='+encodeURIComponent(kind),{method:'POST'}).then(function(r){return r.json()}).then(function(d){alert('已删除 '+d.deleted+' 条');loadStats()});
}

// --- 云仓 ---
var sPage=1,sLimit=10;
function loadStores(){
  var kw=encodeURIComponent(document.getElementById('sKw').value.trim());
  var c=encodeURIComponent(document.getElementById('sCountry').value);
  fetch('/admin/api/stores?kw='+kw+'&country='+c+'&page='+sPage+'&limit='+sLimit).then(function(r){return r.json()}).then(function(d){
    var list=d.data||[];
    document.getElementById('stores').innerHTML=list.length?list.map(function(s){
      var errHtml=s.lastError?'<div class="err">'+esc(s.lastError)+'</div>':'';
      var checking=s.checking>0?' <span class="gray">(检测中'+s.checking+')</span>':'';
      return '<tr><td>'+s.id+'</td><td><b>'+esc(s.name)+'</b>'+errHtml+'</td><td>'+esc(s.remark)+'</td>'+
        '<td>'+esc(COUNTRY_NAME[s.country]||s.country||'—')+'</td><td>'+esc(TYPE_LABEL[s.taskType]||s.taskType)+'</td>'+
        '<td class="r">'+s.pending+checking+'</td>'+
        '<td class="r green">'+s.valid+(s.valid?'<a class="exp" href="/admin/api/stores/export?id='+s.id+'&type=valid">导出</a>':'')+'</td>'+
        '<td class="r redtxt">'+s.invalid+(s.invalid?'<a class="exp" href="/admin/api/stores/export?id='+s.id+'&type=invalid">导出</a>':'')+'</td>'+
        '<td class="mono">'+new Date(s.updatedAt*1000).toLocaleString('zh-CN')+'</td>'+
        '<td><button class="btn" onclick="uploadTo('+s.id+')">上传号码</button> '+
        '<button class="btn" onclick=\'openStoreModal('+JSON.stringify({id:s.id,name:s.name,remark:s.remark,country:s.country,taskType:s.taskType})+')\'>编辑</button> '+
        '<button class="btn red" onclick="delStore('+s.id+',\''+esc(s.name)+'\')">删除</button></td></tr>';
    }).join(''):'<tr><td colspan="10" class="gray" style="text-align:center;padding:22px">暂无云仓，点击「添加云仓」创建</td></tr>';
    var pages=Math.max(1,Math.ceil((d.total||0)/sLimit));
    if(sPage>pages)sPage=pages;
    document.getElementById('sTotal').textContent='共 '+(d.total||0)+' 条记录';
    document.getElementById('sPageInfo').textContent=sPage+' / '+pages;
    document.getElementById('sPrev').disabled=sPage<=1;
    document.getElementById('sNext').disabled=sPage>=pages;
  });
}
function fillSelects(){
  var cSel=document.getElementById('sCountry');
  COUNTRIES.forEach(function(c){var o=document.createElement('option');o.value=c[0];o.textContent=c[1];cSel.appendChild(o)});
  var mC=document.getElementById('mCountry');
  mC.innerHTML='<option value="">不指定（仅邮箱类）</option>'+COUNTRIES.map(function(c){return '<option value="'+c[0]+'">'+c[1]+'</option>'}).join('');
  var mT=document.getElementById('mType');
  mT.innerHTML=TYPE_GROUPS.map(function(g){return '<optgroup label="'+g[0]+'">'+g[1].map(function(t){return '<option value="'+t[0]+'">'+t[1]+'</option>'}).join('')+'</optgroup>'}).join('');
}
function openStoreModal(s){
  document.getElementById('mTitle').textContent=s?'编辑云仓':'添加云仓';
  document.getElementById('mId').value=s?s.id:'';
  document.getElementById('mName').value=s?s.name:'';
  document.getElementById('mRemark').value=s?s.remark:'';
  document.getElementById('mCountry').value=s?s.country:'MY';
  document.getElementById('mType').value=s?s.taskType:'wsValid';
  document.getElementById('mType').disabled=!!s;
  document.getElementById('storeOverlay').className='overlay on';
}
function closeStoreModal(){document.getElementById('storeOverlay').className='overlay'}
function saveStore(){
  var body={id:Number(document.getElementById('mId').value||0),name:document.getElementById('mName').value,
    remark:document.getElementById('mRemark').value,country:document.getElementById('mCountry').value,
    taskType:document.getElementById('mType').value};
  fetch('/admin/api/stores/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(function(r){return r.json()}).then(function(d){
      if(d.code!==0){alert(d.message||'保存失败');return}
      closeStoreModal();loadStores();
    });
}
function delStore(id,name){
  if(!confirm('删除云仓「'+name+'」？仓内所有号码数据将一并删除'))return;
  fetch('/admin/api/stores/del?id='+id,{method:'POST'}).then(function(r){return r.json()}).then(function(d){
    if(d.code!==0){alert(d.message||'删除失败');return}
    loadStores();
  });
}
var upStoreId=0;
function uploadTo(id){upStoreId=id;document.getElementById('upFile').click()}
document.getElementById('upFile').addEventListener('change',function(){
  var f=this.files[0];this.value='';
  if(!f||!upStoreId)return;
  var fd=new FormData();fd.append('file',f);
  fetch('/admin/api/stores/upload?id='+upStoreId,{method:'POST',body:fd})
    .then(function(r){return r.json()}).then(function(d){
      if(d.code!==0){alert(d.message||'上传失败');return}
      alert('识别 '+d.parsed+' 条，新增 '+d.added+' 条（其中缓存直出 '+d.fromCache+' 条），其余待后台自动检测');
      loadStores();
    });
});

// --- 消耗统计 ---
function loadBilling(){
  fetch('/admin/api/billing').then(function(r){return r.json()}).then(function(d){
    var cards=[['上游扣费合计',fmt3(d.totalDeduction)+' 积分'],['缓存免检条数',d.totalCached],['实际上游检测',d.totalForwarded],['估算节省',fmt3(d.estimatedSaved)+' 积分']];
    document.getElementById('bCards').innerHTML=cards.map(function(c){return '<div class="card"><div class="k">'+c[0]+'</div><div class="v">'+esc(c[1])+'</div></div>'}).join('');
    var os=d.owners||[];
    document.getElementById('bOwners').innerHTML=os.length?os.map(function(o){
      var name=o.ownerName||o.ownerId||'未标记';
      return '<tr><td><b>'+esc(name)+'</b>'+(o.ownerId&&o.ownerName?'<div class="mono">'+esc(o.ownerId)+'</div>':'')+'</td>'+
        '<td class="r">'+o.tasks+'</td><td class="r">'+o.total+'</td><td class="r green">'+o.cached+'</td>'+
        '<td class="r">'+o.forwarded+'</td><td class="r"><b>'+fmt3(o.deduction)+'</b></td></tr>'}).join('')
      :'<tr><td colspan="6" class="gray" style="text-align:center;padding:18px">暂无记录（商家在面板提交检测后这里会出现）</td></tr>';
    var ss=d.stores||[];
    document.getElementById('bStores').innerHTML=ss.length?ss.map(function(s){
      return '<tr><td><b>'+esc(s.name)+'</b></td><td class="r">'+s.jobs+'</td><td class="r">'+s.count+'</td><td class="r"><b>'+fmt3(s.deduction)+'</b></td></tr>'}).join('')
      :'<tr><td colspan="4" class="gray" style="text-align:center;padding:18px">暂无作业</td></tr>';
  });
}

// --- 设置 ---
function loadSettings(){
  fetch('/admin/api/settings').then(function(r){return r.json()}).then(function(d){
    document.getElementById('tokNow').textContent=d.hasToken?d.token:'未设置';
    document.getElementById('upNow').textContent=d.upstreamEffective||'—';
    document.getElementById('upDefault').textContent=d.upstreamDefault||'—';
    document.getElementById('upInput').value=d.upstream||'';
    document.getElementById('usdtInput').value=d.usdtAddress||'';
  });
}
function saveUsdt(){
  var v=document.getElementById('usdtInput').value.trim();
  if(v&&!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v)){document.getElementById('usdtMsg').textContent='地址格式不对：应为 T 开头的 34 位 TRC20 地址';return}
  if(!v&&!confirm('清空收款地址？面板充值中心将无法创建新订单'))return;
  fetch('/admin/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usdtAddress:v})})
    .then(function(r){return r.json()}).then(function(d){
      document.getElementById('usdtMsg').textContent=d.code===0?(v?'已保存，面板最多 60 秒后生效':'已清空'):(d.message||'保存失败');
      loadSettings();
    });
}
function saveUpstream(){
  var v=document.getElementById('upInput').value.trim();
  fetch('/admin/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({upstream:v})})
    .then(function(r){return r.json()}).then(function(d){
      document.getElementById('upMsg').textContent=d.code===0?(v?'已保存，立即生效':'已清空，回退默认地址'):(d.message||'保存失败');
      loadSettings();loadStats();
    });
}
function saveToken(){
  var v=document.getElementById('tokInput').value.trim();
  if(!v){alert('请输入 token');return}
  fetch('/admin/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:v})})
    .then(function(r){return r.json()}).then(function(d){
      document.getElementById('tokMsg').textContent=d.code===0?'已保存':(d.message||'保存失败');
      document.getElementById('tokInput').value='';loadSettings();
    });
}
function testBalance(){
  document.getElementById('tokMsg').textContent='查询中…';
  fetch('/admin/api/balance').then(function(r){return r.json()}).then(function(d){
    document.getElementById('tokMsg').textContent=d.code===0?('连接成功，积分余额：'+(d.data&&d.data.balance!=null?d.data.balance:'未知')):('失败：'+(d.message||''));
  });
}

fillSelects();loadStats();loadStores();loadSettings();loadBilling();
</script></body></html>`
