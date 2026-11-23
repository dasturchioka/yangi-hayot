/**
 * Admin-panel shell. Login, roles (Administrator / Menejer) and the screens
 * (Xonadonlar, Loyihalar, Yozilishlar, Rassilka, Analitika, Matnlar va sozlamalar)
 * come in later tickets.
 */
const sections = ['Xonadonlar', 'Loyihalar', 'Yozilishlar', 'Rassilka', 'Analitika', 'Matnlar va sozlamalar'];

export function App() {
  return (
    <div className="layout">
      <nav className="sidebar">
        <p className="brand">Yangi Hayot</p>
        <ul>
          {sections.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </nav>
      <main className="content">
        <h1 className="h2">Admin-panel</h1>
        <p className="muted">Bo'limlar keyingi bosqichlarda qo'shiladi.</p>
      </main>
    </div>
  );
}
