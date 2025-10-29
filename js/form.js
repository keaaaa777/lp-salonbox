
(function(){
  // お申込みフォーム（ステッパー）
  const applyForm = document.getElementById('applyForm');
  if(applyForm){
    const panes = [...applyForm.querySelectorAll('.step-pane')];
    const steps = [...document.getElementById('stepper').querySelectorAll('.step')];
    let cur = 0;
    function show(i){
      panes.forEach((p,idx)=>{ p.hidden = idx!==i; });
      steps.forEach((s,idx)=>{ s.classList.toggle('active', idx===i); });
      cur = i;
    }
    function next(){
      const invalid = panes[cur].querySelector(':invalid');
      if(invalid){ invalid.reportValidity(); invalid.focus(); return; }
      if(cur < panes.length-1){
        if(cur===2){ buildReview(); }
        show(cur+1);
      }
    }
    function prev(){ if(cur>0) show(cur-1); }
    applyForm.addEventListener('click', (e)=>{
      const btn = e.target.closest('button, a'); if(!btn) return;
      if(btn.dataset.next!==undefined){ e.preventDefault(); next(); }
      if(btn.dataset.prev!==undefined){ e.preventDefault(); prev(); }
    });
    function buildReview(){
      const map = new Map();
      const fields = ['company','corpnum','industry','stores','name','email','tel','website','usecase','datasets','plan','cycle','billname','taxid','zip','pref','addr','users','start','adminEmail','adminName'];
      fields.forEach(id=>{ const el = document.getElementById(id); if(el){ map.set(id, el.value); } });
      const labels = {
        company:'企業名/屋号', corpnum:'法人番号', industry:'業種', stores:'店舗数', name:'ご担当者名', email:'メール', tel:'電話', website:'Webサイト',
        usecase:'利用目的・背景', datasets:'利用予定データ', plan:'プラン', cycle:'支払いサイクル', billname:'請求先名義', taxid:'適格請求書番号',
        zip:'郵便番号', pref:'都道府県', addr:'住所', users:'想定ユーザー数', start:'利用開始希望日', adminEmail:'管理者メール', adminName:'管理者氏名'
      };
      const tbody = document.querySelector('#reviewTable tbody');
      if(!tbody) return;
      tbody.innerHTML = '';
      for(const [k,v] of map.entries()){
        const tr = document.createElement('tr');
        const th = document.createElement('th'); th.textContent = labels[k]||k; tr.appendChild(th);
        const td = document.createElement('td'); td.textContent = v||'-'; tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }
    const payBtn = document.getElementById('payBtn');
    if (payBtn) {
      payBtn.addEventListener('click', function(){
        const msg = document.getElementById('finishMsg');
        if(msg){ msg.style.display = 'block'; window.scrollTo({ top: msg.offsetTop - 80, behavior: 'smooth' }); }
      });
    }
    show(0);
  }

  // お問い合わせフォーム（簡易バリデーション）
  const contactForm = document.getElementById('contactForm');
  if(contactForm){
    const alertOk = document.getElementById('alertOk');
    contactForm.addEventListener('submit', function(e){
      e.preventDefault(); // demo
      if(!contactForm.checkValidity()){
        const firstInvalid = contactForm.querySelector(':invalid');
        if(firstInvalid){ firstInvalid.focus(); }
        contactForm.reportValidity();
        return;
      }
      if(alertOk){ alertOk.style.display = 'block'; }
    });
  }
})();
