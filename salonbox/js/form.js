(function(){
  function formDataToObject(form){
    const obj = {};
    for(const [key,val] of new FormData(form).entries()){
      if(obj[key] === undefined){ obj[key] = val; }
      else if(Array.isArray(obj[key])){ obj[key].push(val); }
      else{ obj[key] = [obj[key], val]; }
    }
    return obj;
  }

  function inferLpFromReferrer(){
    if(!document.referrer) return '';
    let ref;
    try{ ref = new URL(document.referrer); }catch(_){ return ''; }
    const path = ref.pathname || '';
    if(/\/salonbox\/hair(\/|$)/.test(path)) return 'hair';
    if(/\/salonbox\/esthetic(\/|$)/.test(path)) return 'esthetic';
    if(/\/salonbox\/(index\.html)?$/.test(path) || /\/salonbox\/$/.test(path)) return 'salonbox';
    if(/\/salonbox\/contact(\/|$)/.test(path) || /\/salonbox\/apply(\/|$)/.test(path)) return '';
    return '';
  }

  function setLpField(form){
    if(!form) return;
    const field = form.querySelector('input[name="lp"]');
    if(!field) return;
    const params = new URLSearchParams(window.location.search);
    let lp = params.get('lp') || params.get('source') || params.get('utm_source') || '';
    if(!lp){ lp = inferLpFromReferrer(); }
    if(lp){ field.value = lp; }
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
      try{ parsed = JSON.parse(raw); }catch(_){ /* noop */ }
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

  function waitForRecaptcha(){
    if(typeof grecaptcha !== 'undefined' && grecaptcha.execute){ return Promise.resolve(); }
    return new Promise((resolve, reject)=>{
      const timeout = setTimeout(()=>{
        clearInterval(tick);
        reject(new Error('reCAPTCHAの読み込みに失敗しました。'));
      }, 5000);
      const tick = setInterval(()=>{
        if(typeof grecaptcha !== 'undefined' && grecaptcha.execute){
          clearInterval(tick);
          clearTimeout(timeout);
          resolve();
        }
      }, 50);
    });
  }

  async function getRecaptchaToken(action){
    const siteKey = (typeof RECAPTCHA_SITE_KEY !== 'undefined' && RECAPTCHA_SITE_KEY) ? RECAPTCHA_SITE_KEY : '';
    if(!siteKey){
      throw new Error('reCAPTCHAのサイトキーが設定されていません。');
    }
    await waitForRecaptcha();
    return new Promise((resolve, reject)=>{
      grecaptcha.ready(()=>{
        grecaptcha.execute(siteKey, { action }).then(resolve).catch(reject);
      });
    });
  }

  // お申込みフォームのステップ制御 + API送信
  const applyForm = document.getElementById('applyForm');
  if(applyForm){
    setLpField(applyForm);
    const stepper = document.getElementById('stepper');
    const panes = [...applyForm.querySelectorAll('.step-pane')];
    const steps = stepper ? [...stepper.querySelectorAll('.step')] : [];
    const payBtn = document.getElementById('payBtn');
    const finishMsg = document.getElementById('finishMsg');
    const applyError = document.getElementById('applyError');
    const processingMsg = document.getElementById('processingMsg');
    const cancelMsg = document.getElementById('cancelMsg');
    const applyEndpoint = applyForm.dataset.applyEndpoint || applyForm.dataset.endpoint || '';
    const checkoutEndpoint = applyForm.dataset.checkoutEndpoint || '';
    const statusEndpoint = applyForm.dataset.statusEndpoint || '';
    const SESSION_KEY = 'sb_application_id';
    let cur = 0;
    let applicationId = sessionStorage.getItem(SESSION_KEY) || '';
    let isCreating = false;
    let isCheckout = false;

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

    function toggle(el, flag){
      if(!el) return;
      el.style.display = flag ? 'block' : 'none';
    }

    function resetAlerts(){
      toggle(applyError, false);
      toggle(processingMsg, false);
      toggle(finishMsg, false);
      toggle(cancelMsg, false);
    }

    applyForm.addEventListener('click', (e)=>{
      const btn = e.target.closest('button, a'); if(!btn) return;
      if(btn.dataset.next!==undefined){ e.preventDefault(); next(); return; }
      if(btn.dataset.prev!==undefined){ e.preventDefault(); prev(); return; }
      if(btn.dataset.submitApply!==undefined){ e.preventDefault(); createApplication(btn); return; }
      if(btn.dataset.checkout!==undefined){ e.preventDefault(); startCheckout(btn); return; }
    });

  function buildReview(){
    const map = new Map();
    const fields = ['company','corpnum','industry','stores','name','email','tel','website','usecase','datasets','plan','cycle','billname','taxid','zip','pref','addr','users','start','adminEmail','adminName'];
    const labels = {
      company:'企業名 / 屋号', corpnum:'法人番号', industry:'メイン業種', stores:'店舗数', name:'ご担当者名', email:'メール', tel:'電話', website:'Webサイト',
      usecase:'利用目的・背景', datasets:'連絡可能な時間帯・連絡手段', plan:'プラン', cycle:'支払いサイクル', billname:'請求書名義', taxid:'適格請求書番号',
      zip:'郵便番号', pref:'都道府県', addr:'住所', users:'想定ユーザー数', start:'利用開始希望日', adminEmail:'管理者メール', adminName:'管理者氏名'
    };
    const tbody = document.querySelector('#reviewTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    for(const id of fields){
      let val = '';
      if(id === 'industry'){
        const checked = document.querySelectorAll('input[name="industry"]:checked');
        val = checked.length ? Array.from(checked).map(o=>o.value).join(', ') : '';
      }else{
        const el = document.getElementById(id);
        if(!el) continue;
        if(el.multiple && el.selectedOptions){
          val = Array.from(el.selectedOptions).map(o=>o.value||o.textContent.trim()).join(', ');
        }else{
          val = el.value;
        }
      }
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.textContent = labels[id]||id; tr.appendChild(th);
      const td = document.createElement('td'); td.textContent = val||'-'; tr.appendChild(td);
      tbody.appendChild(tr);
    }
    }

    async function createApplication(btn){
      if(isCreating) return;
      if(!applyForm.checkValidity()){
        const invalid = applyForm.querySelector(':invalid');
        if(invalid){ invalid.reportValidity(); invalid.focus(); }
        return;
      }
      resetAlerts();
      if(!applyEndpoint){
        if(applyError){
          applyError.textContent = '申込みエンドポイントが設定されていません。';
          applyError.style.display = 'block';
        }
        return;
      }
      setButtonLoading(btn, true);
      isCreating = true;
      try{
        const rawPayload = formDataToObject(applyForm);
        // 業種は複数選択でも常に文字列で送る（カンマ区切り）
        if (Array.isArray(rawPayload.industry)) {
          rawPayload.industry = rawPayload.industry.join(', ');
        }
        const token = await getRecaptchaToken('apply');
        // バックエンド(Pydantic)向けにキーをスネークケースへ正規化
        const payload = {
          ...rawPayload,
          admin_email: rawPayload.adminEmail,
          admin_name: rawPayload.adminName,
          captcha_token: token
        };
        delete payload.adminEmail;
        delete payload.adminName;
        const captchaField = document.getElementById('captcha_token');
        if(captchaField){ captchaField.value = token; }

        const res = await postJSON(applyEndpoint, payload);
        applicationId = (res && (res.applicationId || res.application_id || res.id)) || '';
        if(applicationId){ sessionStorage.setItem(SESSION_KEY, applicationId); }
        show(4);
        scrollToEl(stepper);
      }catch(err){
        if(applyError){
          applyError.textContent = err.message || '送信に失敗しました。時間をおいて再度お試しください。';
          applyError.style.display = 'block';
          scrollToEl(applyError);
        }
      }finally{
        isCreating = false;
        setButtonLoading(btn, false);
      }
    }

    async function startCheckout(btn){
      if(isCheckout) return;
      resetAlerts();
      if(!applicationId){
        if(applyError){
          applyError.textContent = '申込IDが取得できませんでした。Step4まで完了してください。';
          applyError.style.display = 'block';
          scrollToEl(applyError);
        }
        return;
      }
      if(!checkoutEndpoint){
        if(applyError){
          applyError.textContent = '決済エンドポイントが設定されていません。';
          applyError.style.display = 'block';
        }
        return;
      }
      setButtonLoading(btn, true);
      isCheckout = true;
      try{
        const res = await postJSON(checkoutEndpoint, { applicationId });
        const redirectUrl = res && (res.url || res.redirectUrl || res.redirect_url);
        if(!redirectUrl){ throw new Error('決済ページのURLを取得できませんでした。'); }
        window.location.href = redirectUrl;
      }catch(err){
        if(applyError){
          applyError.textContent = err.message || '決済の開始に失敗しました。時間をおいて再度お試しください。';
          applyError.style.display = 'block';
          scrollToEl(applyError);
        }
      }finally{
        isCheckout = false;
        setButtonLoading(btn, false);
      }
    }

    async function pollStatus(appId){
      if(!statusEndpoint || !appId) return;
      const maxAttempts = 5;
      const waitMs = 1500;
      for(let i=0;i<maxAttempts;i++){
        try{
          const url = new URL(statusEndpoint, window.location.origin);
          url.searchParams.set('application_id', appId);
          const res = await fetch(url.toString(), { method:'GET' });
          const raw = await res.text();
          let data = null;
          if(raw){ try{ data = JSON.parse(raw); }catch(_){ /* noop */ } }
          if(!res.ok){
            const message = (data && (data.message||data.error)) || raw || 'ステータス確認に失敗しました。';
            throw new Error(message);
          }
          const status = (data && (data.status || data.state || data.applicationStatus)) || '';
          if(status && status.toLowerCase() === 'active'){
            toggle(processingMsg, false);
            toggle(finishMsg, true);
            scrollToEl(finishMsg);
            return;
          }
        }catch(err){
          if(applyError){
            applyError.textContent = err.message || 'ステータス確認に失敗しました。';
            applyError.style.display = 'block';
            scrollToEl(applyError);
          }
          return;
        }
        await new Promise(r=>setTimeout(r, waitMs));
      }
    }

    function handleRedirectResult(){
      const params = new URLSearchParams(window.location.search);
      const queryAppId = params.get('applicationId') || params.get('application_id');
      if(queryAppId){
        applicationId = queryAppId;
        sessionStorage.setItem(SESSION_KEY, applicationId);
      }
      const redirectStatus = (params.get('result') || params.get('status') || params.get('redirect_status') || '').toLowerCase();
      const isSuccess = params.get('success') === '1' || redirectStatus === 'success' || redirectStatus === 'succeeded';
      const isCanceled = params.get('cancel') === '1' || params.get('canceled') === '1' || redirectStatus === 'cancel' || redirectStatus === 'canceled';

      if(isCanceled){
        show(4);
        resetAlerts();
        toggle(cancelMsg, true);
        scrollToEl(cancelMsg);
        return;
      }
      if(isSuccess){
        show(4);
        resetAlerts();
        if(statusEndpoint && applicationId){
          toggle(processingMsg, true);
          pollStatus(applicationId);
        }else{
          toggle(finishMsg, true);
        }
      }
    }

    const params = new URLSearchParams(window.location.search);
    setSelectValue(document.getElementById('plan'), params.get('plan'));
    setSelectValue(document.getElementById('cycle'), params.get('cycle'));

    show(0);
    handleRedirectResult();
  }

  // お問い合わせフォームのAPI送信
  const contactForm = document.getElementById('contactForm');
  if(contactForm){
    setLpField(contactForm);
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
        const token = await getRecaptchaToken('contact');
        payload.captcha_token = token;
        const captchaField = document.getElementById('captcha_token');
        if(captchaField){ captchaField.value = token; }
        await postJSON(contactForm.dataset.endpoint, payload);
        if(alertOk){
          alertOk.style.display = 'block';
          scrollToEl(alertOk);
        }
        contactForm.reset();
        if(topicPreset){ setSelectValue(topicSelect, topicPreset); }
      }catch(err){
        if(alertErr){
          alertErr.textContent = err.message || '送信に失敗しました。時間をおいて再度お試しください。';
          alertErr.style.display = 'block';
          scrollToEl(alertErr);
        }
      }finally{
        setButtonLoading(submitBtn, false);
      }
    });
  }
})();
