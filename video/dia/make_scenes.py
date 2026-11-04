"""Writes scenes/cNN.html fragments (style <!--markup--> markup <!--script--> js).
Stage for the product: x 640-1840. María José lives in the left column."""
import os
ROOT = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(ROOT, "scenes"), exist_ok=True)

STORE = """<svg viewBox="0 0 300 260" class="store"><rect x="20" y="70" width="260" height="180" rx="10" fill="#fff" stroke="#1e4d68" stroke-width="7"/>
<path d="M10 70 L290 70 L276 24 L24 24 Z" fill="#e07a5f"/><path d="M10 70 q23 26 46 0 q23 26 46 0 q23 26 46 0 q23 26 46 0 q23 26 46 0 q23 26 46 0" fill="#e07a5f" stroke="#e07a5f"/>
<rect x="46" y="120" width="96" height="70" rx="6" fill="#f4c542"/><rect x="168" y="118" width="80" height="132" rx="6" fill="#1e4d68"/><circle cx="234" cy="186" r="5" fill="#f4c542"/></svg>"""

S = {}

S["c01"] = ("""
    #c01-title { position: absolute; left: 640px; top: 150px; }
    #c01-t1 { font-size: 120px; }
    #c01-t2 { font-size: 46px; color: #121826; margin-top: 10px; }
    .c01-shop { position: absolute; top: 400px; width: 330px; text-align: center; font-size: 38px; font-weight: 600; color: #1e4d68; }
    .c01-shop .store { width: 300px; height: 260px; display: block; margin: 0 auto 10px; }
    .c01-q { position: absolute; padding: 26px 38px; font-size: 46px; font-weight: 600; color: #1e4d68; background: #fff; border: 4px solid #1e4d68; border-radius: 34px; box-shadow: 0 16px 40px rgba(18,24,38,.12); }
""", f"""
    <div id="c01-title"><div class="mask"><span id="c01-t1" class="h">Librería Aurora</span></div><div class="mask"><span id="c01-t2">3 sucursales en la ciudad</span></div></div>
    <div class="c01-shop" id="c01-s1" style="left:680px">{STORE}Central Zona 1</div>
    <div class="c01-shop" id="c01-s2" style="left:1090px">{STORE}Mixco</div>
    <div class="c01-shop" id="c01-s3" style="left:1500px">{STORE}Villa Nueva</div>
    <div class="c01-q" id="c01-q1" style="left:600px; top:790px">¿Cuánto vendimos ayer?</div>
    <div class="c01-q" id="c01-q2" style="left:1170px; top:900px">¿Qué se nos está acabando?</div>
""", """
    rise("#c01-t1", 0.15); rise("#c01-t2", 1.5);
    pop("#c01-s1", 1.9); pop("#c01-s2", 2.1); pop("#c01-s3", 2.3);
    tl.to(".c01-shop", { opacity: 0.35, duration: 0.4 }, at(6.6));
    pop("#c01-q1", 7.9); pop("#c01-q2", 9.6);
    gone("#c01-q1", 11.1); gone("#c01-q2", 11.15);
    tl.to(".c01-shop", { opacity: 1, duration: 0.4 }, at(11.2));
""")

S["c02"] = ("""
    #c02-kpis, #c02-hora { opacity: 0; }
    #c02-full { left: 640px; top: 150px; width: 1200px; }
    #c02-kpis { left: 640px; top: 170px; width: 1200px; }
    #c02-hora { left: 640px; top: 340px; width: 700px; }
    #c02-ring { left: 1244px; top: 162px; width: 302px; height: 128px; }
    #c02-note { position: absolute; left: 1380px; top: 380px; width: 460px; font-size: 46px; font-weight: 700; color: #1e4d68; line-height: 1.2; }
""", """
    <img id="c02-full" class="ui" src="assets/dash_full.png" alt="Dashboard de DENGO" />
    <img id="c02-kpis" class="ui" src="assets/dash_kpis.png" alt="Ventas del día, transacciones, stock bajo y caja" />
    <img id="c02-hora" class="ui" src="assets/dash_hora.png" alt="Ventas por hora" />
    <div id="c02-ring" class="ring"></div>
    <div id="c02-note" class="mask"><span id="c02-n1">6 productos por pedir</span></div>
""", """
    wipe("#c02-full", 1.2);
    gone("#c02-full", 2.8);
    tl.set("#c02-kpis", { opacity: 1 }, at(3.0)); wipeX("#c02-kpis", 3.0);
    tl.set("#c02-hora", { opacity: 1 }, at(4.2)); wipe("#c02-hora", 4.2);
    ring("#c02-ring", 5.8); rise("#c02-n1", 6.4);
""")

