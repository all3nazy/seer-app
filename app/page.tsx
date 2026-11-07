import { Icon, Logo, type IconName } from "../components/icons";

const features: { icon: IconName; title: string; description: string }[] = [
  { icon: "board", title: "لوحة المهام", description: "كل مهمة تمشي من جديدة إلى منجزة. اسحبها بين المراحل وشوف المتأخر قبل ما يتأخر أكثر." },
  { icon: "spark", title: "مساعد يفهم عربي", description: "اسأل «وش عندي اليوم؟» أو «كم طلب ينتظر الموافقة؟» ويرد عليك بالأرقام ويوديك للصفحة." },
  { icon: "users", title: "الأطفال وأولياء الأمور", description: "ملفات منظمة لكل منشأة، وكل موظف يشوف اللي تسمح له به صلاحيته فقط." },
  { icon: "folder", title: "التسجيل والقبول", description: "تابع طلبات الالتحاق من الاستلام إلى القبول، بدون جداول متفرقة." },
  { icon: "wallet", title: "الفواتير", description: "فواتير وحالات سداد واضحة، ومحصورة على المالك والمدير." },
  { icon: "check", title: "كل تعديل مسجّل", description: "سجل تدقيق لكل إضافة وتعديل وحذف، بدون حفظ بيانات الأطفال فيه." },
];

export default function Home() {
  return <><a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a><main>
    <header className="top shell" style={{ paddingBlock: 20 }}>
      <Logo />
      <nav aria-label="التنقل الرئيسي"><a className="btn" href="/login">تسجيل الدخول</a></nav>
    </header>
    <section className="dusk" id="main-content" tabIndex={-1} aria-labelledby="home-title">
      <div className="dusk-inner">
        <h1 id="home-title">يومك في المدرسة، يسير.</h1>
        <p>سِير منصة تشغيل للمدارس الأهلية والحضانات: المهام والسجلات والمساعد في مكان واحد، بالعربي ومن أول يوم.</p>
        <div className="dusk-actions"><a className="primary-button" href="/login">الدخول إلى سِير</a><a className="btn" href="/auth/activate">تفعيل حساب جديد</a></div>
      </div>
      <div className="dusk-sun" aria-hidden="true" />
      <div className="dusk-horizon" aria-hidden="true" />
    </section>
    <section className="shell" aria-labelledby="modules-title">
      <h2 id="modules-title" className="section-title">وش تلقى داخل سِير</h2>
      <div className="feature-list">{features.map(feature => <article key={feature.title}><h3><Icon name={feature.icon} />{feature.title}</h3><p>{feature.description}</p></article>)}</div>
      <footer className="foot">سِير، منصة إدارة عمليات المدارس والحضانات.</footer>
    </section>
  </main></>;
}
