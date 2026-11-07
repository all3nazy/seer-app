import { Icon, Logo, type IconName } from "../components/icons";

const features: { icon: IconName; tone: string; title: string; description: string }[] = [
  { icon: "board", tone: "plum", title: "لوحة المهام", description: "كل مهمة تمشي من جديدة إلى منجزة. اسحبها بين المراحل وشوف المتأخر قبل ما يتأخر أكثر." },
  { icon: "spark", tone: "sky", title: "مساعد يفهم عربي", description: "اسأل «وش عندي اليوم؟» أو «كم طلب ينتظر الموافقة؟» ويرد عليك بالأرقام ويوديك للصفحة." },
  { icon: "users", tone: "rose", title: "الأطفال وأولياء الأمور", description: "ملفات منظمة لكل منشأة، وكل موظف يشوف اللي تسمح له به صلاحيته فقط." },
  { icon: "folder", tone: "sun", title: "التسجيل والقبول", description: "تابع طلبات الالتحاق من الاستلام إلى القبول، بدون جداول متفرقة." },
  { icon: "wallet", tone: "coral", title: "الفواتير", description: "فواتير وحالات سداد واضحة، ومحصورة على المالك والمدير." },
  { icon: "check", tone: "leaf", title: "كل تعديل مسجّل", description: "سجل تدقيق لكل إضافة وتعديل وحذف، بدون حفظ بيانات الأطفال فيه." },
];

export default function Home() {
  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main className="shell">
    <header className="top">
      <Logo />
      <nav aria-label="التنقل الرئيسي"><a className="btn" href="/login">تسجيل الدخول</a></nav>
    </header>
    <section className="hero-center" id="main-content" tabIndex={-1} aria-labelledby="home-title">
      <span className="badge-circle" aria-hidden="true"><span className="tile-icon lg tone-plum"><Icon name="board" /></span></span>
      <h1 id="home-title">يومك في المدرسة، يسير.</h1>
      <p>سِير منصة تشغيل للمدارس الأهلية والحضانات: المهام والسجلات والمساعد في مكان واحد، بالعربي ومن أول يوم.</p>
      <div className="hero-actions"><a className="primary-button" href="/login">الدخول إلى سِير</a><a className="btn" href="/auth/activate">تفعيل حساب جديد</a></div>
    </section>
    <section aria-labelledby="modules-title">
      <h2 id="modules-title" className="section-title" style={{ textAlign: "center" }}>وش تلقى داخل سِير</h2>
      <div className="feature-grid">{features.map(feature => <article className="tile" key={feature.title}><span className={`tile-icon tone-${feature.tone}`}><Icon name={feature.icon} /></span><h3 style={{ margin: 0 }}>{feature.title}</h3><p>{feature.description}</p></article>)}</div>
    </section>
    <footer className="foot">سِير، منصة إدارة عمليات المدارس والحضانات.</footer>
  </main></>;
}
