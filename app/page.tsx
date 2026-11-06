const modules = [
  { title: "التسجيل والقبول", description: "متابعة طلبات الالتحاق وحالاتها ضمن المنشأة." },
  { title: "ملفات الأطفال", description: "إدارة بيانات الأطفال وأولياء الأمور وفق صلاحيات الحساب." },
  { title: "المالية والفواتير", description: "إدارة الفواتير وحالات السداد للمسؤولين المخولين." },
  { title: "الفروع والصلاحيات", description: "تنظيم فروع المنشأة والوصول إلى بياناتها." },
  { title: "المساعد التشغيلي", description: "استعلامات عربية مباشرة عن مؤشرات المنشأة." },
  { title: "لوحة التشغيل", description: "عرض مؤشرات التسجيل والفروع والعمليات المتاحة لحسابك." }
];
export default function Home() {
  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main className="shell">
    <header className="top">
      <a className="logo" href="/" aria-label="سِير — الصفحة الرئيسية">سِير<span className="logo-dot">.</span></a>
      <nav aria-label="التنقل الرئيسي"><a className="primary-button" href="/login">تسجيل الدخول</a></nav>
    </header>
    <section className="hero" id="main-content" tabIndex={-1} aria-labelledby="home-title">
      <span className="tag" lang="en" dir="ltr">SEER</span>
      <h1 id="home-title">شغلك يسير.</h1>
      <p>منصة موحدة لإدارة وتشغيل المدارس الأهلية والحضانات.<br/>ادخل بحساب منشأتك للوصول إلى العمليات المتاحة وفق صلاحياتك.</p>
      <a className="primary-button" href="/login">الدخول إلى سِير</a>
    </section>
    <section aria-labelledby="modules-title">
      <h2 id="modules-title" className="section-title">مساحة عمل منشأتك</h2>
      <div className="grid">{modules.map(module => <article className="card" key={module.title}><h3>{module.title}</h3><p>{module.description}</p></article>)}</div>
    </section>
    <footer className="foot">سِير | <span lang="en" dir="ltr">SEER</span> — منصة إدارة وتشغيل</footer>
  </main></>;
}
