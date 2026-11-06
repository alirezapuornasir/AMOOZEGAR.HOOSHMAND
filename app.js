const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const subjects = ["روش تدریس و رفتار معلم", "ریاضی", "علوم تجربی", "فارسی", "قرآن و هدیه‌های آسمان", "مطالعات اجتماعی"];
const fa = (n) => new Intl.NumberFormat("fa-IR").format(n);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
let bank = [], current = [], deferredInstall = null, currentTitle = "آزمون تمرینی", chatHistory = [];

async function init() {
  try {
    const local = localStorage.getItem("customQuestionBank");
    bank = local ? JSON.parse(local) : await fetch("/data/questions.json").then(r => { if (!r.ok) throw new Error("bank missing"); return r.json(); });
  } catch (e) { bank = []; }
  fillSelects();
  updateBankCount();
  $("#subjectChips").innerHTML = subjects.map(s => `<span class="chip">${esc(s)}</span>`).join("");
  renderLibrary(); renderProgress(); renderLessons();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
function fillSelects() {
  ["quizSubject", "tutorSubject", "librarySubject"].forEach(id => {
    const el = $("#" + id);
    subjects.forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s; el.append(o); });
  });
}
function updateBankCount() {
  $("#questionCount").textContent = `${fa(bank.length)} سؤال در بانک آموزشی`;
}
function go(view) {
  $$(".view").forEach(v => v.classList.toggle("active", v.id === view));
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  window.scrollTo({top:0, behavior:"smooth"});
}
$$(".tab").forEach(b => b.onclick = () => go(b.dataset.view));
$$("[data-goto]").forEach(b => b.onclick = () => go(b.dataset.goto));
function shuffle(a) { const x = [...a]; for (let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];} return x; }
function normalized(s) { return String(s||"").toLocaleLowerCase("fa").replace(/[\u200c\sـ،؛.!؟?]/g, ""); }
function begin(list, title="آزمون تمرینی") {
  if (!list.length) return alert("برای این انتخاب سؤال مناسبی پیدا نشد.");
  current = list; currentTitle = title; renderQuiz(); go("quiz");
}
function getQuestionPool(subject, level) {
  return bank.filter(q => (subject === "همه" || q.subject === subject) && (level === "همه" || q.level === level));
}
$("#startQuiz").onclick = () => {
  const pool = getQuestionPool($("#quizSubject").value, $("#quizLevel").value);
  const n = +$("#quizSize").value;
  begin(shuffle(pool).slice(0, Math.min(n, pool.length)), "آزمون تصادفی");
};
$("#finishLesson").onclick = () => {
  const subject = $("#quizSubject").value;
  const topic = $("#lessonTopic").value.trim();
  if (subject === "همه") return alert("برای آزمون پایان درس، ابتدا درس مربوط را از فهرست انتخاب کن.");
  if (!topic) return alert("نام درس یا مبحثی را که تمام کرده‌ای وارد کن.");
  const n = +$("#quizSize").value;
  let pool = bank.filter(q => (subject === "همه" || q.subject === subject));
  const needle = normalized(topic);
  let matches = pool.filter(q => normalized(q.question + " " + q.unit).includes(needle) || needle.includes(normalized(q.unit)) && normalized(q.unit).length > 2);
  let title = `آزمون پایان درس: ${topic}`;
  if (matches.length < Math.min(5,n)) {
    const tokens = topic.split(/[\s،؛]+/).filter(x => x.length >= 3).map(normalized);
    matches = pool.filter(q => tokens.some(t => normalized(q.question + " " + q.unit).includes(t)));
  }
  let usedFallback = false;
  if (matches.length < Math.min(5,n)) { matches = pool; usedFallback = true; }
  const list = shuffle(matches).slice(0, Math.min(n, matches.length));
  const lessons = JSON.parse(localStorage.completedLessons || "[]");
  lessons.unshift({topic, subject, date:new Date().toISOString(), questionCount:list.length});
  localStorage.completedLessons = JSON.stringify(lessons.slice(0,100));
  renderLessons();
  if (usedFallback) alert("برای این عنوان، سؤال‌های مستقیم کافی در بانک پیدا نشد؛ آزمون از بانک همان درس انتخاب شده است. بعداً می‌توانیم بانک را برای این مبحث دقیق‌تر کنیم.");
  begin(list, title);
};
$("#aiQuiz").onclick = async () => {
  const subject = $("#quizSubject").value;
  const topic = $("#lessonTopic").value.trim();
  const n = +$("#quizSize").value;
  const btn = $("#aiQuiz"); btn.disabled = true; btn.textContent = "در حال ساخت آزمون...";
  try {
    const r = await api("/api/quiz", {subject, topic, count:n, level:$("#quizLevel").value});
    if (!r.questions?.length) throw new Error(r.error || "پاسخ نامعتبر");
    begin(r.questions.map((q,i) => ({...q,id:"AI"+i,subject:q.subject || subject,level:q.level || "متوسط",unit:topic || "آزمون هوشمند"})), topic ? `آزمون هوشمند: ${topic}` : "آزمون هوشمند");
  } catch (e) { alert("ساخت آزمون با هوش مصنوعی انجام نشد: " + e.message + "\nاز بانک آفلاین ۲۰۰۰ سؤالی استفاده کن."); }
  finally { btn.disabled = false; btn.textContent = "ساخت آزمون تازه با هوش مصنوعی"; }
};
function renderQuiz() {
  const a = $("#quizArea");
  a.innerHTML = `<div class="section-head"><h2>${esc(currentTitle)}</h2><span class="muted">${fa(current.length)} سؤال</span></div>` + current.map((q,i) => `
    <article class="question-card"><small>${esc(q.subject)} • ${esc(q.unit || "عمومی")} • ${esc(q.level)}</small><b>${fa(i+1)}. ${esc(q.question)}</b><div>
    ${q.options.map((o,j) => `<label class="option"><input type="radio" name="q${i}" value="${j}"> ${["الف","ب","ج","د"][j]}) ${esc(o)}</label>`).join("")}</div></article>`).join("") + `<button id="submitQuiz" class="primary">ثبت پاسخ‌ها و دریافت کارنامه</button>`;
  $("#submitQuiz").onclick = grade;
}
function grade() {
  let correct = 0;
  const details = current.map((q,i) => {
    const v = document.querySelector(`input[name="q${i}"]:checked`);
    const selected = v ? +v.value : -1, ok = selected === q.answer;
    if (ok) correct++;
    return {q, selected, ok};
  });
  const pct = Math.round(correct/current.length*100);
  const rec = JSON.parse(localStorage.results || "[]");
  rec.push({date:new Date().toISOString(), title:currentTitle, correct,total:current.length,pct,subjects:[...new Set(current.map(q=>q.subject))],details:details.map(d=>({id:d.q.id,subject:d.q.subject,ok:d.ok,question:d.q.question}))});
  localStorage.results = JSON.stringify(rec.slice(-250));
  const wrongIds = new Set(JSON.parse(localStorage.reviewQuestionIds || "[]"));
  details.filter(d=>!d.ok && d.q.id && !String(d.q.id).startsWith("AI")).forEach(d=>wrongIds.add(d.q.id));
  localStorage.reviewQuestionIds = JSON.stringify([...wrongIds]);
  const unans = details.filter(d=>d.selected<0).length;
  $("#quizArea").innerHTML = `<div class="panel"><h2>کارنامه آزمون</h2><p>${esc(currentTitle)}</p><div class="stats"><div><b>${fa(correct)} از ${fa(current.length)}</b><small>پاسخ درست</small></div><div><b>${fa(pct)}٪</b><small>درصد</small></div><div><b>${pct>=85?"خیلی خوب":pct>=65?"رو به رشد":"نیازمند مرور"}</b><small>ارزیابی</small></div></div><p class="muted">${fa(unans)} سؤال بدون پاسخ • ${fa(current.length-correct-unans)} پاسخ نادرست</p><p>${pct>=80?"مفاهیم را خوب فهمیده‌ای؛ برای تثبیت، مرور فاصله‌دار انجام بده.":"سؤالات اشتباه را مرور کن و دوباره از همان مبحث آزمون بده."}</p></div>` + details.map((d,i) => `<article class="question-card"><b>${fa(i+1)}. ${esc(d.q.question)}</b><p>${d.ok?"✅ پاسخ درست":d.selected<0?"⚪ بدون پاسخ":"❌ پاسخ نادرست"}</p><p>پاسخ صحیح: <b>${esc(d.q.options[d.q.answer])}</b></p><p class="muted">${esc(d.q.explanation || "برای این سؤال توضیح ثبت نشده است.")}</p></article>`).join("") + `<button class="primary" onclick="window.showView('progress')">دیدن کارنامه</button><button class="secondary" onclick="window.showView('quiz')">آزمون بعدی</button>`;
  renderProgress();
}
window.showView = go;
async function api(path,data) {
  const r = await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
  const j = await r.json().catch(()=>({error:"پاسخ سرور قابل خواندن نیست"}));
  if (!r.ok) throw new Error(j.error || `خطای ${r.status}`);
  return j;
}
$("#chatForm").onsubmit = async e => {
  e.preventDefault(); const msg = $("#chatInput").value.trim(); if (!msg) return;
  addBubble(msg,"user"); $("#chatInput").value="";
  const wait = addBubble("در حال فکرکردن...","bot");
  try { const r = await api("/api/chat",{message:msg,subject:$("#tutorSubject").value,grade:$("#grade").value,history:chatHistory.slice(-8)}); wait.textContent = r.answer || "پاسخی دریافت نشد."; chatHistory.push({role:"user",text:msg},{role:"assistant",text:r.answer||""}); }
  catch(err) { wait.textContent = "اتصال هوش مصنوعی فعال نیست یا سهمیه رایگان موقتاً تمام شده است. تنظیمات GEMINI_API_KEY را در Cloudflare بررسی کن. " + err.message; }
};
$("#clearChat").onclick=()=>{chatHistory=[];$("#chatLog").innerHTML=`<div class="bubble bot">گفت‌وگو پاک شد. سؤال تازه‌ات را بپرس.</div>`;};
function addBubble(t,c) { const d=document.createElement("div");d.className="bubble "+c;d.textContent=t;$("#chatLog").append(d);$("#chatLog").scrollTop=$("#chatLog").scrollHeight;return d; }