S["c03"] = ("""
    #c03-k { position: absolute; left: 640px; top: 150px; font-size: 44px; color: #121826; }
    #c03-big { position: absolute; left: 640px; top: 205px; }
    #c03-big span { font-size: 170px; }
    #c03-track { position: absolute; left: 640px; top: 440px; width: 1200px; height: 46px; border-radius: 23px; background: #e3ebf0; overflow: hidden; }
    #c03-fill { width: 100%; height: 100%; background: #1e4d68; border-radius: 23px; }
    #c03-pct { position: absolute; left: 640px; top: 510px; font-size: 58px; font-weight: 700; color: #1e4d68; }
    #c03-pct small { font-size: 40px; font-weight: 400; color: #121826; margin-left: 18px; }
    #c03-pos { left: 640px; top: 650px; width: 1200px; }
    #c03-ring { left: 632px; top: 692px; width: 1216px; height: 58px; }
    #c03-team { position: absolute; left: 640px; top: 880px; display: flex; gap: 26px; }
    .c03-av { width: 96px; height: 96px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 44px; font-weight: 700; color: #fff; }
""", """
    <div id="c03-k" class="mask"><span id="c03-k1">Meta de octubre · Mixco</span></div>
    <div id="c03-big" class="mask"><span id="c03-b1" class="h">Q137,000</span></div>
    <div id="c03-track"><div id="c03-fill"></div></div>
    <div id="c03-pct" class="mask"><span id="c03-p1">86% <small>Q117,932 vendidos</small></span></div>
    <img id="c03-pos" class="ui" src="assets/pos_top.png" alt="La meta en el punto de venta" />
    <div id="c03-ring" class="ring"></div>
    <div id="c03-team"><div class="c03-av" id="c03-a1" style="background:#1e4d68">A</div><div class="c03-av" id="c03-a2" style="background:#e07a5f">C</div><div class="c03-av" id="c03-a3" style="background:#2f9e77">L</div><div class="c03-av" id="c03-a4" style="background:#f4c542;color:#1e4d68">K</div></div>
""", """
    rise("#c03-k1", 0.2); rise("#c03-b1", 2.2, 0.6);
    tl.fromTo("#c03-fill", { scaleX: 0, transformOrigin: "0 50%" }, { scaleX: 0.86, duration: 1.3, ease: "power2.inOut" }, at(4.4));
    rise("#c03-p1", 5.2);
    wipe("#c03-pos", 7.0); ring("#c03-ring", 7.8);
    ["#c03-a1", "#c03-a2", "#c03-a3", "#c03-a4"].forEach((s, i) => pop(s, 10.0 + i * 0.15));
""")

S["c04"] = ("""
    .c04-lock { opacity: 0; }
    #c04-card { left: 640px; top: 170px; width: 1200px; }
    #c04-list { left: 640px; top: 430px; width: 1200px; height: 420px; padding: 20px 40px; }
    .c04-row { display: flex; align-items: center; gap: 30px; height: 126px; border-bottom: 2px solid #eef3f6; font-size: 42px; }
    .c04-row:last-child { border-bottom: 0; }
    .c04-av { width: 84px; height: 84px; border-radius: 50%; color: #fff; font-size: 38px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: none; }
    .c04-row b { color: #1e4d68; }
    .c04-row span.br { margin-left: auto; color: #5b6b78; }
    .c04-lock { width: 46px; height: 46px; margin-left: 24px; }
""", """
    <img id="c04-card" class="ui" src="assets/caja_card.png" alt="Caja abierta con fondo de Q500" />
    <div id="c04-list" class="card">
      <div class="c04-row" id="c04-r1"><div class="c04-av" style="background:#1e4d68">A</div><b>Ana Sofía López</b><span class="br">Central Zona 1</span><svg class="c04-lock" id="c04-l1" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" fill="#1e4d68"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#1e4d68" stroke-width="2.2"/></svg></div>
      <div class="c04-row" id="c04-r2"><div class="c04-av" style="background:#e07a5f">C</div><b>Carlos Méndez</b><span class="br">Mixco</span><svg class="c04-lock" id="c04-l2" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" fill="#1e4d68"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#1e4d68" stroke-width="2.2"/></svg></div>
      <div class="c04-row" id="c04-r3"><div class="c04-av" style="background:#2f9e77">L</div><b>Lucía Hernández</b><span class="br">Villa Nueva</span><svg class="c04-lock" id="c04-l3" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" fill="#1e4d68"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#1e4d68" stroke-width="2.2"/></svg></div>
    </div>
""", """
    wipe("#c04-card", 0.7);
    wipe("#c04-list", 1.6);
    slide("#c04-r1", 1.8); slide("#c04-r2", 2.0); slide("#c04-r3", 2.2);
    pop("#c04-l1", 5.4); pop("#c04-l2", 5.55); pop("#c04-l3", 5.7);
""")

