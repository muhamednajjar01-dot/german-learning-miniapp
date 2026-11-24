/* The same study dashboard runs inside Telegram and in a paired web browser. */
(function () {
  'use strict';
  const API = 'https://script.google.com/macros/s/AKfycbwh_YGP5Rvrx9Of0HA8Rmn6g3c7pvPPU7xn3s2AmnwNOPTpOKyFmi2_IC4t7xgo1MIg/exec?api=1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tg = window.Telegram && window.Telegram.WebApp;
  const hash = new URLSearchParams(location.hash.slice(1));
  let access = hash.get('access') || localStorage.getItem('gls.browser-session') || '';
  if (hash.get('access')) {
    localStorage.setItem('gls.browser-session', access);
    history.replaceState(null, '', location.pathname + location.search);
  }
  const params = new URLSearchParams(location.search);
  const start = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param || '';
  const initialDoc = params.get('lesson') || (/^L\d{2}-(T\d{2}|R)$/.test(start) ? start : '');
  const S = {cat:null, boot:null, summary:null, view:initialDoc?'lesson':params.get('view')||'home',
    doc:initialDoc, unit:null, tab:params.get('tab')==='quiz'||hash.get('view')==='quiz'?'quiz':'read', quiz:null, results:null, answers:{}, marks:{}, busy:false};
  if (hash.get('view') && hash.get('view')!=='quiz') S.view=hash.get('view');
  const doc = id => S.cat.lessons.find(d => d.doc_id === id);
  const unit = n => S.cat.units.find(u => u.id === Number(n));
  const progress = id => S.boot && S.boot.curriculum.find(d => d.doc_id === id) || {};
  const label = p => p.completed?'مكتمل':p.opened?'بدأت':'لم يبدأ';
  const chip = p => '<span class="pill '+(p.completed?'done':p.opened?'started':'')+'">'+label(p)+'</span>';
  const button = (text, action, cls) => '<button class="btn '+(cls||'')+'" data-action="'+esc(action)+'">'+esc(text)+'</button>';
  const link = (text, url, cls) => '<a class="btn '+(cls||'')+'" href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(text)+'</a>';
  let toastTimer;
  function toast(text) { $('toast').textContent=text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500); }
  async function call(action, body) {
    const abort = new AbortController(), timer = setTimeout(()=>abort.abort(),45000);
    try {
      const response = await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({initData:tg && tg.initData || '',accessToken:access,action:action,body:body||{}}),signal:abort.signal});
      const result=await response.json();
      if (!result.ok) throw new Error(result.error==='unauthorized'?'افتح التطبيق من البوت أو استخدم /login لربط المتصفح.':result.error==='busy'?'الخادم مشغول لحظيًا. حاول مرة ثانية.':'تعذّر تنفيذ الطلب. حاول مرة ثانية.');
      return result;
    } finally { clearTimeout(timer); }
  }
  function authenticated() { if (S.boot) return true; toast('افتح البوت واضغط ابدأ الدراسة، أو استخدم /login لربط المتصفح.'); return false; }
  async function refresh() {
    // One request carries the study summary now. The fallback keeps an older
    // deployed backend usable during a rollout window.
    const boot=await call('bootstrap',{summary:true});
    S.boot=boot; S.summary=boot.summary||await call('study.summary');
    $('notice').textContent='';
    $('who').innerHTML='<bdi>'+esc(S.boot.student.name_ar)+'</bdi> · <bdi dir="rtl">'+S.boot.done_count+' من 37</bdi>';
    $('dueCount').textContent=S.summary.due.length||'';
  }
  function go(view, id, tab) {
    S.view=view;
    if(view==='unit')S.unit=Number(id);
    if(view==='lesson') { if(S.doc!==id){S.quiz=null;S.results=null;} S.doc=id; S.unit=doc(id)&&doc(id).lektion; S.tab=tab||'read'; }
    const url=new URL(location.href); url.searchParams.set('view',view);
    if(view==='lesson')url.searchParams.set('lesson',id); else url.searchParams.delete('lesson');
    history.replaceState(null,'',url);
    render(); window.scrollTo({top:0,behavior:'instant'});
    if(view==='lesson'&&S.tab==='quiz')loadQuiz();
    if(view==='lesson'&&S.tab==='read'&&S.boot&&!progress(id).opened) markOpened(id);
  }
  function breadcrumbs() {
    let html='<button data-view="home">A1.1</button><span>›</span><button data-view="atlas">Menschen</button>';
    if(S.view==='unit'||S.view==='lesson') { const u=unit(S.unit||doc(S.doc).lektion); html+='<span>›</span><button data-unit="'+u.id+'">Lektion '+u.id+'</button>'; }
    if(S.view==='lesson') html+='<span>›</span><span dir="ltr">'+esc(S.doc)+'</span>';
    $('breadcrumb').innerHTML=html;
  }
  function unitCards() {
    return S.cat.units.map(u=>{
      const docs=S.cat.lessons.filter(d=>d.lektion===u.id), done=docs.filter(d=>progress(d.doc_id).completed).length;
      return '<button class="unit" style="--accent:'+u.accent+'" data-unit="'+u.id+'"><div class="num"><span>LEKTION '+('0'+u.id).slice(-2)+'</span><span>MODUL '+u.modul+'</span></div><h3 class="de">'+esc(u.title_de)+'</h3><p class="de">'+esc(u.topic_de)+'</p><div class="progress"><i style="width:'+Math.round(done/docs.length*100)+'%"></i></div><div class="fraction">'+(S.boot?done+' من '+docs.length+' جلسات':'عرض الدروس والمواد')+'</div></button>';
    }).join('');
  }
  function wheel() {
    let svg='<svg viewBox="-240 -240 480 480" aria-label="فهرس وحدات الكتاب الملون">';
    S.cat.units.forEach((u,i)=>{
      const a=(i*30-90)*Math.PI/180,b=((i+1)*30-90)*Math.PI/180;
      const xy=(r,t)=>[r*Math.cos(t),r*Math.sin(t)].join(' ');
      const path='M '+xy(220,a)+' A 220 220 0 0 1 '+xy(220,b)+' L '+xy(145,b)+' A 145 145 0 0 0 '+xy(145,a)+' Z';
      const mid=(a+b)/2;
      svg+='<g role="button" tabindex="0" aria-label="Lektion '+u.id+' '+esc(u.title_de)+'" data-unit="'+u.id+'"><path d="'+path+'" fill="'+u.accent+'"></path><text x="'+182*Math.cos(mid)+'" y="'+(182*Math.sin(mid)+7)+'" text-anchor="middle" font-size="21" font-weight="700">'+u.id+'</text></g>';
    });
    return svg+'<text class="centerTitle" x="0" y="-18" text-anchor="middle">A1.1</text><text class="centerSmall" x="0" y="13" text-anchor="middle">12 وحدة · Menschen</text><text class="centerSmall" x="0" y="38" text-anchor="middle">اضغط على لون الوحدة</text></svg>';
  }
  function atlas() { return '<div class="section-title"><h2>خريطة كتابك</h2><span class="muted">12 وحدة · 4 Modules</span></div><div class="atlas"><div class="wheel">'+wheel()+'</div><div class="grid">'+unitCards()+'</div></div>'; }
  function home() {
    const next=S.boot&&doc(S.boot.next_doc_id),done=S.boot?S.boot.done_count:0;
    let html='<div class="panel hero" style="--accent:'+(next?next.accent:'#b02739')+'"><div><div class="eyebrow">مساحتك للدراسة · A1.1</div><h1>'+(S.boot?'نكمّل من آخر خطوة؟':'أهلًا بك في مساحة الألمانية')+'</h1>';
    if(next)html+='<h2 class="de">'+esc(next.title_de)+'</h2><p class="muted">'+esc(next.title_ar)+' · Lektion '+next.lektion+'</p>';
    else html+='<p class="muted">'+(S.boot?'أكملت الجلسات كلها. وقت المراجعة والتثبيت.':'الكتاب، الدروس، الفيديوهات والاختبارات في مكان واحد.')+'</p>';
    html+='<div class="progress"><i style="width:'+Math.round(done/37*100)+'%"></i></div><div class="fraction">'+(S.boot?done+' من 37 جلسة مكتملة':'اربط حسابك لحفظ تقدمك')+'</div></div><div class="row">'+(next?button('استكمل دراستي ←','lesson:'+next.doc_id,'primary'):button('تصفّح الوحدات','view:atlas','primary'))+'</div></div>';
    html+='<div class="row">'+button('📚 الكتاب والتدريبات','view:book','ghost')+button('🔁 مراجعاتي','view:reviews','ghost')+button('📊 تقدمي ونتائجي','view:progress','ghost')+'</div>';
    return html+atlas();
  }
  function unitPage() {
    const u=unit(S.unit);
    if(!u)return '<div class="empty">الوحدة غير موجودة.</div>';
    return '<div class="panel study-head" style="--accent:'+u.accent+'"><div class="eyebrow">Menschen A1.1 · Modul '+u.modul+' · صفحة '+u.book_page+'</div><h1 class="de">Lektion '+u.id+' · '+esc(u.title_de)+'</h1><p class="muted de">'+esc(u.topic_de)+'</p><p class="muted">اختر جلسة تعليمية أو مراجعة الوحدة.</p></div><div class="lesson-list">'+S.cat.lessons.filter(d=>d.lektion===u.id).map(d=>'<button class="lesson-card" data-doc="'+d.doc_id+'" style="--accent:'+d.accent+'"><span class="swatch"></span><span class="body"><span class="de">'+esc(d.title_de)+'</span><small>'+esc(d.title_ar)+'</small><small dir="ltr">'+d.doc_id+' · '+(d.kind==='review'?'Wiederholung':d.video_ids.length+' video')+'</small></span>'+chip(progress(d.doc_id))+'</button>').join('')+'</div>';
  }
  function books() {
    return '<div class="panel"><div class="eyebrow">مراجع المستوى</div><h1>الكتاب Menschen A1.1</h1><p class="muted">كتاب الطالب والتدريبات. كل الأجزاء مرتبة وتشمل صفحات الملف كاملًا.</p></div>'+['kursbuch','arbeitsbuch'].map(kind=>'<div class="section-title"><h2>'+(kind==='kursbuch'?'Kursbuch · كتاب الطالب':'Arbeitsbuch · كتاب التدريبات')+'</h2></div><div class="book-parts">'+S.cat.books.filter(b=>b.kind===kind).map(b=>'<a class="resource" href="'+esc(b.url)+'" target="_blank" rel="noopener"><span><strong>صفحات PDF '+b.pages_from+'–'+b.pages_to+'</strong><small> من '+b.total_pages+' صفحة</small></span><span>تنزيل PDF ↗</span></a>').join('')+'</div>').join('')+'<div class="tip">روابط الملفات تفتح رسالتها في مكتبة تيليجرام الخاصة. '+link('ادخل مكتبة الملفات','https://t.me/+rMayz9Xgmq8wMmE0','small')+'</div>';
  }
  function lessonPage() {
    const d=doc(S.doc); if(!d)return '<div class="empty">الدرس غير موجود.</div>';
    const p=progress(d.doc_id);
    let html='<div class="panel study-head" style="--accent:'+d.accent+'"><div class="row spread"><span class="eyebrow">Lektion '+d.lektion+' · '+d.doc_id+' · '+(d.kind==='review'?'مراجعة الوحدة':'جلسة تعليمية')+'</span>'+chip(p)+'</div><h1 class="de">'+esc(d.title_de)+'</h1><p class="muted">'+esc(d.title_ar)+'</p><div class="row" style="margin-top:18px">'+button(p.completed?'✅ الدرس مكتمل':'✅ أكملت دراسة الدرس','complete',p.completed?'ghost':'primary')+button('↗ افتح الشرح في صفحة كاملة','reader-full','ghost')+'</div></div>';
    html+='<div class="lesson-tabs">'+[['read','📖 الشرح'],['videos','▶ الفيديو'],['files','📄 PDF وWord'],['quiz','✍ الاختبار']].map(t=>'<button class="btn '+(S.tab===t[0]?'active':'')+'" data-tab="'+t[0]+'">'+t[1]+'</button>').join('')+'</div><div id="lessonBody">';
    if(S.tab==='read')html+='<div class="reader"><div class="reader-note"><span>الشرح الكامل · '+d.doc_id+'</span><span>للمذاكرة والمقارنة — الاختبار في تبويب مستقل</span></div><iframe title="شرح '+d.doc_id+'" src="'+d.reader+'" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" loading="eager"></iframe></div>';
    if(S.tab==='videos')html+=d.video_ids.length?d.video_ids.map((id,i)=>'<div class="panel video"><h3>فيديو '+(i+1)+' من '+d.video_ids.length+'</h3><iframe title="فيديو '+d.doc_id+' '+(i+1)+'" src="https://www.youtube-nocookie.com/embed/'+id+'" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><div class="row">'+link('شاهد على YouTube','https://www.youtube.com/watch?v='+id,'primary')+'</div></div>').join(''):'<div class="empty">دي مراجعة للوحدة. فيديوهات الشرح موجودة داخل جلساتها التعليمية.</div>';
    if(S.tab==='files')html+='<div class="resource-grid">'+d.files.map(f=>'<a class="resource" href="'+esc(f.url)+'" target="_blank" rel="noopener"><strong dir="ltr">'+esc(f.label)+'</strong><span>تنزيل من تيليجرام ↗</span></a>').join('')+'</div><p class="tip">A وC تصميمان لنفس محتوى الدرس. تقدر كمان تستلم الملف مباشرة من قائمة الدرس في البوت.</p>';
    if(S.tab==='quiz')html+='<div id="quizMount">'+quizHTML()+'</div>';
    return html+'</div>';
  }
  function quizHTML() {
    if(!S.boot)return '<div class="empty">اربط حسابك من البوت أولًا لحفظ نتيجة الاختبار. '+link('افتح البوت','https://t.me/Deutsch099_bot','primary')+'</div>';
    const q=S.quiz;if(!q||q.doc_id!==S.doc)return '<div class="loading">جارٍ تحميل الاختبار…</div>';
    let html='<div class="tip">'+q.grading.strict+' سؤالًا بتصحيح آلي · '+q.grading.self_assess+' بتقييم ذاتي بعد التسليم. الاختبار لا يسجّل إكمال الدرس تلقائيًا.</div>';
    q.questions.forEach((item,i)=>{
      html+='<div class="q"><div class="row spread"><span class="muted">سؤال '+(i+1)+'</span><span class="pill">'+(item.mode==='strict'?'تصحيح آلي':'تقييم ذاتي')+'</span></div><h3>'+esc(item.q)+'</h3>';
      if(!S.results)html+='<input type="text" data-qid="'+esc(item.qid)+'" value="'+esc(S.answers[item.qid]||'')+'" placeholder="اكتب إجابتك بالألمانية" autocomplete="off" aria-label="إجابة السؤال '+(i+1)+'">';
      else { const result=S.results.results.find(r=>r.qid===item.qid);
        html+='<div class="reference"><p>إجابتك</p><div class="de">'+esc(S.answers[item.qid]||'—')+'</div>';
        if(item.mode==='strict')html+='<strong class="'+(result.auto?'right':'wrong')+'">'+(result.auto?'✓ إجابة صحيحة':'✕ الإجابة غير مطابقة')+'</strong>';
        if(result.expected)html+='<p>الإجابة المرجعية</p><div class="de">'+esc(result.expected)+'</div>';
        html+='</div>';
        if(item.mode==='self')html+='<label><input type="checkbox" data-mark="'+esc(item.qid)+'" '+(S.marks[item.qid]?'checked':'')+(S.results.assessed?' disabled':'')+'>قارنت إجابتي بالمرجع وهي صحيحة</label>';
      }
      html+='</div>';
    });
    if(!S.results)html+=button('سلّم الاختبار واحفظ المحاولة','submit','primary');
    else if(!S.results.assessed)html+='<div class="tip">تم حفظ المحاولة. قارن الإجابات الحرة ثم احفظ تقييمك.</div>'+button('احفظ التقييم الذاتي والنتيجة','assess','primary');
    else html+='<div class="panel"><h2>تم حفظ نتيجتك ✓</h2><p>'+S.results.score_auto+' آلي + '+S.results.score_self+' ذاتي من '+S.results.total+'</p><div class="row">'+button('راجع تقدمي','view:progress','primary')+button('محاولة جديدة','retry-quiz','ghost')+'</div></div>';
    return html;
  }
  function reviews() {
    if(!S.summary)return '<div class="empty">اربط حسابك لعرض مراجعاتك الشخصية.</div>';
    const list=(items,due)=>items.length?items.map(r=>'<div class="resource"><span><strong>'+esc(doc(r.doc_id).title_ar)+'</strong><small style="display:block">D+'+r.offset+' · '+new Date(r.due_at).toLocaleDateString('ar-EG')+'</small></span><span class="row">'+button('افتح الدرس','lesson:'+r.doc_id,'small')+(due?button('راجعت ✓','review:'+r.review_id,'small primary'):'')+'</span></div>').join(''):'<div class="empty">'+(due?'مفيش مراجعات متأخرة. ممتاز.':'هتظهر مواعيد المراجعة بعد أول اختبار أو إكمال درس.')+'</div>';
    return '<h1>مراجعاتي</h1><p class="muted">تثبيت الدروس بعد يوم و3 أيام و7 أيام. كل مراجعة مرتبطة بمحاولتك أنت.</p><div class="section-title"><h2>مستحقة الآن</h2></div>'+list(S.summary.due,true)+'<div class="section-title"><h2>قادمة</h2></div>'+list(S.summary.upcoming,false);
  }
  function progressPage() {
    if(!S.boot)return '<div class="empty">افتح من البوت أو استخدم /login لعرض تقدمك.</div>';
    const sum=S.summary||{attempts:[],mistakes:[],due:[]},done=S.boot.done_count;
    let html='<div class="row spread"><div><h1>تقدمي</h1><p class="muted">'+esc(S.boot.student.name_ar)+' · نفس السجل على الموبايل واللابتوب</p></div>'+button('حدّث التقدم ↻','refresh','ghost')+'</div><div class="stats"><div class="stat"><b>'+done+' / 37</b><small>جلسات مكتملة</small></div><div class="stat"><b>'+sum.attempts.length+'</b><small>محاولات اختبارات</small></div><div class="stat"><b>'+sum.due.length+'</b><small>مراجعات مستحقة</small></div></div>';
    html+='<div class="section-title"><h2>أحدث نتائج الاختبارات</h2></div>'+(sum.attempts.length?sum.attempts.slice().reverse().map(a=>'<div class="resource"><span><strong dir="ltr">'+a.doc_id+'</strong><small style="display:block">'+a.auto+' آلي + '+a.self+' ذاتي من '+a.total+(a.assessed?' · تقييم محفوظ':' · التقييم الذاتي لم يُحفظ')+'</small></span>'+button('افتح الدرس','lesson:'+a.doc_id,'small')+'</div>').join(''):'<div class="empty">لسه مفيش اختبار متسجل. افتح أي درس وابدأ اختباره.</div>');
    html+='<div class="section-title"><h2>أخطاء أراجعها</h2></div>'+(sum.mistakes.length?sum.mistakes.map(m=>'<div class="q"><h3>'+esc(m.prompt)+'</h3><p class="de error">'+esc(m.given||'—')+'</p><p class="de right">'+esc(m.expected)+'</p>'+button('راجع '+m.doc_id,'lesson:'+m.doc_id,'small')+'</div>').join(''):'<div class="empty">لا توجد أخطاء آلية في أحدث محاولاتك.</div>');
    html+='<div class="section-title"><h2>تقدمي في وحدات الكتاب</h2></div><div class="grid">'+unitCards()+'</div><div class="tip">فتح الدرس أو تنزيل ملفه لا يسجّل إكماله. اضغط «أكملت دراسة الدرس» بعد الانتهاء.</div>';
    html+='<div class="row">'+link('ربط متصفح آخر — أرسل /login للبوت','https://t.me/Deutsch099_bot','small')+(S.boot.student.id==='mohamed'?link('تفعيل حساب أشرف — أرسل /invite للبوت','https://t.me/Deutsch099_bot','small'):'')+button('خروج من المتصفح','logout','small ghost')+'</div>';
    return html;
  }
  function render() {
    if(!S.cat)return;
    document.querySelectorAll('.tabs [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===S.view||(S.view==='unit'||S.view==='lesson')&&b.dataset.view==='atlas'));
    breadcrumbs();
    $('screen').innerHTML=({home:home,atlas:atlas,unit:unitPage,book:books,lesson:lessonPage,reviews:reviews,progress:progressPage}[S.view]||home)();
    bind();
  }
  async function markOpened(id) {
    try {await call('lesson.open',{doc_id:id});const p=progress(id);p.opened=true;} catch(e){toast(e.message);}
  }
  async function loadQuiz() {
    if(!authenticated())return;
    if(S.quiz&&S.quiz.doc_id===S.doc){render();return;}
    const id=S.doc;
    try {const q=await call('quiz.get',{doc_id:id});if(S.doc!==id||S.tab!=='quiz')return;S.quiz=q;S.results=null;S.answers=JSON.parse(sessionStorage.getItem('draft:'+S.boot.student.id+':'+id)||'{}');S.marks={};render();}
    catch(e){if(S.doc!==id||S.tab!=='quiz'||!$('quizMount'))return;$('quizMount').innerHTML='<div class="empty">'+esc(e.message)+' '+button('حاول مرة أخرى','load-quiz')+'</div>';bind();}
  }
  async function action(name, buttonElement) {
    if(name.startsWith('view:'))return go(name.slice(5));
    if(name.startsWith('lesson:'))return go('lesson',name.slice(7));
    if(name==='reader-full') {window.open(doc(S.doc).reader,'_blank','noopener');return;}
    if(name==='logout'){localStorage.removeItem('gls.browser-session');access='';location.href=location.pathname;return;}
    if(!authenticated()||S.busy)return;
    if(name==='retry-quiz'){S.quiz=null;S.results=null;return loadQuiz();}
    if(name==='load-quiz')return loadQuiz();
    S.busy=true;if(buttonElement)buttonElement.disabled=true;
    try {
      if(name==='complete') {if(progress(S.doc).completed){toast('الدرس مكتمل بالفعل');return;}await call('lesson.complete',{doc_id:S.doc});await refresh();toast('اتحفظ إكمال الدرس ✓');render();}
      if(name==='refresh'){await refresh();render();toast('التقدم محدث');}
      if(name==='submit') {
        const id=S.doc;
        const key='submit:'+S.boot.student.id+':'+id+':'+(S.quiz.attemptKey||(S.quiz.attemptKey=crypto.randomUUID()));
        const result=await call('quiz.submit',{doc_id:id,answers:S.answers,idempotency_key:key});
        if(S.doc===id){S.results=result;S.marks={};render();} toast('اتحفظت المحاولة. قارن الإجابات الحرة بالمرجع.');
      }
      if(name==='assess'){const r=await call('quiz.assess',{doc_id:S.doc,submission_event_id:S.results.submission_event_id,marks:S.marks});Object.assign(S.results,r);sessionStorage.removeItem('draft:'+S.boot.student.id+':'+S.doc);await refresh();render();toast('اتحفظ تقييمك ونتيجتك ✓');}
      if(name.startsWith('review:')){await call('review.complete',{review_id:name.slice(7)});await refresh();render();toast('اتحفظت المراجعة ✓');}
    } catch(e){toast(e.message);} finally {S.busy=false;if(buttonElement&&buttonElement.isConnected)buttonElement.disabled=false;}
  }
  function bind() {
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>go(b.dataset.view));
    document.querySelectorAll('[data-unit]').forEach(b=>{b.onclick=()=>go('unit',b.dataset.unit);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go('unit',b.dataset.unit);}};});
    document.querySelectorAll('[data-doc]').forEach(b=>b.onclick=()=>go('lesson',b.dataset.doc));
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab;render();if(S.tab==='quiz')loadQuiz();});
    document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action,b));
    document.querySelectorAll('[data-qid]').forEach(input=>input.oninput=()=>{S.answers[input.dataset.qid]=input.value;sessionStorage.setItem('draft:'+S.boot.student.id+':'+S.doc,JSON.stringify(S.answers));});
    document.querySelectorAll('[data-mark]').forEach(input=>input.onchange=()=>S.marks[input.dataset.mark]=input.checked);
    document.querySelectorAll('a[href^="https://t.me/"]').forEach(a=>a.onclick=e=>{if(tg&&tg.initData&&tg.openTelegramLink){e.preventDefault();tg.openTelegramLink(a.href);}});
  }
  async function init() {
    try {if(tg){tg.ready();tg.expand();tg.setHeaderColor('#f7f5ef');tg.setBackgroundColor('#f7f5ef');}}
    catch(e) { /* older Telegram clients still use the standard viewport */ }
    try {S.cat=await (await fetch('catalog.json?v=unified-1')).json();}
    catch(e){$('screen').innerHTML='<div class="empty">تعذّر تحميل الفهرس. أعد فتح التطبيق.</div>';return;}
    try {await refresh();}
    catch(e){$('who').textContent='تصفح المكتبة';$('notice').innerHTML='لحفظ تقدمك ونتائجك افتح من <a href="https://t.me/Deutsch099_bot"><b>بوت الألمانية</b></a> واضغط «ابدأ الدراسة». للمتصفح العادي أرسل <b dir="ltr">/login</b> للبوت وافتح الرابط الشخصي.';}
    if(S.doc&&doc(S.doc)){S.view='lesson';S.unit=doc(S.doc).lektion;}else if(S.view==='unit')S.view='atlas';else if(S.view==='lesson'){S.view='home';S.doc='';}
    render();
    if(S.view==='lesson'&&S.tab==='quiz')loadQuiz();
    else if(S.view==='lesson'&&S.boot)markOpened(S.doc);
    $('brand').onclick=e=>{e.preventDefault();go('home');};
  }
  init();
})();