// Open-license educational image search via Wikimedia Commons. The app displays source and license attribution.
$("#imageSearch").onclick = async () => {
  const q = $("#imageQuery").value.trim(); if (!q) return;
  const box = $("#imageResults"); box.innerHTML = `<p class="muted">در حال جست‌وجوی تصویرهای آزاد...</p>`;
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=480&format=json&origin=*`;
    const data = await fetch(url).then(r=>r.json());
    const pages = Object.values(data.query?.pages || {});
    if (!pages.length) { box.innerHTML = `<p>تصویری پیدا نشد. نام دقیق‌تر یا انگلیسی موضوع را امتحان کن.</p>`; return; }
    box.className = "image-results";
    box.innerHTML = pages.map(p=>{
      const info=p.imageinfo?.[0]; if(!info?.thumburl) return "";
      const meta=info.extmetadata||{}; const author=(meta.Artist?.value||"نامشخص").replace(/<[^>]*>/g,"");
      const license=meta.LicenseShortName?.value||"مجوز را در صفحه منبع بررسی کن";
      return `<article class="image-card"><a href="${esc(info.descriptionurl)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(info.thumburl)}" alt="${esc(p.title)}"></a><b>${esc(p.title.replace(/^File:/,""))}</b><small>پدیدآور: ${esc(author)}</small><small>مجوز: ${esc(license)}</small><a target="_blank" rel="noopener" href="${esc(info.descriptionurl)}">صفحه منبع و شرایط استفاده</a></article>`;
    }).join("") || `<p>تصویر قابل‌نمایش پیدا نشد.</p>`;
  } catch(e) { box.innerHTML = `<p>جست‌وجوی تصویر در حال حاضر ممکن نیست. دوباره تلاش کن.</p>`; }
};

function renderProgress() {
  const r=JSON.parse(localStorage.results||"[]");
  $("#attempts").textContent=fa(r.length);
  const avg=r.length?Math.round(r.reduce((a,x)=>a+x.pct,0)/r.length):0;
  $("#average").textContent=fa(avg)+"٪";
  $("#best").textContent=fa(r.length?Math.max(...r.map(x=>x.pct)):0)+"٪";
  $("#subjectProgress").innerHTML=subjects.map(s=>{const d=r.flatMap(x=>x.details||[]).filter(x=>x.subject===s);const p=d.length?Math.round(d.filter(x=>x.ok).length/d.length*100):0;return `<p>${esc(s)} <span class="muted">${fa(p)}٪ (${fa(d.length)} پاسخ)</span></p><div class="bar"><i style="width:${p}%"></i></div>`;}).join("");
  const mistakes=JSON.parse(localStorage.reviewQuestionIds||"[]");
  $("#reviewCount").textContent=`${fa(mistakes.length)} سؤال برای مرور`;
  $("#reviewBtn").disabled=!mistakes.length;
  $("#recentResults").innerHTML=r.slice(-5).reverse().map(x=>`<div class="result-row"><b>${esc(x.title||"آزمون")}</b><span>${fa(x.pct)}٪</span><small>${new Date(x.date).toLocaleDateString("fa-IR")}</small></div>`).join("")||`<p class="muted">هنوز آزمونی ثبت نشده است.</p>`;
}
$("#reviewBtn").onclick=()=>{
  const ids=new Set(JSON.parse(localStorage.reviewQuestionIds||"[]"));
  const list=bank.filter(q=>ids.has(q.id));
  if(!list.length)return alert("سؤال اشتباهی برای مرور ذخیره نشده است.");
  begin(shuffle(list).slice(0,Math.min(20,list.length)),"مرور اشتباهات قبلی");
};
function renderLessons(){const list=JSON.parse(localStorage.completedLessons||"[]");$("#lessonProgress").innerHTML=list.slice(0,8).map(x=>`<div class="result-row"><b>${esc(x.topic)}</b><small>${esc(x.subject)} • ${new Date(x.date).toLocaleDateString("fa-IR")}</small></div>`).join("")||`<p class="muted">هنوز درسی ثبت نشده است. پس از تمام‌کردن درس، از بخش آزمون نام آن را ثبت کن.</p>`;}
function renderLibrary(){
  const term=normalized($("#searchQuestions").value||""),s=$("#librarySubject").value||"همه",l=$("#libraryLevel").value||"همه";
  const arr=bank.filter(q=>(s==="همه"||q.subject===s)&&(l==="همه"||q.level===l)&&(!term||normalized(q.question+" "+q.unit+" "+q.explanation).includes(term)));
  $("#questionList").innerHTML=`<p class="muted">${fa(arr.length)} سؤال پیدا شد</p>`+arr.slice(0,150).map((q,i)=>`<article class="question-card"><small>${esc(q.subject)} • ${esc(q.unit||"عمومی")} • ${esc(q.level)}</small><b>${fa(i+1)}. ${esc(q.question)}</b><details><summary>نمایش پاسخ و توضیح</summary><p>پاسخ: ${esc(q.options[q.answer])}</p><p class="muted">${esc(q.explanation||"")}</p></details></article>`).join("")+(arr.length>150?`<p class="muted">برای سریع‌ماندن صفحه، فقط ۱۵۰ نتیجه اول نمایش داده شده است. جست‌وجو را دقیق‌تر کن.</p>`:"");
}
["searchQuestions","librarySubject","libraryLevel"].forEach(id=>$("#"+id).addEventListener(id==="searchQuestions"?"input":"change",renderLibrary));
$("#clearProgress").onclick=()=>{if(confirm("تمام سوابق آزمون و فهرست مرور این دستگاه پاک شود؟")){["results","reviewQuestionIds","completedLessons"].forEach(k=>localStorage.removeItem(k));renderProgress();renderLessons();}};
$("#exportData").onclick=()=>{
  const data={exportedAt:new Date().toISOString(),results:JSON.parse(localStorage.results||"[]"),reviewQuestionIds:JSON.parse(localStorage.reviewQuestionIds||"[]"),completedLessons:JSON.parse(localStorage.completedLessons||"[]")};
  download(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),"amoozegar-progress.json");
};
$("#exportQuestions").onclick=()=>download(new Blob([JSON.stringify(bank,null,2)],{type:"application/json"}),"amoozegar-2000-questions.json");
$("#importQuestions").onchange=async e=>{
  try {const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data)||!data.every(q=>q.question&&Array.isArray(q.options)&&q.options.length===4&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4))throw Error("ساختار JSON درست نیست");
    bank=data;localStorage.setItem("customQuestionBank",JSON.stringify(data));updateBankCount();renderLibrary();alert(`${fa(data.length)} سؤال وارد شد.`);
  } catch(err){alert("فایل معتبر نیست: "+err.message);} e.target.value="";
};
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("#installBtn").hidden=false;});
$("#installBtn").onclick=async()=>{if(deferredInstall){deferredInstall.prompt();deferredInstall=null;}};
init();
