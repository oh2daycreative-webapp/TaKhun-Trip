"use strict";
(function createAdminDashboard(global) {
  const CARDS = Object.freeze([
    Object.freeze({key:"total_places",label:"สถานที่ทั้งหมด"}),
    Object.freeze({key:"total_routes",label:"เส้นทางทั้งหมด"}),
    Object.freeze({key:"total_products",label:"สินค้าและบริการ"}),
    Object.freeze({key:"total_events",label:"กิจกรรมทั้งหมด"}),
    Object.freeze({key:"pending_reviews",label:"รีวิวรอตรวจสอบ"}),
    Object.freeze({key:"total_gallery",label:"ภาพและวิดีโอ"})
  ]);
  const DESTINATIONS = Object.freeze([
    Object.freeze({key:"places",href:"places.html",noun:"สถานที่"}),
    Object.freeze({key:"routes",href:"routes.html",noun:"เส้นทาง"}),
    Object.freeze({key:"products",href:"products.html",noun:"สินค้าและบริการ"}),
    Object.freeze({key:"events",href:"events.html",noun:"กิจกรรม"}),
    Object.freeze({key:"reviews",href:"reviews.html",noun:"รีวิว"}),
    Object.freeze({key:"gallery",href:"gallery.html",noun:"ภาพและวิดีโอ"})
  ]);

  function quickLinks(role) {
    const writer = role === "super_admin" || role === "editor";
    return DESTINATIONS.map(item => ({
      href:item.href,
      label:writer ? `จัดการ${item.noun}` : role === "reviewer" && item.key === "reviews" ? "ตรวจรีวิว" : `ดู${item.noun}`
    }));
  }

  function createController(api, view) {
    let pending = null;
    function load(token) {
      if (pending) return pending;
      view.loading();
      let request;
      try { request=api.getDashboard(token); }
      catch (error) { view.error(); return Promise.reject(error); }
      pending = Promise.resolve(request).then(data => {
        const empty = CARDS.every(card => data[card.key] === 0);
        view.success(data,{empty,warning:data.warnings.length > 0});
        return data;
      }, error => {
        view.error();
        throw error;
      }).finally(() => { pending = null; });
      return pending;
    }
    return Object.freeze({load});
  }

  function initDom(token, role) {
    const root=global.document.querySelector("[data-admin-dashboard]");
    if (!root) return null;
    const status=root.querySelector("[data-dashboard-status]");
    const retry=root.querySelector("[data-dashboard-retry]");
    const links=root.querySelector("[data-dashboard-links]");
    const counts=Object.fromEntries(CARDS.map(card=>[card.key,root.querySelector(`[data-dashboard-count="${card.key}"]`)]));
    function setCounts(value){CARDS.forEach(card=>{counts[card.key].textContent=value===null?"—":String(value[card.key]);});}
    const view={
      loading(){setCounts(null);status.textContent="กำลังโหลดข้อมูลภาพรวม…";status.setAttribute("role","status");retry.hidden=true;retry.disabled=true;},
      success(data,state){setCounts(data);retry.hidden=true;retry.disabled=false;status.setAttribute("role","status");status.textContent=state.warning?"โหลดข้อมูลแล้ว โดยไม่นับบางแถวที่ข้อมูลไม่ถูกต้องหรือมีรหัสซ้ำ":state.empty?"ยังไม่มีข้อมูลที่นับได้ในขณะนี้":"โหลดข้อมูลภาพรวมแล้ว";},
      error(){setCounts(null);status.textContent="ไม่สามารถโหลดข้อมูลภาพรวมได้ กรุณาลองอีกครั้ง";status.setAttribute("role","alert");retry.hidden=false;retry.disabled=false;retry.focus();}
    };
    links.replaceChildren();
    quickLinks(role).forEach(item=>{const link=global.document.createElement("a");link.className="admin-dashboard__link";link.href=item.href;link.textContent=item.label;links.appendChild(link);});
    const controller=createController(global.TakhunAdminApi,view);
    retry.addEventListener("click",()=>controller.load(token).catch(()=>{}));
    controller.load(token).catch(()=>{});
    return controller;
  }

  async function init() {
    const result=await global.TakhunAdminShell.init();
    if (!result || result.status !== "authenticated") return null;
    const session=global.TakhunAdminAuth.readSession();
    if (!session || !session.token) return null;
    return initDom(session.token,result.admin&&result.admin.role||session.role);
  }

  global.TakhunAdminDashboard=Object.freeze({quickLinks,createController,init});
})(window);