S["c05"] = ("""
    #c05-cart { left: 640px; top: 160px; width: 1120px; }
    #c05-pay { left: 1420px; top: 250px; width: 420px; }
    #c05-scan { left: 632px; top: 198px; width: 760px; height: 66px; }
    #c05-stock { left: 640px; top: 690px; width: 700px; height: 250px; padding: 34px 44px; }
    #c05-stock .lbl { font-size: 36px; color: #5b6b78; }
    #c05-stock .name { font-size: 40px; font-weight: 600; margin-top: 6px; }
    #c05-num { font-size: 84px; font-weight: 700; color: #1e4d68; margin-top: 4px; }
    #c05-num em { font-style: normal; color: #cf5f43; font-size: 52px; margin-left: 20px; }
""", """
    <img id="c05-cart" class="ui" src="assets/cart2.png" alt="Venta con tres productos" />
    <div id="c05-scan" class="ring"></div>
    <img id="c05-pay" class="ui" src="assets/pay2.png" alt="Métodos de pago" />
    <div id="c05-stock" class="card"><div class="lbl">Existencia en Mixco</div><div class="name">Cuaderno espiral 100 hojas</div><div id="c05-num">50 → 49 <em>−1</em></div></div>
""", """
    wipe("#c05-cart", 0.4);
    ring("#c05-scan", 2.5); tl.to("#c05-scan", { opacity: 0, duration: 0.3 }, at(3.6));
    slide("#c05-pay", 5.5, 160);
    pop("#c05-stock", 8.6);
""")

S["c06"] = ("""
    #c06-otras, #c06-tr { opacity: 0; }
    #c06-row { left: 640px; top: 170px; width: 1200px; }
    #c06-otras { left: 900px; top: 370px; width: 720px; }
    #c06-ring { left: 940px; top: 527px; width: 640px; height: 78px; }
    #c06-tr { left: 640px; top: 860px; width: 1200px; }
""", """
    <img id="c06-row" class="ui" src="assets/redrow.png" alt="Sin stock en Mixco" />
    <img id="c06-otras" class="ui" src="assets/otras.png" alt="Inventario en otras sucursales" />
    <div id="c06-ring" class="ring"></div>
    <img id="c06-tr" class="ui" src="assets/traslado_row.png" alt="Traslado pendiente" />
""", """
    wipe("#c06-row", 0.9);
    pop("#c06-otras", 7.0); ring("#c06-ring", 7.9);
    slide("#c06-tr", 9.1, -200);
""")

S["c07"] = ("""
    #c07-movs, #c07-badge { opacity: 0; }
    #c07-compras { left: 640px; top: 150px; width: 1150px; }
    #c07-movs { left: 640px; top: 190px; width: 1200px; }
    #c07-ring { left: 1448px; top: 300px; width: 300px; height: 290px; }
    #c07-badge { left: 640px; top: 650px; width: 900px; height: 170px; display: flex; align-items: center; gap: 36px; padding: 0 44px; font-size: 46px; font-weight: 700; color: #1e4d68; }
    #c07-badge svg { width: 104px; height: 104px; flex: none; }
""", """
    <img id="c07-compras" class="ui" src="assets/compras.png" alt="Historial de compras a proveedores" />
    <img id="c07-movs" class="ui" src="assets/movs.png" alt="Movimientos de inventario con antes, después y usuario" />
    <div id="c07-ring" class="ring"></div>
    <div id="c07-badge" class="card"><svg viewBox="0 0 24 24"><path d="M12 2 L20 5 V11 C20 16.5 16.4 20.6 12 22 C7.6 20.6 4 16.5 4 11 V5 Z" fill="#1e4d68"/><path d="M8.2 12.2 L11 15 L16 9.6" fill="none" stroke="#f4c542" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Cada movimiento, con nombre y motivo</div>
""", """
    wipe("#c07-compras", 2.1); gone("#c07-compras", 5.8);
    tl.set("#c07-movs", { opacity: 1 }, at(6.1)); wipe("#c07-movs", 6.1);
    ring("#c07-ring", 8.1);
    pop("#c07-badge", 10.6);
""")

