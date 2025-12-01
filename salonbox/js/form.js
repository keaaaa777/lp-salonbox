
(function(){
  function formDataToObject(form){
    return Object.fromEntries(new FormData(form).entries());
  }

  async function postJSON(endpoint, payload){
    if(!endpoint){
      console.warn('送信先エンドポイントが設定されていません');
      return { mock:true };
    }
    let response;
    try{
      response = await fetch(endpoint, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(payload)
      });
    }catch(err){
      throw new Error('ネットワークエラーが発生しました。通信環境をご確認ください。');
    }
    const raw = await response.text();
    let parsed = null;
    if(raw){
      try{ parsed = JSON.parse(raw); }catch(_){}
    }
    if(!response.ok){
      const message = (parsed && (parsed.message||parsed.error)) || raw || '送信に失敗しました。時間をおいて再度お試しください。';
      throw new Error(message);
    }
    return parsed ?? raw;
  }

  function setButtonLoading(btn, isLoading){
    if(!btn) return;
    const defaultLabel = btn.dataset.label || btn.textContent.trim();
    if(!btn.dataset.label){ btn.dataset.label = defaultLabel; }
    btn.disabled = !!isLoading;
    btn.textContent = isLoading ? '送信中...' : btn.dataset.label;
  }

  function setSelectValue(select, value){
    if(!select || !value) return;
    const normalized = value.toLowerCase();
    const found = Array.from(select.options).find(opt=>{
      const val = opt.value.toLowerCase();
      const text = opt.textContent.trim().toLowerCase();
      return val === normalized || text === normalized;
    });
    if(found){ select.value = found.value; }
  }

  function scrollToEl(el){
    if(!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior:'smooth' });
  }

  // お申込みフォーム（ステッパー + API送信）
  const applyForm = document.getElementById('applyForm');
  if(applyForm){
    const stepper = document.getElementById('stepper');
    const panes = [...applyForm.querySelectorAll('.step-pane')];
    const steps = stepper ? [...stepper.querySelectorAll('.step')] : [];
    const payBtn = document.getElementById('payBtn');
    const finishMsg = document.getElementById('finishMsg');
    const applyError = document.getElementById('applyError');
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

    async function submitApplication(){
      if(!applyForm.checkValidity()){
        const invalid = applyForm.querySelector(':invalid');
        if(invalid){ invalid.reportValidity(); invalid.focus(); }
        return;
      }
      setButtonLoading(payBtn, true);
      if(applyError){ applyError.style.display = 'none'; }
      try{
        const payload = formDataToObject(applyForm);
        await postJSON(applyForm.dataset.endpoint, payload);
        if(finishMsg){
          finishMsg.style.display = 'block';
          scrollToEl(finishMsg);
        }
      }catch(err){
        if(applyError){
          applyError.textContent = err.message || '送信に失敗しました。';
          applyError.style.display = 'block';
          scrollToEl(applyError);
        }
      }finally{
        setButtonLoading(payBtn, false);
      }
    }

    if(payBtn){
      payBtn.addEventListener('click', submitApplication);
    }

    // URLクエリからプラン/サイクルを事前選択
    const params = new URLSearchParams(window.location.search);
    setSelectValue(document.getElementById('plan'), params.get('plan'));
    setSelectValue(document.getElementById('cycle'), params.get('cycle'));

    show(0);
  }

  // お問い合わせフォーム（API送信）
  const contactForm = document.getElementById('contactForm');
  if(contactForm){
    const alertOk = document.getElementById('alertOk');
    const alertErr = document.getElementById('alertErr');
    const submitBtn = document.getElementById('contactSubmit');
    const topicSelect = document.getElementById('topic');
    const topicPreset = new URLSearchParams(window.location.search).get('topic');
    if(topicPreset){ setSelectValue(topicSelect, topicPreset); }

    contactForm.addEventListener('submit', async function(e){
      e.preventDefault();
      if(!contactForm.checkValidity()){
        const firstInvalid = contactForm.querySelector(':invalid');
        if(firstInvalid){ firstInvalid.reportValidity(); firstInvalid.focus(); }
        return;
      }
      setButtonLoading(submitBtn, true);
      if(alertErr){ alertErr.style.display = 'none'; }
      try{
        const payload = formDataToObject(contactForm);
        const token = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "contact" });
        payload.captcha_token = token;
        await postJSON(contactForm.dataset.endpoint, payload);
        if(alertOk){
          alertOk.style.display = 'block';
          scrollToEl(alertOk);
        }
        contactForm.reset();
        if(topicPreset){ setSelectValue(topicSelect, topicPreset); }
      }catch(err){
        if(alertErr){
          alertErr.textContent = err.message || '送信に失敗しました。';
          alertErr.style.display = 'block';
          scrollToEl(alertErr);
        }
      }finally{
        setButtonLoading(submitBtn, false);
      }
    });
  }
})();
