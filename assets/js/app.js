(function () {
  'use strict';

  const U = window.BENT_UTIL;
  const I = window.BENT_IMAGE;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    supabase: null,
    session: null,
    profile: null,
    hospital: null,
    masters: { components: [], antigens: [], sources: [], hospitals: [] },
    announcements: [],
    currentView: 'dashboard',
    editingAnnouncement: null,
    compressedImage: null,
    installPrompt: null,
    adminTab: 'requests',
    filters: {},
    initialized: false,
    setupToken: null
  };

  const screens = {
    setup: $('#setupScreen'), auth: $('#authScreen'), passwordSetup: $('#passwordSetupScreen'), pending: $('#pendingScreen'), app: $('#appShell')
  };
  const main = $('#mainContent');

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
  }

  function toast(title, message = '', type = 'info', ms = 4500) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<b>${U.esc(title)}</b>${message ? `<p>${U.esc(message)}</p>` : ''}`;
    $('#toastHost').appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function loading() {
    main.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';
  }

  function setPage(title, subtitle = 'Blood Exchange Network Thailand') {
    $('#pageTitle').textContent = title;
    $('#pageSubtitle').textContent = subtitle;
  }

  function setButtonBusy(button, busy, label = 'กำลังบันทึก...') {
    if (!button) return;
    if (busy) {
      button.dataset.original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner"></span>${U.esc(label)}`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.original || button.innerHTML;
    }
  }

  function configIsValid() {
    const c = window.BENT_CONFIG || {};
    return c.SUPABASE_URL?.startsWith('https://') && !c.SUPABASE_URL.includes('YOUR-PROJECT')
      && c.SUPABASE_PUBLISHABLE_KEY && !c.SUPABASE_PUBLISHABLE_KEY.includes('YOUR_')
      && c.APPS_SCRIPT_WEB_APP_URL?.startsWith('https://')
      && !c.APPS_SCRIPT_WEB_APP_URL.includes('YOUR_DEPLOYMENT_ID');
  }

  function renderSetupScreen() {
    showScreen('setup');
    screens.setup.innerHTML = `
      <div class="setup-card">
        <img src="assets/icons/icon-192.png" alt="BENT" class="status-logo">
        <h1>ยังไม่ได้เชื่อมต่อ Supabase</h1>
        <p>ไฟล์แอปครบแล้ว แต่ต้องใส่ค่าของโครงการก่อนเปิดใช้งานจริง</p>
        <div class="notice warning">
          <b>แก้ไฟล์ <code>assets/js/config.js</code></b>
          <p>แทนค่า <code>SUPABASE_URL</code>, <code>SUPABASE_PUBLISHABLE_KEY</code> และ <code>APPS_SCRIPT_WEB_APP_URL</code> ตามคู่มือ <code>INSTALLATION_TH.md</code></p>
        </div>
        <div class="info-box">
          <b>ห้ามใส่ Service Role Key ในหน้าเว็บ</b>
          <p>หน้าเว็บใช้เฉพาะ Publishable Key หรือ Anon Key เท่านั้น ส่วน Service Role Key เก็บใน Apps Script Properties ตามคู่มือติดตั้ง</p>
        </div>
      </div>`;
  }

  async function init() {
    bindStaticEvents();
    registerPwa();
    updateConnectionState();
    if (!configIsValid()) {
      renderSetupScreen();
      return;
    }

    state.supabase = window.supabase.createClient(
      window.BENT_CONFIG.SUPABASE_URL,
      window.BENT_CONFIG.SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );

    state.setupToken = new URLSearchParams(location.search).get('setup');
    if (state.setupToken) {
      showScreen('passwordSetup');
      await inspectPasswordSetupToken();
      state.initialized = true;
      return;
    }

    state.supabase.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;
      await routeSession();
    });

    const { data, error } = await state.supabase.auth.getSession();
    if (error) toast('เปิด Session ไม่สำเร็จ', U.friendlyError(error), 'error');
    state.session = data?.session || null;
    await routeSession();
    state.initialized = true;
  }

  async function inspectPasswordSetupToken() {
    const status = $('#setupTokenStatus');
    const form = $('#passwordSetupForm');
    const back = $('#backToLoginBtn');
    try {
      const data = await I.call({ action: 'check_setup_token', setup_token: state.setupToken });
      status.textContent = `ลิงก์พร้อมใช้งานสำหรับ ${data.masked_email || 'บัญชีนี้'} กรุณาตั้งรหัสผ่านอย่างน้อย 10 ตัวอักษร`;
      form.classList.remove('hidden');
      back.classList.add('hidden');
    } catch (error) {
      status.textContent = U.friendlyError(error);
      form.classList.add('hidden');
      back.classList.remove('hidden');
    }
  }

  async function saveSetupPassword(event) {
    event.preventDefault();
    const button = $('#saveSetupPasswordBtn');
    const password = $('#setupPassword').value;
    const confirm = $('#setupPasswordConfirm').value;
    try {
      if (password.length < 10) throw new Error('PASSWORD_TOO_SHORT');
      if (password !== confirm) throw new Error('PASSWORDS_NOT_MATCH');
      setButtonBusy(button, true, 'กำลังบันทึก...');
      await I.call({ action: 'set_password', setup_token: state.setupToken, new_password: password });
      try { await state.supabase.auth.signOut(); } catch (_) {}
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('setup');
      history.replaceState({}, '', cleanUrl.toString());
      state.setupToken = null;
      event.target.reset();
      showScreen('auth');
      openModal('ตั้งรหัสผ่านสำเร็จ', 'บัญชีพร้อมใช้งานแล้ว', `<p>เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่เพิ่งกำหนดได้ทันที</p><div class="modal-actions"><button class="btn btn-primary" data-close-modal>เข้าสู่ระบบ</button></div>`);
    } catch (error) {
      toast('ตั้งรหัสผ่านไม่สำเร็จ', U.friendlyError(error), 'error');
    } finally {
      setButtonBusy(button, false);
    }
  }

  function returnToLogin() {
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete('setup');
    location.href = cleanUrl.toString();
  }

  async function routeSession() {
    if (!state.session?.user) {
      state.profile = null;
      showScreen('auth');
      return;
    }

    const { data: profile, error } = await state.supabase
      .from('bent_profiles').select('*').eq('id', state.session.user.id).maybeSingle();

    if (error) {
      showScreen('pending');
      $('#pendingTitle').textContent = 'อ่านข้อมูลบัญชีไม่สำเร็จ';
      $('#pendingMessage').textContent = U.friendlyError(error);
      return;
    }

    state.profile = profile;
    if (!profile || profile.status !== 'active' || !profile.hospital_id) {
      renderPending(profile);
      return;
    }

    await enterApp();
  }

  function renderPending(profile) {
    showScreen('pending');
    const status = profile?.status || 'pending';
    const titleMap = {
      pending: 'บัญชีอยู่ระหว่างตรวจสอบ',
      rejected: 'บัญชียังไม่ได้รับอนุมัติ',
      suspended: 'บัญชีถูกระงับชั่วคราว',
      inactive: 'บัญชีถูกปิดใช้งาน'
    };
    const msgMap = {
      pending: 'ผู้ดูแลระบบจะตรวจสอบโรงพยาบาลและข้อมูลผู้สมัครก่อนเปิดใช้งาน',
      rejected: 'กรุณาติดต่อผู้ดูแลระบบเพื่อสอบถามข้อมูลที่ต้องแก้ไข',
      suspended: 'กรุณาติดต่อผู้ดูแลระบบ BENT',
      inactive: 'กรุณาติดต่อผู้ดูแลระบบหากต้องการเปิดใช้งานอีกครั้ง'
    };
    $('#pendingBadge').textContent = U.statusLabel[status] || status;
    $('#pendingBadge').className = `badge badge-${status}`;
    $('#pendingTitle').textContent = titleMap[status] || 'บัญชียังไม่พร้อมใช้งาน';
    $('#pendingMessage').textContent = msgMap[status] || 'กรุณาติดต่อผู้ดูแลระบบ';
  }

  async function enterApp() {
    showScreen('app');
    loading();
    try {
      await loadMasters();
      state.hospital = state.masters.hospitals.find(h => h.id === state.profile.hospital_id) || null;
      await loadAnnouncements();
      renderNavigation();
      renderUserBlock();
      await navigate(state.currentView || 'dashboard');
      showOnboardingOnce();
    } catch (error) {
      main.innerHTML = `<div class="notice danger"><b>โหลดข้อมูลไม่สำเร็จ</b><p>${U.esc(U.friendlyError(error))}</p><button class="btn btn-primary" data-action="reload-app">ลองอีกครั้ง</button></div>`;
    }
  }

  async function loadMasters() {
    const [components, antigens, sources, hospitals] = await Promise.all([
      state.supabase.from('bent_components').select('*').order('sort_order'),
      state.supabase.from('bent_antigens').select('*').order('sort_order'),
      state.supabase.from('bent_blood_sources').select('*').order('sort_order'),
      state.supabase.from('bent_hospitals').select('*').order('name')
    ]);
    for (const result of [components, antigens, sources, hospitals]) {
      if (result.error) throw result.error;
    }
    state.masters.components = components.data || [];
    state.masters.antigens = antigens.data || [];
    state.masters.sources = sources.data || [];
    state.masters.hospitals = hospitals.data || [];
  }

  async function loadAnnouncements() {
    const { data, error } = await state.supabase.from('bent_announcements').select(`
      *,
      component:bent_components(id,code,display_name,is_active),
      source:bent_blood_sources(id,code,display_name,requires_detail,is_active),
      hospital:bent_hospitals(id,name,province,is_active),
      images:bent_announcement_images(id,image_file_name,image_status,uploaded_at)
    `).order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    state.announcements = data || [];
  }

  function isAdmin() { return state.profile?.role === 'system_admin'; }
  function canManage(item) { return isAdmin() || item.hospital_id === state.profile?.hospital_id; }
  function activeMasters(list) { return list.filter(x => x.is_active); }

  function renderNavigation() {
    const items = [
      ['dashboard', 'OV', 'ภาพรวม'],
      ['browse', 'ค้น', 'ค้นหาประกาศ'],
      ['create', 'เพิ่ม', 'สร้างประกาศ'],
      ['mine', 'รพ.', 'รายการของโรงพยาบาลฉัน'],
      ['guide', 'คู่มือ', 'คู่มือการใช้งาน']
    ];
    let html = items.map(([view, icon, label]) => `<button class="nav-btn ${state.currentView === view ? 'active' : ''}" data-view="${view}"><span class="nav-icon">${icon}</span>${label}</button>`).join('');
    if (isAdmin()) {
      html += '<div class="nav-divider"></div><div class="nav-group">ผู้ดูแลระบบ</div>';
      html += '<button class="nav-btn" data-view="admin"><span class="nav-icon">ADM</span>จัดการระบบ</button>';
    }
    $('#mainNav').innerHTML = html;
  }

  function renderUserBlock() {
    const name = state.profile.full_name || state.profile.email;
    $('#sidebarUser').innerHTML = `<strong>${U.esc(name)}</strong><span>${U.esc(state.hospital?.name || 'ยังไม่พบโรงพยาบาล')}</span>`;
  }

  async function navigate(view, options = {}) {
    state.currentView = view;
    if (view !== 'create') state.editingAnnouncement = null;
    renderNavigation();
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (view === 'dashboard') renderDashboard();
    else if (view === 'browse') renderBrowse();
    else if (view === 'create') renderAnnouncementForm(options.item || state.editingAnnouncement);
    else if (view === 'mine') renderMine();
    else if (view === 'guide') renderGuide();
    else if (view === 'admin' && isAdmin()) await renderAdmin();
    else { state.currentView = 'dashboard'; renderDashboard(); }
    main.focus({ preventScroll: true });
  }

  function activeAnnouncements() {
    return state.announcements.filter(a => ['open', 'coordinating'].includes(a.status));
  }

  function renderDashboard() {
    setPage('ภาพรวม', `โรงพยาบาลของคุณ: ${state.hospital?.name || '-'}`);
    const active = activeAnnouncements();
    const offer = active.filter(a => a.announcement_type === 'offer').length;
    const request = active.filter(a => a.announcement_type === 'request').length;
    const mine = state.announcements.filter(a => a.hospital_id === state.profile.hospital_id && ['open','coordinating'].includes(a.status)).length;
    const coordinating = active.filter(a => a.status === 'coordinating').length;
    main.innerHTML = `
      <div class="page-stack">
        <section class="hero-panel">
          <div><h2>ยินดีต้อนรับ ${U.esc(state.profile.full_name || '')}</h2><p>ค้นหาหรือแจ้งความต้องการผลิตภัณฑ์โลหิตได้จากหน้าจอนี้</p></div>
          <div class="hero-actions"><button class="btn" data-view="browse">ค้นหาประกาศ</button><button class="btn" data-view="create">สร้างประกาศ</button></div>
        </section>
        <section class="stat-grid">
          ${statCard('ประกาศที่กำลังเปิด', active.length, 'ทุกรายการที่บัญชีคุณเห็นได้')}
          ${statCard('มีเลือดพร้อมติดต่อ', offer, 'ประกาศ') }
          ${statCard('กำลังต้องการเลือด', request, 'ประกาศ') }
          ${statCard('ของโรงพยาบาลฉัน', mine, `กำลังประสานงาน ${coordinating} รายการ`)}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h2>เริ่มใช้งานจากตรงนี้</h2><p>เลือกตามสิ่งที่ต้องการทำ</p></div></div>
          <div class="panel-body quick-grid">
            <button class="quick-card" data-view="browse"><b>ค้นหาเลือดหรือความต้องการ</b><span>กรองตามผลิตภัณฑ์ หมู่เลือด แอนติเจน และโรงพยาบาล</span></button>
            <button class="quick-card" data-action="create-offer"><b>ประกาศว่ามีเลือด</b><span>ระบุจำนวน วันหมดอายุ และแหล่งที่มาของเลือด</span></button>
            <button class="quick-card" data-action="create-request"><b>ประกาศว่าต้องการเลือด</b><span>ระบุจำนวน วันที่ต้องการ และระดับความเร่งด่วน</span></button>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h2>ประกาศล่าสุด</h2><p>รายการที่ยังเปิดรับการติดต่อ</p></div><button class="btn btn-soft" data-view="browse">ดูทั้งหมด</button></div>
          <div class="panel-body"><div class="announcement-grid">${active.slice(0, 4).map(renderAnnouncementCard).join('') || emptyState('ยังไม่มีประกาศที่เปิดอยู่','เริ่มสร้างประกาศแรกของโรงพยาบาลคุณได้เลย')}</div></div>
        </section>
        <div class="notice warning"><b>ข้อควรจำ</b><p>BENT ใช้ช่วยค้นหาและติดต่อเท่านั้น โรงพยาบาลผู้รับต้องตรวจสอบผลิตภัณฑ์ เอกสาร คุณภาพ การขนส่ง และดำเนินการตาม SOP ก่อนรับหรือจ่ายผลิตภัณฑ์โลหิต</p></div>
      </div>`;
  }

  function statCard(label, number, small) {
    return `<div class="stat-card"><span>${U.esc(label)}</span><strong>${Number(number || 0).toLocaleString('th-TH')}</strong><small>${U.esc(small || '')}</small></div>`;
  }

  function renderBrowse() {
    setPage('ค้นหาประกาศ', 'เลือกเงื่อนไขที่ต้องการค้นหาได้มากกว่าหนึ่งรายการ');
    const f = state.filters || {};
    const selectedAntigens = Array.isArray(f.antigens) ? f.antigens : (f.antigen ? [f.antigen] : []);
    main.innerHTML = `
      <div class="page-stack">
        <section class="filters" id="announcementFilters">
          <label class="filter-search">ค้นหาคำ<input id="filterText" value="${U.esc(f.text || '')}" placeholder="ชื่อผลิตภัณฑ์ โรงพยาบาล หรือแหล่งที่มา"></label>
          <label>ประเภทประกาศ<select id="filterType"><option value="">ทั้งหมด</option><option value="offer">มีเลือดพร้อมให้ติดต่อ</option><option value="request">ต้องการเลือด</option></select></label>
          <label>ผลิตภัณฑ์โลหิต<select id="filterComponent"><option value="">ทั้งหมด</option>${activeMasters(state.masters.components).map(c => `<option value="${c.id}">${U.esc(c.display_name)}</option>`).join('')}</select></label>
          <label>หมู่เลือด ABO<select id="filterAbo"><option value="">ทั้งหมด</option>${['A','B','O','AB','not_specified'].map(x => `<option value="${x}">${x === 'not_specified' ? 'ไม่ระบุ' : x}</option>`).join('')}</select></label>
          <label>หมู่เลือด Rh<select id="filterRh"><option value="">ทั้งหมด</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="not_specified">ไม่ระบุ</option></select></label>
          <label>โรงพยาบาล<select id="filterHospital"><option value="">ทั้งหมด</option>${activeMasters(state.masters.hospitals).map(h => `<option value="${h.id}">${U.esc(h.name)}</option>`).join('')}</select></label>
          <label>สถานะประกาศ<select id="filterStatus"><option value="">รายการที่ยังติดต่อได้ทั้งหมด</option><option value="open">เปิดรับการติดต่อ</option><option value="coordinating">กำลังประสานงาน</option></select></label>
          <label>แหล่งที่มาของเลือด<select id="filterSource"><option value="">ทั้งหมด</option>${activeMasters(state.masters.sources).map(s => `<option value="${s.id}">${U.esc(s.display_name)}</option>`).join('')}</select></label>
          <label>รูปประกอบ<select id="filterImage"><option value="">ทั้งหมด</option><option value="yes">มีรูป</option><option value="no">ไม่มีรูป</option></select></label>
          <div class="filter-antigen-field">
            <div class="filter-antigen-heading"><div><b>แอนติเจนที่ต้องการผลลบ</b><span>เลือกได้หลายรายการ โดยผลค้นหาต้องมีครบทุกตัวที่เลือก</span></div><small id="filterAntigenCount">ยังไม่ได้เลือก</small></div>
            <div class="filter-antigen-picker">${activeMasters(state.masters.antigens).map(a => `<label class="antigen-option"><input type="checkbox" name="filterAntigen" value="${U.esc(a.code)}" ${selectedAntigens.includes(a.code) ? 'checked' : ''}><span>${U.esc(a.display_name)}-</span></label>`).join('')}</div>
          </div>
          <button class="btn btn-ghost filter-clear" data-action="clear-filters">ล้างตัวกรองทั้งหมด</button>
        </section>
        <div class="result-head"><div><h2>ผลการค้นหา</h2><p id="resultCount"></p></div><button class="btn btn-primary" data-view="create">สร้างประกาศ</button></div>
        <section id="announcementResults" class="announcement-grid"></section>
      </div>`;
    Object.entries({ Type:'type', Component:'component', Abo:'abo', Rh:'rh', Hospital:'hospital', Status:'status', Source:'source', Image:'image' }).forEach(([id, key]) => {
      const el = $(`#filter${id}`); if (el && f[key]) el.value = f[key];
    });
    applyAnnouncementFilters();
    const handler = U.debounce(() => applyAnnouncementFilters(), 120);
    $$('#announcementFilters input,#announcementFilters select').forEach(el => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', handler));
  }

  function collectFilters() {
    return {
      text: $('#filterText')?.value.trim().toLowerCase() || '', type: $('#filterType')?.value || '',
      component: $('#filterComponent')?.value || '', abo: $('#filterAbo')?.value || '', rh: $('#filterRh')?.value || '',
      antigens: $$('input[name="filterAntigen"]:checked').map(x => x.value), hospital: $('#filterHospital')?.value || '', status: $('#filterStatus')?.value || '',
      source: $('#filterSource')?.value || '', image: $('#filterImage')?.value || ''
    };
  }

  function applyAnnouncementFilters() {
    const f = collectFilters(); state.filters = f;
    let rows = activeAnnouncements();
    rows = rows.filter(a => {
      const searchable = [a.component?.display_name, a.other_component, a.hospital?.name, a.source?.display_name, a.blood_source_detail, a.contact_name].join(' ').toLowerCase();
      const hasImage = (a.images || []).some(i => i.image_status === 'active');
      const announcementAntigens = a.phenotype_negative || [];
      return (!f.text || searchable.includes(f.text))
        && (!f.type || a.announcement_type === f.type)
        && (!f.component || a.component_id === f.component)
        && (!f.abo || a.abo === f.abo)
        && (!f.rh || a.rh === f.rh)
        && (!f.antigens.length || f.antigens.every(code => announcementAntigens.includes(code)))
        && (!f.hospital || a.hospital_id === f.hospital)
        && (!f.status || a.status === f.status)
        && (!f.source || a.blood_source_id === f.source)
        && (!f.image || (f.image === 'yes' ? hasImage : !hasImage));
    });
    const antigenCount = $('#filterAntigenCount');
    if (antigenCount) antigenCount.textContent = f.antigens.length ? `เลือก ${f.antigens.length} รายการ` : 'ยังไม่ได้เลือก';
    $('#resultCount').textContent = `พบ ${rows.length.toLocaleString('th-TH')} รายการ`;
    $('#announcementResults').innerHTML = rows.map(renderAnnouncementCard).join('') || emptyState('ไม่พบรายการที่ตรงกับตัวกรอง','ลองลดเงื่อนไขบางช่อง หรือสร้างประกาศใหม่');
  }

  function renderMine() {
    setPage('รายการของโรงพยาบาลฉัน', state.hospital?.name || '');
    const rows = state.announcements.filter(a => a.hospital_id === state.profile.hospital_id);
    main.innerHTML = `
      <div class="page-stack">
        <section class="hero-panel"><div><h2>ประวัติของโรงพยาบาล</h2><p>ดูได้ทั้งรายการเปิด กำลังประสานงาน ปิด ยกเลิก และหมดอายุ</p></div><div class="hero-actions"><button class="btn" data-view="create">สร้างประกาศใหม่</button></div></section>
        <div class="result-head"><div><h2>ทั้งหมด ${rows.length.toLocaleString('th-TH')} รายการ</h2><p>รายการปิดแล้วเก็บไว้เป็นประวัติ แต่รูปจะถูกซ่อนและเข้าสู่กระบวนการลบ</p></div></div>
        <section class="announcement-grid">${rows.map(renderAnnouncementCard).join('') || emptyState('โรงพยาบาลยังไม่มีประกาศ','สร้างประกาศได้จากปุ่มด้านบน')}</section>
      </div>`;
  }

  function renderAnnouncementCard(a) {
    const antigen = a.phenotype_negative || [];
    const dateLabel = a.announcement_type === 'offer' ? 'หมดอายุ' : 'ต้องการภายใน';
    const dateValue = a.announcement_type === 'offer' ? a.expiry_date : a.needed_by;
    const image = (a.images || []).find(i => i.image_status === 'active');
    const manageable = canManage(a);
    const componentName = a.component?.code === 'OTHER' && a.other_component ? a.other_component : a.component?.display_name || '-';
    return `
      <article class="announcement-card ${a.announcement_type}">
        <div class="card-head">
          <div><span class="badge badge-${a.announcement_type}">${U.typeLabel[a.announcement_type]}</span><div class="card-title">${U.esc(componentName)} ${U.esc(a.abo === 'not_specified' ? '' : a.abo)} Rh ${U.esc(U.rhLabel[a.rh])}</div><div class="card-subtitle">สร้าง ${U.fmtDateTime(a.created_at)}</div></div>
          <span class="badge badge-${a.status}">${U.esc(U.statusLabel[a.status] || a.status)}</span>
        </div>
        <div class="card-facts">
          <div class="fact"><span>จำนวนคงเหลือ/ต้องการ</span><b>${a.quantity_remaining} Unit</b></div>
          <div class="fact"><span>${dateLabel}</span><b>${U.fmtDate(dateValue)}</b></div>
          ${a.announcement_type === 'request' ? `<div class="fact"><span>ความเร่งด่วน</span><b>${U.esc(U.urgencyLabel[a.urgency] || '-')}</b></div>` : ''}
          ${a.announcement_type === 'offer' ? `<div class="fact"><span>แหล่งที่มา</span><b>${U.esc(a.source?.display_name || '-')}</b></div>` : ''}
        </div>
        ${antigen.length ? `<div><span class="card-kicker">แอนติเจนที่ต้องการผลลบ</span><div class="antigen-line">${antigen.map(x => `<span class="antigen-chip">${U.esc(x)}-</span>`).join('')}</div></div>` : ''}
        ${a.blood_source_detail ? `<div class="info-box"><b>รายละเอียดแหล่งที่มา</b><p>${U.esc(a.blood_source_detail)}</p></div>` : ''}
        ${image ? `<button class="image-button" data-action="view-image" data-id="${a.id}">ดูรูปภาพประกอบ (ไม่ใช้แทนการตรวจสอบตาม SOP)</button>` : ''}
        <div class="hospital-line"><b>${U.esc(a.hospital?.name || '-')}</b><span>${U.esc(a.hospital?.province || '')} · ผู้ติดต่อ ${U.esc(a.contact_name)}</span></div>
        <div class="card-actions">
          <button class="btn btn-primary" data-action="detail" data-id="${a.id}">ดูรายละเอียดและติดต่อ</button>
          ${manageable && a.status === 'open' ? `<button class="btn btn-soft" data-action="coordinate" data-id="${a.id}">กำลังประสานงาน</button>` : ''}
          ${manageable && image && ['open','coordinating'].includes(a.status) ? `<button class="btn btn-ghost" data-action="remove-image" data-id="${a.id}">ลบรูป</button>` : ''}
          ${manageable && ['open','coordinating'].includes(a.status) ? `<button class="btn btn-secondary" data-action="edit" data-id="${a.id}">แก้ไข</button><button class="btn btn-secondary" data-action="close" data-id="${a.id}">ปิดรายการ</button><button class="btn btn-ghost" data-action="cancel" data-id="${a.id}">ยกเลิก</button>` : ''}
        </div>
      </article>`;
  }

  function emptyState(title, text) {
    return `<div class="empty-state"><h3>${U.esc(title)}</h3><p>${U.esc(text)}</p></div>`;
  }

  function renderAnnouncementForm(item = null, presetType = null) {
    state.editingAnnouncement = item || null;
    state.compressedImage = null;
    const type = item?.announcement_type || presetType || '';
    const componentId = item?.component_id || '';
    const sourceId = item?.blood_source_id || activeMasters(state.masters.sources)[0]?.id || '';
    const antigens = item?.phenotype_negative || [];
    const existingImage = (item?.images || []).find(i => i.image_status !== 'deleted');
    setPage(item ? 'แก้ไขประกาศ' : 'สร้างประกาศ', item ? 'แก้ไขได้เฉพาะรายการที่ยังเปิดอยู่' : 'กรอกเฉพาะข้อมูลที่ใช้ค้นหาและติดต่อ');

    main.innerHTML = `
      <form id="announcementForm" class="form-layout" novalidate>
        <div>
          <section class="form-section">
            <h2>${item ? 'ข้อมูลประกาศ' : '1. เลือกประเภทประกาศ'}</h2><p>${item ? 'ประเภทประกาศเปลี่ยนภายหลังไม่ได้' : 'เลือกว่ามีเลือดพร้อมให้ติดต่อ หรือกำลังต้องการเลือด'}</p>
            <div class="segmented">
              <label class="segment-option"><input type="radio" name="announcementType" value="offer" ${type === 'offer' ? 'checked' : ''} ${item ? 'disabled' : ''}><span>มีเลือดพร้อมให้ติดต่อ</span></label>
              <label class="segment-option"><input type="radio" name="announcementType" value="request" ${type === 'request' ? 'checked' : ''} ${item ? 'disabled' : ''}><span>ต้องการเลือด</span></label>
            </div>
            <div class="field-grid">
              <label>ผลิตภัณฑ์โลหิต<select id="annComponent" required><option value="" ${!componentId ? 'selected' : ''} disabled>-- กรุณาระบุ --</option>${activeMasters(state.masters.components).map(c => `<option value="${c.id}" data-code="${U.esc(c.code)}" ${c.id === componentId ? 'selected' : ''}>${U.esc(c.display_name)}</option>`).join('')}</select></label>
              <label id="otherComponentField" class="hidden">ระบุผลิตภัณฑ์อื่น<input id="annOtherComponent" maxlength="120" value="${U.esc(item?.other_component || '')}"></label>
              <label>หมู่เลือด ABO<select id="annAbo" required><option value="" ${!item?.abo ? 'selected' : ''} disabled>-- กรุณาระบุ --</option>${['A','B','O','AB','not_specified'].map(x => `<option value="${x}" ${item?.abo === x ? 'selected' : ''}>${x === 'not_specified' ? 'ไม่ระบุ' : x}</option>`).join('')}</select></label>
              <label>หมู่เลือด Rh<select id="annRh" required><option value="" ${!item?.rh ? 'selected' : ''} disabled>-- กรุณาระบุ --</option><option value="positive" ${item?.rh === 'positive' ? 'selected' : ''}>Positive</option><option value="negative" ${item?.rh === 'negative' ? 'selected' : ''}>Negative</option><option value="not_specified" ${item?.rh === 'not_specified' ? 'selected' : ''}>ไม่ระบุ</option></select></label>
              <label>จำนวนทั้งหมด (Unit)<input id="annQtyTotal" type="number" min="1" max="9999" required value="${item?.quantity_total ?? ''}" placeholder="-- กรุณาระบุ --"></label>
              ${item ? `<label>จำนวนคงเหลือ/ยังต้องการ (Unit)<input id="annQtyRemaining" type="number" min="0" max="${item.quantity_total}" required value="${item.quantity_remaining}"></label>` : ''}
            </div>
          </section>

          <section class="form-section">
            <h2>2. วันที่และรายละเอียดที่เกี่ยวข้อง</h2><p>ระบบจะแสดงช่องให้เหมาะกับประเภทประกาศ</p>
            <div id="offerFields" class="field-grid">
              <label>วันหมดอายุ<input id="annExpiry" type="date" value="${item?.expiry_date || ''}"></label>
              <label>แหล่งที่มา<select id="annSource">${activeMasters(state.masters.sources).map(s => `<option value="${s.id}" data-detail="${s.requires_detail}" ${s.id === sourceId ? 'selected' : ''}>${U.esc(s.display_name)}</option>`).join('')}</select></label>
              <label id="sourceDetailField" class="span-2 hidden">รายละเอียดแหล่งที่มา<input id="annSourceDetail" maxlength="180" value="${U.esc(item?.blood_source_detail || '')}" placeholder="เช่น ชื่อโรงพยาบาลหรือหน่วยงาน"></label>
            </div>
            <div id="requestFields" class="field-grid hidden">
              <label>ต้องการภายในวันที่<input id="annNeededBy" type="date" value="${item?.needed_by || ''}"></label>
              <label>ระดับความเร่งด่วน<select id="annUrgency"><option value="routine" ${item?.urgency === 'routine' ? 'selected' : ''}>ทั่วไป</option><option value="urgent" ${item?.urgency === 'urgent' ? 'selected' : ''}>เร่งด่วน</option><option value="immediate" ${item?.urgency === 'immediate' ? 'selected' : ''}>ด่วนมาก</option></select></label>
            </div>
          </section>

          <section class="form-section">
            <h2>3. แอนติเจนที่ต้องการผลลบ</h2><p>เลือกได้มากกว่าหนึ่งรายการ ช่องที่ไม่ได้เลือกหมายถึง “ไม่ระบุ” ไม่ได้หมายถึงผลบวก</p>
            <div class="antigen-picker">${activeMasters(state.masters.antigens).map(a => `<label class="antigen-option"><input type="checkbox" name="antigen" value="${U.esc(a.code)}" ${antigens.includes(a.code) ? 'checked' : ''}><span>${U.esc(a.display_name)}-</span></label>`).join('')}</div>
          </section>

          <section class="form-section">
            <h2>4. ผู้ติดต่อ</h2><p>เบอร์โทรจะแสดงเฉพาะบัญชีที่เข้าสู่ระบบและได้รับอนุมัติแล้ว</p>
            <div class="field-grid"><label>ชื่อผู้ติดต่อ<input id="annContactName" required maxlength="120" value="${U.esc(item?.contact_name || state.profile.full_name || '')}"></label><label>เบอร์โทรหน่วยงาน<input id="annContactPhone" required maxlength="30" value="${U.esc(item?.contact_phone || state.profile.phone || '')}"></label></div>
          </section>

          <section class="form-section">
            <h2>5. รูปภาพประกอบ (ไม่บังคับ)</h2><p>สูงสุด 1 รูป ระบบจะลดขนาดและลบข้อมูลแฝงทั่วไปก่อนส่ง</p>
            ${existingImage ? `<div class="notice success"><b>ประกาศนี้มีข้อมูลรูปอยู่แล้ว</b><p>สถานะ: ${U.esc(existingImage.image_status)} · หากต้องการเปลี่ยนรูป ให้ลบรูปเดิมก่อน แล้วกลับมาแก้ไขประกาศอีกครั้ง</p></div>` : `
              <div class="image-drop"><input id="annImage" type="file" accept="image/jpeg,image/png,image/webp"><p>รองรับ JPG, PNG, WebP ระบบตั้งเป้าหมายประมาณ 300–500 KB</p><img id="imagePreview" class="image-preview hidden" alt="ตัวอย่างรูป"><div id="imageInfo"></div><button id="removeSelectedImage" type="button" class="btn btn-ghost hidden">เอารูปออก</button></div>
              <div class="privacy-warning"><b>ห้ามมีข้อมูลต่อไปนี้ในรูป</b><br>ชื่อผู้ป่วย, HN, เลขบัตรประชาชน, Diagnosis, Donor ID, เลขถุงเลือด, Barcode, QR Code หรือข้อมูลที่ระบุตัวบุคคล/ผลิตภัณฑ์เฉพาะถุงได้</div>
              <label class="check-row"><input id="imagePrivacyConfirm" type="checkbox"><span>หากแนบรูป ฉันตรวจสอบแล้วว่าไม่มีข้อมูลต้องห้ามและได้ครอบตัดหรือปิดบังข้อมูลเรียบร้อย</span></label>`}
          </section>
        </div>

        <aside class="form-aside">
          <div class="summary-box"><h3>สรุปก่อนบันทึก</h3><dl id="formSummary"></dl></div>
          <div class="notice warning" style="margin-top:12px"><b>ไม่บันทึกข้อมูลผู้ป่วย</b><p>ห้ามใส่ชื่อ HN Diagnosis เลขถุงเลือด หรือข้อมูลผู้บริจาคในทุกช่อง</p></div>
          <div class="sticky-submit"><button type="button" class="btn btn-ghost" data-view="${item ? 'mine' : 'dashboard'}">ยกเลิก</button><button id="saveAnnouncementBtn" type="submit" class="btn btn-primary">${item ? 'บันทึกการแก้ไข' : 'สร้างประกาศ'}</button></div>
        </aside>
      </form>`;

    bindAnnouncementForm(item, type);
  }

  function bindAnnouncementForm(item, initialType) {
    const form = $('#announcementForm');
    const typeInputs = $$('input[name="announcementType"]', form);
    const updateDynamic = () => {
      const type = item?.announcement_type || $('input[name="announcementType"]:checked', form)?.value || initialType || '';
      $('#offerFields').classList.toggle('hidden', type !== 'offer');
      $('#requestFields').classList.toggle('hidden', type !== 'request');
      const option = $('#annComponent').selectedOptions[0];
      const isOther = option?.dataset.code === 'OTHER';
      $('#otherComponentField').classList.toggle('hidden', !isOther);
      const source = $('#annSource')?.selectedOptions[0];
      $('#sourceDetailField')?.classList.toggle('hidden', !(source?.dataset.detail === 'true'));
      updateFormSummary(type);
    };
    typeInputs.forEach(el => el.addEventListener('change', updateDynamic));
    ['annComponent','annAbo','annRh','annQtyTotal','annQtyRemaining','annExpiry','annNeededBy','annUrgency','annSource','annSourceDetail','annContactName','annContactPhone'].forEach(id => $(`#${id}`)?.addEventListener('input', updateDynamic));
    $$('input[name="antigen"]', form).forEach(el => el.addEventListener('change', updateDynamic));
    $('#annSource')?.addEventListener('change', updateDynamic);
    $('#annComponent')?.addEventListener('change', updateDynamic);
    $('#annImage')?.addEventListener('change', handleImageSelection);
    $('#removeSelectedImage')?.addEventListener('click', clearSelectedImage);
    form.addEventListener('submit', event => saveAnnouncement(event, item));
    updateDynamic();
  }

  function currentFormType(item = state.editingAnnouncement) {
    return item?.announcement_type || $('input[name="announcementType"]:checked')?.value || '';
  }

  function updateFormSummary(type) {
    const component = $('#annComponent')?.value ? ($('#annComponent').selectedOptions[0]?.textContent || 'ยังไม่ระบุ') : 'ยังไม่ระบุ';
    const aboValue = $('#annAbo')?.value || '';
    const abo = aboValue ? (aboValue === 'not_specified' ? 'ไม่ระบุ' : aboValue) : 'ยังไม่ระบุ';
    const rh = U.rhLabel[$('#annRh')?.value] || 'ยังไม่ระบุ';
    const qty = $('#annQtyRemaining')?.value || $('#annQtyTotal')?.value || 'ยังไม่ระบุ';
    const antigens = $$('input[name="antigen"]:checked').map(x => `${x.value}-`).join(' ') || 'ไม่ระบุ';
    const date = type === 'offer' ? $('#annExpiry')?.value : $('#annNeededBy')?.value;
    $('#formSummary').innerHTML = `
      <dt>ประเภท</dt><dd>${U.esc(U.typeLabel[type] || 'ยังไม่ระบุ')}</dd>
      <dt>ผลิตภัณฑ์</dt><dd>${U.esc(component)} ${U.esc(abo)} Rh ${U.esc(rh)}</dd>
      <dt>จำนวน</dt><dd>${U.esc(qty)} Unit</dd>
      <dt>${type === 'offer' ? 'หมดอายุ' : 'ต้องการภายใน'}</dt><dd>${date ? U.fmtDate(date) : 'ยังไม่ระบุ'}</dd>
      <dt>แอนติเจนที่ต้องการผลลบ</dt><dd>${U.esc(antigens)}</dd>`;
  }

  async function handleImageSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return clearSelectedImage();
    const info = $('#imageInfo');
    try {
      info.textContent = 'กำลังลดขนาดรูป...';
      state.compressedImage = await I.compressImage(file);
      $('#imagePreview').src = state.compressedImage.previewUrl;
      $('#imagePreview').classList.remove('hidden');
      $('#removeSelectedImage').classList.remove('hidden');
      info.textContent = `พร้อมอัปโหลด ${(state.compressedImage.size / 1024).toFixed(0)} KB · ${state.compressedImage.width}×${state.compressedImage.height} px`;
    } catch (error) {
      clearSelectedImage();
      toast('ใช้รูปนี้ไม่ได้', U.friendlyError(error), 'error');
    }
  }

  function clearSelectedImage() {
    if (state.compressedImage?.previewUrl) URL.revokeObjectURL(state.compressedImage.previewUrl);
    state.compressedImage = null;
    if ($('#annImage')) $('#annImage').value = '';
    if ($('#imagePreview')) { $('#imagePreview').src = ''; $('#imagePreview').classList.add('hidden'); }
    $('#removeSelectedImage')?.classList.add('hidden');
    if ($('#imageInfo')) $('#imageInfo').textContent = '';
  }

  function validateForm(item) {
    const type = currentFormType(item);
    if (!['offer','request'].includes(type)) throw new Error('กรุณาเลือกประเภทประกาศ');
    const componentOption = $('#annComponent').selectedOptions[0];
    if (!componentOption || !$('#annComponent').value) throw new Error('กรุณาระบุผลิตภัณฑ์โลหิต');
    if (componentOption.dataset.code === 'OTHER' && !$('#annOtherComponent').value.trim()) throw new Error('กรุณาระบุผลิตภัณฑ์อื่น');
    if (!$('#annAbo').value) throw new Error('กรุณาระบุหมู่เลือด ABO');
    if (!$('#annRh').value) throw new Error('กรุณาระบุหมู่เลือด Rh');
    if (!$('#annQtyTotal').value) throw new Error('กรุณาระบุจำนวนทั้งหมด');
    const qtyTotal = Number($('#annQtyTotal').value);
    const qtyRemaining = item ? Number($('#annQtyRemaining').value) : qtyTotal;
    if (!Number.isInteger(qtyTotal) || qtyTotal <= 0) throw new Error('จำนวนทั้งหมดต้องเป็นจำนวนเต็มมากกว่า 0');
    if (!Number.isInteger(qtyRemaining) || qtyRemaining < 0 || qtyRemaining > qtyTotal) throw new Error('จำนวนคงเหลือต้องอยู่ระหว่าง 0 ถึงจำนวนทั้งหมด');
    if (type === 'offer' && !$('#annExpiry').value) throw new Error('กรุณาระบุวันหมดอายุ');
    if (type === 'request' && !$('#annNeededBy').value) throw new Error('กรุณาระบุวันที่ต้องการ');
    if (type === 'offer') {
      const sourceOpt = $('#annSource').selectedOptions[0];
      if (!sourceOpt) throw new Error('กรุณาเลือกแหล่งที่มา');
      if (sourceOpt.dataset.detail === 'true' && !$('#annSourceDetail').value.trim()) throw new Error('กรุณาระบุรายละเอียดแหล่งที่มา');
    }
    if (!$('#annContactName').value.trim() || !$('#annContactPhone').value.trim()) throw new Error('กรุณากรอกชื่อและเบอร์โทรผู้ติดต่อ');
    if (state.compressedImage && !$('#imagePrivacyConfirm')?.checked) throw new Error('กรุณายืนยันว่ารูปไม่มีข้อมูลต้องห้าม');
    return { type, qtyTotal, qtyRemaining };
  }

  function announcementPayload(item) {
    const { type, qtyTotal, qtyRemaining } = validateForm(item);
    const antigens = $$('input[name="antigen"]:checked').map(x => x.value);
    return {
      type, qtyTotal, qtyRemaining,
      common: {
        p_component_id: $('#annComponent').value,
        p_other_component: $('#annOtherComponent')?.value.trim() || null,
        p_abo: $('#annAbo').value,
        p_rh: $('#annRh').value,
        p_quantity_total: qtyTotal,
        p_expiry_date: type === 'offer' ? $('#annExpiry').value : null,
        p_needed_by: type === 'request' ? $('#annNeededBy').value : null,
        p_urgency: type === 'request' ? $('#annUrgency').value : null,
        p_phenotype_negative: antigens,
        p_blood_source_id: type === 'offer' ? $('#annSource').value : null,
        p_blood_source_detail: type === 'offer' ? ($('#annSourceDetail')?.value.trim() || null) : null,
        p_contact_name: $('#annContactName').value.trim(),
        p_contact_phone: $('#annContactPhone').value.trim()
      }
    };
  }

  async function saveAnnouncement(event, item) {
    event.preventDefault();
    const button = $('#saveAnnouncementBtn');
    try {
      const p = announcementPayload(item);
      setButtonBusy(button, true, item ? 'กำลังบันทึก...' : 'กำลังสร้าง...');
      let announcementId;
      if (item) {
        const { data, error } = await state.supabase.rpc('bent_update_announcement', {
          p_announcement_id: item.id,
          ...p.common,
          p_quantity_remaining: p.qtyRemaining
        });
        if (error) throw error;
        announcementId = data?.id || item.id;
      } else {
        const { data, error } = await state.supabase.rpc('bent_create_announcement', {
          p_client_request_id: U.uuid(),
          p_announcement_type: p.type,
          ...p.common
        });
        if (error) throw error;
        announcementId = data;
      }

      let imageError = null;
      if (state.compressedImage) {
        try {
          const token = state.session?.access_token;
          await I.upload({ accessToken: token, announcementId, compressed: state.compressedImage });
        } catch (error) { imageError = error; }
      }

      clearSelectedImage();
      await loadAnnouncements();
      toast(item ? 'บันทึกการแก้ไขแล้ว' : 'สร้างประกาศแล้ว', imageError ? 'ประกาศสำเร็จ แต่รูปอัปโหลดไม่สำเร็จ สามารถเพิ่มรูปภายหลังได้' : 'ฐานข้อมูลยืนยันรายการเรียบร้อย', imageError ? 'error' : 'success', 6500);
      await navigate('mine');
    } catch (error) {
      toast('บันทึกไม่สำเร็จ', U.friendlyError(error), 'error');
    } finally { setButtonBusy(button, false); }
  }

  function openModal(title, subtitle, html) {
    $('#modalTitle').textContent = title;
    $('#modalSubtitle').textContent = subtitle || '';
    $('#modalBody').innerHTML = html;
    $('#modalRoot').classList.remove('hidden');
    $('#modalRoot').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modalRoot').classList.add('hidden');
    $('#modalRoot').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function findAnnouncement(id) { return state.announcements.find(a => a.id === id); }

  function openDetail(item) {
    const dateLabel = item.announcement_type === 'offer' ? 'วันหมดอายุ' : 'ต้องการภายใน';
    const date = item.announcement_type === 'offer' ? item.expiry_date : item.needed_by;
    const image = (item.images || []).find(i => i.image_status === 'active');
    openModal('รายละเอียดประกาศ', U.typeLabel[item.announcement_type], `
      <div class="page-stack">
        <div class="card-head"><div><span class="badge badge-${item.announcement_type}">${U.typeLabel[item.announcement_type]}</span><h2>${U.esc(item.component?.display_name || '-')} ${U.esc(item.abo)} Rh ${U.esc(U.rhLabel[item.rh])}</h2></div><span class="badge badge-${item.status}">${U.esc(U.statusLabel[item.status])}</span></div>
        <div class="card-facts"><div class="fact"><span>จำนวน</span><b>${item.quantity_remaining} Unit</b></div><div class="fact"><span>${dateLabel}</span><b>${U.fmtDate(date)}</b></div></div>
        ${(item.phenotype_negative || []).length ? `<div><b>แอนติเจนที่ต้องการผลลบ</b><div class="antigen-line">${item.phenotype_negative.map(x => `<span class="antigen-chip">${U.esc(x)}-</span>`).join('')}</div></div>` : '<div class="info-box">ไม่ได้ระบุแอนติเจนที่ต้องการผลลบ</div>'}
        ${item.announcement_type === 'offer' ? `<div class="info-box"><b>แหล่งที่มา</b><p>${U.esc(item.source?.display_name || '-')}${item.blood_source_detail ? ` — ${U.esc(item.blood_source_detail)}` : ''}</p></div>` : `<div class="info-box"><b>ความเร่งด่วน</b><p>${U.esc(U.urgencyLabel[item.urgency] || '-')}</p></div>`}
        <div class="panel"><div class="panel-body"><b>${U.esc(item.hospital?.name || '-')}</b><p>ผู้ติดต่อ: ${U.esc(item.contact_name)}</p><p>โทร: <strong>${U.esc(item.contact_phone)}</strong></p><div class="inline-actions"><a class="btn btn-primary" href="${U.telHref(item.contact_phone)}">โทร</a><button class="btn btn-secondary" data-action="copy-phone" data-phone="${U.esc(item.contact_phone)}">คัดลอกเบอร์</button>${image ? `<button class="btn btn-soft" data-action="view-image" data-id="${item.id}">ดูรูปประกอบ</button>` : ''}</div></div></div>
        <div class="notice warning"><b>ข้อควรทราบ</b><p>ข้อมูลและรูปใช้เพื่อช่วยค้นหาและติดต่อเท่านั้น โรงพยาบาลผู้รับต้องตรวจสอบผลิตภัณฑ์ เอกสาร ความเหมาะสม คุณภาพ การขนส่ง และดำเนินการตาม SOP ก่อนรับหรือจ่ายผลิตภัณฑ์โลหิต</p></div>
      </div>`);
  }

  async function openImage(item) {
    try {
      openModal('กำลังเปิดรูปภาพ', 'รูปนี้ไม่ได้เปิดเป็นลิงก์สาธารณะ', '<div class="loading-block"><div class="spinner"></div></div>');
      const data = await I.read({ accessToken: state.session.access_token, announcementId: item.id });
      $('#modalTitle').textContent = 'รูปภาพประกอบ';
      $('#modalSubtitle').textContent = 'ใช้ประกอบการติดต่อเท่านั้น ไม่ใช้แทนการตรวจสอบตาม SOP';
      $('#modalBody').innerHTML = `<img class="modal-image" src="${data.data_url}" alt="รูปภาพประกอบประกาศ"><div class="notice warning" style="margin-top:12px"><b>ตรวจสอบซ้ำก่อนรับหรือจ่ายผลิตภัณฑ์</b><p>ห้ามใช้รูปนี้แทนฉลากจริง เอกสาร หรือขั้นตอนตรวจสอบของโรงพยาบาล</p></div>`;
    } catch (error) {
      $('#modalBody').innerHTML = `<div class="notice danger"><b>เปิดรูปไม่สำเร็จ</b><p>${U.esc(U.friendlyError(error))}</p></div>`;
    }
  }

  function openCloseModal(item) {
    const reasons = ['ประสานงานสำเร็จ','หาเลือดได้จากช่องทางอื่น','ไม่มีความต้องการแล้ว','เลือดหรือรายการหมดอายุ','จำนวนคงเหลือเป็นศูนย์','ลงข้อมูลผิด','ยกเลิกรายการ','อื่น ๆ'];
    openModal('ปิดรายการ', 'ระบบจะซ่อนรูปทันทีและส่งเข้ากระบวนการลบ', `
      <form id="closeAnnouncementForm">
        <label>เหตุผลที่ปิด<select id="closeReason" required>${reasons.map(x => `<option>${U.esc(x)}</option>`).join('')}</select></label>
        <label>รายละเอียดเพิ่มเติม<textarea id="closeNote" maxlength="500" placeholder="ไม่ต้องใส่ชื่อผู้ป่วย HN Diagnosis หรือเลขถุงเลือด"></textarea></label>
        <label>ผลการประสานงาน<select id="coordResult" required><option value="success">สำเร็จ</option><option value="unsuccessful">ไม่สำเร็จ</option><option value="not_actioned">ไม่ได้ดำเนินการ</option><option value="unknown">ไม่ทราบผล</option></select></label>
        <label>จำนวนที่ประสานงานสำเร็จ (Unit)<input id="coordQty" type="number" min="0" max="${item.quantity_total}" value="0"></label>
        <label>หมายเหตุผลการประสานงาน<textarea id="coordNote" maxlength="500" placeholder="ไม่บังคับ และห้ามมีข้อมูลผู้ป่วย"></textarea></label>
        <label class="check-row"><input id="closePrivacy" type="checkbox" required><span>ยืนยันว่าข้อมูลที่กรอกไม่มีชื่อผู้ป่วย HN Diagnosis เลขถุงเลือด หรือข้อมูลส่วนบุคคล</span></label>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>กลับ</button><button id="confirmCloseBtn" type="submit" class="btn btn-primary">ยืนยันปิดรายการ</button></div>
      </form>`);
    const updateCloseFields = () => {
      $('#coordQty').disabled = $('#coordResult').value !== 'success';
      $('#closeNote').required = $('#closeReason').value === 'อื่น ๆ';
    };
    $('#coordResult').addEventListener('change', updateCloseFields);
    $('#closeReason').addEventListener('change', updateCloseFields);
    updateCloseFields();
    $('#closeAnnouncementForm').addEventListener('submit', event => closeAnnouncement(event, item));
  }

  async function closeAnnouncement(event, item) {
    event.preventDefault();
    const button = $('#confirmCloseBtn');
    try {
      setButtonBusy(button, true, 'กำลังปิด...');
      const result = $('#coordResult').value;
      const { error } = await state.supabase.rpc('bent_close_announcement', {
        p_announcement_id: item.id,
        p_closure_reason: $('#closeReason').value,
        p_closure_note: $('#closeNote').value.trim() || null,
        p_coordination_result: result,
        p_coordinated_quantity: result === 'success' ? Number($('#coordQty').value || 0) : null,
        p_coordination_note: $('#coordNote').value.trim() || null
      });
      if (error) throw error;
      closeModal();
      let imageDeleteFailed = false;
      if ((item.images || []).length) {
        try { await I.remove({ accessToken: state.session.access_token, announcementId: item.id }); }
        catch (_) { imageDeleteFailed = true; }
      }
      await loadAnnouncements();
      toast('ปิดรายการแล้ว', imageDeleteFailed ? 'รูปถูกซ่อนแล้ว แต่การลบไฟล์ยังไม่สำเร็จ ระบบจะให้ผู้ดูแลลองซ้ำ' : 'ฐานข้อมูลยืนยันและจัดการรูปเรียบร้อย', imageDeleteFailed ? 'error' : 'success', 6500);
      await navigate('mine');
    } catch (error) { toast('ปิดรายการไม่สำเร็จ', U.friendlyError(error), 'error'); }
    finally { setButtonBusy(button, false); }
  }

  async function setCoordinating(item) {
    try {
      const { error } = await state.supabase.rpc('bent_set_coordinating', { p_announcement_id: item.id });
      if (error) throw error;
      await loadAnnouncements(); toast('เปลี่ยนสถานะแล้ว', 'รายการอยู่ระหว่างประสานงาน', 'success'); await navigate(state.currentView);
    } catch (error) { toast('เปลี่ยนสถานะไม่สำเร็จ', U.friendlyError(error), 'error'); }
  }

  function confirmCancel(item) {
    openModal('ยกเลิกรายการ', 'ใช้เมื่อประกาศผิดหรือไม่ต้องการเปิดรายการต่อ', `
      <form id="cancelForm"><label>เหตุผลเพิ่มเติม<textarea id="cancelNote" maxlength="500" placeholder="ห้ามใส่ข้อมูลผู้ป่วย"></textarea></label><div class="notice warning"><b>เมื่อยืนยัน</b><p>รายการจะหายจากหน้าค้นหาทั่วไป และรูปจะถูกซ่อนทันที</p></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>กลับ</button><button id="confirmCancelBtn" class="btn btn-danger" type="submit">ยืนยันยกเลิก</button></div></form>`);
    $('#cancelForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = $('#confirmCancelBtn');
      try {
        setButtonBusy(btn, true, 'กำลังยกเลิก...');
        const { error } = await state.supabase.rpc('bent_cancel_announcement', { p_announcement_id: item.id, p_closure_note: $('#cancelNote').value.trim() || null });
        if (error) throw error;
        closeModal();
        if ((item.images || []).length) { try { await I.remove({ accessToken: state.session.access_token, announcementId: item.id }); } catch (_) {} }
        await loadAnnouncements(); toast('ยกเลิกรายการแล้ว', '', 'success'); await navigate('mine');
      } catch (error) { toast('ยกเลิกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
  }

  function confirmRemoveImage(item, fromAdmin = false) {
    openModal('ลบรูปภาพประกอบ', 'ประกาศจะยังอยู่ตามสถานะเดิม', `<div class="notice warning"><b>ยืนยันการลบรูป</b><p>รูปจะถูกซ่อนทันที แล้วระบบจะย้ายไฟล์ในโฟลเดอร์ Google Drive ส่วนตัวไปยังถังขยะ หากลบไม่สำเร็จ ผู้ดูแลสามารถลองอีกครั้งได้</p></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>กลับ</button><button id="confirmRemoveImageBtn" type="button" class="btn btn-danger">ยืนยันลบรูป</button></div>`);
    $('#confirmRemoveImageBtn').addEventListener('click', async () => {
      const btn = $('#confirmRemoveImageBtn');
      try {
        setButtonBusy(btn,true,'กำลังลบ...');
        const image = (item.images || []).find(x => x.image_status !== 'deleted');
        if (image) {
          const { error } = await state.supabase.from('bent_announcement_images').update({ image_status:'pending_delete', delete_error:null }).eq('id',image.id);
          if (error) throw error;
        }
        await I.remove({ accessToken:state.session.access_token, announcementId:item.id });
        closeModal(); await loadAnnouncements(); toast('ลบรูปแล้ว','','success');
        if (fromAdmin) await loadAdminTab('images'); else await navigate(state.currentView);
      } catch (error) {
        closeModal(); await loadAnnouncements().catch(()=>{}); toast('รูปถูกซ่อนแล้ว แต่ลบไฟล์ยังไม่สำเร็จ',U.friendlyError(error),'error',6500);
        if (fromAdmin) await loadAdminTab('images'); else await navigate(state.currentView);
      } finally { setButtonBusy(btn,false); }
    });
  }

  async function setImageVisibility(imageId,status) {
    try {
      const { error } = await state.supabase.from('bent_announcement_images').update({ image_status:status, delete_error:null }).eq('id',imageId); if (error) throw error;
      await loadAnnouncements(); toast(status === 'hidden' ? 'ซ่อนรูปแล้ว' : 'แสดงรูปแล้ว','','success'); await loadAdminTab('images');
    } catch (error) { toast('เปลี่ยนสถานะรูปไม่สำเร็จ',U.friendlyError(error),'error'); }
  }

  function renderGuide() {
    setPage('คู่มือการใช้งาน', 'คนที่ไม่เคยใช้ BENT สามารถเริ่มจากหน้านี้');
    main.innerHTML = `
      <div class="page-stack">
        <section class="guide-hero"><span class="eyebrow" style="color:var(--blue-700)">เริ่มใช้งานแบบทีละขั้น</span><h2>BENT ใช้ทำอะไร และต้องกดตรงไหน</h2><p>ระบบนี้เป็นพื้นที่กลางสำหรับ “ประกาศและติดต่อ” ไม่ใช่ระบบจองหรือยืนยันส่งมอบเลือด</p></section>
        <div id="installPromptBox" class="install-prompt"><div><b>ติดตั้ง BENT บนหน้าจอมือถือหรือแท็บเล็ต</b><p style="margin:2px 0;color:var(--muted)">เปิดได้เหมือนแอปและเข้าถึงง่ายขึ้น</p></div><button class="btn btn-primary" data-action="install-pwa">ดูวิธีติดตั้ง</button></div>
        <section class="guide-grid">
          <article class="guide-card"><h3>1. สมัครและเข้าสู่ระบบ</h3><ol><li>กด “สมัครใช้งาน”</li><li>กรอกชื่อ โรงพยาบาล เบอร์โทร และอีเมล</li><li>รอผู้ดูแลระบบตรวจสอบและอนุมัติ</li><li>เปิดอีเมลที่ได้รับ แล้วตั้งรหัสผ่านของตนเอง</li><li>เมื่อบัญชีได้รับอนุมัติและเปิดใช้งานแล้ว จึงเห็นประกาศและเบอร์โทรได้</li></ol></article>
          <article class="guide-card"><h3>2. ค้นหาประกาศ</h3><ol><li>เปิดเมนู “ค้นหาประกาศ”</li><li>เลือกว่ามีเลือดพร้อมให้ติดต่อหรือต้องการเลือด</li><li>กรองผลิตภัณฑ์ หมู่เลือด โรงพยาบาล หรือแหล่งที่มา</li><li>เลือกแอนติเจนผลลบได้หลายตัว โดยระบบจะค้นหารายการที่มีครบทุกตัวที่เลือก</li><li>กด “ดูรายละเอียดและติดต่อ”</li><li>โทรหรือคัดลอกเบอร์ แล้วประสานงานตาม SOP ของโรงพยาบาล</li></ol></article>
          <article class="guide-card"><h3>3. ประกาศว่ามีเลือด</h3><ol><li>เลือก “มีเลือดพร้อมให้ติดต่อ”</li><li>ระบุผลิตภัณฑ์ หมู่เลือด ABO หมู่เลือด Rh และจำนวน</li><li>ใส่วันหมดอายุและแหล่งที่มา</li><li>เลือกแอนติเจนเฉพาะตัวที่ต้องการผลลบ</li><li>แนบรูปได้ แต่ไม่บังคับ</li><li>ตรวจสรุปแล้วกด “สร้างประกาศ”</li></ol></article>
          <article class="guide-card"><h3>4. ประกาศว่าต้องการเลือด</h3><ol><li>เลือก “ต้องการเลือด”</li><li>ระบุผลิตภัณฑ์ หมู่เลือด ABO หมู่เลือด Rh และจำนวนที่ต้องการ</li><li>ใส่วันที่ต้องการและระดับความเร่งด่วน</li><li>เลือกแอนติเจนที่ต้องการผลลบตามเงื่อนไข</li><li>กรอกผู้ติดต่อ แล้วสร้างประกาศ</li></ol></article>
          <article class="guide-card"><h3>5. ระหว่างประสานงานและปิดรายการ</h3><ol><li>เมื่อเริ่มคุยกับโรงพยาบาลอื่น กด “กำลังประสานงาน”</li><li>แก้จำนวนคงเหลือ/ยังต้องการได้</li><li>เมื่อจบเรื่อง กด “ปิดรายการ”</li><li>เลือกเหตุผล ผลการประสานงาน และจำนวนที่สำเร็จ</li><li>รูปจะถูกซ่อนทันที แล้วระบบจึงลบจาก Google Drive</li></ol></article>
          <article class="guide-card"><h3>6. การแนบรูปอย่างปลอดภัย</h3><ul class="danger-list"><li>ห้ามชื่อผู้ป่วย HN เลขบัตรประชาชน Diagnosis</li><li>ห้าม Donor ID เลขถุงเลือด Barcode และ QR Code</li><li>ครอบตัดหรือปิดบังข้อมูลก่อนเลือกไฟล์</li><li>รูปเป็นข้อมูลประกอบ ไม่ใช้แทนฉลากจริงหรือ SOP</li></ul></article>
        </section>
        <section class="panel"><div class="panel-header"><div><h2>ความหมายสถานะ</h2><p>ดูแล้วรู้ทันทีว่ารายการอยู่ขั้นไหน</p></div></div><div class="panel-body"><div class="antigen-line"><span class="badge badge-open">เปิดรับการติดต่อ</span><span class="badge badge-coordinating">กำลังประสานงาน</span><span class="badge badge-closed">ปิดแล้ว</span><span class="badge badge-cancelled">ยกเลิก</span><span class="badge badge-expired">หมดอายุ</span></div></div></section>
        <div class="notice warning"><b>หลักสำคัญที่สุด</b><p>ไม่บันทึกข้อมูลผู้ป่วย ผู้บริจาค หรือข้อมูลที่ระบุถุงเลือดเฉพาะถุง และต้องรอข้อความยืนยันจากฐานข้อมูลก่อนถือว่ารายการสำเร็จ</p></div>
      </div>`;
  }

  async function renderAdmin() {
    setPage('จัดการระบบ', 'สำหรับผู้ดูแลระบบ');
    main.innerHTML = `
      <div class="page-stack">
        <div class="admin-tabs">
          ${[['requests','คำขอเปิดบัญชี'],['users','ผู้ใช้งาน'],['hospitals','โรงพยาบาล'],['announcements','ประกาศทั้งหมด'],['components','ผลิตภัณฑ์โลหิต'],['antigens','แอนติเจน'],['sources','แหล่งที่มา'],['stats','สถิติการใช้งาน'],['images','จัดการรูป'],['audit','ประวัติการเปลี่ยนแปลง']].map(([key,label]) => `<button class="admin-tab ${state.adminTab === key ? 'active' : ''}" data-admin-tab="${key}">${label}</button>`).join('')}
        </div>
        <div id="adminContent"><div class="loading-block"><div class="spinner"></div></div></div>
      </div>`;
    await loadAdminTab(state.adminTab);
  }

  async function loadAdminTab(tab) {
    state.adminTab = tab;
    $$('.admin-tab').forEach(x => x.classList.toggle('active', x.dataset.adminTab === tab));
    const host = $('#adminContent'); if (!host) return;
    host.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';
    try {
      if (tab === 'requests') await adminAccountRequests(host);
      else if (tab === 'users') await adminUsers(host);
      else if (tab === 'hospitals') adminHospitals(host);
      else if (tab === 'announcements') adminAnnouncements(host);
      else if (['components','antigens','sources'].includes(tab)) adminMaster(host, tab);
      else if (tab === 'stats') await adminStats(host);
      else if (tab === 'images') await adminImages(host);
      else if (tab === 'audit') await adminAudit(host);
    } catch (error) { host.innerHTML = `<div class="notice danger"><b>โหลดข้อมูลไม่สำเร็จ</b><p>${U.esc(U.friendlyError(error))}</p></div>`; }
  }

  function adminAnnouncements(host) {
    const rows = state.announcements;
    const counts = ['open','coordinating','closed','cancelled','expired'].map(status => ({ status, total: rows.filter(x => x.status === status).length }));
    host.innerHTML = `<div class="page-stack"><section class="stat-grid">${counts.map(x => statCard(U.statusLabel[x.status], x.total, 'รายการ')).join('')}</section><section class="panel"><div class="panel-header"><div><h2>ประกาศทุกโรงพยาบาล ${rows.length} รายการ</h2><p>ผู้ดูแลระบบเห็นทั้งรายการที่เปิดอยู่และประวัติที่ปิดแล้ว</p></div></div><div class="panel-body"><div class="announcement-grid">${rows.map(renderAnnouncementCard).join('') || emptyState('ยังไม่มีประกาศ','')}</div></div></section></div>`;
  }

  async function adminAccountRequests(host) {
    const { data, error } = await state.supabase.from('bent_account_requests').select('*').order('requested_at', { ascending: false });
    if (error) throw error;
    const actions = request => {
      if (request.status === 'approved' && request.auth_user_id) {
        return `<button class="btn btn-soft" data-action="admin-resend-request-link" data-request="${request.id}">ส่งลิงก์ใหม่</button>`;
      }
      return `<button class="btn btn-primary" data-action="admin-review-request" data-request="${request.id}">ตรวจสอบ</button>`;
    };
    const row = request => `<tr><td><b>${U.esc(request.full_name)}</b><br><small>${U.esc(request.email)}</small></td><td>${U.esc(request.hospital_name)}</td><td>${U.esc(request.phone)}</td><td><span class="badge badge-${request.status}">${U.esc(U.statusLabel[request.status] || request.status)}</span><br><small>${U.fmtDateTime(request.requested_at)}</small></td><td>${actions(request)}</td></tr>`;
    host.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>คำขอเปิดบัญชี ${data.length} รายการ</h2><p>ตรวจสอบข้อมูลก่อนสร้างบัญชีผู้ใช้และส่งลิงก์ตั้งรหัสผ่านทางอีเมล</p></div></div><div class="panel-body">${data.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ผู้สมัคร</th><th>โรงพยาบาล</th><th>โทรศัพท์</th><th>สถานะ</th><th></th></tr></thead><tbody>${data.map(row).join('')}</tbody></table></div><div class="mobile-cards">${data.map(request => `<div class="mobile-data-card"><b>${U.esc(request.full_name)}</b><span>${U.esc(request.email)}</span><span>${U.esc(request.hospital_name)} · ${U.esc(request.phone)}</span><div class="inline-actions"><span class="badge badge-${request.status}">${U.esc(U.statusLabel[request.status] || request.status)}</span>${actions(request)}</div></div>`).join('')}</div>` : emptyState('ยังไม่มีคำขอเปิดบัญชี','คำขอใหม่จะปรากฏที่หน้านี้')}</div></section>`;
    host.dataset.requests = JSON.stringify(data);
  }

  function openAccountRequest(request) {
    if (!request) return;
    openModal('ตรวจสอบคำขอเปิดบัญชี', request.email, `
      <form id="accountRequestForm">
        <label>ชื่อ–นามสกุล<input id="requestFullName" value="${U.esc(request.full_name || '')}" required maxlength="120"></label>
        <label>เบอร์โทร<input id="requestPhone" value="${U.esc(request.phone || '')}" required maxlength="30"></label>
        <label>โรงพยาบาลที่ผู้สมัครแจ้ง<input value="${U.esc(request.hospital_name || '')}" readonly></label>
        <label>ตำแหน่ง/หน่วยงาน<input value="${U.esc(request.position_title || '')}" readonly></label>
        <label>กำหนดโรงพยาบาลในระบบ<select id="requestHospital" required><option value="">เลือกโรงพยาบาล</option>${state.masters.hospitals.filter(h => h.is_active).map(h => `<option value="${h.id}">${U.esc(h.name)}</option>`).join('')}</select></label>
        <label>สิทธิ์การใช้งาน<select id="requestRole"><option value="user">ผู้ใช้งาน</option><option value="system_admin">ผู้ดูแลระบบ</option></select></label>
        <label>หมายเหตุของผู้ดูแล<textarea id="requestAdminNote" maxlength="500">${U.esc(request.admin_note || '')}</textarea></label>
        <div class="notice warning"><b>เมื่อกดอนุมัติ</b><p>ระบบจะสร้างบัญชีแบบยืนยันอีเมลแล้ว แต่ยังไม่มีรหัสผ่าน จากนั้นส่งลิงก์ BENT ที่ไม่มีการหมดอายุตามเวลาให้ผู้สมัครตั้งรหัสผ่านเอง</p></div>
        <div class="modal-actions">
          <button id="rejectRequestBtn" type="button" class="btn btn-danger">ไม่อนุมัติ</button>
          <button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button>
          <button id="approveRequestBtn" type="submit" class="btn btn-primary">อนุมัติและส่งลิงก์</button>
        </div>
      </form>`);
    $('#accountRequestForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = $('#approveRequestBtn');
      try {
        const hospitalId = $('#requestHospital').value;
        if (!hospitalId) throw new Error('กรุณาเลือกโรงพยาบาล');
        setButtonBusy(btn, true, 'กำลังสร้างบัญชี...');
        const result = await I.call({
          action: 'approve_account_request', access_token: state.session.access_token,
          request_id: request.id, hospital_id: hospitalId, role: $('#requestRole').value,
          full_name: $('#requestFullName').value.trim(), phone: $('#requestPhone').value.trim(),
          admin_note: $('#requestAdminNote').value.trim()
        });
        closeModal();
        toast('อนุมัติบัญชีแล้ว', result.email_sent ? 'ส่งลิงก์ตั้งรหัสผ่านแล้ว' : 'สร้างบัญชีแล้ว แต่ส่งอีเมลไม่สำเร็จ ให้กดส่งลิงก์ใหม่', result.email_sent ? 'success' : 'error', 8000);
        await loadAdminTab('requests');
      } catch (error) { toast('อนุมัติไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
    $('#rejectRequestBtn').addEventListener('click', async () => {
      const btn = $('#rejectRequestBtn');
      try {
        setButtonBusy(btn, true, 'กำลังบันทึก...');
        await I.call({ action: 'reject_account_request', access_token: state.session.access_token, request_id: request.id, admin_note: $('#requestAdminNote').value.trim() });
        closeModal(); toast('บันทึกว่าไม่อนุมัติแล้ว', '', 'success'); await loadAdminTab('requests');
      } catch (error) { toast('บันทึกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
  }

  async function resendRequestLink(request) {
    try {
      const result = await I.call({ action: 'admin_send_password_link', access_token: state.session.access_token, request_id: request.id });
      toast('ออกลิงก์ใหม่แล้ว', result.email_sent ? 'ส่งอีเมลแล้ว และลิงก์เดิมถูกยกเลิก' : 'สร้างลิงก์แล้ว แต่ส่งอีเมลไม่สำเร็จ', result.email_sent ? 'success' : 'error', 8000);
      await loadAdminTab('requests');
    } catch (error) { toast('ส่งลิงก์ไม่สำเร็จ', U.friendlyError(error), 'error'); }
  }

  async function adminUsers(host) {
    const { data, error } = await state.supabase.from('bent_profiles').select('*, hospital:bent_hospitals(id,name)').order('created_at', { ascending: false });
    if (error) throw error;
    const row = p => `<tr><td><b>${U.esc(p.full_name || '-')}</b><br><small>${U.esc(p.email)}</small></td><td>${U.esc(p.hospital?.name || p.hospital_name_requested || '-')}</td><td><span class="badge badge-${p.status}">${U.esc(U.statusLabel[p.status])}</span></td><td>${p.role === 'system_admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน'}</td><td><button class="btn btn-soft" data-action="admin-edit-user" data-user="${p.id}">จัดการ</button></td></tr>`;
    host.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>ผู้ใช้งาน ${data.length} บัญชี</h2><p>อนุมัติบัญชี กำหนดโรงพยาบาล และแต่งตั้งผู้ดูแลระบบ</p></div></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>ผู้ใช้</th><th>โรงพยาบาล</th><th>สถานะ</th><th>สิทธิ์</th><th></th></tr></thead><tbody>${data.map(row).join('')}</tbody></table></div><div class="mobile-cards">${data.map(p => `<div class="mobile-data-card"><b>${U.esc(p.full_name || p.email)}</b><span>${U.esc(p.email)}</span><span>${U.esc(p.hospital?.name || p.hospital_name_requested || '-')}</span><div class="inline-actions"><span class="badge badge-${p.status}">${U.esc(U.statusLabel[p.status])}</span><button class="btn btn-soft" data-action="admin-edit-user" data-user="${p.id}">จัดการ</button></div></div>`).join('')}</div></div></section>`;
    host.dataset.users = JSON.stringify(data);
  }

  function openAdminUser(user) {
    openModal('จัดการผู้ใช้งาน', user.email, `
      <form id="adminUserForm">
        <label>ชื่อ–นามสกุล<input id="adminUserName" value="${U.esc(user.full_name || '')}" maxlength="120"></label>
        <label>เบอร์โทร<input id="adminUserPhone" value="${U.esc(user.phone || '')}" maxlength="30"></label>
        <label>โรงพยาบาล<select id="adminUserHospital"><option value="">ยังไม่กำหนด</option>${state.masters.hospitals.map(h => `<option value="${h.id}" ${h.id === user.hospital_id ? 'selected' : ''}>${U.esc(h.name)}</option>`).join('')}</select></label>
        <label>สถานะ<select id="adminUserStatus">${['pending','active','rejected','suspended','inactive'].map(x => `<option value="${x}" ${x === user.status ? 'selected' : ''}>${U.esc(U.statusLabel[x])}</option>`).join('')}</select></label>
        <label>สิทธิ์การใช้งาน<select id="adminUserRole"><option value="user" ${user.role === 'user' ? 'selected' : ''}>ผู้ใช้งาน</option><option value="system_admin" ${user.role === 'system_admin' ? 'selected' : ''}>ผู้ดูแลระบบ</option></select></label>
        <div class="notice warning"><b>ข้อควรระวัง</b><p>บัญชีที่เปิดใช้งานต้องกำหนดโรงพยาบาล และการแต่งตั้งผู้ดูแลระบบ จะถูกบันทึกในประวัติการเปลี่ยนแปลง</p></div>
        <div class="modal-actions"><button id="adminSendPasswordLinkBtn" type="button" class="btn btn-soft">ส่งลิงก์ตั้งรหัสผ่านใหม่</button><button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button><button id="adminSaveUserBtn" class="btn btn-primary" type="submit">บันทึก</button></div>
      </form>`);
    $('#adminSendPasswordLinkBtn').addEventListener('click', async () => {
      const btn = $('#adminSendPasswordLinkBtn');
      try {
        setButtonBusy(btn, true, 'กำลังส่ง...');
        const result = await I.call({ action: 'admin_send_password_link', access_token: state.session.access_token, user_id: user.id });
        toast('ออกลิงก์ใหม่แล้ว', result.email_sent ? 'ส่งอีเมลแล้ว และลิงก์เดิมถูกยกเลิก' : 'สร้างลิงก์แล้ว แต่ส่งอีเมลไม่สำเร็จ', result.email_sent ? 'success' : 'error', 8000);
      } catch (error) { toast('ส่งลิงก์ไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
    $('#adminUserForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = $('#adminSaveUserBtn');
      try {
        setButtonBusy(btn, true);
        const status = $('#adminUserStatus').value; const hospital = $('#adminUserHospital').value || null;
        if (status === 'active' && !hospital) throw new Error('บัญชีที่เปิดใช้งานต้องกำหนดโรงพยาบาล');
        const { error } = await state.supabase.rpc('bent_admin_update_user', {
          p_user_id: user.id, p_status: status, p_role: $('#adminUserRole').value, p_hospital_id: hospital,
          p_full_name: $('#adminUserName').value.trim() || null, p_phone: $('#adminUserPhone').value.trim() || null
        });
        if (error) throw error;
        closeModal(); toast('บันทึกผู้ใช้งานแล้ว', '', 'success'); await loadAdminTab('users');
      } catch (error) { toast('บันทึกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
  }

  function adminHospitals(host) {
    const rows = state.masters.hospitals;
    host.innerHTML = `
      <section class="panel"><div class="panel-header"><div><h2>โรงพยาบาล</h2><p>เพิ่มหรือเปิด/ปิดการใช้งาน โดยไม่ลบประวัติเดิม</p></div></div><div class="panel-body">
        <form id="hospitalForm" class="master-row-form"><label>ชื่อโรงพยาบาล<input id="hospitalName" required maxlength="180"></label><label>จังหวัด<input id="hospitalProvince" maxlength="100"></label><label>โทรศัพท์<input id="hospitalPhone" maxlength="30"></label><label>สถานะ<select id="hospitalActive"><option value="true">ใช้งาน</option><option value="false">ปิดใช้งาน</option></select></label><button class="btn btn-primary" type="submit">เพิ่มโรงพยาบาล</button></form>
        <div class="table-wrap" style="margin-top:18px"><table class="data-table"><thead><tr><th>โรงพยาบาล</th><th>จังหวัด</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.map(h => `<tr><td>${U.esc(h.name)}</td><td>${U.esc(h.province || '-')}</td><td><span class="badge badge-${h.is_active ? 'active':'inactive'}">${h.is_active ? 'ใช้งาน':'ปิดใช้งาน'}</span></td><td><button class="btn btn-soft" data-action="edit-hospital" data-id="${h.id}">แก้ไข</button></td></tr>`).join('')}</tbody></table></div>
      </div></section>`;
    $('#hospitalForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = event.submitter;
      try {
        setButtonBusy(btn, true);
        const { error } = await state.supabase.from('bent_hospitals').insert({ name: $('#hospitalName').value.trim(), province: $('#hospitalProvince').value.trim() || null, phone: $('#hospitalPhone').value.trim() || null, is_active: $('#hospitalActive').value === 'true' });
        if (error) throw error;
        await loadMasters(); toast('เพิ่มโรงพยาบาลแล้ว', '', 'success'); adminHospitals(host);
      } catch (error) { toast('เพิ่มไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
  }

  function openHospitalEdit(hospital) {
    openModal('แก้ไขโรงพยาบาล', 'การปิดใช้งานจะไม่ลบข้อมูลประกาศเก่า', `<form id="editHospitalForm"><label>ชื่อ<input id="editHospitalName" value="${U.esc(hospital.name)}" required></label><label>จังหวัด<input id="editHospitalProvince" value="${U.esc(hospital.province || '')}"></label><label>โทรศัพท์<input id="editHospitalPhone" value="${U.esc(hospital.phone || '')}"></label><label>สถานะ<select id="editHospitalActive"><option value="true" ${hospital.is_active ? 'selected':''}>ใช้งาน</option><option value="false" ${!hospital.is_active ? 'selected':''}>ปิดใช้งาน</option></select></label><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button><button id="saveHospitalEdit" class="btn btn-primary">บันทึก</button></div></form>`);
    $('#editHospitalForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = $('#saveHospitalEdit');
      try {
        setButtonBusy(btn, true);
        const { error } = await state.supabase.from('bent_hospitals').update({ name: $('#editHospitalName').value.trim(), province: $('#editHospitalProvince').value.trim() || null, phone: $('#editHospitalPhone').value.trim() || null, is_active: $('#editHospitalActive').value === 'true' }).eq('id', hospital.id);
        if (error) throw error;
        await loadMasters(); closeModal(); toast('บันทึกแล้ว', '', 'success'); await loadAdminTab('hospitals');
      } catch (error) { toast('บันทึกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
  }

  function adminMaster(host, tab) {
    const map = {
      components: { table:'bent_components', list:state.masters.components, label:'ผลิตภัณฑ์โลหิต', code:'เช่น PRC_NEW' },
      antigens: { table:'bent_antigens', list:state.masters.antigens, label:'แอนติเจน', code:'เช่น Vel' },
      sources: { table:'bent_blood_sources', list:state.masters.sources, label:'แหล่งที่มา', code:'เช่น regional_center' }
    };
    const m = map[tab];
    host.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>จัดการ ${m.label}</h2><p>ปิดใช้งานแทนการลบ เพื่อรักษาประวัติประกาศเดิม</p></div></div><div class="panel-body"><form id="masterAddForm" class="master-row-form"><label>รหัสระบบ<input id="masterCode" required placeholder="${m.code}" maxlength="60"></label><label>ชื่อที่แสดง<input id="masterName" required maxlength="180"></label><label>ลำดับ<input id="masterOrder" type="number" min="0" value="100"></label>${tab === 'sources' ? '<label class="check-row"><input id="masterRequiresDetail" type="checkbox"><span>บังคับรายละเอียด</span></label>' : '<span></span>'}<button class="btn btn-primary" type="submit">เพิ่ม</button></form><div class="table-wrap" style="margin-top:18px"><table class="data-table"><thead><tr><th>รหัสระบบ</th><th>ชื่อ</th><th>ลำดับ</th>${tab === 'sources' ? '<th>รายละเอียด</th>':''}<th>สถานะ</th><th></th></tr></thead><tbody>${m.list.map(x => `<tr><td><code>${U.esc(x.code)}</code></td><td>${U.esc(x.display_name)}</td><td>${x.sort_order}</td>${tab === 'sources' ? `<td>${x.requires_detail ? 'บังคับ':'ไม่บังคับ'}</td>`:''}<td><span class="badge badge-${x.is_active ? 'active':'inactive'}">${x.is_active ? 'ใช้งาน':'ปิด'}</span></td><td><div class="inline-actions"><button class="btn btn-soft" data-action="edit-master" data-tab="${tab}" data-id="${x.id}">แก้ไข</button><button class="btn btn-ghost" data-action="toggle-master" data-tab="${tab}" data-id="${x.id}">${x.is_active ? 'ปิดใช้งาน':'เปิดใช้งาน'}</button></div></td></tr>`).join('')}</tbody></table></div></div></section>`;
    $('#masterAddForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = event.submitter;
      try {
        setButtonBusy(btn, true);
        const payload = { code: $('#masterCode').value.trim(), display_name: $('#masterName').value.trim(), sort_order: Number($('#masterOrder').value || 100), is_active: true };
        if (tab === 'sources') payload.requires_detail = $('#masterRequiresDetail').checked;
        const { error } = await state.supabase.from(m.table).insert(payload); if (error) throw error;
        await loadMasters(); toast('เพิ่มข้อมูลแล้ว', '', 'success'); adminMaster(host, tab);
      } catch (error) { toast('เพิ่มไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
  }

  function openMasterEdit(tab, item) {
    const map = { components:'bent_components', antigens:'bent_antigens', sources:'bent_blood_sources' };
    openModal('แก้ไขข้อมูลรายการ', `รหัสระบบ: ${item.code}`, `<form id="editMasterForm"><label>รหัสระบบ<input value="${U.esc(item.code)}" disabled></label><label>ชื่อที่แสดง<input id="editMasterName" value="${U.esc(item.display_name)}" required maxlength="180"></label><label>ลำดับ<input id="editMasterOrder" type="number" min="0" value="${item.sort_order}" required></label>${tab === 'sources' ? `<label class="check-row"><input id="editMasterDetail" type="checkbox" ${item.requires_detail ? 'checked':''}><span>บังคับกรอกรายละเอียดเพิ่มเติม</span></label>` : ''}<label>สถานะ<select id="editMasterActive"><option value="true" ${item.is_active ? 'selected':''}>ใช้งาน</option><option value="false" ${!item.is_active ? 'selected':''}>ปิดใช้งาน</option></select></label><div class="notice warning"><b>รหัสระบบแก้ไขไม่ได้</b><p>เพื่อไม่ให้ประกาศเก่าหรือกติกาภายในระบบเสียหาย สามารถแก้ชื่อ ลำดับ และสถานะได้</p></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button><button id="saveMasterEdit" type="submit" class="btn btn-primary">บันทึก</button></div></form>`);
    $('#editMasterForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = $('#saveMasterEdit');
      try {
        setButtonBusy(btn, true);
        const payload = { display_name: $('#editMasterName').value.trim(), sort_order: Number($('#editMasterOrder').value), is_active: $('#editMasterActive').value === 'true' };
        if (tab === 'sources') payload.requires_detail = $('#editMasterDetail').checked;
        const { error } = await state.supabase.from(map[tab]).update(payload).eq('id', item.id); if (error) throw error;
        await loadMasters(); closeModal(); toast('แก้ไขข้อมูลรายการแล้ว','','success'); await loadAdminTab(tab);
      } catch (error) { toast('บันทึกไม่สำเร็จ',U.friendlyError(error),'error'); }
      finally { setButtonBusy(btn,false); }
    });
  }

  async function toggleMaster(tab, id) {
    const map = { components:['bent_components',state.masters.components], antigens:['bent_antigens',state.masters.antigens], sources:['bent_blood_sources',state.masters.sources] };
    const [table,list] = map[tab]; const item = list.find(x => x.id === id); if (!item) return;
    try {
      const { error } = await state.supabase.from(table).update({ is_active: !item.is_active }).eq('id', id); if (error) throw error;
      await loadMasters(); toast('เปลี่ยนสถานะแล้ว', '', 'success'); await loadAdminTab(tab);
    } catch (error) { toast('เปลี่ยนสถานะไม่สำเร็จ', U.friendlyError(error), 'error'); }
  }

  async function adminStats(host) {
    const { data, error } = await state.supabase.rpc('bent_get_pilot_stats'); if (error) throw error;
    const chart = (title, rows, labelKey) => {
      const list = rows || []; const max = Math.max(...list.map(x => x.total),1);
      return `<section class="panel"><div class="panel-header"><h2>${U.esc(title)}</h2></div><div class="panel-body chart-list">${list.map(x => `<div class="chart-row"><span>${U.esc(x[labelKey] || '-')}</span><div class="chart-bar"><span style="width:${Math.round(x.total/max*100)}%"></span></div><b>${x.total}</b></div>`).join('') || 'ยังไม่มีข้อมูล'}</div></section>`;
    };
    host.innerHTML = `<div class="page-stack"><section class="stat-grid">${statCard('โรงพยาบาลที่เปิดใช้งาน',data.hospitals_active,'แห่ง')}${statCard('ผู้ใช้งานที่เปิดใช้งาน',data.users_active,'บัญชี')}${statCard('ประกาศว่ามีเลือดทั้งหมด',data.offers,'รายการ')}${statCard('ประกาศว่าต้องการเลือดทั้งหมด',data.requests,'รายการ')}${statCard('ประสานงานสำเร็จ',data.success_items,'รายการ')}${statCard('Unit ที่สำเร็จ',data.coordinated_units,'Unit')}${statCard('หาได้ช่องทางอื่น',data.found_other_channel,'รายการ')}${statCard('เวลาเฉลี่ยจนปิด',data.average_close_hours,'ชั่วโมง')}${statCard('รายการหมดอายุ',data.expired_items,'รายการ')}${statCard('ประกาศมีรูป',data.with_images,'รายการ')}${statCard('รูปซ่อน/ลบ',data.images_hidden_or_deleted,'รายการ')}</section>${chart('ผลิตภัณฑ์ที่ถูกประกาศมากที่สุด',data.top_components,'display_name')}${chart('แอนติเจนผลลบที่ถูกประกาศมากที่สุด',data.top_antigens,'antigen')}${chart('แหล่งที่มาของผลิตภัณฑ์โลหิต',data.blood_sources,'display_name')}${chart('เหตุผลการปิดรายการ',data.closure_reasons,'closure_reason')}</div>`;
  }

  async function adminImages(host) {
    const { data, error } = await state.supabase.from('bent_announcement_images').select('*, announcement:bent_announcements(id,status,hospital_id,hospital:bent_hospitals(name))').order('updated_at',{ascending:false});
    if (error) throw error;
    const buttons = x => {
      if (x.image_status === 'active') return `<button class="btn btn-soft" data-action="admin-hide-image" data-image="${x.id}">ซ่อนรูป</button><button class="btn btn-danger" data-action="admin-delete-image" data-id="${x.announcement_id}">ลบรูป</button>`;
      if (x.image_status === 'hidden') return `<button class="btn btn-soft" data-action="admin-show-image" data-image="${x.id}" data-id="${x.announcement_id}">แสดงรูป</button><button class="btn btn-danger" data-action="admin-delete-image" data-id="${x.announcement_id}">ลบรูป</button>`;
      if (['pending_delete','delete_failed'].includes(x.image_status)) return `<button class="btn btn-primary" data-action="retry-image-delete" data-id="${x.announcement_id}">ลองลบอีกครั้ง</button>`;
      return '-';
    };
    host.dataset.images = JSON.stringify(data);
    host.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>จัดการรูป ${data.length} รายการ</h2><p>ซ่อนรูปได้ทันที หรือลบไฟล์จากโฟลเดอร์ Google Drive ส่วนตัว โดยระบบจะเก็บประวัติการเปลี่ยนแปลง</p></div></div><div class="panel-body">${data.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ไฟล์</th><th>โรงพยาบาล</th><th>ประกาศ</th><th>สถานะรูป</th><th>ข้อผิดพลาด</th><th></th></tr></thead><tbody>${data.map(x => `<tr><td>${U.esc(x.image_file_name)}</td><td>${U.esc(x.announcement?.hospital?.name || '-')}</td><td>${U.esc(U.statusLabel[x.announcement?.status] || x.announcement?.status || '-')}</td><td>${U.esc(x.image_status)}</td><td>${U.esc(x.delete_error || '-')}</td><td><div class="inline-actions">${buttons(x)}</div></td></tr>`).join('')}</tbody></table></div>` : emptyState('ยังไม่มีรูปในระบบ','')}</div></section>`;
    host.dataset.images = JSON.stringify(data);
  }

  async function adminAudit(host) {
    const { data, error } = await state.supabase.from('bent_audit_logs').select('*').order('performed_at',{ascending:false}).limit(150); if (error) throw error;
    host.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>ประวัติการเปลี่ยนแปลงล่าสุด</h2><p>เก็บการเปลี่ยนแปลงสำคัญโดยไม่ตั้งใจเก็บข้อมูลผู้ป่วย</p></div></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>วันเวลา</th><th>การทำรายการ</th><th>ข้อมูลที่เกี่ยวข้อง</th><th>ผู้ดำเนินการ</th><th>ข้อมูลใหม่</th></tr></thead><tbody>${data.map(x => `<tr><td>${U.fmtDateTime(x.performed_at)}</td><td>${U.esc(x.action)}</td><td>${U.esc(x.entity_type)}<br><small>${U.esc(x.entity_id || '')}</small></td><td>${U.esc(x.performed_by || '-')}</td><td><div class="audit-json">${U.esc(JSON.stringify(x.new_data,null,2) || '-')}</div></td></tr>`).join('')}</tbody></table></div></div></section>`;
  }

  function showOnboardingOnce() {
    const key = `bent_onboarding_${state.session.user.id}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, 'shown');
    openModal('เริ่มใช้ BENT ใน 4 ขั้นตอน', 'อ่านครั้งเดียวก็เริ่มใช้งานได้', `<div class="guide-grid"><div class="guide-card"><h3>1. ค้นหา</h3><p>ใช้ตัวกรองเพื่อหาผลิตภัณฑ์ หมู่เลือด และแอนติเจนที่ต้องการ</p></div><div class="guide-card"><h3>2. ติดต่อ</h3><p>เปิดรายละเอียด แล้วโทรหรือคัดลอกเบอร์ผู้ติดต่อ</p></div><div class="guide-card"><h3>3. สร้างประกาศ</h3><p>เลือกว่ามีเลือดหรือต้องการเลือด แล้วกรอกเฉพาะข้อมูลที่จำเป็น</p></div><div class="guide-card"><h3>4. ปิดรายการ</h3><p>บันทึกผลสั้น ๆ เพื่อใช้เป็นสถิติการใช้งาน โดยไม่ใส่ข้อมูลผู้ป่วย</p></div></div><div class="notice warning"><b>ห้ามบันทึก</b><p>ชื่อผู้ป่วย HN Diagnosis Donor ID เลขถุงเลือด Barcode หรือ QR Code</p></div><div class="modal-actions"><button class="btn btn-primary" data-close-modal>เข้าใจแล้ว เริ่มใช้งาน</button></div>`);
  }

  function openInstallHelp() {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (state.installPrompt) {
      state.installPrompt.prompt();
      state.installPrompt.userChoice.finally(() => state.installPrompt = null);
      return;
    }
    openModal('ติดตั้ง BENT บนหน้าจอหลัก', '', isIos ? `<ol><li>เปิดเว็บไซต์ BENT ด้วย Safari</li><li>แตะปุ่ม Share</li><li>เลือก “เพิ่มไปยังหน้าจอโฮม”</li><li>แตะ “เพิ่ม”</li></ol>` : `<ol><li>เปิดเว็บไซต์ BENT ด้วย Chrome</li><li>แตะเมนูจุดสามจุด</li><li>เลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”</li><li>กดยืนยัน</li></ol><p>หากยังไม่พบเมนู ให้เปิดเว็บไซต์ผ่าน HTTPS และโหลดหน้าใหม่หนึ่งครั้ง</p>`);
  }


  function bindStaticEvents() {
    $$('.auth-tab').forEach(btn => btn.addEventListener('click', () => {
      $$('.auth-tab').forEach(x => x.classList.toggle('active', x === btn));
      $('#loginForm').classList.toggle('hidden', btn.dataset.authTab !== 'login');
      $('#registerForm').classList.toggle('hidden', btn.dataset.authTab !== 'register');
    }));
    $$('.show-password').forEach(btn => btn.addEventListener('click', () => {
      const input = $(`#${btn.dataset.target}`); input.type = input.type === 'password' ? 'text' : 'password'; btn.textContent = input.type === 'password' ? 'แสดง' : 'ซ่อน';
    }));
    $('#loginForm').addEventListener('submit', login);
    $('#registerForm').addEventListener('submit', register);
    $('#passwordSetupForm').addEventListener('submit', saveSetupPassword);
    $('#backToLoginBtn').addEventListener('click', returnToLogin);
    $('#forgotPasswordBtn').addEventListener('click', forgotPassword);
    $('#logoutBtn').addEventListener('click', logout);
    $('#pendingLogoutBtn').addEventListener('click', logout);
    $('#refreshProfileBtn').addEventListener('click', routeSession);
    $('#mainNav').addEventListener('click', e => { const btn = e.target.closest('[data-view]'); if (btn) navigate(btn.dataset.view); });
    $('#openSidebarBtn').addEventListener('click', openSidebar);
    $('#closeSidebarBtn').addEventListener('click', closeSidebar);
    $('#sidebarBackdrop').addEventListener('click', closeSidebar);
    $('#helpTopBtn').addEventListener('click', () => navigate('guide'));
    $('#modalRoot').addEventListener('click', e => { if (e.target.closest('[data-close-modal]')) closeModal(); handleActionClick(e); });
    main.addEventListener('click', handleActionClick);
    window.addEventListener('online', updateConnectionState);
    window.addEventListener('offline', updateConnectionState);
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }

  async function login(event) {
    event.preventDefault(); const btn = event.submitter;
    try {
      setButtonBusy(btn, true, 'กำลังเข้าสู่ระบบ...');
      const { error } = await state.supabase.auth.signInWithPassword({ email: $('#loginEmail').value.trim(), password: $('#loginPassword').value });
      if (error) throw error;
    } catch (error) { toast('เข้าสู่ระบบไม่สำเร็จ', U.friendlyError(error), 'error'); }
    finally { setButtonBusy(btn, false); }
  }

  async function register(event) {
    event.preventDefault(); const btn = event.submitter;
    try {
      setButtonBusy(btn, true, 'กำลังส่งคำขอ...');
      await I.call({
        action: 'submit_account_request',
        full_name: $('#registerName').value.trim(),
        hospital_name: $('#registerHospital').value.trim(),
        phone: $('#registerPhone').value.trim(),
        email: $('#registerEmail').value.trim(),
        position_title: $('#registerPosition').value.trim(),
        website: $('#registerWebsite').value
      });
      openModal('ส่งคำขอแล้ว', 'ยังไม่มีการสร้างบัญชีในขั้นตอนนี้', `<ol><li>ผู้ดูแลระบบตรวจสอบข้อมูลและโรงพยาบาล</li><li>เมื่ออนุมัติ ระบบจะส่งลิงก์ตั้งรหัสผ่านไปยังอีเมลที่ระบุ</li><li>เปิดลิงก์ ตั้งรหัสผ่าน แล้วเข้าสู่ระบบ</li></ol><div class="notice warning"><b>ลิงก์ไม่มีการหมดอายุตามเวลา</b><p>ลิงก์ใช้ได้หนึ่งครั้ง และลิงก์เดิมจะถูกยกเลิกเมื่อมีการออกลิงก์ใหม่</p></div><div class="modal-actions"><button class="btn btn-primary" data-close-modal>รับทราบ</button></div>`);
      event.target.reset();
    } catch (error) { toast('ส่งคำขอไม่สำเร็จ', U.friendlyError(error), 'error'); }
    finally { setButtonBusy(btn, false); }
  }

  async function forgotPassword() {
    const email = $('#loginEmail').value.trim();
    if (!email) { toast('กรุณากรอกอีเมลก่อน', 'ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลนี้', 'error'); return; }
    try {
      await I.call({ action: 'request_password_reset', email });
      toast('รับคำขอแล้ว', 'หากอีเมลนี้เป็นบัญชีที่ใช้งาน ระบบจะส่งลิงก์ตั้งรหัสผ่านให้', 'success', 7000);
    } catch (error) { toast('ส่งคำขอไม่สำเร็จ', U.friendlyError(error), 'error'); }
  }

  async function logout() {
    try { await state.supabase?.auth.signOut(); } catch (_) {}
    state.session = null; state.profile = null; state.announcements = []; state.currentView = 'dashboard'; showScreen('auth');
  }

  async function handleActionClick(event) {
    const viewBtn = event.target.closest('[data-view]');
    if (viewBtn && !viewBtn.closest('#mainNav')) { await navigate(viewBtn.dataset.view); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const id = event.target.closest('[data-id]')?.dataset.id;
    const item = id ? findAnnouncement(id) : null;
    if (action === 'reload-app') await enterApp();
    else if (action === 'clear-filters') { state.filters = {}; renderBrowse(); }
    else if (action === 'create-offer') { state.editingAnnouncement = null; renderAnnouncementForm(null,'offer'); }
    else if (action === 'create-request') { state.editingAnnouncement = null; renderAnnouncementForm(null,'request'); }
    else if (action === 'detail' && item) openDetail(item);
    else if (action === 'view-image' && item) await openImage(item);
    else if (action === 'coordinate' && item) await setCoordinating(item);
    else if (action === 'edit' && item) { state.editingAnnouncement = item; await navigate('create',{item}); }
    else if (action === 'close' && item) openCloseModal(item);
    else if (action === 'cancel' && item) confirmCancel(item);
    else if (action === 'copy-phone') { await navigator.clipboard.writeText(event.target.closest('[data-phone]').dataset.phone); toast('คัดลอกเบอร์แล้ว','','success'); }
    else if (action === 'install-pwa') openInstallHelp();
    else if (action === 'admin-review-request') {
      const requests = JSON.parse($('#adminContent').dataset.requests || '[]'); openAccountRequest(requests.find(x => x.id === event.target.closest('[data-request]').dataset.request));
    }
    else if (action === 'admin-resend-request-link') {
      const requests = JSON.parse($('#adminContent').dataset.requests || '[]'); await resendRequestLink(requests.find(x => x.id === event.target.closest('[data-request]').dataset.request));
    }
    else if (action === 'admin-edit-user') {
      const users = JSON.parse($('#adminContent').dataset.users || '[]'); openAdminUser(users.find(x => x.id === event.target.closest('[data-user]').dataset.user));
    }
    else if (action === 'edit-hospital') openHospitalEdit(state.masters.hospitals.find(x => x.id === id));
    else if (action === 'edit-master') {
      const tab = event.target.closest('[data-tab]').dataset.tab;
      const list = {components:state.masters.components,antigens:state.masters.antigens,sources:state.masters.sources}[tab];
      openMasterEdit(tab,list.find(x => x.id === id));
    }
    else if (action === 'toggle-master') await toggleMaster(event.target.closest('[data-tab]').dataset.tab,id);
    else if (action === 'remove-image' && item) confirmRemoveImage(item);
    else if (action === 'admin-hide-image') await setImageVisibility(event.target.closest('[data-image]').dataset.image,'hidden');
    else if (action === 'admin-show-image') {
      const ann = findAnnouncement(id);
      if (!ann || !['open','coordinating'].includes(ann.status)) toast('แสดงรูปไม่ได้','ประกาศไม่ได้อยู่สถานะเปิดหรือกำลังประสานงาน','error');
      else await setImageVisibility(event.target.closest('[data-image]').dataset.image,'active');
    }
    else if (action === 'admin-delete-image') {
      const ann = findAnnouncement(id); if (ann) confirmRemoveImage(ann,true);
    }
    else if (action === 'retry-image-delete') {
      try { await I.remove({ accessToken:state.session.access_token, announcementId:id }); toast('ลบไฟล์แล้ว','','success'); await loadAdminTab('images'); }
      catch (error) { toast('ลบไฟล์ไม่สำเร็จ',U.friendlyError(error),'error'); }
    }
  }

  function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.remove('hidden'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.add('hidden'); }

  function updateConnectionState() {
    const online = navigator.onLine;
    $('#offlineBanner').classList.toggle('hidden', online);
    const pill = $('#connectionStatus'); if (pill) { pill.textContent = online ? 'ออนไลน์' : 'ออฟไลน์'; pill.classList.toggle('offline', !online); }
  }

  function registerPwa() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
    }
  }

  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-admin-tab]');
    if (tab) loadAdminTab(tab.dataset.adminTab);
  });

  init().catch(error => {
    renderSetupScreen();
    toast('เริ่มแอปไม่สำเร็จ', U.friendlyError(error), 'error');
  });
})();