S["c08"] = ("""
    #c08-cre { opacity: 0; }
    #c08-cot { left: 640px; top: 150px; width: 1150px; }
    #c08-cre { left: 640px; top: 150px; width: 1150px; }
    #c08-ring { left: 1704px; top: 338px; width: 80px; height: 472px; }
""", """
    <img id="c08-cot" class="ui" src="assets/cotiz.png" alt="Cotizaciones a colegios" />
    <img id="c08-cre" class="ui" src="assets/credito.png" alt="Clientes con crédito y abonos" />
    <div id="c08-ring" class="ring"></div>
""", """
    wipe("#c08-cot", 1.2); gone("#c08-cot", 4.5);
    tl.set("#c08-cre", { opacity: 1 }, at(4.7)); wipe("#c08-cre", 4.7);
    ring("#c08-ring", 6.6);
""")

S["c09"] = ("""
    #c09-m1, #c09-m2, #c09-dots, #c09-hours { opacity: 0; }
    #c09-chat { left: 700px; top: 130px; width: 1080px; height: 800px; overflow: hidden; }
    #c09-head { height: 112px; background: #1e4d68; display: flex; align-items: center; gap: 24px; padding: 0 36px; color: #fff; }
    #c09-head svg { width: 62px; height: 62px; }
    #c09-head b { font-size: 42px; }
    #c09-head small { display: block; font-size: 28px; color: #bfe6d5; }
    .c09-msg { position: absolute; max-width: 720px; padding: 26px 32px 18px; border-radius: 26px; font-size: 36px; line-height: 1.32; box-shadow: 0 6px 18px rgba(18,24,38,.08); }
    .c09-msg i { display: block; font-style: normal; font-size: 26px; color: #6b7c88; text-align: right; margin-top: 6px; }
    #c09-m1 { right: 36px; top: 160px; background: #dcf3e8; border-bottom-right-radius: 8px; }
    #c09-m2 { left: 36px; top: 370px; background: #fff; border: 2px solid #e3ebf0; border-bottom-left-radius: 8px; }
    #c09-dots { position: absolute; left: 36px; top: 370px; display: flex; gap: 12px; padding: 26px 32px; background: #fff; border: 2px solid #e3ebf0; border-radius: 26px; }
    #c09-dots div { width: 18px; height: 18px; border-radius: 50%; background: #9fb3c2; }
    #c09-hours { position: absolute; left: 36px; bottom: 34px; display: flex; align-items: center; gap: 20px; font-size: 48px; font-weight: 700; color: #1e4d68; }
    #c09-hours svg { width: 64px; height: 64px; }
""", """
    <div id="c09-chat" class="card">
      <div id="c09-head"><svg viewBox="5 5 120 135"><path d="M 65,15 L 115,44 L 115,101 L 65,130 L 15,101 L 15,44 Z" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/><line x1="15" y1="101" x2="115" y2="44" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M 28,107 L 65,42 L 102,107" fill="none" stroke="#e07a5f" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/></svg><div><b>Soporte DENGO</b><small>● en línea</small></div></div>
      <div class="c09-msg" id="c09-m1">¿Cómo le hago un descuento especial a un colegio?<i>3:12 p.m.</i></div>
      <div id="c09-dots"><div></div><div></div><div></div></div>
      <div class="c09-msg" id="c09-m2">¡Hola, María José! En el punto de venta puede poner el % de descuento en cada producto, o usar «Descuento general» para toda la venta. ¿Le ayudo con algo más?<i>3:15 p.m.</i></div>
      <div id="c09-hours"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#1e4d68" stroke-width="2.2"/><path d="M12 6.5 V12 L15.5 14" fill="none" stroke="#e07a5f" stroke-width="2.2" stroke-linecap="round"/></svg>7:00 a.m. – 7:00 p.m.</div>
    </div>
""", """
    wipe("#c09-chat", 3.9, 0.5);
    tl.set("#c09-m1", { opacity: 1 }, at(4.5)); wipeX("#c09-m1", 4.5, 0.9);
    pop("#c09-dots", 5.5);
    tl.fromTo("#c09-dots div", { y: 0 }, { y: -8, duration: 0.18, ease: "sine.inOut", yoyo: true, repeat: 3, stagger: 0.09 }, at(5.6));
    tl.to("#c09-dots", { opacity: 0, duration: 0.15 }, at(6.25));
    pop("#c09-m2", 6.3);
    pop("#c09-hours", 8.4);
""")

