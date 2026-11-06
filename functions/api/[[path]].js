const windows = new Map();
const json = (data, status = 200, origin = "") => new Response(JSON.stringify(data), {
  status,
  headers: {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", ...(origin ? {"Access-Control-Allow-Origin":origin,"Vary":"Origin"} : {})}
});
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const expected = env.APP_ORIGIN || new URL(request.url).origin;
  return origin === expected;
}
function rateLimited(ip, now) {
  const current = windows.get(ip) || {start:now,count:0};
  if (now-current.start > 60_000) { current.start=now; current.count=0; }
  current.count++;
  windows.set(ip,current);
  return current.count > 8;
}
export async function onRequest({request, env}) {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type", ...(origin?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{})}});
  if (request.method !== "POST") return json({error:"Method not allowed"},405);
  if (!allowedOrigin(request,env)) return json({error:"درخواست از دامنه ناشناس رد شد."},403);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (rateLimited(ip,Date.now())) return json({error:"تعداد درخواست‌ها زیاد است؛ یک دقیقه بعد دوباره تلاش کن."},429);
  if (!env.GEMINI_API_KEY) return json({error:"کلید Gemini تنظیم نشده است. در Cloudflare یک Secret با نام GEMINI_API_KEY ثبت کن."},503);
  let body;
  try { body=await request.json(); } catch { return json({error:"بدنه درخواست JSON معتبر نیست."},400); }
  const path = new URL(request.url).pathname.split("/").pop();
  let prompt="", generationConfig={temperature:0.35,maxOutputTokens:5000};
  if (path === "chat") {
    const message=String(body.message||"").trim();
    if (!message || message.length>3000) return json({error:"متن سؤال خالی یا بیش از ۳۰۰۰ نویسه است."},400);
    const history=Array.isArray(body.history)?body.history.slice(-8).filter(x=>["user","assistant"].includes(x.role)).map(x=>({role:x.role==="assistant"?"model":"user",parts:[{text:String(x.text||"").slice(0,1200)}]})):[];
    prompt=`تو «معلم هوشمند» فارسی‌زبان هستی و به دانش‌آموز و داوطلب آموزگاری کمک می‌کنی.
درس انتخاب‌شده: ${String(body.subject||"عمومی").slice(0,80)}؛ پایه یا سطح: ${String(body.grade||"نامشخص").slice(0,60)}.
دستورالعمل‌ها:
- پاسخ را به فارسی روان، دقیق و متناسب با سطح دانش‌آموز بده.
- ابتدا تعریف ساده، سپس مثال، و در صورت نیاز مراحل حل را توضیح بده.
- اگر واژه مبهم، ناقص یا احتمالاً غلط املایی است، حدس قطعی نزن؛ معنی‌های محتمل را بگو و برای رفع ابهام یک سؤال کوتاه بپرس.
- در ریاضی محاسبات را دوباره کنترل کن؛ در علوم علت را توضیح بده؛ در فارسی مثال روشن ارائه کن.
- برای موضوعات دینی، احکام وابسته به مذهب/مرجع را قطعی و فراگیر جلوه نده؛ در موارد اختلافی بگو باید با منبع درسی یا مرجع مربوط بررسی شود.
- منبع، شماره صفحه یا نقل‌قولی را جعل نکن. اگر مطمئن نیستی، صریح بگو.
- جواب را تا حد امکان مفید و نه بی‌دلیل طولانی بنویس.
پرسش فعلی: ${message}`;
    if (history.length) generationConfig.temperature=0.3;
    body._contents=[...history,{role:"user",parts:[{text:prompt}]}];
  } else if (path === "quiz") {
    const count=Math.min(30,Math.max(5,Number(body.count)||10));
    const subject=String(body.subject||"همه").slice(0,80), topic=String(body.topic||"").slice(0,300), level=String(body.level||"متوسط").slice(0,30);
    prompt=`برای آمادگی آموزگار ابتدایی، دقیقاً ${count} سؤال چهارگزینه‌ای تألیفی به زبان فارسی بساز.
درس: ${subject}. مبحث/درس تمام‌شده: ${topic||"موضوعات متنوع همان درس"}. سطح: ${level}.
سؤال‌ها باید روشن، بدون ابهام، متنوع و دارای فقط یک پاسخ صحیح باشند. محتوای آموزشی دبستانی باشد و سؤال تخصصی دانشگاهی نساز. برای هر سؤال توضیح کوتاه و درست بنویس. از سؤال‌های تکراری در همین آزمون پرهیز کن.
فقط JSON معتبر و بدون markdown با ساختار زیر برگردان:
{"questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"...","level":"متوسط","subject":"${subject}"}]}
answer شاخص صفرمبنای گزینه درست است.`;
    generationConfig={temperature:0.45,maxOutputTokens:6500,responseMimeType:"application/json"};
    body._contents=[{role:"user",parts:[{text:prompt}]}];
  } else return json({error:"مسیر API شناخته نشد."},404);
  const model=env.GEMINI_MODEL||"gemini-2.5-flash-lite";
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let response;
  try {
    response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify({contents:body._contents,generationConfig})});
  } catch { return json({error:"ارتباط با سرویس هوش مصنوعی برقرار نشد."},502); }
  const result=await response.json().catch(()=>({}));
  if (!response.ok) {
    const msg=result.error?.message||"خطای سرویس هوش مصنوعی";
    const status=response.status===429?429:502;
    return json({error:status===429?"سهمیه یا محدودیت درخواست Gemini موقتاً پر شده است؛ بعداً تلاش کن.":msg},status);
  }
  const text=(result.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("").trim();
  if (!text) return json({error:"هوش مصنوعی پاسخ متنی برنگرداند."},502);
  if (path === "chat") return json({answer:text});
  try {
    const clean=text.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
    const parsed=JSON.parse(clean), qs=parsed.questions;
    if (!Array.isArray(qs)||qs.length<5||qs.some(q=>!q.question||!Array.isArray(q.options)||q.options.length!==4||!Number.isInteger(q.answer)||q.answer<0||q.answer>3||typeof q.explanation!=="string")) throw new Error("schema");
    return json({questions:qs.slice(0,Math.min(30,Number(body.count)||10))});
  } catch { return json({error:"مدل نتوانست پاسخ را در قالب استاندارد سؤال‌ها برگرداند. دوباره تلاش کن یا از بانک محلی استفاده کن."},502); }
}
