/**
 * Three phone screens drawn in HTML and CSS (no images), with clearly made-up data, so visitors see
 * what the attendance, pickup and family portal screens look like.
 */
const attendance: [string, string, string][] = [
  ["ريم خالد", "حاضرة", "ok"], ["سارة أحمد", "متأخرة", "warn"], ["عبدالله فهد", "حاضر", "ok"], ["نورة سعد", "غائبة", "bad"], ["يوسف علي", "بعذر", "muted"],
];

function Phone({ title, label, children }: { title: string; label: string; children: React.ReactNode }) {
  return <figure className="lp-phone" aria-label={label}>
    <div className="lp-phone-frame" aria-hidden="true">
      <div className="lp-phone-notch" />
      <div className="lp-phone-bar"><strong>{title}</strong><span>سِير</span></div>
      <div className="lp-phone-body">{children}</div>
    </div>
    <figcaption>{label}</figcaption>
  </figure>;
}

export function LandingPreviews() {
  return <div className="lp-phones">
    <Phone title="الحضور · الأول (أ)" label="الحضور: حالة كل طالب بضغطة">
      <div className="lp-mini-stats"><span><b>٢٢</b>حاضر</span><span><b>٢</b>متأخر</span><span><b>١</b>غائب</span></div>
      <ul className="lp-list">{attendance.map(([name, state, tone]) => <li key={name}><span className="lp-avatar">{name[0]}</span><span className="lp-name">{name}</span><span className={`lp-chip ${tone}`}>{state}</span></li>)}</ul>
      <span className="lp-cta">تحديد الباقين حاضرين</span>
    </Phone>
    <Phone title="تسليم الطلاب" label="التسليم: لولي الأمر أو المصرّح لهم فقط">
      <div className="lp-search">ابحث عن طالب…</div>
      <div className="lp-card"><span className="lp-avatar lg">ر</span><div><b>ريم خالد</b><small>الأول (أ) · حاضرة من ٧:١٢</small></div></div>
      <p className="lp-label">مين بيستلم؟</p>
      <ul className="lp-options"><li className="on"><b>خالد محمد</b><small>الأب · تم التحقق</small></li><li><b>منى سالم</b><small>الأم</small></li><li><b>أبو سعد</b><small>سائق · مصرّح له</small></li></ul>
      <span className="lp-cta">تسليم ريم لخالد</span>
    </Phone>
    <Phone title="بوابة ولي الأمر" label="بوابة ولي الأمر: كل شيء عن الطفل في رابط واحد">
      <div className="lp-card"><span className="lp-avatar lg">ر</span><div><b>ريم خالد</b><small>حاضرة اليوم ✓</small></div></div>
      <div className="lp-report"><b>تقرير اليوم</b><span>🍎 أكلت فطورها كامل</span><span>😴 نامت ساعة</span><span>😊 مزاجها رايق</span></div>
      <div className="lp-report"><b>إعلان</b><span>رحلة الحديقة يوم الخميس، أرسلوا الموافقة.</span></div>
      <div className="lp-invoice"><span>فاتورة نوفمبر</span><b>١٬٢٠٠ ر.س</b></div>
      <span className="lp-cta ghost">إبلاغ عن غياب</span>
    </Phone>
  </div>;
}