S["c10"] = ("""
    #c10-banner, #c10-rec, #c10-toast, #c10-ok, #c10-cloud, #c10-book { opacity: 0; }
    #c10-wifi { position: absolute; left: 960px; top: 230px; width: 460px; height: 460px; }
    #c10-book { position: absolute; left: 1420px; top: 300px; width: 380px; height: 460px; }
    #c10-banner { left: 640px; top: 150px; width: 1200px; }
    #c10-ring { left: 630px; top: 140px; width: 1220px; height: 56px; }
    #c10-rec { left: 760px; top: 240px; width: 470px; }
    #c10-toast { left: 1280px; top: 300px; width: 560px; }
    #c10-ok { left: 890px; top: 760px; width: 600px; height: 120px; display: flex; align-items: center; gap: 24px; padding: 0 34px; font-size: 44px; font-weight: 700; color: #2f9e77; }
    #c10-ok svg { width: 72px; height: 72px; }
    #c10-cloud { position: absolute; left: 820px; top: 200px; width: 860px; height: 620px; }
    #c10-cl { position: absolute; left: 820px; top: 830px; width: 860px; text-align: center; }
    #c10-cl span { font-size: 60px; }
""", """
    <svg id="c10-wifi" viewBox="0 0 24 24"><path d="M2 8.5 C7.5 3.5 16.5 3.5 22 8.5" fill="none" stroke="#1e4d68" stroke-width="2" stroke-linecap="round"/><path d="M5 12 C9 8.6 15 8.6 19 12" fill="none" stroke="#1e4d68" stroke-width="2" stroke-linecap="round"/><path d="M8.3 15.4 C10.4 13.8 13.6 13.8 15.7 15.4" fill="none" stroke="#1e4d68" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="19" r="1.6" fill="#1e4d68"/><path id="c10-slash" d="M3 3 L21 21" stroke="#cf5f43" stroke-width="2.4" stroke-linecap="round"/></svg>
    <svg id="c10-book" viewBox="0 0 38 46"><rect x="1" y="1" width="36" height="44" rx="3" fill="#fff" stroke="#1e4d68" stroke-width="1.6"/><path d="M7 10 H31 M7 16 H28 M7 22 H31 M7 28 H25 M7 34 H30" stroke="#9fb3c2" stroke-width="1.2"/><path d="M5 40 L33 6" stroke="#cf5f43" stroke-width="2" stroke-linecap="round"/></svg>
    <img id="c10-banner" class="ui" src="assets/off_banner.png" alt="Sin conexión con el servidor, se guarda todo localmente" />
    <img id="c10-rec" class="ui" src="assets/off_receipt.png" alt="Ticket pendiente de sincronizar" />
    <img id="c10-toast" class="ui" src="assets/off_toast.png" alt="Venta guardada, se sincronizará automáticamente" />
    <div id="c10-ring" class="ring"></div>
    <div id="c10-ok" class="card"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#2f9e77"/><path d="M7 12.4 L10.4 15.6 L17 8.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Todo sincronizado</div>
    <svg id="c10-cloud" viewBox="0 0 86 62"><path d="M22 34 C14 34 10 28 11 23 C12 17 18 14 23 16 C25 8 33 4 41 6 C48 7 52 12 53 17 C60 15 67 20 66 27 C72 28 75 33 72 37 C70 40 67 41 63 41 L24 41 C18 41 16 37 22 34 Z" fill="#fff" stroke="#1e4d68" stroke-width="2"/><path d="M33 26 L39 32 L51 20" fill="none" stroke="#2f9e77" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><g fill="none" stroke="#1e4d68" stroke-width="1.6"><rect x="6" y="50" width="16" height="10" rx="1.5"/><path d="M4 61 H24"/><rect x="38" y="48" width="9" height="14" rx="1.5"/><rect x="62" y="49" width="16" height="11" rx="1.5"/></g><path d="M14 49 L24 41 M42.5 47 V41 M70 48 L60 41" stroke="#9fb3c2" stroke-width="1.2" stroke-dasharray="2 2"/></svg>
    <div id="c10-cl" class="mask"><span id="c10-c1" class="h">Respaldada en la nube</span></div>
""", """
    pop("#c10-wifi", 0.5);
    tl.fromTo("#c10-slash", { strokeDasharray: 30, strokeDashoffset: 30 }, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }, at(1.7));
    pop("#c10-book", 3.6);
    gone("#c10-wifi", 5.8); gone("#c10-book", 5.8);
    tl.set("#c10-banner", { opacity: 1 }, at(6.0)); wipeX("#c10-banner", 6.0);
    ring("#c10-ring", 6.6);
    tl.set("#c10-rec", { opacity: 1 }, at(7.0)); wipe("#c10-rec", 7.0);
    slide("#c10-toast", 7.6, 140);
    tl.to("#c10-ring", { opacity: 0, duration: 0.2 }, at(8.6));
    gone("#c10-banner", 8.6); gone("#c10-rec", 8.6); gone("#c10-toast", 8.6);
    tl.set("#c10-slash", { opacity: 0 }, at(8.7)); pop("#c10-wifi", 8.7);
    pop("#c10-ok", 9.8);
    gone("#c10-wifi", 11.2); gone("#c10-ok", 11.2);
    pop("#c10-cloud", 11.4); rise("#c10-c1", 12.2);
""")

S["c11"] = ("""
    #c11-hist { left: 640px; top: 260px; width: 1200px; }
    #c11-ring { left: 1448px; top: 368px; width: 84px; height: 104px; }
    #c11-big { position: absolute; left: 640px; top: 600px; }
    #c11-big span { font-size: 120px; }
    #c11-sub { position: absolute; left: 640px; top: 750px; font-size: 46px; }
""", """
    <img id="c11-hist" class="ui" src="assets/caja_hist.png" alt="Historial de cierres de caja" />
    <div id="c11-ring" class="ring"></div>
    <div id="c11-big" class="mask"><span id="c11-b1" class="h">Q0.00</span></div>
    <div id="c11-sub" class="mask"><span id="c11-s1">de diferencia al cerrar</span></div>
""", """
    wipe("#c11-hist", 0.5); ring("#c11-ring", 2.4);
    rise("#c11-b1", 2.6, 0.6); rise("#c11-s1", 2.9);
""")

S["c12"] = ("""
    #c12-met { opacity: 0; }
    #c12-per { left: 640px; top: 140px; width: 1150px; }
    #c12-mar { left: 640px; top: 560px; width: 1150px; }
    #c12-met { left: 640px; top: 230px; width: 1150px; }
""", """
    <img id="c12-per" class="ui" src="assets/periodo.png" alt="Ventas por período" />
    <img id="c12-mar" class="ui" src="assets/margen.png" alt="Márgenes de ganancia por producto" />
    <img id="c12-met" class="ui" src="assets/metas.png" alt="Cumplimiento de metas por sucursal" />
""", """
    wipe("#c12-per", 2.2); wipe("#c12-mar", 3.8);
    gone("#c12-per", 5.3); gone("#c12-mar", 5.3);
    tl.set("#c12-met", { opacity: 1 }, at(5.5)); wipe("#c12-met", 5.5);
""")

S["c13"] = ("""
    #c13-proj { opacity: 0; }
    #c13-q { left: 700px; top: 130px; width: 1100px; border: 0; border-radius: 30px; }
    #c13-proj { left: 700px; top: 290px; width: 1100px; }
    #c13-cover { position: absolute; left: 752px; top: 432px; width: 1030px; height: 350px; background: #fff; opacity: 0; }
    #c13-ring { left: 980px; top: 293px; width: 262px; height: 114px; }
    #c13-end { position: absolute; left: 700px; top: 330px; }
    #c13-e1 { font-size: 96px; } #c13-e2 { font-size: 132px; margin-top: 10px; }
    #c13-e2 b { color: #cf5f43; }
""", """
    <img id="c13-q" class="ui" src="assets/ia2_q.png" alt="¿Cuánto tengo que vender por día para llegar a la meta de este mes en cada sucursal?" />
    <img id="c13-proj" class="ui" src="assets/ia2_proj.png" alt="Venta diaria necesaria por sucursal y proyección" />
    <div id="c13-cover"></div>
    <div id="c13-ring" class="ring"></div>
    <div id="c13-end"><div class="mask"><span id="c13-e1" class="h">Ya no decido a ciegas.</span></div><div class="mask"><span id="c13-e2" class="h">Decido con <b>datos.</b></span></div></div>
""", """
    tl.fromTo("#c13-q", { clipPath: "inset(0 100% 0 0 round 30px)" }, { clipPath: "inset(0 0% 0 0 round 30px)", duration: 2.2, ease: "steps(30)" }, at(1.6));
    tl.set("#c13-proj", { opacity: 1 }, at(4.6)); wipe("#c13-proj", 4.6);
    tl.set("#c13-cover", { opacity: 1 }, at(4.6));
    tl.fromTo("#c13-cover", { scaleX: 1, transformOrigin: "100% 50%" }, { scaleX: 0, duration: 1.4, ease: "power2.inOut" }, at(5.2));
    ring("#c13-ring", 9.3);
    gone("#c13-q", 14.2); gone("#c13-proj", 14.2); tl.to("#c13-ring", { opacity: 0, duration: 0.3 }, at(14.2));
    rise("#c13-e1", 14.6, 0.6); rise("#c13-e2", 15.9, 0.6);
""")

BARS = [("Ene", 250.9), ("Feb", 164.5), ("Mar", 129.4), ("Abr", 124.7), ("May", 144.7), ("Jun", 144.2), ("Jul", 137.7), ("Ago", 143.3), ("Sep", 146.1), ("Oct", 155.5)]
bars_html = "".join(
    f'<div class="c14-col"><div class="c14-bar" style="height:{v / 250.9 * 330:.0f}px;background:{"#e07a5f" if i == 0 else "#1e4d68"}"></div><span>{m}</span></div>'
    for i, (m, v) in enumerate(BARS))
S["c14"] = ("""
    #c14-chart { left: 640px; top: 140px; width: 1200px; height: 570px; padding: 34px 44px; }
    #c14-chart h3 { font-size: 36px; font-weight: 600; color: #121826; }
    #c14-bars { display: flex; align-items: flex-end; gap: 30px; height: 390px; margin-top: 26px; }
    .c14-col { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 80px; font-size: 28px; color: #5b6b78; }
    .c14-bar { width: 70px; border-radius: 10px 10px 4px 4px; }
    #c14-note { position: absolute; left: 1120px; top: 250px; font-size: 44px; font-weight: 700; color: #cf5f43; }
    #c14-stores { position: absolute; left: 640px; top: 750px; display: flex; gap: 40px; align-items: flex-end; }
    #c14-stores .store { width: 190px; height: 165px; }
    #c14-new { width: 190px; height: 165px; border: 6px dashed #1e4d68; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 84px; font-weight: 700; color: #1e4d68; }
""", f"""
    <div id="c14-chart" class="card"><h3>Ventas mensuales · Central Zona 1 · 2026</h3><div id="c14-bars">{bars_html}</div></div>
    <div id="c14-note" class="mask"><span id="c14-n1">Enero: 1.8× un mes normal</span></div>
    <div id="c14-stores"><div id="c14-s1">{STORE}</div><div id="c14-s2">{STORE}</div><div id="c14-s3">{STORE}</div><div id="c14-new">?</div></div>
""", """
    wipe("#c14-chart", 0.3);
    tl.fromTo(".c14-bar", { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.6, ease: "power3.out", stagger: 0.07 }, at(0.6));
    rise("#c14-n1", 2.5);
    pop("#c14-s1", 4.3); pop("#c14-s2", 4.45); pop("#c14-s3", 4.6); pop("#c14-new", 5.2);
""")

S["c15"] = ("""
    #c15-b { opacity: 0; }
    .c15-st { position: absolute; left: 640px; top: 300px; width: 1200px; display: flex; align-items: center; gap: 50px; }
    .c15-st svg { width: 220px; height: 220px; flex: none; }
    .c15-st .h { font-size: 92px; }
    .c15-st p { font-size: 46px; margin-top: 14px; }
""", """
    <div class="c15-st" id="c15-a"><svg viewBox="0 0 24 24"><path d="M10 3 h4 v3 a2 2 0 0 0 4 0 v-1 h3 v6 h-1 a2 2 0 0 0 0 4 h1 v6 h-6 v-1 a2 2 0 0 0 -4 0 v1 H3 v-6 h1 a2 2 0 0 0 0 -4 H3 V5 h7 Z" fill="#f4c542" stroke="#1e4d68" stroke-width="1.4" stroke-linejoin="round"/></svg><div><div class="mask"><span class="h" id="c15-a1">A su medida</span></div><div class="mask"><p id="c15-a2">Si su negocio necesita algo distinto, lo adecuamos.</p></div></div></div>
    <div class="c15-st" id="c15-b"><svg viewBox="0 0 24 24"><path d="M12 22 C12 22 4.5 14.6 4.5 9.4 A7.5 7.5 0 0 1 19.5 9.4 C19.5 14.6 12 22 12 22 Z" fill="#e07a5f" stroke="#1e4d68" stroke-width="1.4"/><circle cx="12" cy="9.4" r="2.8" fill="#fff"/></svg><div><div class="mask"><span class="h" id="c15-b1">Hecho en Guatemala</span></div><div class="mask"><p id="c15-b2">Para emprendedores como usted.</p></div></div></div>
""", """
    pop("#c15-a svg", 0.3); rise("#c15-a1", 0.6); rise("#c15-a2", 1.6);
    gone("#c15-a", 4.15);
    tl.set("#c15-b", { opacity: 1 }, at(4.3)); pop("#c15-b svg", 4.3); rise("#c15-b1", 4.9); rise("#c15-b2", 6.0);
""")

S["c16"] = ("""
    #c16-list { position: absolute; left: 640px; top: 250px; }
    #c16-list .h { font-size: 96px; }
    #c16-end { position: absolute; left: 0; right: 0; top: 330px; text-align: center; }
    #c16-lock { display: flex; justify-content: center; align-items: center; gap: 40px; }
    #c16-iso { width: 150px; height: 168px; overflow: visible; }
    #c16-word { font-family: "Inter", sans-serif; font-size: 136px; font-weight: 700; letter-spacing: 0.05em; color: #1e4d68; line-height: 1; }
    #c16-c1 { font-size: 56px; margin-top: 70px; }
    #c16-c2 { font-size: 80px; font-weight: 700; color: #1e4d68; margin-top: 10px; }
""", """
    <div id="c16-list"><div class="mask"><span class="h" id="c16-l1">Más ventas.</span></div><div class="mask"><span class="h" id="c16-l2">Inventario bajo control.</span></div><div class="mask"><span class="h" id="c16-l3">Tranquilidad.</span></div></div>
    <div id="c16-end">
      <div id="c16-lock"><svg id="c16-iso" viewBox="5 5 120 135"><path id="c16-hex" d="M 65,15 L 115,44 L 115,101 L 65,130 L 15,101 L 15,44 Z" fill="none" stroke="#1E4D68" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/><line id="c16-diag" x1="15" y1="101" x2="115" y2="44" stroke="#1E4D68" stroke-width="8" stroke-linecap="round"/><path id="c16-chev" d="M 28,107 L 65,42 L 102,107" fill="none" stroke="#E07A5F" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/></svg><div class="mask"><span id="c16-word">DENGO</span></div></div>
      <div class="mask"><span id="c16-c1">Agende su demo por WhatsApp</span></div>
      <div class="mask"><span id="c16-c2" data-var-text="whatsapp">+502 5568-3004</span></div>
    </div>
""", """
    rise("#c16-l1", 0.3); rise("#c16-l2", 1.2); rise("#c16-l3", 2.8);
    tl.to("#c16-list", { opacity: 0, duration: 0.35 }, at(4.9));
    tl.fromTo("#c16-hex", { strokeDasharray: 360, strokeDashoffset: 360 }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" }, at(5.1));
    tl.fromTo("#c16-diag", { strokeDasharray: 120, strokeDashoffset: 120 }, { strokeDashoffset: 0, duration: 0.4 }, at(5.7));
    tl.fromTo("#c16-chev", { strokeDasharray: 160, strokeDashoffset: 160 }, { strokeDashoffset: 0, duration: 0.5, ease: "power3.out" }, at(5.9));
    tl.fromTo("#c16-word", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power3.inOut" }, at(6.2));
    rise("#c16-c1", 6.6); rise("#c16-c2", 6.9);
""")

for k, (style, markup, js) in S.items():
    open(os.path.join(ROOT, "scenes", f"{k}.html"), "w", encoding="utf-8").write(style + "<!--markup-->" + markup + "<!--script-->" + js)
print("ok", len(S))
