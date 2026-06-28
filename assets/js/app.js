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
    searchPerformed: false,
    adminFilters: {},
    initialized: false,
    setupToken: null,
    authRouteId: 0,
    registrationHospitals: [],
    registrationOptionsProvince: '',
    registrationOptionsLoadingProvince: ''
  };

  const screens = {
    setup: $('#setupScreen'), auth: $('#authScreen'), passwordSetup: $('#passwordSetupScreen'), pending: $('#pendingScreen'), app: $('#appShell')
  };
  const main = $('#mainContent');


  const THAI_PROVINCES = [
    'กรุงเทพมหานคร','สมุทรปราการ','นนทบุรี','ปทุมธานี','พระนครศรีอยุธยา','อ่างทอง','ลพบุรี','สิงห์บุรี','ชัยนาท','สระบุรี',
    'ชลบุรี','ระยอง','จันทบุรี','ตราด','ฉะเชิงเทรา','ปราจีนบุรี','นครนายก','สระแก้ว','นครราชสีมา','บุรีรัมย์','สุรินทร์',
    'ศรีสะเกษ','อุบลราชธานี','ยโสธร','ชัยภูมิ','อำนาจเจริญ','บึงกาฬ','หนองบัวลำภู','ขอนแก่น','อุดรธานี','เลย','หนองคาย',
    'มหาสารคาม','ร้อยเอ็ด','กาฬสินธุ์','สกลนคร','นครพนม','มุกดาหาร','เชียงใหม่','ลำพูน','ลำปาง','อุตรดิตถ์','แพร่','น่าน',
    'พะเยา','เชียงราย','แม่ฮ่องสอน','นครสวรรค์','อุทัยธานี','กำแพงเพชร','ตาก','สุโขทัย','พิษณุโลก','พิจิตร','เพชรบูรณ์',
    'ราชบุรี','กาญจนบุรี','สุพรรณบุรี','นครปฐม','สมุทรสาคร','สมุทรสงคราม','เพชรบุรี','ประจวบคีรีขันธ์','นครศรีธรรมราช',
    'กระบี่','พังงา','ภูเก็ต','สุราษฎร์ธานี','ระนอง','ชุมพร','สงขลา','สตูล','ตรัง','พัทลุง','ปัตตานี','ยะลา','นราธิวาส'
  ];

  const THAI_REGIONS = {
    'ภาคเหนือ': ['เชียงใหม่','ลำพูน','ลำปาง','อุตรดิตถ์','แพร่','น่าน','พะเยา','เชียงราย','แม่ฮ่องสอน','นครสวรรค์','อุทัยธานี','กำแพงเพชร','ตาก','สุโขทัย','พิษณุโลก','พิจิตร','เพชรบูรณ์'],
    'ภาคตะวันออกเฉียงเหนือ': ['นครราชสีมา','บุรีรัมย์','สุรินทร์','ศรีสะเกษ','อุบลราชธานี','ยโสธร','ชัยภูมิ','อำนาจเจริญ','บึงกาฬ','หนองบัวลำภู','ขอนแก่น','อุดรธานี','เลย','หนองคาย','มหาสารคาม','ร้อยเอ็ด','กาฬสินธุ์','สกลนคร','นครพนม','มุกดาหาร'],
    'ภาคกลาง': ['กรุงเทพมหานคร','สมุทรปราการ','นนทบุรี','ปทุมธานี','พระนครศรีอยุธยา','อ่างทอง','ลพบุรี','สิงห์บุรี','ชัยนาท','สระบุรี','นครนายก','สุพรรณบุรี','นครปฐม','สมุทรสาคร','สมุทรสงคราม'],
    'ภาคตะวันออก': ['ชลบุรี','ระยอง','จันทบุรี','ตราด','ฉะเชิงเทรา','ปราจีนบุรี','สระแก้ว'],
    'ภาคตะวันตก': ['ราชบุรี','กาญจนบุรี','เพชรบุรี','ประจวบคีรีขันธ์'],
    'ภาคใต้': ['นครศรีธรรมราช','กระบี่','พังงา','ภูเก็ต','สุราษฎร์ธานี','ระนอง','ชุมพร','สงขลา','สตูล','ตรัง','พัทลุง','ปัตตานี','ยะลา','นราธิวาส']
  };
  const REGION_NAMES = Object.keys(THAI_REGIONS);
  const PROVINCE_REGION = Object.fromEntries(REGION_NAMES.flatMap(region => THAI_REGIONS[region].map(province => [province, region])));

  const MEMBER_REPORT_REASON_LABEL = {
    resigned: 'ลาออกจากโรงพยาบาล',
    left_hospital: 'ย้ายไปโรงพยาบาลอื่น',
    transferred_unit: 'ย้ายหน่วยและไม่ได้ปฏิบัติงานด้านธนาคารเลือดแล้ว',
    other: 'อื่น ๆ'
  };
  const MEMBER_REPORT_STATUS_LABEL = {
    pending_verification: 'รอผู้ดูแลตรวจสอบ',
    confirmed_inactive: 'ตรวจสอบแล้วและปิดบัญชี',
    dismissed: 'ตรวจสอบแล้ว ไม่ดำเนินการ',
    cancelled: 'ผู้แจ้งยกเลิก'
  };
  const SUPPORT_CATEGORY_LABEL = {
    question: 'สอบถามการใช้งาน',
    suggestion: 'เสนอแนะ',
    problem: 'แจ้งปัญหา',
    account: 'บัญชีผู้ใช้งาน',
    other: 'เรื่องอื่น ๆ'
  };
  const SUPPORT_STATUS_LABEL = {
    waiting_admin: 'รอผู้ดูแลตอบ',
    waiting_user: 'รอผู้ใช้งานตอบ',
    resolved: 'ปิดเรื่องแล้ว'
  };


  function provinceOptions(selected = '') {
    return `<option value="">-- กรุณาเลือกจังหวัด --</option>${THAI_PROVINCES.map(name => `<option value="${U.esc(name)}" ${name === selected ? 'selected' : ''}>${U.esc(name)}</option>`).join('')}`;
  }

  function normalizeHospitalName(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/^(โรงพยาบาล|ร\.?\s*พ\.?)\s*/i, '')
      .replace(/[\s\u00a0().,\-_/\\]+/g, '');
  }

  function levenshteinDistance(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    const row = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= right.length; j += 1) {
        const saved = row[j];
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
        previous = saved;
      }
    }
    return row[right.length];
  }

  function hospitalSimilarity(left, right) {
    const a = normalizeHospitalName(left);
    const b = normalizeHospitalName(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const longest = Math.max(a.length, b.length);
    const editScore = longest ? 1 - (levenshteinDistance(a, b) / longest) : 0;
    const containsScore = (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a)))
      ? Math.min(a.length, b.length) / longest
      : 0;
    return Math.max(editScore, containsScore);
  }

  function similarHospitals(name, province, includeInactive = true) {
    const target = normalizeHospitalName(name);
    if (!target) return [];
    return state.masters.hospitals
      .filter(hospital => (!province || hospital.province === province) && (includeInactive || hospital.is_active))
      .map(hospital => ({ hospital, score: hospitalSimilarity(name, hospital.name) }))
      .filter(item => item.score >= 0.68)
      .sort((a, b) => b.score - a.score || a.hospital.name.localeCompare(b.hospital.name, 'th'));
  }

  function initializeRegistrationForm() {
    const province = $('#registerProvince');
    if (!province) return;
    province.innerHTML = provinceOptions('');
    resetRegistrationHospital(false);
  }

  async function loadRegistrationOptions(province = $('#registerProvince')?.value || '') {
    if (!province) return;
    if (state.registrationOptionsProvince === province) {
      renderRegistrationHospitalSuggestions();
      return;
    }
    if (state.registrationOptionsLoadingProvince === province) return;

    state.registrationOptionsLoadingProvince = province;
    const search = $('#registerHospitalSearch');
    if (search && $('#registerProvince')?.value === province) {
      search.placeholder = 'กำลังโหลดรายชื่อโรงพยาบาลในจังหวัดนี้...';
    }

    try {
      const data = await I.call({ action: 'get_registration_options', province });
      if ($('#registerProvince')?.value !== province) return;
      state.registrationHospitals = Array.isArray(data.hospitals) ? data.hospitals : [];
      state.registrationOptionsProvince = province;
      if (search) search.placeholder = 'พิมพ์อย่างน้อย 1 ตัวอักษรเพื่อค้นหา';
      renderRegistrationHospitalSuggestions();
    } catch (error) {
      if ($('#registerProvince')?.value === province) {
        state.registrationHospitals = [];
        state.registrationOptionsProvince = '';
        if (search) search.placeholder = 'โหลดรายชื่อโรงพยาบาลไม่สำเร็จ กรุณาลองใหม่';
      }
      throw error;
    } finally {
      if (state.registrationOptionsLoadingProvince === province) {
        state.registrationOptionsLoadingProvince = '';
      }
    }
  }

  function resetRegistrationHospital(clearProvince = false) {
    if (clearProvince && $('#registerProvince')) $('#registerProvince').value = '';
    if ($('#registerHospitalId')) $('#registerHospitalId').value = '';
    if ($('#registerHospitalMode')) $('#registerHospitalMode').value = '';
    if ($('#registerHospitalSearch')) {
      $('#registerHospitalSearch').value = '';
      $('#registerHospitalSearch').disabled = !$('#registerProvince')?.value;
      $('#registerHospitalSearch').placeholder = $('#registerProvince')?.value
        ? 'พิมพ์บางส่วนของชื่อโรงพยาบาล'
        : 'เลือกจังหวัดก่อน แล้วพิมพ์ชื่อโรงพยาบาล';
    }
    if ($('#registerNewHospitalBtn')) $('#registerNewHospitalBtn').disabled = !$('#registerProvince')?.value;
    $('#registerHospitalSuggestions')?.classList.add('hidden');
    $('#registerHospitalSelected')?.classList.add('hidden');
    $('#registerNewHospitalFields')?.classList.add('hidden');
    $('#registerExistingHospitalPhone')?.classList.add('hidden');
    $('#registerHospitalPhoneProposalLabel')?.classList.add('hidden');
    if ($('#registerNewHospitalName')) $('#registerNewHospitalName').value = '';
    if ($('#registerHospitalPhoneProposed')) $('#registerHospitalPhoneProposed').value = '';
    if ($('#registerExistingHospitalPhoneProposed')) $('#registerExistingHospitalPhoneProposed').value = '';
  }

  function registrationHospitalsForProvince() {
    const province = $('#registerProvince')?.value || '';
    return state.registrationHospitals.filter(hospital => hospital.province === province && hospital.is_active !== false);
  }

  function renderRegistrationHospitalSuggestions() {
    const box = $('#registerHospitalSuggestions');
    const input = $('#registerHospitalSearch');
    if (!box || !input || input.disabled || $('#registerHospitalMode')?.value === 'new') return;
    const province = $('#registerProvince')?.value || '';
    const query = normalizeHospitalName(input.value);
    if (!query) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    if (state.registrationOptionsProvince !== province) {
      box.innerHTML = '<div class="autocomplete-empty">กำลังโหลดรายชื่อโรงพยาบาลในจังหวัดนี้...</div>';
      box.classList.remove('hidden');
      loadRegistrationOptions(province).catch(error => toast('โหลดรายชื่อโรงพยาบาลไม่สำเร็จ', U.friendlyError(error), 'error'));
      return;
    }
    const allMatches = registrationHospitalsForProvince()
      .filter(hospital => normalizeHospitalName(hospital.name).includes(query));
    const matches = allMatches.slice(0, 8);
    box.innerHTML = matches.length
      ? `${matches.map(hospital => `<button type="button" class="autocomplete-option" data-register-hospital-id="${hospital.id}" role="option"><b>${U.esc(hospital.name)}</b><span>${U.esc(hospital.phone || 'ยังไม่มีเบอร์โทรในระบบ')}</span></button>`).join('')}${allMatches.length > matches.length ? `<div class="autocomplete-more">พบ ${allMatches.length} แห่ง · แสดง 8 รายการแรก กรุณาพิมพ์เพิ่มเพื่อกรองให้แคบลง</div>` : ''}`
      : `<div class="autocomplete-empty">ไม่พบใน Master ของจังหวัดนี้<br><small>กด “ไม่พบโรงพยาบาลของฉัน” เพื่อเสนอชื่อใหม่</small></div>`;
    box.classList.remove('hidden');
  }

  function selectRegistrationHospital(hospital) {
    if (!hospital) return;
    $('#registerHospitalId').value = hospital.id;
    $('#registerHospitalMode').value = 'existing';
    $('#registerHospitalSearch').value = hospital.name;
    $('#registerHospitalSuggestions').classList.add('hidden');
    $('#registerNewHospitalFields').classList.add('hidden');
    const selected = $('#registerHospitalSelected');
    selected.innerHTML = `<b>เลือกแล้ว: ${U.esc(hospital.name)}</b><span>${U.esc(hospital.province || '')}</span>`;
    selected.classList.remove('hidden');
    const phoneBox = $('#registerExistingHospitalPhone');
    $('#registerHospitalPhoneCurrent').textContent = hospital.phone
      ? `เบอร์โทรโรงพยาบาลใน Master: ${hospital.phone}`
      : 'โรงพยาบาลนี้ยังไม่มีเบอร์โทรใน Master';
    phoneBox.classList.remove('hidden');
    $('#registerHospitalPhoneProposalLabel').classList.add('hidden');
    $('#registerExistingHospitalPhoneProposed').value = '';
  }

  function startNewHospitalRequest() {
    const province = $('#registerProvince').value;
    if (!province) {
      toast('กรุณาเลือกจังหวัดก่อน', '', 'error');
      return;
    }
    const typed = $('#registerHospitalSearch').value.trim();
    $('#registerHospitalMode').value = 'new';
    $('#registerHospitalId').value = '';
    $('#registerHospitalSuggestions').classList.add('hidden');
    $('#registerHospitalSelected').classList.add('hidden');
    $('#registerExistingHospitalPhone').classList.add('hidden');
    $('#registerNewHospitalFields').classList.remove('hidden');
    $('#registerNewHospitalName').value = typed;
    $('#registerNewHospitalName').focus();
  }

  function handleRegistrationProvinceChange() {
    resetRegistrationHospital(false);
    state.registrationHospitals = [];
    state.registrationOptionsProvince = '';
    const province = $('#registerProvince').value;
    const enabled = Boolean(province);
    $('#registerHospitalSearch').disabled = !enabled;
    $('#registerNewHospitalBtn').disabled = !enabled;
    if (enabled) {
      $('#registerHospitalSearch').placeholder = 'กำลังโหลดรายชื่อโรงพยาบาลในจังหวัดนี้...';
      $('#registerHospitalSearch').focus();
      loadRegistrationOptions(province).catch(error => toast('โหลดรายชื่อโรงพยาบาลไม่สำเร็จ', U.friendlyError(error), 'error'));
    }
  }

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
    initializeRegistrationForm();
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


    let passwordSetupCompleted = false;
    try {
      passwordSetupCompleted = sessionStorage.getItem('bent_password_setup_success') === '1';
      if (passwordSetupCompleted) sessionStorage.removeItem('bent_password_setup_success');
    } catch (_) {}

    // A setup-link page intentionally returns before registering the auth listener.
    // After password setup we therefore reload to the clean URL and initialize auth here.
    if (passwordSetupCompleted) {
      try { await state.supabase.auth.signOut({ scope: 'local' }); } catch (_) {}
    }

    // Keep this callback synchronous. Running Supabase queries directly inside an
    // async onAuthStateChange callback can deadlock the client.
    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      scheduleRouteSession();
    });

    const { data, error } = await state.supabase.auth.getSession();
    if (error) toast('เปิด Session ไม่สำเร็จ', U.friendlyError(error), 'error');
    state.session = data?.session || null;
    await routeSession();
    state.initialized = true;

    if (passwordSetupCompleted && !state.session?.user) {
      showScreen('auth');
      openModal('ตั้งรหัสผ่านสำเร็จ', 'บัญชีพร้อมใช้งานแล้ว', `<p>เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่เพิ่งกำหนดได้ทันที</p><div class="modal-actions"><button class="btn btn-primary" data-close-modal>เข้าสู่ระบบ</button></div>`);
    }
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
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('setup');
      cleanUrl.hash = '';
      try { sessionStorage.setItem('bent_password_setup_success', '1'); } catch (_) {}
      state.setupToken = null;
      event.target.reset();

      // Reload the clean URL so the normal auth listener is registered. The setup-link
      // branch exits init() early by design, so merely revealing the login form leaves
      // the page unable to route a successful login into the application.
      location.replace(cleanUrl.toString());
      return;
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

  function scheduleRouteSession() {
    window.setTimeout(() => {
      routeSession().catch(handleRouteSessionError);
    }, 0);
  }

  function handleRouteSessionError(error) {
    if (state.session?.user) {
      showScreen('pending');
      $('#pendingTitle').textContent = 'เปิดบัญชีไม่สำเร็จ';
      $('#pendingMessage').textContent = U.friendlyError(error);
    } else {
      showScreen('auth');
    }
    toast('เปิดหน้าใช้งานไม่สำเร็จ', U.friendlyError(error), 'error');
  }

  async function routeSession() {
    const routeId = ++state.authRouteId;
    const sessionAtStart = state.session;

    if (!sessionAtStart?.user) {
      state.profile = null;
      state.hospital = null;
      showScreen('auth');
      return;
    }

    const { data: profile, error } = await state.supabase
      .from('bent_profiles')
      .select('*, hospital:bent_hospitals(id,name,province,phone,is_active)')
      .eq('id', sessionAtStart.user.id)
      .maybeSingle();

    if (routeId !== state.authRouteId || state.session?.user?.id !== sessionAtStart.user.id) return;

    if (error) {
      showScreen('pending');
      $('#pendingTitle').textContent = 'อ่านข้อมูลบัญชีไม่สำเร็จ';
      $('#pendingMessage').textContent = U.friendlyError(error);
      return;
    }

    state.profile = profile;
    state.hospital = profile?.hospital || null;
    if (!profile || profile.status !== 'active' || !profile.hospital_id) {
      renderPending(profile);
      return;
    }

    await enterApp(routeId);
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

  async function enterApp(routeId = state.authRouteId) {
    showScreen('app');
    loading();
    try {
      await loadMasters();
      const hospitalFromMaster = state.masters.hospitals.find(h => h.id === state.profile.hospital_id);
      state.hospital = hospitalFromMaster || state.profile?.hospital || state.hospital || null;
      if (state.hospital && !state.masters.hospitals.some(h => h.id === state.hospital.id)) {
        state.masters.hospitals.push(state.hospital);
        state.masters.hospitals.sort((a, b) => a.name.localeCompare(b.name, 'th'));
      }
      await loadAnnouncements();
      if (routeId !== state.authRouteId || !state.session?.user) return;
      renderNavigation();
      renderUserBlock();
      await navigate(state.currentView || 'dashboard');
      showOnboardingOnce();
    } catch (error) {
      main.innerHTML = `<div class="notice danger"><b>โหลดข้อมูลไม่สำเร็จ</b><p>${U.esc(U.friendlyError(error))}</p><button class="btn btn-primary" data-action="reload-app">ลองอีกครั้ง</button></div>`;
    }
  }
  async function fetchHospitalPages(configureQuery = query => query) {
    const pageSize = 500;
    const rows = [];
    let from = 0;

    while (true) {
      let query = state.supabase
        .from('bent_hospitals')
        .select('*')
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      query = configureQuery(query);
      const { data, error } = await query;
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    return rows;
  }

  function mergeHospitalsIntoMaster(hospitals) {
    const byId = new Map(state.masters.hospitals.map(hospital => [hospital.id, hospital]));
    (hospitals || []).forEach(hospital => byId.set(hospital.id, hospital));
    state.masters.hospitals = Array.from(byId.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'th') || String(a.id).localeCompare(String(b.id)));
  }

  async function refreshHospitalsForAccountRequest(request) {
    const province = String(request?.province || '').trim();
    const requestedName = String(request?.hospital_name || '').trim();
    const requestedId = String(request?.requested_hospital_id || '').trim();
    const tasks = [];

    if (province) tasks.push(fetchHospitalPages(query => query.eq('province', province)));
    if (requestedId && !state.masters.hospitals.some(hospital => hospital.id === requestedId)) {
      tasks.push(state.supabase.from('bent_hospitals').select('*').eq('id', requestedId).limit(1));
    }
    if (requestedName) {
      tasks.push(state.supabase.from('bent_hospitals').select('*').ilike('name', requestedName).limit(20));
    }

    const results = await Promise.all(tasks);
    const rows = [];
    results.forEach(result => {
      if (Array.isArray(result)) {
        rows.push(...result);
        return;
      }
      if (result.error) throw result.error;
      rows.push(...(result.data || []));
    });
    mergeHospitalsIntoMaster(rows);
  }

  async function loadMasters() {
    const [components, antigens, sources, hospitals] = await Promise.all([
      state.supabase.from('bent_components').select('*').order('sort_order'),
      state.supabase.from('bent_antigens').select('*').order('sort_order'),
      state.supabase.from('bent_blood_sources').select('*').order('sort_order'),
      fetchHospitalPages()
    ]);
    for (const result of [components, antigens, sources]) {
      if (result.error) throw result.error;
    }
    state.masters.components = components.data || [];
    state.masters.antigens = antigens.data || [];
    state.masters.sources = sources.data || [];
    state.masters.hospitals = hospitals;
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

  function dateTimeLocalValue(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function bangkokDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).reduce((map, part) => {
      if (part.type !== 'literal') map[part.type] = part.value;
      return map;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function adminFilterState(tab) {
    if (!state.adminFilters[tab]) state.adminFilters[tab] = {};
    return state.adminFilters[tab];
  }

  function bindAdminFilterControls(tab, onChange) {
    const root = $('#adminContent');
    if (!root) return;
    const filters = adminFilterState(tab);
    const run = U.debounce(onChange, 120);
    $$('[data-admin-filter]', root).forEach(input => {
      const key = input.dataset.adminFilter;
      if (Object.prototype.hasOwnProperty.call(filters, key)) input.value = filters[key];
      input.addEventListener(input.tagName === 'SELECT' || input.type === 'date' ? 'change' : 'input', () => {
        filters[key] = input.value;
        run();
      });
    });
    $('[data-admin-filter-clear]', root)?.addEventListener('click', () => {
      state.adminFilters[tab] = {};
      $$('[data-admin-filter]', root).forEach(input => { input.value = ''; });
      onChange();
    });
  }

  function adminFilterBar(fields, hint = 'กรองรายการเพื่อทำงานได้เร็วขึ้น') {
    return `<section class="admin-filter-panel"><div class="admin-filter-heading"><div><b>ตัวกรอง</b><span>${U.esc(hint)}</span></div><button type="button" class="btn btn-ghost" data-admin-filter-clear>ล้างตัวกรอง</button></div><div class="admin-filter-grid">${fields}</div></section>`;
  }

  function renderNavigation() {
    const items = [
      ['dashboard', 'OV', 'ภาพรวม'],
      ['browse', 'ค้น', 'ค้นหาประกาศ'],
      ['create', 'เพิ่ม', 'สร้างประกาศ'],
      ['mine', 'รพ.', 'รายการของโรงพยาบาลฉัน'],
      ['members', 'คน', 'สมาชิกโรงพยาบาล'],
      ['account', 'ฉัน', 'ข้อมูลบัญชีของฉัน'],
      ['support', 'แชท', 'ติดต่อผู้ดูแล'],
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
    else if (view === 'members') await renderHospitalMembers();
    else if (view === 'account') await renderAccount();
    else if (view === 'support') await renderSupport();
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
    const todayKey = bangkokDateKey();
    const todayRows = active.filter(a => bangkokDateKey(a.created_at) === todayKey);
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
            <button class="quick-card" data-view="browse"><b>ค้นหาเลือดหรือความต้องการ</b><span>กรอกตัวกรอง แล้วกดค้นหาเพื่อแสดงผล</span></button>
            <button class="quick-card" data-action="create-offer"><b>ประกาศว่ามีเลือด</b><span>ระบุจำนวน วันหมดอายุ และแหล่งที่มาของเลือด</span></button>
            <button class="quick-card" data-action="create-request"><b>ประกาศว่าต้องการเลือด</b><span>ระบุจำนวน วันที่ต้องการ และระดับความเร่งด่วน</span></button>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h2>ประกาศวันนี้</h2><p>แสดงเฉพาะประกาศที่สร้างวันนี้และยังเปิดรับการติดต่อ</p></div><button class="btn btn-soft" data-view="browse">ค้นหาประกาศทั้งหมด</button></div>
          <div class="panel-body"><div class="announcement-grid">${todayRows.slice(0, 4).map(renderAnnouncementCard).join('') || emptyState('วันนี้ยังไม่มีประกาศใหม่','ประกาศวันก่อนยังค้นหาได้จากเมนู “ค้นหาประกาศ”')}</div></div>
        </section>
        <div class="notice warning"><b>ข้อควรจำ</b><p>BENT ใช้ช่วยค้นหาและติดต่อเท่านั้น โรงพยาบาลผู้รับต้องตรวจสอบผลิตภัณฑ์ เอกสาร คุณภาพ การขนส่ง และดำเนินการตาม SOP ก่อนรับหรือจ่ายผลิตภัณฑ์โลหิต</p></div>
      </div>`;
  }
  function statCard(label, number, small) {
    return `<div class="stat-card"><span>${U.esc(label)}</span><strong>${Number(number || 0).toLocaleString('th-TH')}</strong><small>${U.esc(small || '')}</small></div>`;
  }

  function regionOptions(selected = '') {
    return `<option value="">ทุกภาค</option>${REGION_NAMES.map(region => `<option value="${U.esc(region)}" ${region === selected ? 'selected' : ''}>${U.esc(region)}</option>`).join('')}`;
  }

  function provinceFilterOptions(region = '', selected = '') {
    const provinces = region ? (THAI_REGIONS[region] || []) : THAI_PROVINCES;
    return `<option value="">ทุกจังหวัด</option>${provinces.map(province => `<option value="${U.esc(province)}" ${province === selected ? 'selected' : ''}>${U.esc(province)}</option>`).join('')}`;
  }

  function hospitalFilterOptions(region = '', province = '', selected = '') {
    const hospitals = activeMasters(state.masters.hospitals)
      .filter(hospital => !region || PROVINCE_REGION[hospital.province] === region)
      .filter(hospital => !province || hospital.province === province)
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
    return `<option value="">ทุกโรงพยาบาล</option>${hospitals.map(hospital => `<option value="${hospital.id}" ${hospital.id === selected ? 'selected' : ''}>${U.esc(hospital.name)}${province ? '' : ` — ${U.esc(hospital.province || 'ไม่ระบุจังหวัด')}`}</option>`).join('')}`;
  }

  function renderBrowse() {
    setPage('ค้นหาประกาศ', 'เลือกภาค จังหวัด หรือเงื่อนไขอื่น แล้วกด “ค้นหา”');
    const f = state.filters || {};
    const selectedAntigens = Array.isArray(f.antigens) ? f.antigens : (f.antigen ? [f.antigen] : []);
    main.innerHTML = `
      <div class="page-stack">
        <form class="filters" id="announcementFilters">
          <label class="filter-search">ค้นหาคำ<input id="filterText" value="${U.esc(f.text || '')}" placeholder="ชื่อผลิตภัณฑ์ โรงพยาบาล หรือแหล่งที่มา"></label>
          <label>ประเภทประกาศ<select id="filterType"><option value="">ทั้งหมด</option><option value="offer">มีเลือดพร้อมให้ติดต่อ</option><option value="request">ต้องการเลือด</option></select></label>
          <label>ผลิตภัณฑ์โลหิต<select id="filterComponent"><option value="">ทั้งหมด</option>${activeMasters(state.masters.components).map(c => `<option value="${c.id}">${U.esc(c.display_name)}</option>`).join('')}</select></label>
          <label>หมู่เลือด ABO<select id="filterAbo"><option value="">ทั้งหมด</option>${['A','B','O','AB','not_specified'].map(x => `<option value="${x}">${x === 'not_specified' ? 'ไม่ระบุ' : x}</option>`).join('')}</select></label>
          <label>หมู่เลือด Rh<select id="filterRh"><option value="">ทั้งหมด</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="not_specified">ไม่ระบุ</option></select></label>
          <label>ภาค<select id="filterRegion">${regionOptions(f.region || '')}</select></label>
          <label>จังหวัด<select id="filterProvince">${provinceFilterOptions(f.region || '', f.province || '')}</select></label>
          <label>โรงพยาบาล<select id="filterHospital">${hospitalFilterOptions(f.region || '', f.province || '', f.hospital || '')}</select></label>
          <label>สถานะประกาศ<select id="filterStatus"><option value="">รายการที่ยังติดต่อได้ทั้งหมด</option><option value="open">เปิดรับการติดต่อ</option><option value="coordinating">กำลังประสานงาน</option></select></label>
          <label>แหล่งที่มาของเลือด<select id="filterSource"><option value="">ทั้งหมด</option>${activeMasters(state.masters.sources).map(s => `<option value="${s.id}">${U.esc(s.display_name)}</option>`).join('')}</select></label>
          <label>รูปประกอบ<select id="filterImage"><option value="">ทั้งหมด</option><option value="yes">มีรูป</option><option value="no">ไม่มีรูป</option></select></label>
          <div class="filter-region-note">การแบ่งภาคใช้เพื่อช่วยค้นหาใน BENT เท่านั้น จังหวัดยังเป็นข้อมูลหลักของโรงพยาบาล</div>
          <div class="filter-antigen-field">
            <div class="filter-antigen-heading"><div><b>แอนติเจนที่ต้องการผลลบ</b><span>เลือกได้หลายรายการ โดยผลค้นหาต้องมีครบทุกตัวที่เลือก</span></div><small id="filterAntigenCount">ยังไม่ได้เลือก</small></div>
            <div class="filter-antigen-picker">${activeMasters(state.masters.antigens).map(a => `<label class="antigen-option"><input type="checkbox" name="filterAntigen" value="${U.esc(a.code)}" ${selectedAntigens.includes(a.code) ? 'checked' : ''}><span>${U.esc(a.display_name)}-</span></label>`).join('')}</div>
          </div>
          <div class="filter-actions"><button type="button" class="btn btn-ghost" data-action="clear-filters">ล้างตัวกรองทั้งหมด</button><button type="submit" class="btn btn-primary">ค้นหา</button></div>
        </form>
        <div class="result-head"><div><h2>ผลการค้นหา</h2><p id="resultCount"></p></div><button class="btn btn-primary" data-view="create">สร้างประกาศ</button></div>
        <section id="announcementResults" class="announcement-grid"></section>
      </div>`;

    Object.entries({ Type:'type', Component:'component', Abo:'abo', Rh:'rh', Status:'status', Source:'source', Image:'image' }).forEach(([id, key]) => {
      const el = $(`#filter${id}`); if (el && f[key]) el.value = f[key];
    });

    const refreshLocationFilters = (changed) => {
      const region = $('#filterRegion').value;
      let province = $('#filterProvince').value;
      let hospital = $('#filterHospital').value;
      if (changed === 'region' && province && PROVINCE_REGION[province] !== region) province = '';
      $('#filterProvince').innerHTML = provinceFilterOptions(region, province);
      province = $('#filterProvince').value;
      const validHospital = state.masters.hospitals.find(h => h.id === hospital);
      if (validHospital && ((region && PROVINCE_REGION[validHospital.province] !== region) || (province && validHospital.province !== province))) hospital = '';
      $('#filterHospital').innerHTML = hospitalFilterOptions(region, province, hospital);
    };
    $('#filterRegion').addEventListener('change', () => refreshLocationFilters('region'));
    $('#filterProvince').addEventListener('change', () => refreshLocationFilters('province'));

    const updateCount = () => {
      const count = $$('input[name="filterAntigen"]:checked').length;
      $('#filterAntigenCount').textContent = count ? `เลือก ${count} รายการ` : 'ยังไม่ได้เลือก';
    };
    $$('input[name="filterAntigen"]').forEach(el => el.addEventListener('change', updateCount));
    updateCount();
    $('#announcementFilters').addEventListener('submit', event => {
      event.preventDefault();
      state.searchPerformed = true;
      applyAnnouncementFilters();
    });
    if (state.searchPerformed) applyAnnouncementFilters();
    else {
      $('#resultCount').textContent = 'ยังไม่ได้ค้นหา';
      $('#announcementResults').innerHTML = emptyState('กรอกเงื่อนไขแล้วกด “ค้นหา”','ระบบจะยังไม่แสดงประกาศจนกว่าจะกดค้นหา');
    }
  }

  function collectFilters() {
    return {
      text: $('#filterText')?.value.trim().toLowerCase() || '', type: $('#filterType')?.value || '',
      component: $('#filterComponent')?.value || '', abo: $('#filterAbo')?.value || '', rh: $('#filterRh')?.value || '',
      antigens: $$('input[name="filterAntigen"]:checked').map(x => x.value), region: $('#filterRegion')?.value || '',
      province: $('#filterProvince')?.value || '', hospital: $('#filterHospital')?.value || '', status: $('#filterStatus')?.value || '',
      source: $('#filterSource')?.value || '', image: $('#filterImage')?.value || ''
    };
  }

  function applyAnnouncementFilters() {
    const f = collectFilters(); state.filters = f;
    let rows = activeAnnouncements();
    rows = rows.filter(a => {
      const searchable = [a.component?.display_name, a.other_component, a.hospital?.name, a.hospital?.province, a.source?.display_name, a.blood_source_detail, a.contact_name].join(' ').toLowerCase();
      const hasImage = (a.images || []).some(i => i.image_status === 'active');
      const announcementAntigens = a.phenotype_negative || [];
      const province = a.hospital?.province || '';
      return (!f.text || searchable.includes(f.text))
        && (!f.type || a.announcement_type === f.type)
        && (!f.component || a.component_id === f.component)
        && (!f.abo || a.abo === f.abo)
        && (!f.rh || a.rh === f.rh)
        && (!f.antigens.length || f.antigens.every(code => announcementAntigens.includes(code)))
        && (!f.region || PROVINCE_REGION[province] === f.region)
        && (!f.province || province === f.province)
        && (!f.hospital || a.hospital_id === f.hospital)
        && (!f.status || a.status === f.status)
        && (!f.source || a.blood_source_id === f.source)
        && (!f.image || (f.image === 'yes' ? hasImage : !hasImage));
    });
    const antigenCount = $('#filterAntigenCount');
    if (antigenCount) antigenCount.textContent = f.antigens.length ? `เลือก ${f.antigens.length} รายการ` : 'ยังไม่ได้เลือก';
    const locationText = [f.region, f.province].filter(Boolean).join(' · ');
    $('#resultCount').textContent = `พบ ${rows.length.toLocaleString('th-TH')} รายการ${locationText ? ` ใน ${locationText}` : ''}`;
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

  function renderAnnouncementCard(a, options = {}) {
    const antigen = a.phenotype_negative || [];
    const dateLabel = a.announcement_type === 'offer' ? 'หมดอายุ' : 'ต้องการภายใน';
    const dateValue = a.announcement_type === 'offer' ? a.expiry_date : a.needed_by;
    const image = (a.images || []).find(i => i.image_status === 'active');
    const manageable = canManage(a);
    const componentName = a.component?.code === 'OTHER' && a.other_component ? a.other_component : a.component?.display_name || '-';
    const adminDelete = Boolean(options.adminMode && isAdmin());
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
          ${adminDelete ? `<button class="btn btn-danger" data-action="admin-delete-announcement" data-id="${a.id}">ลบประกาศถาวร</button>` : ''}
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

  function confirmAdminDeleteAnnouncement(item) {
    if (!isAdmin() || !item) return;
    const componentName = item.component?.code === 'OTHER' && item.other_component ? item.other_component : item.component?.display_name || '-';
    openModal('ลบประกาศถาวร', `${componentName} · ${item.hospital?.name || '-'}`, `
      <div class="notice danger"><b>การลบนี้ย้อนกลับไม่ได้</b><p>ประกาศ รายละเอียด รูปภาพ และประวัติที่ผูกกับประกาศนี้จะถูกลบออกจากหน้าระบบ ผู้ดูแลควรใช้เมื่อเป็นข้อมูลทดสอบ ข้อมูลซ้ำ หรือข้อมูลที่ไม่ควรคงอยู่เท่านั้น</p></div>
      <label class="check-row"><input id="confirmDeleteAnnouncementCheck" type="checkbox"><span>ฉันตรวจสอบประกาศและยืนยันว่าต้องการลบถาวร</span></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button><button id="confirmDeleteAnnouncementBtn" type="button" class="btn btn-danger" disabled>ยืนยันลบประกาศถาวร</button></div>`);
    const check = $('#confirmDeleteAnnouncementCheck');
    const button = $('#confirmDeleteAnnouncementBtn');
    check.addEventListener('change', () => { button.disabled = !check.checked; });
    button.addEventListener('click', async () => {
      try {
        setButtonBusy(button, true, 'กำลังลบ...');
        const hasFile = (item.images || []).some(image => image.image_status !== 'deleted');
        if (hasFile) {
          try {
            await I.remove({ accessToken: state.session.access_token, announcementId: item.id });
          } catch (error) {
            throw new Error(`ลบไฟล์รูปไม่สำเร็จ จึงยังไม่ลบประกาศ: ${U.friendlyError(error)}`);
          }
        }
        const { error } = await state.supabase.rpc('bent_admin_delete_announcement', { p_announcement_id: item.id });
        if (error) throw error;
        closeModal();
        await loadAnnouncements();
        toast('ลบประกาศถาวรแล้ว', 'รายการถูกนำออกจากระบบเรียบร้อย', 'success');
        await loadAdminTab('announcements');
      } catch (error) {
        toast('ลบประกาศไม่สำเร็จ', U.friendlyError(error), 'error', 9000);
      } finally {
        setButtonBusy(button, false);
      }
    });
  }

  async function renderAccount() {
    setPage('ข้อมูลบัญชีของฉัน', 'แก้ไขข้อมูลติดต่อและส่งคำขอย้ายโรงพยาบาล');
    main.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';

    const { data: freshProfile, error: profileError } = await state.supabase
      .from('bent_profiles')
      .select('*, hospital:bent_hospitals(id,name,province,phone,is_active)')
      .eq('id', state.session.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (freshProfile) {
      state.profile = freshProfile;
      state.hospital = freshProfile.hospital || state.masters.hospitals.find(h => h.id === freshProfile.hospital_id) || null;
      renderUserBlock();
    }

    const { data: transfers, error: transferError } = await state.supabase
      .from('bent_hospital_transfer_requests')
      .select(`
        *,
        from_hospital:bent_hospitals!bent_hospital_transfer_requests_from_hospital_id_fkey(id,name,province,phone,is_active),
        to_hospital:bent_hospitals!bent_hospital_transfer_requests_to_hospital_id_fkey(id,name,province,phone,is_active)
      `)
      .eq('user_id', state.profile.id)
      .order('requested_at', { ascending: false })
      .limit(10);
    if (transferError) throw transferError;

    const pending = (transfers || []).find(row => row.status === 'pending_verification');
    const activeHospitals = state.masters.hospitals.filter(h => h.is_active && h.id !== state.profile.hospital_id);
    const historyHtml = (transfers || []).length
      ? `<div class="transfer-history">${transfers.map(row => `
          <div class="transfer-history-row">
            <div><b>${U.esc(row.from_hospital?.name || '-')} → ${U.esc(row.to_hospital?.name || '-')}</b><span>${U.esc(row.to_hospital?.province || '-')} · ส่งคำขอ ${U.fmtDateTime(row.requested_at)}</span></div>
            <span class="badge badge-${row.status}">${U.esc(U.statusLabel[row.status] || row.status)}</span>
          </div>`).join('')}</div>`
      : '<p class="field-help">ยังไม่มีประวัติคำขอย้ายโรงพยาบาล</p>';

    const pendingHtml = pending ? `
      <div class="hospital-status-card pending-transfer"><span>สถานะคำขอ</span><b>${U.esc(U.statusLabel[pending.status] || pending.status)}</b><p>${U.esc(pending.from_hospital?.name || '-')} → ${U.esc(pending.to_hospital?.name || '-')}</p></div>
      <div class="transfer-progress-grid">
        <div class="${pending.old_hospital_verified_at ? 'done' : ''}"><b>${pending.old_hospital_verified_at ? '✓' : '1'}</b><span>ตรวจสอบโรงพยาบาลเดิม</span></div>
        <div class="${pending.new_hospital_verified_at ? 'done' : ''}"><b>${pending.new_hospital_verified_at ? '✓' : '2'}</b><span>ตรวจสอบโรงพยาบาลใหม่</span></div>
        <div class="${pending.no_outstanding_items_confirmed ? 'done' : ''}"><b>${pending.no_outstanding_items_confirmed ? '✓' : '3'}</b><span>ตรวจรายการค้าง</span></div>
      </div>
      <div class="info-box"><b>เหตุผลที่แจ้ง</b><p>${U.esc(pending.reason)}</p>${pending.requested_effective_date ? `<p>วันที่คาดว่าจะเริ่มงาน: ${U.fmtDate(pending.requested_effective_date)}</p>` : ''}${pending.admin_note ? `<p>หมายเหตุผู้ดูแล: ${U.esc(pending.admin_note)}</p>` : ''}</div>
      <button id="cancelTransferRequestBtn" type="button" class="btn btn-ghost">ยกเลิกคำขอนี้</button>` : `
      <div class="notice warning transfer-policy-notice">
        <b>กรุณาอ่านก่อนยื่นคำขอย้ายโรงพยาบาล</b>
        <ul>
          <li>ผู้ดูแล BENT จะโทรตรวจสอบทั้งโรงพยาบาลเดิมและโรงพยาบาลใหม่</li>
          <li>โรงพยาบาลเดิมมีหน้าที่ยืนยันข้อมูลเท่านั้น ไม่มีสิทธิ์อนุญาตหรือขัดขวางการย้ายบัญชี</li>
          <li>ต้องปิดหรือส่งมอบรายการที่ยังเปิด/กำลังประสานงานให้เรียบร้อยก่อนอนุมัติ</li>
          <li>ชื่อผู้ให้ข้อมูล วันที่โทร และผลการตรวจสอบจะถูกบันทึกในประวัติการเปลี่ยนแปลง</li>
          <li>ประกาศและประวัติเก่ายังคงเป็นของโรงพยาบาลเดิม ไม่ถูกย้ายย้อนหลัง</li>
        </ul>
      </div>
      <form id="hospitalTransferForm">
        <div class="field-grid">
          <label>จังหวัดของโรงพยาบาลใหม่<select id="transferProvince" required>${provinceOptions('')}</select></label>
          <label>ค้นหาชื่อโรงพยาบาล<input id="transferHospitalSearch" type="search" disabled placeholder="เลือกจังหวัดก่อน"></label>
        </div>
        <label>โรงพยาบาลใหม่<select id="transferHospitalId" required disabled><option value="">-- เลือกจังหวัดก่อน --</option></select></label>
        <label>เหตุผลการย้าย<textarea id="transferReason" required maxlength="1000" placeholder="เช่น ย้ายสถานที่ปฏิบัติงานประจำไปยังโรงพยาบาลใหม่"></textarea></label>
        <label>วันที่คาดว่าจะเริ่มงานที่ใหม่ (ถ้ามี)<input id="transferEffectiveDate" type="date" min="${bangkokDateKey()}"></label>
        <label class="check-row"><input id="transferAgreement" type="checkbox" required><span>ฉันอ่านเงื่อนไขข้างต้นแล้ว และยืนยันว่าข้อมูลที่แจ้งเป็นความจริง</span></label>
        <button id="submitTransferRequestBtn" type="submit" class="btn btn-primary">ยื่นคำขอย้ายโรงพยาบาล</button>
      </form>`;

    main.innerHTML = `
      <div class="page-stack">
        <section class="panel"><div class="panel-header"><div><h2>ข้อมูลส่วนตัว</h2><p>ชื่อและเบอร์โทรแก้ไขได้ทันที ส่วนโรงพยาบาลต้องส่งคำขอตรวจสอบ</p></div></div><div class="panel-body">
          <form id="myProfileForm">
            <div class="field-grid"><label>ชื่อ–นามสกุล<input id="myProfileName" required maxlength="120" value="${U.esc(state.profile.full_name || '')}"></label><label>เบอร์โทรติดต่อ<input id="myProfilePhone" required maxlength="30" value="${U.esc(state.profile.phone || '')}"></label></div>
            <label>อีเมล<input value="${U.esc(state.profile.email || '')}" disabled></label>
            <label>โรงพยาบาลปัจจุบัน<input value="${U.esc(state.hospital?.name || '-')} · ${U.esc(state.hospital?.province || '-')}" disabled></label>
            <button id="saveMyProfileBtn" type="submit" class="btn btn-primary">บันทึกข้อมูลส่วนตัว</button>
          </form>
        </div></section>
        <section class="panel"><div class="panel-header"><div><h2>ขอย้ายโรงพยาบาล</h2><p>บัญชียังผูกกับโรงพยาบาลเดิมจนกว่าผู้ดูแลตรวจสอบและอนุมัติ</p></div></div><div class="panel-body">${pendingHtml}</div></section>
        <section class="panel"><div class="panel-header"><div><h2>ประวัติคำขอย้าย</h2><p>แสดงคำขอล่าสุดของบัญชีนี้</p></div></div><div class="panel-body">${historyHtml}</div></section>
      </div>`;

    $('#myProfileForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('#saveMyProfileBtn');
      try {
        setButtonBusy(button, true, 'กำลังบันทึก...');
        const { data, error } = await state.supabase.rpc('bent_update_own_profile', {
          p_full_name: $('#myProfileName').value.trim(),
          p_phone: $('#myProfilePhone').value.trim()
        });
        if (error) throw error;
        const updated = Array.isArray(data) ? data[0] : data;
        if (updated) {
          state.profile.full_name = updated.full_name;
          state.profile.phone = updated.phone;
          renderUserBlock();
        }
        toast('บันทึกข้อมูลแล้ว', '', 'success');
      } catch (error) { toast('บันทึกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(button, false); }
    });

    if (pending) {
      $('#cancelTransferRequestBtn').addEventListener('click', () => {
        openModal('ยืนยันยกเลิกคำขอ', `${pending.from_hospital?.name || '-'} → ${pending.to_hospital?.name || '-'}`, `
          <div class="notice warning"><b>คำขอจะถูกยกเลิก</b><p>บัญชีของคุณยังคงผูกกับโรงพยาบาลเดิม และสามารถยื่นคำขอใหม่ภายหลังได้</p></div>
          <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>กลับ</button><button id="confirmCancelTransferBtn" type="button" class="btn btn-danger">ยืนยันยกเลิกคำขอ</button></div>`);
        $('#confirmCancelTransferBtn').addEventListener('click', async () => {
          const button = $('#confirmCancelTransferBtn');
          try {
            setButtonBusy(button, true, 'กำลังยกเลิก...');
            const { error } = await state.supabase.rpc('bent_cancel_hospital_transfer_request', { p_request_id: pending.id });
            if (error) throw error;
            closeModal(); toast('ยกเลิกคำขอแล้ว', '', 'success'); await renderAccount();
          } catch (error) { toast('ยกเลิกไม่สำเร็จ', U.friendlyError(error), 'error'); }
          finally { setButtonBusy(button, false); }
        });
      });
      return;
    }

    const renderTransferHospitals = () => {
      const province = $('#transferProvince').value;
      const search = $('#transferHospitalSearch').value.trim().toLowerCase();
      const rows = activeHospitals
        .filter(h => h.province === province)
        .filter(h => !search || h.name.toLowerCase().includes(search))
        .sort((a,b) => a.name.localeCompare(b.name,'th'));
      $('#transferHospitalId').innerHTML = `<option value="">-- กรุณาเลือกโรงพยาบาล --</option>${rows.map(h => `<option value="${h.id}">${U.esc(h.name)}</option>`).join('')}`;
    };
    $('#transferProvince').addEventListener('change', () => {
      const enabled = Boolean($('#transferProvince').value);
      $('#transferHospitalSearch').disabled = !enabled;
      $('#transferHospitalId').disabled = !enabled;
      $('#transferHospitalSearch').value = '';
      $('#transferHospitalSearch').placeholder = enabled ? 'พิมพ์ชื่อบางส่วนเพื่อกรองรายการ' : 'เลือกจังหวัดก่อน';
      renderTransferHospitals();
    });
    $('#transferHospitalSearch').addEventListener('input', renderTransferHospitals);

    $('#hospitalTransferForm').addEventListener('submit', event => {
      event.preventDefault();
      const hospital = activeHospitals.find(h => h.id === $('#transferHospitalId').value);
      const reason = $('#transferReason').value.trim();
      const effectiveDate = $('#transferEffectiveDate').value || null;
      if (!hospital) { toast('กรุณาเลือกโรงพยาบาลใหม่', '', 'error'); return; }
      if (!$('#transferAgreement').checked) { toast('กรุณาอ่านและยืนยันเงื่อนไขก่อน', '', 'error'); return; }

      openModal('ยืนยันส่งคำขอย้ายโรงพยาบาล', 'ผู้ดูแลจะโทรตรวจสอบทั้งสองโรงพยาบาล', `
        <div class="request-hospital-summary"><div><span>โรงพยาบาลเดิม</span><b>${U.esc(state.hospital?.name || '-')}</b></div><div><span>โรงพยาบาลใหม่</span><b>${U.esc(hospital.name)}</b></div><div><span>จังหวัด</span><b>${U.esc(hospital.province || '-')}</b></div></div>
        <div class="notice warning"><b>หลังส่งคำขอ</b><p>บัญชียังใช้งานในนามโรงพยาบาลเดิมจนกว่าผู้ดูแลจะโทรตรวจสอบทั้งสองฝั่ง ตรวจรายการค้าง และอนุมัติการย้าย</p><p>โรงพยาบาลเดิมมีหน้าที่ยืนยันข้อมูล ไม่ได้มีสิทธิ์ขัดขวางการย้ายบัญชี</p></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>กลับไปตรวจข้อมูล</button><button id="confirmSubmitTransferBtn" type="button" class="btn btn-primary">ยืนยันส่งคำขอ</button></div>`);
      $('#confirmSubmitTransferBtn').addEventListener('click', async () => {
        const button = $('#confirmSubmitTransferBtn');
        try {
          setButtonBusy(button, true, 'กำลังส่งคำขอ...');
          const { error } = await state.supabase.rpc('bent_submit_hospital_transfer_request', {
            p_to_hospital_id: hospital.id,
            p_reason: reason,
            p_requested_effective_date: effectiveDate
          });
          if (error) throw error;
          closeModal(); toast('ส่งคำขอย้ายโรงพยาบาลแล้ว', 'สถานะ: รอตรวจสอบโรงพยาบาลเดิมและโรงพยาบาลใหม่', 'success', 8000); await renderAccount();
        } catch (error) { toast('ส่งคำขอไม่สำเร็จ', U.friendlyError(error), 'error'); }
        finally { setButtonBusy(button, false); }
      });
    });
  }


  async function renderHospitalMembers() {
    setPage('สมาชิกโรงพยาบาล', 'ตรวจรายชื่อผู้ใช้งาน และแจ้งผู้ดูแลเมื่อมีผู้พ้นสภาพ');
    main.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';

    const [memberResult, reportResult] = await Promise.all([
      state.supabase.rpc('bent_list_same_hospital_members'),
      state.supabase.rpc('bent_list_my_member_departure_reports')
    ]);
    if (memberResult.error) throw memberResult.error;
    if (reportResult.error) throw reportResult.error;

    const members = memberResult.data || [];
    const reports = reportResult.data || [];
    const pendingByUser = new Map(reports.filter(report => report.status === 'pending_verification').map(report => [report.reported_user_id, report]));
    const memberRows = members.map(member => {
      const pending = pendingByUser.get(member.user_id);
      return `<div class="member-card">
        <div class="member-avatar">${U.esc((member.full_name || '?').slice(0, 1))}</div>
        <div class="member-card-body"><b>${U.esc(member.full_name || '-')}</b><span>${U.esc(member.masked_email || '')}${member.role === 'system_admin' ? ' · ผู้ดูแลระบบ' : ''}</span></div>
        ${pending
          ? '<span class="badge badge-pending_verification">แจ้งแล้ว รอตรวจสอบ</span>'
          : `<button type="button" class="btn btn-ghost" data-report-member="${member.user_id}">แจ้งว่าไม่ได้ปฏิบัติงานแล้ว</button>`}
      </div>`;
    }).join('');

    const history = reports.map(report => `<div class="report-history-row">
      <div><b>${U.esc(report.reported_user_full_name)}</b><span>${U.esc(MEMBER_REPORT_REASON_LABEL[report.reason_category] || report.reason_category)} · ส่ง ${U.fmtDateTime(report.requested_at)}</span></div>
      <div class="inline-actions"><span class="badge badge-${U.esc(report.status)}">${U.esc(MEMBER_REPORT_STATUS_LABEL[report.status] || report.status)}</span>${report.status === 'pending_verification' ? `<button type="button" class="btn btn-ghost" data-cancel-member-report="${report.id}">ยกเลิกคำแจ้ง</button>` : ''}</div>
    </div>`).join('');

    main.innerHTML = `<div class="page-stack">
      <div class="notice warning"><b>คำแจ้งจะไม่ปิดบัญชีทันที</b><p>ผู้ดูแลระบบต้องโทรตรวจสอบกับโรงพยาบาลก่อน ตรวจว่าบุคคลดังกล่าวไม่ได้ปฏิบัติงานแล้ว และตรวจประกาศที่ยังค้างอยู่ จึงจะเปลี่ยนบัญชีเป็น “ปิดใช้งาน” เพื่อรักษาประวัติเดิม</p></div>
      <section class="panel"><div class="panel-header"><div><h2>ผู้ใช้งาน Active ของ ${U.esc(state.hospital?.name || 'โรงพยาบาล')}</h2><p>แสดงเฉพาะเพื่อนร่วมโรงพยาบาล ไม่แสดงเบอร์โทรและอีเมลเต็ม</p></div></div><div class="panel-body"><div class="member-list">${memberRows || emptyState('ยังไม่มีเพื่อนร่วมโรงพยาบาลรายอื่น','รายชื่อจะปรากฏเมื่อมีบัญชี Active มากกว่า 1 คน')}</div></div></section>
      <section class="panel"><div class="panel-header"><div><h2>ประวัติคำแจ้งของฉัน</h2><p>กลับมาตรวจสอบสถานะย้อนหลังได้</p></div></div><div class="panel-body"><div class="report-history">${history || emptyState('ยังไม่เคยส่งคำแจ้ง','เมื่อส่งคำแจ้งแล้ว ประวัติจะอยู่ที่หน้านี้')}</div></div></section>
    </div>`;

    $$('[data-report-member]', main).forEach(button => button.addEventListener('click', () => {
      const member = members.find(item => item.user_id === button.dataset.reportMember);
      if (member) openMemberDepartureReport(member);
    }));
    $$('[data-cancel-member-report]', main).forEach(button => button.addEventListener('click', () => confirmCancelMemberDepartureReport(button.dataset.cancelMemberReport)));
  }

  function openMemberDepartureReport(member) {
    openModal('แจ้งผู้ดูแลว่าบุคคลนี้ไม่ได้ปฏิบัติงานแล้ว', member.full_name || member.masked_email, `
      <form id="memberDepartureForm">
        <div class="notice warning"><b>ใช้เมื่อทราบข้อมูลจริงจากการทำงานร่วมกัน</b><p>คำแจ้งนี้ไม่ใช่การลบบัญชี และผู้ดูแลจะตรวจสอบกับโรงพยาบาลก่อนดำเนินการ</p></div>
        <label>สาเหตุ<select id="memberDepartureReason" required>${Object.entries(MEMBER_REPORT_REASON_LABEL).map(([value,label]) => `<option value="${value}">${U.esc(label)}</option>`).join('')}</select></label>
        <label>วันที่ปฏิบัติงานวันสุดท้าย (ถ้าทราบ)<input id="memberDepartureDate" type="date" max="${bangkokDateKey()}"></label>
        <label>รายละเอียดที่ช่วยให้ตรวจสอบได้<textarea id="memberDepartureDetail" required maxlength="1000" placeholder="เช่น ลาออกตั้งแต่เดือน... หรือย้ายหน่วยแล้ว ปัจจุบันไม่ได้ปฏิบัติงานที่ธนาคารเลือด"></textarea></label>
        <label class="check-row"><input id="memberDepartureConfirm" type="checkbox" required><span>ยืนยันว่ารายงานตามข้อมูลที่ทราบจริง และเข้าใจว่าผู้ดูแลต้องตรวจสอบก่อนปิดบัญชี</span></label>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button><button id="submitMemberDepartureBtn" type="submit" class="btn btn-primary">ส่งคำแจ้ง</button></div>
      </form>`);
    $('#memberDepartureForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('#submitMemberDepartureBtn');
      try {
        if (!$('#memberDepartureConfirm').checked) throw new Error('กรุณายืนยันข้อมูลก่อนส่งคำแจ้ง');
        setButtonBusy(button, true, 'กำลังส่ง...');
        const { error } = await state.supabase.rpc('bent_submit_member_departure_report', {
          p_reported_user_id: member.user_id,
          p_reason_category: $('#memberDepartureReason').value,
          p_detail: $('#memberDepartureDetail').value.trim(),
          p_last_working_date: $('#memberDepartureDate').value || null
        });
        if (error) throw error;
        closeModal();
        toast('ส่งคำแจ้งแล้ว', 'ผู้ดูแลระบบจะตรวจสอบก่อนเปลี่ยนสถานะบัญชี', 'success', 7000);
        await renderHospitalMembers();
      } catch (error) { toast('ส่งคำแจ้งไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(button, false); }
    });
  }

  function confirmCancelMemberDepartureReport(reportId) {
    openModal('ยืนยันยกเลิกคำแจ้ง', 'คำแจ้งที่ยกเลิกจะยังเก็บเป็นประวัติ', `
      <div class="notice warning"><b>ยกเลิกได้เฉพาะรายการที่ยังรอตรวจสอบ</b><p>หากผู้ดูแลดำเนินการไปแล้ว จะไม่สามารถยกเลิกจากหน้านี้ได้</p></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>กลับ</button><button id="confirmCancelMemberReportBtn" type="button" class="btn btn-danger">ยืนยันยกเลิก</button></div>`);
    $('#confirmCancelMemberReportBtn').addEventListener('click', async () => {
      const button = $('#confirmCancelMemberReportBtn');
      try {
        setButtonBusy(button, true, 'กำลังยกเลิก...');
        const { error } = await state.supabase.rpc('bent_cancel_member_departure_report', { p_report_id: reportId });
        if (error) throw error;
        closeModal(); toast('ยกเลิกคำแจ้งแล้ว', '', 'success'); await renderHospitalMembers();
      } catch (error) { toast('ยกเลิกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(button, false); }
    });
  }

  async function renderSupport() {
    setPage('ติดต่อผู้ดูแล', 'ส่งคำถาม ข้อเสนอแนะ หรือแจ้งปัญหา และกลับมาดูประวัติได้');
    main.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';
    const { data: threads, error } = await state.supabase
      .from('bent_support_threads')
      .select('*')
      .eq('created_by', state.profile.id)
      .order('last_message_at', { ascending: false });
    if (error) throw error;

    const threadRows = (threads || []).map(thread => {
      const unread = thread.last_message_at && (!thread.user_last_read_at || new Date(thread.last_message_at) > new Date(thread.user_last_read_at));
      return `<button type="button" class="support-thread-row ${unread ? 'unread' : ''}" data-support-thread="${thread.id}">
        <div><b>${U.esc(thread.subject)}</b><span>${U.esc(SUPPORT_CATEGORY_LABEL[thread.category] || thread.category)} · อัปเดต ${U.fmtDateTime(thread.last_message_at)}</span></div>
        <span class="badge badge-${U.esc(thread.status)}">${U.esc(SUPPORT_STATUS_LABEL[thread.status] || thread.status)}</span>
      </button>`;
    }).join('');

    main.innerHTML = `<div class="page-stack support-layout">
      <section class="panel"><div class="panel-header"><div><h2>ส่งข้อความใหม่</h2><p>สร้างหัวข้อแยกกัน เพื่อกลับมาติดตามแต่ละเรื่องได้ง่าย</p></div></div><div class="panel-body">
        <form id="supportNewThreadForm">
          <div class="field-grid"><label>ประเภท<select id="supportCategory">${Object.entries(SUPPORT_CATEGORY_LABEL).map(([value,label]) => `<option value="${value}">${U.esc(label)}</option>`).join('')}</select></label><label>หัวข้อ<input id="supportSubject" required minlength="4" maxlength="160" placeholder="สรุปเรื่องที่ต้องการติดต่อ"></label></div>
          <label>ข้อความ<textarea id="supportMessage" required minlength="2" maxlength="2000" placeholder="อธิบายคำถาม ปัญหา หรือข้อเสนอแนะ"></textarea></label>
          <div class="notice warning"><b>ไม่ส่งข้อมูลผู้ป่วยหรือเลขถุงเลือด</b><p>ช่องนี้ใช้คุยเรื่องการใช้งานระบบเท่านั้น ห้ามใส่ชื่อ HN Diagnosis Donor ID Barcode หรือ QR Code</p></div>
          <div class="modal-actions"><button id="createSupportThreadBtn" type="submit" class="btn btn-primary">ส่งข้อความถึงผู้ดูแล</button></div>
        </form>
      </div></section>
      <section class="panel"><div class="panel-header"><div><h2>ประวัติการติดต่อ</h2><p>กดหัวข้อเพื่อเปิดบทสนทนาและส่งข้อความต่อ</p></div><button id="refreshSupportBtn" type="button" class="btn btn-soft">รีเฟรช</button></div><div class="panel-body"><div class="support-thread-list">${threadRows || emptyState('ยังไม่มีประวัติการติดต่อ','ส่งข้อความใหม่ได้จากแบบฟอร์มด้านบน')}</div></div></section>
    </div>`;

    $('#supportNewThreadForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('#createSupportThreadBtn');
      try {
        setButtonBusy(button, true, 'กำลังส่ง...');
        const { data, error: createError } = await state.supabase.rpc('bent_create_support_thread', {
          p_category: $('#supportCategory').value,
          p_subject: $('#supportSubject').value.trim(),
          p_message: $('#supportMessage').value.trim()
        });
        if (createError) throw createError;
        toast('ส่งข้อความแล้ว', 'กลับมาดูคำตอบได้ที่ประวัติการติดต่อ', 'success');
        await renderSupport();
        await openSupportThread(String(data), false, () => renderSupport());
      } catch (error) { toast('ส่งข้อความไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(button, false); }
    });
    $('#refreshSupportBtn').addEventListener('click', () => renderSupport().catch(error => toast('รีเฟรชไม่สำเร็จ', U.friendlyError(error), 'error')));
    $$('[data-support-thread]', main).forEach(button => button.addEventListener('click', () => openSupportThread(button.dataset.supportThread, false, () => renderSupport())));
  }

  async function openSupportThread(threadId, adminMode = false, refreshList = null) {
    const [threadResult, messageResult] = await Promise.all([
      state.supabase.from('bent_support_threads').select('*').eq('id', threadId).maybeSingle(),
      state.supabase.from('bent_support_messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: true }).order('id', { ascending: true })
    ]);
    if (threadResult.error) throw threadResult.error;
    if (messageResult.error) throw messageResult.error;
    const thread = threadResult.data;
    if (!thread) throw new Error('SUPPORT_THREAD_NOT_FOUND');

    await state.supabase.rpc('bent_mark_support_thread_read', { p_thread_id: threadId });
    const messages = messageResult.data || [];
    const chat = messages.map(message => `<div class="chat-message ${message.sender_role === 'system_admin' ? 'admin' : 'user'}">
      <div class="chat-bubble"><b>${U.esc(message.sender_role === 'system_admin' ? 'ผู้ดูแลระบบ' : message.sender_name)}</b><p>${U.esc(message.message).replaceAll('\n','<br>')}</p><small>${U.fmtDateTime(message.created_at)}</small></div>
    </div>`).join('');

    openModal(thread.subject, `${SUPPORT_CATEGORY_LABEL[thread.category] || thread.category} · ${SUPPORT_STATUS_LABEL[thread.status] || thread.status}`, `
      ${adminMode ? `<div class="support-owner"><b>${U.esc(thread.created_by_name)}</b><span>${U.esc(thread.created_by_email)} · ${U.esc(thread.hospital_name || '-')}</span></div>` : ''}
      <div id="supportChatLog" class="chat-log">${chat || emptyState('ยังไม่มีข้อความ','')}</div>
      <form id="supportReplyForm" class="support-reply-form">
        <label>พิมพ์ข้อความ<textarea id="supportReplyMessage" required minlength="2" maxlength="2000" placeholder="พิมพ์ข้อความตอบกลับ"></textarea></label>
        <div class="modal-actions">
          ${adminMode ? `<button id="supportToggleResolvedBtn" type="button" class="btn ${thread.status === 'resolved' ? 'btn-soft' : 'btn-ghost'}">${thread.status === 'resolved' ? 'เปิดเรื่องอีกครั้ง' : 'ปิดเรื่อง'}</button>` : ''}
          <button id="refreshSupportThreadBtn" type="button" class="btn btn-ghost">รีเฟรช</button>
          <button id="sendSupportReplyBtn" type="submit" class="btn btn-primary">ส่งข้อความ</button>
        </div>
      </form>`);
    const log = $('#supportChatLog');
    if (log) log.scrollTop = log.scrollHeight;

    $('#refreshSupportThreadBtn').addEventListener('click', () => openSupportThread(threadId, adminMode, refreshList).catch(error => toast('รีเฟรชไม่สำเร็จ', U.friendlyError(error), 'error')));
    $('#supportReplyForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('#sendSupportReplyBtn');
      try {
        setButtonBusy(button, true, 'กำลังส่ง...');
        const { error } = await state.supabase.rpc('bent_send_support_message', { p_thread_id: threadId, p_message: $('#supportReplyMessage').value.trim() });
        if (error) throw error;
        if (refreshList) await refreshList();
        await openSupportThread(threadId, adminMode, refreshList);
      } catch (error) { toast('ส่งข้อความไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(button, false); }
    });
    if (adminMode) {
      $('#supportToggleResolvedBtn').addEventListener('click', async () => {
        const button = $('#supportToggleResolvedBtn');
        try {
          setButtonBusy(button, true, 'กำลังบันทึก...');
          const nextStatus = thread.status === 'resolved' ? 'waiting_user' : 'resolved';
          const { error } = await state.supabase.rpc('bent_admin_set_support_status', { p_thread_id: threadId, p_status: nextStatus });
          if (error) throw error;
          if (refreshList) await refreshList();
          await openSupportThread(threadId, adminMode, refreshList);
        } catch (error) { toast('เปลี่ยนสถานะไม่สำเร็จ', U.friendlyError(error), 'error'); }
        finally { setButtonBusy(button, false); }
      });
    }
  }

  function renderGuide() {
    setPage('คู่มือการใช้งาน', 'คนที่ไม่เคยใช้ BENT สามารถเริ่มจากหน้านี้');
    main.innerHTML = `
      <div class="page-stack">
        <section class="guide-hero"><span class="eyebrow" style="color:var(--blue-700)">เริ่มใช้งานแบบทีละขั้น</span><h2>BENT ใช้ทำอะไร และต้องกดตรงไหน</h2><p>ระบบนี้เป็นพื้นที่กลางสำหรับ “ประกาศและติดต่อ” ไม่ใช่ระบบจองหรือยืนยันส่งมอบเลือด</p></section>
        <div id="installPromptBox" class="install-prompt"><div><b>ติดตั้ง BENT บนหน้าจอมือถือหรือแท็บเล็ต</b><p style="margin:2px 0;color:var(--muted)">เปิดได้เหมือนแอปและเข้าถึงง่ายขึ้น</p></div><button class="btn btn-primary" data-action="install-pwa">ดูวิธีติดตั้ง</button></div>
        <section class="guide-grid">
          <article class="guide-card"><h3>1. สมัครและเข้าสู่ระบบ</h3><ol><li>เปิดแท็บ “สมัครใช้งาน” และอ่านขั้นตอนที่อยู่เหนือแบบฟอร์ม</li><li>เลือกจังหวัดก่อน แล้วค้นหาโรงพยาบาลจากรายชื่อ</li><li>หากไม่พบ ให้กด “ไม่พบโรงพยาบาลของฉัน” และกรอกชื่อทางการพร้อมเบอร์โทรโรงพยาบาล</li><li>กรอกชื่อ เบอร์โทร อีเมล และส่งคำขอ</li><li>รอผู้ดูแลตรวจสอบ จากนั้นเปิดอีเมลและตั้งรหัสผ่านของตนเอง</li></ol></article>
          <article class="guide-card"><h3>2. ค้นหาประกาศ</h3><ol><li>เปิดเมนู “ค้นหาประกาศ”</li><li>กรอกตัวกรองที่ต้องการ โดยเลือกแอนติเจนผลลบได้หลายตัว</li><li>กดปุ่ม “ค้นหา” ระบบจึงจะแสดงรายการ</li><li>กด “ดูรายละเอียดและติดต่อ”</li><li>โทรหรือคัดลอกเบอร์ แล้วประสานงานตาม SOP ของโรงพยาบาล</li></ol></article>
          <article class="guide-card"><h3>3. หน้า ภาพรวม</h3><ol><li>ตัวเลขสรุปด้านบนแสดงรายการที่กำลังเปิดทั้งหมด</li><li>ส่วน “ประกาศวันนี้” แสดงเฉพาะรายการที่สร้างในวันนี้</li><li>ประกาศวันก่อนค้นหาได้จากเมนู “ค้นหาประกาศ”</li></ol></article>
          <article class="guide-card"><h3>4. ประกาศว่ามีเลือด</h3><ol><li>เลือก “มีเลือดพร้อมให้ติดต่อ”</li><li>ระบุผลิตภัณฑ์ หมู่เลือด จำนวน วันหมดอายุ และแหล่งที่มา</li><li>เลือกแอนติเจนเฉพาะตัวที่ต้องการผลลบ</li><li>แนบรูปได้ แต่ไม่บังคับ</li><li>ตรวจสรุปแล้วกด “สร้างประกาศ”</li></ol></article>
          <article class="guide-card"><h3>5. ประกาศว่าต้องการเลือด</h3><ol><li>เลือก “ต้องการเลือด”</li><li>ระบุผลิตภัณฑ์ หมู่เลือด จำนวน วันที่ต้องการ และความเร่งด่วน</li><li>เลือกแอนติเจนที่ต้องการผลลบตามเงื่อนไข</li><li>กรอกผู้ติดต่อ แล้วสร้างประกาศ</li></ol></article>
          <article class="guide-card"><h3>6. ระหว่างประสานงานและปิดรายการ</h3><ol><li>เมื่อเริ่มคุยกับโรงพยาบาลอื่น กด “กำลังประสานงาน”</li><li>แก้จำนวนคงเหลือ/ยังต้องการได้</li><li>เมื่อจบเรื่อง กด “ปิดรายการ”</li><li>เลือกเหตุผล ผลการประสานงาน และจำนวนที่สำเร็จ</li><li>รูปจะถูกซ่อนทันที แล้วระบบจึงลบจาก Google Drive</li></ol></article>
          <article class="guide-card"><h3>7. ขอย้ายโรงพยาบาล</h3><ol><li>เปิดเมนู “ข้อมูลบัญชีของฉัน”</li><li>อ่านเงื่อนไขก่อนยื่นคำขอ แล้วเลือกโรงพยาบาลใหม่</li><li>ปิดหรือส่งมอบประกาศที่ยังค้างให้เรียบร้อย</li><li>ผู้ดูแลจะโทรตรวจสอบทั้งโรงพยาบาลเดิมและโรงพยาบาลใหม่</li><li>ประกาศเก่ายังคงเป็นของโรงพยาบาลเดิม</li></ol></article>
          <article class="guide-card"><h3>8. แจ้งเพื่อนร่วมโรงพยาบาลที่พ้นสภาพ</h3><ol><li>เปิดเมนู “สมาชิกโรงพยาบาล”</li><li>เลือกชื่อบุคคลที่ลาออก ย้ายโรงพยาบาล หรือไม่ได้ปฏิบัติงานที่หน่วยเดิมแล้ว</li><li>ระบุข้อมูลที่ทราบจริงและส่งคำแจ้ง</li><li>บัญชีจะยังไม่ถูกปิดทันที ผู้ดูแลต้องโทรตรวจสอบก่อน</li><li>กลับมาดูสถานะคำแจ้งย้อนหลังได้จากหน้าเดิม</li></ol></article>
          <article class="guide-card"><h3>9. ติดต่อผู้ดูแล</h3><ol><li>เปิดเมนู “ติดต่อผู้ดูแล”</li><li>เลือกประเภท ตั้งหัวข้อ และพิมพ์ข้อความ</li><li>แต่ละเรื่องเก็บเป็นบทสนทนาแยกกัน</li><li>กดหัวข้อเดิมเพื่ออ่านคำตอบหรือส่งข้อความต่อ</li><li>ห้ามส่งข้อมูลผู้ป่วย ผู้บริจาค หรือเลขถุงเลือด</li></ol></article>
          ${isAdmin() ? `<article class="guide-card"><h3>10. สำหรับผู้ดูแลระบบ</h3><ol><li>ทุกแท็บมีตัวกรองสำหรับค้นหาและลดรายการ</li><li>แท็บ “แจ้งพ้นสภาพ” ต้องบันทึกชื่อผู้ให้ข้อมูล วันเวลาที่โทร และผลตรวจสอบก่อนปิดบัญชี</li><li>ต้องจัดการประกาศที่ยังเปิดของผู้ถูกรายงานให้เรียบร้อยก่อน</li><li>แท็บ “ข้อความ/ข้อเสนอแนะ” ใช้ตอบแชทและปิดเรื่องเมื่อดำเนินการเสร็จ</li></ol></article>` : ''}
          <article class="guide-card"><h3>${isAdmin() ? '11' : '10'}. การแนบรูปอย่างปลอดภัย</h3><ul class="danger-list"><li>ห้ามชื่อผู้ป่วย HN เลขบัตรประชาชน Diagnosis</li><li>ห้าม Donor ID เลขถุงเลือด Barcode และ QR Code</li><li>ครอบตัดหรือปิดบังข้อมูลก่อนเลือกไฟล์</li><li>รูปเป็นข้อมูลประกอบ ไม่ใช้แทนฉลากจริงหรือ SOP</li></ul></article>
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
          ${[['requests','คำขอเปิดบัญชี'],['transfers','คำขอย้าย รพ.'],['departures','แจ้งพ้นสภาพ'],['support','ข้อความ/ข้อเสนอแนะ'],['users','ผู้ใช้งาน'],['hospitals','โรงพยาบาล'],['announcements','ประกาศทั้งหมด'],['components','ผลิตภัณฑ์โลหิต'],['antigens','แอนติเจน'],['sources','แหล่งที่มา'],['stats','สถิติการใช้งาน'],['images','จัดการรูป'],['audit','ประวัติการเปลี่ยนแปลง']].map(([key,label]) => `<button class="admin-tab ${state.adminTab === key ? 'active' : ''}" data-admin-tab="${key}">${label}</button>`).join('')}
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
      else if (tab === 'transfers') await adminHospitalTransfers(host);
      else if (tab === 'departures') await adminMemberDepartureReports(host);
      else if (tab === 'support') await adminSupportThreads(host);
      else if (tab === 'users') await adminUsers(host);
      else if (tab === 'hospitals') await adminHospitals(host);
      else if (tab === 'announcements') adminAnnouncements(host);
      else if (['components','antigens','sources'].includes(tab)) adminMaster(host, tab);
      else if (tab === 'stats') await adminStats(host);
      else if (tab === 'images') await adminImages(host);
      else if (tab === 'audit') await adminAudit(host);
    } catch (error) { host.innerHTML = `<div class="notice danger"><b>โหลดข้อมูลไม่สำเร็จ</b><p>${U.esc(U.friendlyError(error))}</p></div>`; }
  }

  function adminAnnouncements(host) {
    const allRows = state.announcements;
    const filters = adminFilterState('announcements');
    const counts = ['open','coordinating','closed','cancelled','expired'].map(status => ({ status, total: allRows.filter(x => x.status === status).length }));
    const hospitalOptions = state.masters.hospitals.map(h => `<option value="${h.id}">${U.esc(h.name)}</option>`).join('');
    host.innerHTML = `<div class="page-stack">
      <section class="stat-grid">${counts.map(x => statCard(U.statusLabel[x.status], x.total, 'รายการ')).join('')}</section>
      ${adminFilterBar(`
        <label>ค้นหาคำ<input data-admin-filter="text" value="${U.esc(filters.text || '')}" placeholder="ผลิตภัณฑ์ โรงพยาบาล ผู้ติดต่อ"></label>
        <label>ประเภท<select data-admin-filter="type"><option value="">ทั้งหมด</option><option value="offer">มีเลือด</option><option value="request">ต้องการเลือด</option></select></label>
        <label>สถานะ<select data-admin-filter="status"><option value="">ทั้งหมด</option>${['open','coordinating','closed','cancelled','expired'].map(x => `<option value="${x}">${U.esc(U.statusLabel[x])}</option>`).join('')}</select></label>
        <label>ผลิตภัณฑ์<select data-admin-filter="component"><option value="">ทั้งหมด</option>${state.masters.components.map(c => `<option value="${c.id}">${U.esc(c.display_name)}</option>`).join('')}</select></label>
        <label>จังหวัด<select data-admin-filter="province"><option value="">ทุกจังหวัด</option>${THAI_PROVINCES.map(p => `<option value="${U.esc(p)}">${U.esc(p)}</option>`).join('')}</select></label>
        <label>โรงพยาบาล<select data-admin-filter="hospital"><option value="">ทุกโรงพยาบาล</option>${hospitalOptions}</select></label>
        <label>ตั้งแต่วันที่<input type="date" data-admin-filter="dateFrom"></label>
        <label>ถึงวันที่<input type="date" data-admin-filter="dateTo"></label>
      `)}
      <section class="panel"><div class="panel-header"><div><h2 id="adminAnnouncementCount">ประกาศทุกโรงพยาบาล</h2><p>ผู้ดูแลระบบสามารถตรวจสอบ แก้ไข ปิด ยกเลิก หรือลบประกาศถาวรได้</p></div></div><div class="panel-body"><div id="adminAnnouncementRows" class="announcement-grid"></div></div></section>
    </div>`;

    const renderRows = () => {
      const f = adminFilterState('announcements');
      const text = String(f.text || '').trim().toLowerCase();
      const rows = allRows.filter(a => {
        const searchable = [a.component?.display_name, a.other_component, a.hospital?.name, a.hospital?.province, a.contact_name, a.contact_phone].join(' ').toLowerCase();
        const date = bangkokDateKey(a.created_at);
        return (!text || searchable.includes(text))
          && (!f.type || a.announcement_type === f.type)
          && (!f.status || a.status === f.status)
          && (!f.component || a.component_id === f.component)
          && (!f.province || a.hospital?.province === f.province)
          && (!f.hospital || a.hospital_id === f.hospital)
          && (!f.dateFrom || date >= f.dateFrom)
          && (!f.dateTo || date <= f.dateTo);
      });
      $('#adminAnnouncementCount').textContent = `ประกาศ ${rows.length.toLocaleString('th-TH')} จาก ${allRows.length.toLocaleString('th-TH')} รายการ`;
      $('#adminAnnouncementRows').innerHTML = rows.map(a => renderAnnouncementCard(a, { adminMode: true })).join('') || emptyState('ไม่พบประกาศที่ตรงกับตัวกรอง','ลองล้างหรือลดเงื่อนไข');
    };
    bindAdminFilterControls('announcements', renderRows);
    renderRows();
  }
  async function adminAccountRequests(host) {
    const { data, error } = await state.supabase.from('bent_account_requests').select('*').order('requested_at', { ascending: false });
    if (error) throw error;

    // Every time the account-request tab is opened or refreshed, begin with pending requests.
    // Other filters remain as the admin last selected, and the status can still be changed manually.
    state.adminFilters.requests = { ...adminFilterState('requests'), status: 'pending' };
    const filters = adminFilterState('requests');
    const actions = request => {
      const deleteLabel = request.auth_user_id ? 'ลบบัญชี' : 'ลบคำขอ';
      if (request.status === 'approved' && request.auth_user_id) {
        return `<div class="inline-actions"><button class="btn btn-soft" data-action="admin-resend-request-link" data-request="${request.id}">ส่งลิงก์ใหม่</button><button class="btn btn-danger" data-action="admin-delete-request" data-request="${request.id}">${deleteLabel}</button></div>`;
      }
      return `<div class="inline-actions"><button class="btn btn-primary" data-action="admin-review-request" data-request="${request.id}">ตรวจสอบ</button><button class="btn btn-danger" data-action="admin-delete-request" data-request="${request.id}">${deleteLabel}</button></div>`;
    };
    const mailState = request => {
      if (request.email_sent_at) return `<span class="badge badge-active">ส่งแล้ว</span><br><small>${U.fmtDateTime(request.email_sent_at)}</small>`;
      if (request.email_last_error) return `<span class="badge badge-rejected">ส่งไม่สำเร็จ</span><br><small>${U.esc(U.friendlyError(request.email_last_error))}</small>`;
      return '<span class="badge badge-pending">ยังไม่ส่ง</span>';
    };
    const matchedHospital = request => {
      const linked = state.masters.hospitals.find(hospital => hospital.id === request.requested_hospital_id);
      return linked || state.masters.hospitals.find(hospital =>
        (!request.province || hospital.province === request.province)
        && normalizeHospitalName(hospital.name) === normalizeHospitalName(request.hospital_name)
      ) || null;
    };
    const requestHospitalState = request => {
      const exact = matchedHospital(request);
      if (exact) return `<span class="badge badge-active">มีในระบบ</span><br><small>${U.esc(exact.name)}</small>`;
      return '<span class="badge badge-pending">ยังไม่มีในระบบ</span>';
    };
    const row = request => `<tr><td><b>${U.esc(request.full_name)}</b><br><small>${U.esc(request.email)}</small></td><td><b>${U.esc(request.hospital_name)}</b><br><small>${U.esc(request.province || 'ยังไม่ระบุจังหวัด')}</small></td><td>${U.esc(request.phone)}${request.proposed_hospital_phone ? `<br><small>เบอร์ รพ. ที่เสนอ: ${U.esc(request.proposed_hospital_phone)}</small>` : ''}</td><td>${requestHospitalState(request)}</td><td><span class="badge badge-${request.status}">${U.esc(U.statusLabel[request.status] || request.status)}</span><br><small>${U.fmtDateTime(request.requested_at)}</small></td><td>${mailState(request)}</td><td>${actions(request)}</td></tr>`;
    const mobile = request => `<div class="mobile-data-card"><b>${U.esc(request.full_name)}</b><span>${U.esc(request.email)}</span><span>${U.esc(request.hospital_name)} · ${U.esc(request.province || 'ยังไม่ระบุจังหวัด')}</span><div>${requestHospitalState(request)}</div><div><small>อีเมลตั้งรหัสผ่าน</small>${mailState(request)}</div><div class="inline-actions"><span class="badge badge-${request.status}">${U.esc(U.statusLabel[request.status] || request.status)}</span>${actions(request)}</div></div>`;

    host.innerHTML = `<div class="page-stack">
      ${adminFilterBar(`
        <label>ค้นหาคำ<input data-admin-filter="text" value="${U.esc(filters.text || '')}" placeholder="ชื่อ อีเมล โรงพยาบาล เบอร์โทร"></label>
        <label>จังหวัด<select data-admin-filter="province"><option value="">ทุกจังหวัด</option>${THAI_PROVINCES.map(p => `<option value="${U.esc(p)}">${U.esc(p)}</option>`).join('')}</select></label>
        <label>สถานะคำขอ<select data-admin-filter="status"><option value="">ทั้งหมด</option>${['pending','approved','rejected'].map(x => `<option value="${x}">${U.esc(U.statusLabel[x] || x)}</option>`).join('')}</select></label>
        <label>โรงพยาบาลในระบบ<select data-admin-filter="hospitalState"><option value="">ทั้งหมด</option><option value="exists">มีในระบบ</option><option value="missing">ยังไม่มีในระบบ</option></select></label>
        <label>สถานะอีเมล<select data-admin-filter="mail"><option value="">ทั้งหมด</option><option value="sent">ส่งแล้ว</option><option value="error">ส่งไม่สำเร็จ</option><option value="pending">ยังไม่ส่ง</option></select></label>
      `)}
      <section class="panel"><div class="panel-header"><div><h2 id="adminRequestCount">คำขอเปิดบัญชี</h2><p>ตรวจชื่อโรงพยาบาลซ้ำ แล้วเพิ่มโรงพยาบาลและอนุมัติบัญชีได้ในหน้าต่างเดียว</p></div></div><div class="panel-body" id="adminRequestResults"></div></section>
    </div>`;
    host.dataset.requests = JSON.stringify(data);

    const renderRows = () => {
      const f = adminFilterState('requests');
      const text = String(f.text || '').trim().toLowerCase();
      const rows = data.filter(request => {
        const searchable = [request.full_name, request.email, request.hospital_name, request.phone, request.proposed_hospital_phone].join(' ').toLowerCase();
        const exists = Boolean(matchedHospital(request));
        const mail = request.email_sent_at ? 'sent' : (request.email_last_error ? 'error' : 'pending');
        return (!text || searchable.includes(text))
          && (!f.province || request.province === f.province)
          && (!f.status || request.status === f.status)
          && (!f.hospitalState || (f.hospitalState === 'exists' ? exists : !exists))
          && (!f.mail || mail === f.mail);
      });
      $('#adminRequestCount').textContent = `คำขอเปิดบัญชี ${rows.length.toLocaleString('th-TH')} จาก ${data.length.toLocaleString('th-TH')} รายการ`;
      $('#adminRequestResults').innerHTML = rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ผู้สมัคร</th><th>โรงพยาบาล/จังหวัด</th><th>โทรศัพท์</th><th>สถานะโรงพยาบาล</th><th>สถานะคำขอ</th><th>อีเมลตั้งรหัสผ่าน</th><th></th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div><div class="mobile-cards">${rows.map(mobile).join('')}</div>` : emptyState('ไม่พบคำขอที่ตรงกับตัวกรอง','คำขอใหม่จะปรากฏที่หน้านี้');
    };
    bindAdminFilterControls('requests', renderRows);
    renderRows();
  }
  async function openAccountRequest(request) {
    if (!request) return;
    try {
      await refreshHospitalsForAccountRequest(request);
    } catch (error) {
      toast('โหลดรายชื่อโรงพยาบาลล่าสุดไม่สำเร็จ', U.friendlyError(error), 'error');
    }
    const initialProvince = request.province || '';
    const provinceField = initialProvince
      ? `<label>จังหวัด<input id="requestProvinceDisplay" value="${U.esc(initialProvince)}" readonly><input id="requestProvince" type="hidden" value="${U.esc(initialProvince)}"></label>`
      : `<label>จังหวัด<select id="requestProvince" required>${provinceOptions('')}</select></label>`;

    openModal('ตรวจสอบคำขอเปิดบัญชี', request.email, `
      <form id="accountRequestForm">
        <div class="request-hospital-summary">
          <div><span>โรงพยาบาลที่ผู้สมัครแจ้ง</span><b>${U.esc(request.hospital_name || '-')}</b></div>
          <div><span>จังหวัด</span><b>${U.esc(initialProvince || 'คำขอเดิมยังไม่ระบุ')}</b></div>
          <div><span>เบอร์โทรโรงพยาบาลที่เสนอ</span><b>${U.esc(request.proposed_hospital_phone || 'ไม่ได้เสนอ')}</b></div>
        </div>
        <label>ชื่อ–นามสกุล<input id="requestFullName" value="${U.esc(request.full_name || '')}" required maxlength="120"></label>
        <label>เบอร์โทรติดต่อผู้สมัคร/หน่วยงาน<input id="requestPhone" value="${U.esc(request.phone || '')}" required maxlength="30"></label>
        ${provinceField}
        <label>ตำแหน่ง/หน่วยงาน<input value="${U.esc(request.position_title || '')}" readonly></label>
        <div id="requestHospitalResolution"></div>
        <label>สิทธิ์การใช้งาน<select id="requestRole"><option value="user">ผู้ใช้งาน</option><option value="system_admin">ผู้ดูแลระบบ</option></select></label>
        <label>หมายเหตุของผู้ดูแล<textarea id="requestAdminNote" maxlength="500">${U.esc(request.admin_note || '')}</textarea></label>
        <div class="notice warning"><b>เมื่อกดอนุมัติ</b><p>ระบบจะเพิ่มโรงพยาบาลใหม่เมื่อจำเป็น ผูกผู้ใช้กับโรงพยาบาล สร้างบัญชี และส่งลิงก์ตั้งรหัสผ่านในขั้นตอนเดียว</p></div>
        <div class="modal-actions">
          <button id="deleteRequestBtn" type="button" class="btn btn-danger">${request.auth_user_id ? 'ลบบัญชี' : 'ลบคำขอ'}</button>
          <button id="rejectRequestBtn" type="button" class="btn btn-secondary">ไม่อนุมัติ</button>
          <button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button>
          <button id="approveRequestBtn" type="submit" class="btn btn-primary">ตรวจสอบตัวเลือกโรงพยาบาล</button>
        </div>
      </form>`);

    const resolutionRoot = $('#requestHospitalResolution');
    const approvalButton = $('#approveRequestBtn');

    function currentProvince() {
      return $('#requestProvince')?.value || '';
    }

    function renderHospitalResolution() {
      const province = currentProvince();
      const inProvince = state.masters.hospitals
        .filter(hospital => !province || hospital.province === province)
        .sort((a, b) => a.name.localeCompare(b.name, 'th'));
      const requestedLinked = inProvince.find(hospital => hospital.id === request.requested_hospital_id);
      const exact = requestedLinked || inProvince.find(hospital => normalizeHospitalName(hospital.name) === normalizeHospitalName(request.hospital_name));
      const candidates = similarHospitals(request.hospital_name, province, true).filter(item => !exact || item.hospital.id !== exact.id).slice(0, 5);
      const activeHospitals = inProvince.filter(hospital => hospital.is_active);
      const suggestedExistingId = (exact && exact.is_active ? exact.id : '')
        || (candidates.find(item => item.hospital.is_active)?.hospital.id || '')
        || '';

      if (!province) {
        resolutionRoot.innerHTML = `<div class="notice warning"><b>กรุณาเลือกจังหวัด</b><p>คำขอรุ่นเดิมไม่มีจังหวัด จึงต้องกำหนดจังหวัดก่อนตรวจชื่อโรงพยาบาล</p></div>`;
        approvalButton.textContent = 'กรุณาเลือกจังหวัด';
        approvalButton.disabled = true;
        return;
      }

      const buildExistingOptions = (searchText = '') => {
        const query = normalizeHospitalName(searchText);
        const visible = query
          ? activeHospitals.filter(hospital => normalizeHospitalName(hospital.name).includes(query))
          : activeHospitals;
        return `<option value="">-- เลือกโรงพยาบาลที่มีอยู่ --</option>${visible.map(hospital => `<option value="${hospital.id}" ${hospital.id === suggestedExistingId ? 'selected' : ''}>${U.esc(hospital.name)}</option>`).join('')}`;
      };
      let content = '';

      if (exact && exact.is_active) {
        content = `
          <div class="hospital-status-card found"><span>สถานะ</span><b>พบโรงพยาบาลนี้ในระบบแล้ว</b><p>${U.esc(exact.name)} · ${U.esc(exact.province || '-')}</p></div>
          <input type="hidden" name="hospitalResolution" value="existing">
          <input id="requestExistingHospital" type="hidden" value="${exact.id}">
          <div class="notice success"><b>ระบบจะใช้โรงพยาบาลที่มีอยู่</b><p>เมื่ออนุมัติ ผู้ใช้จะถูกผูกกับ ${U.esc(exact.name)} ทันที และจะไม่สร้าง Master ซ้ำ</p></div>`;
      } else {
        const exactInactive = exact && !exact.is_active;
        const candidateHtml = candidates.length
          ? `<div class="notice warning"><b>พบโรงพยาบาลที่อาจเป็นแห่งเดียวกัน</b><p>กรุณาเลือกว่าจะใช้โรงพยาบาลเดิม หรือยืนยันว่าเป็นโรงพยาบาลใหม่</p><div class="similar-hospital-list">${candidates.map(item => `<div><b>${U.esc(item.hospital.name)}</b><span>${U.esc(item.hospital.province || '-')} · ความใกล้เคียง ${Math.round(item.score * 100)}%${item.hospital.is_active ? '' : ' · ปิดใช้งาน'}</span></div>`).join('')}</div></div>`
          : '';
        const inactiveWarning = exactInactive
          ? `<div class="notice danger"><b>พบชื่อเดียวกัน แต่โรงพยาบาลถูกปิดใช้งาน</b><p>${U.esc(exact.name)} ต้องเปิดใช้งานจากเมนูโรงพยาบาลก่อน จึงจะผูกบัญชีได้ และระบบจะไม่สร้างชื่อซ้ำ</p></div>`
          : '';
        const defaultResolution = (exactInactive || candidates.length) ? '' : 'new';
        content = `
          <div class="hospital-status-card missing"><span>สถานะ</span><b>${exactInactive ? 'มีชื่อเดิมแต่ปิดใช้งาน' : 'ยังไม่มีในระบบ'}</b><p>${U.esc(request.hospital_name)} · ${U.esc(province)}</p></div>
          ${inactiveWarning}${candidateHtml}
          <div class="hospital-resolution-options">
            <label class="resolution-choice"><input type="radio" name="hospitalResolution" value="existing"><span><b>ใช้โรงพยาบาลที่มีอยู่</b><small>แสดงเฉพาะโรงพยาบาลในจังหวัด ${U.esc(province)}</small></span></label>
            <label>ค้นหาโรงพยาบาลในจังหวัด<input id="requestExistingHospitalSearch" value="${U.esc(request.hospital_name || '')}" placeholder="พิมพ์ชื่อบางส่วน เช่น โรคทรวงอก"></label>
            <label>โรงพยาบาลในระบบ<select id="requestExistingHospital">${buildExistingOptions(request.hospital_name || '')}</select></label>
            <div id="requestExistingHospitalEmpty" class="notice warning hidden"><b>ไม่พบชื่อที่ค้นหาในจังหวัดนี้</b><p>ลองลบคำค้นบางส่วน หรือตรวจสอบจังหวัดก่อนยืนยันว่าเป็นโรงพยาบาลใหม่</p></div>
            <label class="resolution-choice ${exactInactive ? 'disabled' : ''}"><input type="radio" name="hospitalResolution" value="new" ${defaultResolution === 'new' ? 'checked' : ''} ${exactInactive ? 'disabled' : ''}><span><b>ยืนยันว่าเป็นโรงพยาบาลใหม่</b><small>${exactInactive ? 'เปิดใช้งานชื่อเดิมก่อน ระบบไม่อนุญาตให้สร้างชื่อซ้ำ' : 'ระบบจะเพิ่ม Master และอนุมัติบัญชีพร้อมกัน'}</small></span></label>
            <div id="newHospitalApprovalFields" class="proposed-hospital-box ${defaultResolution === 'new' ? '' : 'hidden'}">
              <label>ชื่อโรงพยาบาลตามชื่อทางการ<input id="requestNewHospitalName" value="${U.esc(request.hospital_name || '')}" maxlength="180"></label>
              <label>เบอร์โทรหลักของโรงพยาบาล<input id="requestNewHospitalPhone" value="${U.esc(request.proposed_hospital_phone || '')}" maxlength="30" placeholder="ถ้ามี"></label>
            </div>
          </div>`;
      }

      resolutionRoot.innerHTML = content;
      updateApprovalButton();

      resolutionRoot.querySelectorAll('input[name="hospitalResolution"]').forEach(input => input.addEventListener('change', () => {
        const isNew = resolutionRoot.querySelector('input[name="hospitalResolution"]:checked')?.value === 'new';
        $('#newHospitalApprovalFields')?.classList.toggle('hidden', !isNew);
        updateApprovalButton();
      }));
      const existingSelect = $('#requestExistingHospital');
      const existingSearch = $('#requestExistingHospitalSearch');
      const existingEmpty = $('#requestExistingHospitalEmpty');
      const syncExistingEmptyState = () => {
        if (!existingSelect || !existingEmpty) return;
        existingEmpty.classList.toggle('hidden', existingSelect.options.length > 1);
      };
      if (existingSearch && existingSelect) {
        existingSearch.addEventListener('input', () => {
          const previous = existingSelect.value;
          existingSelect.innerHTML = buildExistingOptions(existingSearch.value);
          if (previous && Array.from(existingSelect.options).some(option => option.value === previous)) existingSelect.value = previous;
          syncExistingEmptyState();
          updateApprovalButton();
        });
      }
      syncExistingEmptyState();
      existingSelect?.addEventListener('change', () => {
        const existingRadio = resolutionRoot.querySelector('input[name="hospitalResolution"][value="existing"]');
        if (existingRadio && existingSelect.value) existingRadio.checked = true;
        $('#newHospitalApprovalFields')?.classList.add('hidden');
        updateApprovalButton();
      });
    }

    function selectedResolution() {
      const hidden = resolutionRoot.querySelector('input[type="hidden"][name="hospitalResolution"]');
      if (hidden) return hidden.value;
      return resolutionRoot.querySelector('input[name="hospitalResolution"]:checked')?.value || '';
    }

    function updateApprovalButton() {
      const resolution = selectedResolution();
      if (resolution === 'existing') {
        approvalButton.textContent = 'ใช้โรงพยาบาลที่มีอยู่และอนุมัติบัญชี';
        approvalButton.disabled = !$('#requestExistingHospital')?.value;
      } else if (resolution === 'new') {
        approvalButton.textContent = 'เพิ่มโรงพยาบาลและอนุมัติบัญชี';
        approvalButton.disabled = false;
      } else {
        approvalButton.textContent = 'กรุณาเลือกวิธีจัดการโรงพยาบาล';
        approvalButton.disabled = true;
      }
    }

    if (!initialProvince) $('#requestProvince').addEventListener('change', renderHospitalResolution);
    renderHospitalResolution();

    $('#accountRequestForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = $('#approveRequestBtn');
      try {
        const province = currentProvince();
        const resolution = selectedResolution();
        if (!province) throw new Error('INVALID_PROVINCE');
        if (!resolution) throw new Error('HOSPITAL_RESOLUTION_REQUIRED');

        const hospitalId = resolution === 'existing' ? ($('#requestExistingHospital')?.value || '') : '';
        const newHospitalName = resolution === 'new' ? ($('#requestNewHospitalName')?.value.trim() || request.hospital_name) : '';
        const newHospitalPhone = resolution === 'new' ? ($('#requestNewHospitalPhone')?.value.trim() || '') : '';
        if (resolution === 'existing' && !hospitalId) throw new Error('HOSPITAL_SELECTION_REQUIRED');
        if (resolution === 'new' && newHospitalName.length < 2) throw new Error('INVALID_HOSPITAL');

        setButtonBusy(btn, true, resolution === 'new' ? 'กำลังเพิ่มโรงพยาบาลและสร้างบัญชี...' : 'กำลังสร้างบัญชี...');
        const result = await I.call({
          action: 'approve_account_request', access_token: state.session.access_token,
          request_id: request.id,
          resolution,
          hospital_id: hospitalId || null,
          province,
          new_hospital_name: newHospitalName || null,
          new_hospital_phone: newHospitalPhone || null,
          confirm_new_hospital: resolution === 'new',
          role: $('#requestRole').value,
          full_name: $('#requestFullName').value.trim(), phone: $('#requestPhone').value.trim(),
          admin_note: $('#requestAdminNote').value.trim()
        });
        closeModal();
        await loadMasters();
        const deliveryMessage = result.email_sent
          ? `${result.hospital_created ? 'เพิ่มโรงพยาบาลและสร้างบัญชีแล้ว' : 'ผูกบัญชีกับโรงพยาบาลเดิมแล้ว'} พร้อมส่งลิงก์ตั้งรหัสผ่าน`
          : `สร้างบัญชีแล้ว แต่อีเมลยังไม่ถูกส่ง: ${U.friendlyError(result.email_error || 'ไม่ทราบสาเหตุ')} หลังแก้ไขแล้วให้กด “ส่งลิงก์ใหม่”`;
        toast('อนุมัติบัญชีแล้ว', deliveryMessage, result.email_sent ? 'success' : 'error', 11000);
        await loadAdminTab('requests');
      } catch (error) { toast('อนุมัติไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
    $('#deleteRequestBtn').addEventListener('click', () => confirmDeleteAccountRequest(request));

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

  function confirmDeleteAccountRequest(request) {
    if (!request) return;
    const hasAccount = Boolean(request.auth_user_id);
    const title = hasAccount ? 'ยืนยันการลบบัญชี' : 'ยืนยันการลบคำขอ';
    const buttonLabel = hasAccount ? 'ยืนยันลบบัญชีถาวร' : 'ยืนยันลบคำขอถาวร';
    const detail = hasAccount
      ? `ระบบจะลบบัญชีเข้าสู่ระบบ โปรไฟล์ ลิงก์ตั้งรหัสผ่าน และคำขอของ ${U.esc(request.full_name || request.email)} หากบัญชีมีประวัติสร้างประกาศหรือจัดการรูป ระบบจะไม่ยอมลบ และต้องเปลี่ยนสถานะเป็น “ปิดใช้งาน” แทน โรงพยาบาลใน Master จะไม่ถูกลบ`
      : `ระบบจะลบคำขอของ ${U.esc(request.full_name || request.email)} ออกจากรายการถาวร ผู้สมัครสามารถส่งคำขอใหม่ด้วยอีเมลเดิมได้ โรงพยาบาลใน Master จะไม่ถูกลบ`;
    openModal(title, request.email, `
      <div class="notice danger"><b>การลบนี้ย้อนกลับไม่ได้</b><p>${detail}</p></div>
      <label class="check-row"><input id="confirmDeleteRequestCheck" type="checkbox"><span>ฉันตรวจสอบอีเมลและยืนยันว่าต้องการลบรายการนี้ถาวร</span></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button><button id="confirmDeleteRequestBtn" type="button" class="btn btn-danger" disabled>${buttonLabel}</button></div>`);
    const confirmCheck = $('#confirmDeleteRequestCheck');
    const confirmButton = $('#confirmDeleteRequestBtn');
    confirmCheck.addEventListener('change', () => { confirmButton.disabled = !confirmCheck.checked; });
    confirmButton.addEventListener('click', async () => {
      try {
        setButtonBusy(confirmButton, true, 'กำลังลบ...');
        const result = await I.call({
          action: 'admin_delete_account_request',
          access_token: state.session.access_token,
          request_id: request.id
        });
        closeModal();
        toast(result.deleted_user ? 'ลบบัญชีแล้ว' : 'ลบคำขอแล้ว', `${request.email} ถูกนำออกจากระบบแล้ว`, 'success');
        await loadAdminTab('requests');
      } catch (error) {
        toast(hasAccount ? 'ลบบัญชีไม่สำเร็จ' : 'ลบคำขอไม่สำเร็จ', U.friendlyError(error), 'error', 9000);
      } finally {
        setButtonBusy(confirmButton, false);
      }
    });
  }

  async function resendRequestLink(request) {
    try {
      const result = await I.call({ action: 'admin_send_password_link', access_token: state.session.access_token, request_id: request.id });
      toast('ออกลิงก์ใหม่แล้ว', result.email_sent ? 'ส่งอีเมลแล้ว และลิงก์เดิมถูกยกเลิก' : `ยังส่งอีเมลไม่สำเร็จ: ${U.friendlyError(result.email_error || 'ไม่ทราบสาเหตุ')}`, result.email_sent ? 'success' : 'error', 10000);
      await loadAdminTab('requests');
    } catch (error) { toast('ส่งลิงก์ไม่สำเร็จ', U.friendlyError(error), 'error'); }
  }

  async function adminHospitalTransfers(host) {
    const { data, error } = await state.supabase
      .from('bent_hospital_transfer_requests')
      .select(`
        *,
        profile:bent_profiles!bent_hospital_transfer_requests_user_id_fkey(id,email,full_name,phone,status,hospital_id),
        from_hospital:bent_hospitals!bent_hospital_transfer_requests_from_hospital_id_fkey(id,name,province,phone,is_active),
        to_hospital:bent_hospitals!bent_hospital_transfer_requests_to_hospital_id_fkey(id,name,province,phone,is_active)
      `)
      .order('requested_at', { ascending: false });
    if (error) throw error;

    const userIds = [...new Set((data || []).map(row => row.user_id).filter(Boolean))];
    let activeItems = [];
    if (userIds.length) {
      const result = await state.supabase.from('bent_announcements')
        .select('id,created_by,hospital_id,status')
        .in('created_by', userIds)
        .in('status', ['open','coordinating']);
      if (result.error) throw result.error;
      activeItems = result.data || [];
    }
    (data || []).forEach(row => {
      row._openItems = activeItems.filter(item => item.created_by === row.user_id && item.hospital_id === row.from_hospital_id).length;
    });

    state.adminFilters.transfers = { ...adminFilterState('transfers'), status: 'pending_verification' };
    const filters = adminFilterState('transfers');
    const statusOptions = ['pending_verification','approved','rejected','cancelled'];
    const checklist = row => `<div class="transfer-checklist-mini"><span class="${row.old_hospital_verified_at ? 'done' : ''}">${row.old_hospital_verified_at ? '✓' : '○'} รพ.เดิม</span><span class="${row.new_hospital_verified_at ? 'done' : ''}">${row.new_hospital_verified_at ? '✓' : '○'} รพ.ใหม่</span><span class="${row.no_outstanding_items_confirmed && row._openItems === 0 ? 'done' : ''}">${row._openItems === 0 ? (row.no_outstanding_items_confirmed ? '✓' : '○') : '!' } รายการค้าง ${row._openItems}</span></div>`;
    const actions = row => `<button class="btn btn-soft" data-action="admin-review-transfer" data-transfer="${row.id}">${row.status === 'pending_verification' ? 'ตรวจสอบ' : 'ดูรายละเอียด'}</button>`;
    const rowHtml = row => `<tr><td><b>${U.esc(row.profile?.full_name || row.user_full_name || '-')}</b><br><small>${U.esc(row.profile?.email || row.user_email)}</small></td><td>${U.esc(row.from_hospital?.name || '-')}<br><small>${U.esc(row.from_hospital?.province || '-')}</small></td><td>${U.esc(row.to_hospital?.name || '-')}<br><small>${U.esc(row.to_hospital?.province || '-')}</small></td><td>${checklist(row)}</td><td><span class="badge badge-${row.status}">${U.esc(U.statusLabel[row.status] || row.status)}</span><br><small>${U.fmtDateTime(row.requested_at)}</small></td><td>${actions(row)}</td></tr>`;
    const mobileHtml = row => `<div class="mobile-data-card"><b>${U.esc(row.profile?.full_name || row.user_full_name || '-')}</b><span>${U.esc(row.from_hospital?.name || '-')} → ${U.esc(row.to_hospital?.name || '-')}</span>${checklist(row)}<div class="inline-actions"><span class="badge badge-${row.status}">${U.esc(U.statusLabel[row.status] || row.status)}</span>${actions(row)}</div></div>`;

    host.innerHTML = `<div class="page-stack">
      ${adminFilterBar(`
        <label>ค้นหา<input data-admin-filter="text" value="${U.esc(filters.text || '')}" placeholder="ชื่อ อีเมล โรงพยาบาล"></label>
        <label>สถานะ<select data-admin-filter="status"><option value="">ทั้งหมด</option>${statusOptions.map(value => `<option value="${value}">${U.esc(U.statusLabel[value] || value)}</option>`).join('')}</select></label>
        <label>จังหวัดปลายทาง<select data-admin-filter="province"><option value="">ทุกจังหวัด</option>${THAI_PROVINCES.map(p => `<option value="${U.esc(p)}">${U.esc(p)}</option>`).join('')}</select></label>
      `, 'เปิดแท็บนี้เมื่อมีผู้ใช้ยื่นคำขอย้ายโรงพยาบาล')}
      <section class="panel"><div class="panel-header"><div><h2 id="adminTransferCount">คำขอย้ายโรงพยาบาล</h2><p>โทรตรวจสอบทั้งสองฝั่ง บันทึกผู้ให้ข้อมูล และตรวจรายการค้างก่อนอนุมัติ</p></div></div><div class="panel-body" id="adminTransferResults"></div></section>
    </div>`;
    host.dataset.transfers = JSON.stringify(data || []);

    const renderRows = () => {
      const f = adminFilterState('transfers');
      const text = String(f.text || '').trim().toLowerCase();
      const rows = (data || []).filter(row => {
        const searchable = [row.profile?.full_name,row.user_full_name,row.profile?.email,row.user_email,row.from_hospital?.name,row.to_hospital?.name].join(' ').toLowerCase();
        return (!text || searchable.includes(text))
          && (!f.status || row.status === f.status)
          && (!f.province || row.to_hospital?.province === f.province);
      });
      $('#adminTransferCount').textContent = `คำขอย้ายโรงพยาบาล ${rows.length.toLocaleString('th-TH')} จาก ${(data || []).length.toLocaleString('th-TH')} รายการ`;
      $('#adminTransferResults').innerHTML = rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ผู้ใช้</th><th>โรงพยาบาลเดิม</th><th>โรงพยาบาลใหม่</th><th>การตรวจสอบ</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div><div class="mobile-cards">${rows.map(mobileHtml).join('')}</div>` : emptyState('ไม่พบคำขอย้ายโรงพยาบาลที่ตรงกับตัวกรอง','ลองเปลี่ยนสถานะหรือล้างตัวกรอง');
    };
    bindAdminFilterControls('transfers', renderRows);
    renderRows();
  }

  function openAdminHospitalTransfer(request) {
    if (!request) return;
    const editable = request.status === 'pending_verification';
    const oldConfirmed = Boolean(request.old_hospital_verified_at);
    const newConfirmed = Boolean(request.new_hospital_verified_at);
    const noItemsConfirmed = Boolean(request.no_outstanding_items_confirmed);
    openModal('ตรวจสอบคำขอย้ายโรงพยาบาล', request.profile?.email || request.user_email, `
      <div class="request-hospital-summary"><div><span>ผู้ใช้งาน</span><b>${U.esc(request.profile?.full_name || request.user_full_name || '-')}</b><small>${U.esc(request.profile?.phone || request.user_phone || 'ไม่มีเบอร์ผู้ใช้')}</small></div><div><span>โรงพยาบาลเดิม</span><b>${U.esc(request.from_hospital?.name || '-')}</b><small>${U.esc(request.from_hospital?.province || '-')} · โทร ${U.esc(request.from_hospital?.phone || 'ยังไม่มีเบอร์ใน Master')}</small></div><div><span>โรงพยาบาลใหม่</span><b>${U.esc(request.to_hospital?.name || '-')}</b><small>${U.esc(request.to_hospital?.province || '-')} · โทร ${U.esc(request.to_hospital?.phone || 'ยังไม่มีเบอร์ใน Master')}</small></div></div>
      <div class="notice warning"><b>โรงพยาบาลเดิมไม่มีสิทธิ์ขัดขวางการย้าย</b><p>ให้ติดต่อเพื่อยืนยันข้อเท็จจริงและตรวจงานค้างเท่านั้น การติ๊กว่า “ยืนยันแล้ว” หมายถึงโทรตรวจสอบและบันทึกผลแล้ว ไม่ได้หมายถึงต้องได้รับอนุญาตจากโรงพยาบาลเดิม</p></div>
      <div class="info-box"><b>เหตุผลที่ผู้ใช้แจ้ง</b><p>${U.esc(request.reason)}</p>${request.requested_effective_date ? `<p>วันที่คาดว่าจะเริ่มงาน: ${U.fmtDate(request.requested_effective_date)}</p>` : ''}</div>
      <form id="adminTransferForm">
        <fieldset class="transfer-verification-box" ${editable ? '' : 'disabled'}><legend>1. ตรวจสอบโรงพยาบาลเดิม</legend>
          <div class="field-grid"><label>ชื่อผู้ให้ข้อมูล<input id="transferOldContactName" maxlength="160" value="${U.esc(request.old_hospital_contact_name || '')}"></label><label>เบอร์โทรที่ใช้ติดต่อ<input id="transferOldContactPhone" maxlength="40" value="${U.esc(request.old_hospital_contact_phone || request.from_hospital?.phone || '')}"></label></div>
          <label>วันที่และเวลาที่โทร<input id="transferOldContactedAt" type="datetime-local" value="${dateTimeLocalValue(request.old_hospital_contacted_at || request.old_hospital_verified_at)}"></label>
          <label>ผลการตรวจสอบ<textarea id="transferOldResult" maxlength="1500" placeholder="เช่น ยืนยันว่าไม่ได้ปฏิบัติงานแล้ว / ติดต่อไม่ได้ / ไม่ประสงค์ให้ข้อมูล">${U.esc(request.old_hospital_verification_result || '')}</textarea></label>
          <label class="check-row"><input id="transferOldConfirmed" type="checkbox" ${oldConfirmed ? 'checked' : ''}><span>ยืนยันว่าติดต่อและบันทึกผลจากโรงพยาบาลเดิมแล้ว</span></label>
          ${request.old_hospital_verified_at ? `<p class="field-help">บันทึกเมื่อ ${U.fmtDateTime(request.old_hospital_verified_at)}</p>` : ''}
        </fieldset>
        <fieldset class="transfer-verification-box" ${editable ? '' : 'disabled'}><legend>2. ตรวจสอบโรงพยาบาลใหม่</legend>
          <div class="field-grid"><label>ชื่อผู้ให้ข้อมูล<input id="transferNewContactName" maxlength="160" value="${U.esc(request.new_hospital_contact_name || '')}"></label><label>เบอร์โทรที่ใช้ติดต่อ<input id="transferNewContactPhone" maxlength="40" value="${U.esc(request.new_hospital_contact_phone || request.to_hospital?.phone || '')}"></label></div>
          <label>วันที่และเวลาที่โทร<input id="transferNewContactedAt" type="datetime-local" value="${dateTimeLocalValue(request.new_hospital_contacted_at || request.new_hospital_verified_at)}"></label>
          <label>ผลการตรวจสอบ<textarea id="transferNewResult" maxlength="1500" placeholder="เช่น ยืนยันว่าเริ่มปฏิบัติงานในหน่วยธนาคารเลือดแล้ว">${U.esc(request.new_hospital_verification_result || '')}</textarea></label>
          <label class="check-row"><input id="transferNewConfirmed" type="checkbox" ${newConfirmed ? 'checked' : ''}><span>ยืนยันว่าติดต่อและบันทึกผลจากโรงพยาบาลใหม่แล้ว</span></label>
          ${request.new_hospital_verified_at ? `<p class="field-help">บันทึกเมื่อ ${U.fmtDateTime(request.new_hospital_verified_at)}</p>` : ''}
        </fieldset>
        <fieldset class="transfer-verification-box" ${editable ? '' : 'disabled'}><legend>3. ตรวจรายการที่ยังต้องรับผิดชอบ</legend>
          <div class="hospital-status-card ${request._openItems === 0 ? 'found' : 'missing'}"><span>รายการเปิด/กำลังประสานงานของผู้ใช้นี้ที่โรงพยาบาลเดิม</span><b>${request._openItems || 0} รายการ</b><p>${request._openItems === 0 ? 'สามารถยืนยันว่าไม่มีรายการค้างได้' : 'ต้องปิดหรือส่งมอบรายการก่อน จึงจะอนุมัติการย้ายได้'}</p></div>
          <label class="check-row"><input id="transferNoItemsConfirmed" type="checkbox" ${noItemsConfirmed ? 'checked' : ''} ${request._openItems > 0 ? 'disabled' : ''}><span>ยืนยันว่าไม่มีรายการในระบบที่ผู้ใช้นี้ยังต้องรับผิดชอบ</span></label>
        </fieldset>
        <label>หมายเหตุผู้ดูแล<textarea id="transferAdminNote" maxlength="1500">${U.esc(request.admin_note || '')}</textarea></label>
        <div class="modal-actions">
          ${editable ? `<button id="rejectTransferBtn" type="button" class="btn btn-danger">ไม่อนุมัติ</button><button id="saveTransferCheckBtn" type="button" class="btn btn-soft">บันทึกผลตรวจสอบ</button><button id="approveTransferBtn" type="button" class="btn btn-primary">อนุมัติการย้ายโรงพยาบาล</button>` : `<button type="button" class="btn btn-primary" data-close-modal>ปิด</button>`}
        </div>
      </form>`);
    if (!editable) return;

    const payload = () => ({
      p_request_id: request.id,
      p_old_hospital_confirmed: $('#transferOldConfirmed').checked,
      p_old_hospital_contact_name: $('#transferOldContactName').value.trim() || null,
      p_old_hospital_contact_phone: $('#transferOldContactPhone').value.trim() || null,
      p_old_hospital_contacted_at: $('#transferOldContactedAt').value ? new Date($('#transferOldContactedAt').value).toISOString() : null,
      p_old_hospital_verification_result: $('#transferOldResult').value.trim() || null,
      p_new_hospital_confirmed: $('#transferNewConfirmed').checked,
      p_new_hospital_contact_name: $('#transferNewContactName').value.trim() || null,
      p_new_hospital_contact_phone: $('#transferNewContactPhone').value.trim() || null,
      p_new_hospital_contacted_at: $('#transferNewContactedAt').value ? new Date($('#transferNewContactedAt').value).toISOString() : null,
      p_new_hospital_verification_result: $('#transferNewResult').value.trim() || null,
      p_no_outstanding_items_confirmed: $('#transferNoItemsConfirmed').checked,
      p_admin_note: $('#transferAdminNote').value.trim() || null
    });
    const updateApprovalState = () => {
      $('#approveTransferBtn').disabled = !($('#transferOldConfirmed').checked && $('#transferNewConfirmed').checked && $('#transferNoItemsConfirmed').checked && request._openItems === 0);
    };
    const bindContactConfirmation = (checkboxId, dateId) => {
      $(`#${checkboxId}`).addEventListener('change', () => {
        if ($(`#${checkboxId}`).checked && !$(`#${dateId}`).value) $(`#${dateId}`).value = dateTimeLocalValue(new Date());
        updateApprovalState();
      });
    };
    bindContactConfirmation('transferOldConfirmed', 'transferOldContactedAt');
    bindContactConfirmation('transferNewConfirmed', 'transferNewContactedAt');
    $('#transferNoItemsConfirmed').addEventListener('change', updateApprovalState);
    updateApprovalState();

    const saveChecks = async () => {
      const { error } = await state.supabase.rpc('bent_admin_update_hospital_transfer', payload());
      if (error) throw error;
    };

    $('#saveTransferCheckBtn').addEventListener('click', async () => {
      const button = $('#saveTransferCheckBtn');
      try { setButtonBusy(button, true, 'กำลังบันทึก...'); await saveChecks(); toast('บันทึกผลตรวจสอบแล้ว', 'ข้อมูลผู้ให้ข้อมูล วันที่ และผลตรวจสอบถูกเก็บใน Audit Log แล้ว', 'success'); closeModal(); await loadAdminTab('transfers'); }
      catch (error) { toast('บันทึกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(button, false); }
    });

    $('#approveTransferBtn').addEventListener('click', async () => {
      const button = $('#approveTransferBtn');
      try {
        setButtonBusy(button, true, 'กำลังย้ายบัญชี...');
        await saveChecks();
        const { data, error } = await state.supabase.rpc('bent_admin_approve_hospital_transfer', { p_request_id: request.id });
        if (error) throw error;
        if (data?.user_id === state.profile?.id) {
          state.profile.hospital_id = data.to_hospital_id;
          state.hospital = state.masters.hospitals.find(h => h.id === data.to_hospital_id) || state.hospital;
          renderUserBlock();
        }
        closeModal(); toast('อนุมัติการย้ายแล้ว', `${request.from_hospital?.name || '-'} → ${request.to_hospital?.name || '-'}`, 'success', 8000); await loadAdminTab('transfers');
      } catch (error) { toast('อนุมัติไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(button, false); }
    });

    $('#rejectTransferBtn').addEventListener('click', async () => {
      const button = $('#rejectTransferBtn');
      try {
        const note = $('#transferAdminNote').value.trim();
        if (note.length < 3) throw new Error('TRANSFER_REJECTION_NOTE_REQUIRED');
        setButtonBusy(button, true, 'กำลังบันทึก...');
        const { error } = await state.supabase.rpc('bent_admin_reject_hospital_transfer', { p_request_id: request.id, p_admin_note: note });
        if (error) throw error;
        closeModal(); toast('บันทึกว่าไม่อนุมัติแล้ว', '', 'success'); await loadAdminTab('transfers');
      } catch (error) { toast('บันทึกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(button, false); }
    });
  }


  async function adminMemberDepartureReports(host) {
    const { data, error } = await state.supabase
      .from('bent_member_departure_reports')
      .select('*, hospital:bent_hospitals(id,name,province), reporter:bent_profiles!bent_member_departure_reports_reported_by_fkey(id,full_name,email)')
      .order('requested_at', { ascending: false });
    if (error) throw error;

    const reports = data || [];
    const targetIds = [...new Set(reports.map(report => report.reported_user_id).filter(Boolean))];
    const openCountKey = (userId, hospitalId) => `${userId || ''}:${hospitalId || ''}`;
    let openCounts = {};
    if (targetIds.length) {
      const { data: openRows, error: openError } = await state.supabase
        .from('bent_announcements')
        .select('id,created_by,hospital_id,status')
        .in('created_by', targetIds)
        .in('status', ['open','coordinating']);
      if (openError) throw openError;
      openCounts = (openRows || []).reduce((map, row) => {
        const key = openCountKey(row.created_by, row.hospital_id);
        map[key] = (map[key] || 0) + 1;
        return map;
      }, {});
    }
    const openItemCountFor = report => openCounts[openCountKey(report.reported_user_id, report.hospital_id)] || 0;

    state.adminFilters.departures = { ...adminFilterState('departures'), status: adminFilterState('departures').status ?? 'pending_verification' };
    const filters = adminFilterState('departures');
    host.innerHTML = `<div class="page-stack">
      ${adminFilterBar(`
        <label>ค้นหา<input data-admin-filter="text" value="${U.esc(filters.text || '')}" placeholder="ชื่อผู้ถูกรายงาน ผู้แจ้ง หรือโรงพยาบาล"></label>
        <label>จังหวัด<select data-admin-filter="province"><option value="">ทุกจังหวัด</option>${THAI_PROVINCES.map(province => `<option value="${U.esc(province)}">${U.esc(province)}</option>`).join('')}</select></label>
        <label>สถานะ<select data-admin-filter="status"><option value="">ทั้งหมด</option>${Object.entries(MEMBER_REPORT_STATUS_LABEL).map(([value,label]) => `<option value="${value}">${U.esc(label)}</option>`).join('')}</select></label>
        <label>รายการค้าง<select data-admin-filter="openItems"><option value="">ทั้งหมด</option><option value="yes">มีประกาศค้าง</option><option value="no">ไม่มีประกาศค้าง</option></select></label>
      `, 'ตรวจสอบกับโรงพยาบาลก่อนปิดบัญชี และต้องจัดการประกาศที่ยังเปิดอยู่ให้เรียบร้อย')}
      <section class="panel"><div class="panel-header"><div><h2 id="adminDepartureCount">คำแจ้งผู้พ้นสภาพ</h2><p>คำแจ้งจากเพื่อนร่วมโรงพยาบาลไม่ทำให้บัญชีถูกปิดอัตโนมัติ</p></div></div><div class="panel-body" id="adminDepartureResults"></div></section>
    </div>`;

    const renderRows = () => {
      const f = adminFilterState('departures');
      const text = String(f.text || '').trim().toLowerCase();
      const rows = reports.filter(report => {
        const count = openItemCountFor(report);
        const searchable = [report.reported_user_full_name, report.reported_user_email, report.reporter?.full_name, report.reporter?.email, report.reported_by_name, report.reported_by_email, report.hospital?.name, report.detail].join(' ').toLowerCase();
        return (!text || searchable.includes(text))
          && (!f.province || report.hospital?.province === f.province)
          && (!f.status || report.status === f.status)
          && (!f.openItems || (f.openItems === 'yes' ? count > 0 : count === 0));
      });
      $('#adminDepartureCount').textContent = `คำแจ้ง ${rows.length.toLocaleString('th-TH')} จาก ${reports.length.toLocaleString('th-TH')} รายการ`;
      $('#adminDepartureResults').innerHTML = rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ผู้ถูกรายงาน</th><th>โรงพยาบาล</th><th>ผู้แจ้ง</th><th>สาเหตุ</th><th>ประกาศค้าง</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.map(report => `<tr><td><b>${U.esc(report.reported_user_full_name)}</b><br><small>${U.esc(report.reported_user_email)}</small></td><td>${U.esc(report.hospital?.name || '-')}<br><small>${U.esc(report.hospital?.province || '-')}</small></td><td>${U.esc(report.reporter?.full_name || report.reporter?.email || report.reported_by_name || report.reported_by_email || '-')}</td><td>${U.esc(MEMBER_REPORT_REASON_LABEL[report.reason_category] || report.reason_category)}<br><small>${U.fmtDateTime(report.requested_at)}</small></td><td>${openItemCountFor(report).toLocaleString('th-TH')} รายการ</td><td><span class="badge badge-${U.esc(report.status)}">${U.esc(MEMBER_REPORT_STATUS_LABEL[report.status] || report.status)}</span></td><td><button type="button" class="btn btn-soft" data-admin-departure="${report.id}">ตรวจสอบ</button></td></tr>`).join('')}</tbody></table></div><div class="mobile-cards">${rows.map(report => `<div class="mobile-data-card"><b>${U.esc(report.reported_user_full_name)}</b><span>${U.esc(report.hospital?.name || '-')} · ${U.esc(MEMBER_REPORT_REASON_LABEL[report.reason_category] || report.reason_category)}</span><span>ประกาศค้าง ${openItemCountFor(report)} รายการ</span><div class="inline-actions"><span class="badge badge-${U.esc(report.status)}">${U.esc(MEMBER_REPORT_STATUS_LABEL[report.status] || report.status)}</span><button type="button" class="btn btn-soft" data-admin-departure="${report.id}">ตรวจสอบ</button></div></div>`).join('')}</div>` : emptyState('ไม่พบคำแจ้งที่ตรงกับตัวกรอง','คำแจ้งใหม่จะปรากฏในหน้านี้');
      $$('[data-admin-departure]', $('#adminDepartureResults')).forEach(button => button.addEventListener('click', () => {
        const report = reports.find(item => item.id === button.dataset.adminDeparture);
        if (report) openAdminMemberDepartureReport(report, openItemCountFor(report));
      }));
    };
    bindAdminFilterControls('departures', renderRows);
    renderRows();
  }

  function openAdminMemberDepartureReport(report, openItemCount) {
    const pending = report.status === 'pending_verification';
    const progress = `<div class="transfer-progress-grid"><div class="${report.verified_at ? 'done' : ''}"><b>1</b><span>โทรตรวจสอบโรงพยาบาล</span></div><div class="${report.no_open_items_confirmed ? 'done' : ''}"><b>2</b><span>ตรวจประกาศที่ยังค้าง</span></div><div class="${report.status === 'confirmed_inactive' ? 'done' : ''}"><b>3</b><span>ปิดบัญชีเป็น Inactive</span></div></div>`;
    openModal('ตรวจคำแจ้งผู้พ้นสภาพ', `${report.reported_user_full_name} · ${report.hospital?.name || '-'}`, `
      <div class="request-hospital-summary"><div><span>ผู้ถูกรายงาน</span><b>${U.esc(report.reported_user_full_name)}</b><small>${U.esc(report.reported_user_email)}</small></div><div><span>ผู้แจ้ง</span><b>${U.esc(report.reporter?.full_name || report.reporter?.email || report.reported_by_name || report.reported_by_email || '-')}</b></div><div><span>สถานะ</span><b>${U.esc(MEMBER_REPORT_STATUS_LABEL[report.status] || report.status)}</b></div></div>
      <div class="info-box"><b>เหตุผลที่แจ้ง</b><p>${U.esc(MEMBER_REPORT_REASON_LABEL[report.reason_category] || report.reason_category)}</p><p>${U.esc(report.detail)}</p>${report.last_working_date ? `<p>วันที่ปฏิบัติงานวันสุดท้าย: ${U.fmtDate(report.last_working_date)}</p>` : ''}</div>
      ${progress}
      <div class="notice ${openItemCount ? 'danger' : 'success'}"><b>ประกาศของบัญชีนี้ที่ยังเปิด/กำลังประสานงาน: ${openItemCount.toLocaleString('th-TH')} รายการ</b><p>${openItemCount ? 'ต้องแก้ไขหรือปิดประกาศเหล่านี้ก่อน เพื่อไม่ให้เหลือชื่อผู้ติดต่อที่ไม่ได้ปฏิบัติงานแล้ว' : 'ไม่พบประกาศค้าง สามารถยืนยันขั้นตอนนี้ได้หลังตรวจสอบ'}</p></div>
      <form id="adminMemberDepartureForm">
        <fieldset class="transfer-verification-box" ${pending ? '' : 'disabled'}><legend>ผลการโทรตรวจสอบโรงพยาบาล</legend>
          <label class="check-row"><input id="departureHospitalConfirmed" type="checkbox" ${report.verified_at ? 'checked' : ''}><span>ยืนยันว่าโทรตรวจสอบแล้ว และได้รับข้อมูลว่าบุคคลนี้ไม่ได้ปฏิบัติงานที่หน่วยเดิมแล้ว</span></label>
          <div class="field-grid"><label>ชื่อผู้ให้ข้อมูล<input id="departureContactName" maxlength="160" value="${U.esc(report.hospital_contact_name || '')}"></label><label>เบอร์โทรที่ติดต่อ<input id="departureContactPhone" maxlength="40" value="${U.esc(report.hospital_contact_phone || '')}"></label><label>วันที่และเวลาที่โทร<input id="departureContactedAt" type="datetime-local" value="${dateTimeLocalValue(report.contacted_at)}"></label></div>
          <label>ผลการตรวจสอบ<textarea id="departureVerificationResult" maxlength="1500">${U.esc(report.verification_result || '')}</textarea></label>
        </fieldset>
        <label class="check-row"><input id="departureNoOpenItems" type="checkbox" ${report.no_open_items_confirmed ? 'checked' : ''} ${openItemCount ? 'disabled' : ''}><span>ยืนยันว่าไม่มีประกาศของบัญชีนี้ที่ยังต้องรับผิดชอบ หรือจัดการรายการค้างเรียบร้อยแล้ว</span></label>
        <label>หมายเหตุผู้ดูแล<textarea id="departureAdminNote" maxlength="1500">${U.esc(report.admin_note || '')}</textarea></label>
        <div class="modal-actions">
          ${pending ? `<button id="dismissMemberDepartureBtn" type="button" class="btn btn-ghost">ไม่ดำเนินการ</button><button id="saveMemberDepartureCheckBtn" type="button" class="btn btn-soft">บันทึกผลตรวจสอบ</button><button id="confirmMemberDepartureBtn" type="button" class="btn btn-danger" ${openItemCount ? 'disabled' : ''}>ยืนยันและปิดบัญชี</button>` : '<button type="button" class="btn btn-primary" data-close-modal>ปิด</button>'}
        </div>
      </form>`);
    if (!pending) return;

    const saveVerification = async () => {
      const { error } = await state.supabase.rpc('bent_admin_update_member_departure_report', {
        p_report_id: report.id,
        p_hospital_confirmed: $('#departureHospitalConfirmed').checked,
        p_hospital_contact_name: $('#departureContactName').value.trim() || null,
        p_hospital_contact_phone: $('#departureContactPhone').value.trim() || null,
        p_contacted_at: $('#departureContactedAt').value ? new Date($('#departureContactedAt').value).toISOString() : null,
        p_verification_result: $('#departureVerificationResult').value.trim() || null,
        p_no_open_items_confirmed: $('#departureNoOpenItems').checked,
        p_admin_note: $('#departureAdminNote').value.trim() || null
      });
      if (error) throw error;
    };

    $('#saveMemberDepartureCheckBtn').addEventListener('click', async () => {
      const button = $('#saveMemberDepartureCheckBtn');
      try {
        setButtonBusy(button, true, 'กำลังบันทึก...');
        await saveVerification();
        closeModal(); toast('บันทึกผลตรวจสอบแล้ว', '', 'success'); await loadAdminTab('departures');
      } catch (error) { toast('บันทึกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(button, false); }
    });

    $('#confirmMemberDepartureBtn').addEventListener('click', async () => {
      const button = $('#confirmMemberDepartureBtn');
      try {
        setButtonBusy(button, true, 'กำลังตรวจสอบ...');
        await saveVerification();
        const { data, error } = await state.supabase.rpc('bent_admin_confirm_member_departure', { p_report_id: report.id });
        if (error) throw error;
        closeModal(); toast('ปิดบัญชีแล้ว', `${data?.user_name || report.reported_user_full_name} ถูกเปลี่ยนเป็นสถานะปิดใช้งาน โดยยังเก็บประวัติเดิม`, 'success', 8000); await loadAdminTab('departures');
      } catch (error) { toast('ปิดบัญชีไม่สำเร็จ', U.friendlyError(error), 'error', 9000); }
      finally { setButtonBusy(button, false); }
    });

    $('#dismissMemberDepartureBtn').addEventListener('click', async () => {
      const button = $('#dismissMemberDepartureBtn');
      try {
        const note = $('#departureAdminNote').value.trim();
        if (note.length < 3) throw new Error('MEMBER_REPORT_DISMISS_NOTE_REQUIRED');
        setButtonBusy(button, true, 'กำลังบันทึก...');
        const { error } = await state.supabase.rpc('bent_admin_dismiss_member_departure_report', { p_report_id: report.id, p_admin_note: note });
        if (error) throw error;
        closeModal(); toast('บันทึกว่าไม่ดำเนินการแล้ว', '', 'success'); await loadAdminTab('departures');
      } catch (error) { toast('บันทึกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(button, false); }
    });
  }

  async function adminSupportThreads(host) {
    const { data, error } = await state.supabase
      .from('bent_support_threads')
      .select('*')
      .order('last_message_at', { ascending: false });
    if (error) throw error;
    const threads = data || [];
    state.adminFilters.support = { ...adminFilterState('support'), status: adminFilterState('support').status ?? 'waiting_admin' };
    const filters = adminFilterState('support');
    host.innerHTML = `<div class="page-stack">
      ${adminFilterBar(`
        <label>ค้นหา<input data-admin-filter="text" value="${U.esc(filters.text || '')}" placeholder="หัวข้อ ชื่อ อีเมล หรือโรงพยาบาล"></label>
        <label>ประเภท<select data-admin-filter="category"><option value="">ทั้งหมด</option>${Object.entries(SUPPORT_CATEGORY_LABEL).map(([value,label]) => `<option value="${value}">${U.esc(label)}</option>`).join('')}</select></label>
        <label>สถานะ<select data-admin-filter="status"><option value="">ทั้งหมด</option>${Object.entries(SUPPORT_STATUS_LABEL).map(([value,label]) => `<option value="${value}">${U.esc(label)}</option>`).join('')}</select></label>
        <label>จังหวัด<select data-admin-filter="province"><option value="">ทุกจังหวัด</option>${THAI_PROVINCES.map(province => `<option value="${U.esc(province)}">${U.esc(province)}</option>`).join('')}</select></label>
      `, 'หัวข้อที่รอผู้ดูแลตอบจะแสดงก่อน และประวัติแชทจะเก็บแยกตามเรื่อง')}
      <section class="panel"><div class="panel-header"><div><h2 id="adminSupportCount">ข้อความและข้อเสนอแนะ</h2><p>ตอบกลับได้ในรูปแบบบทสนทนา และปิดเรื่องเมื่อดำเนินการเสร็จ</p></div></div><div class="panel-body" id="adminSupportResults"></div></section>
    </div>`;

    const renderRows = () => {
      const f = adminFilterState('support');
      const text = String(f.text || '').trim().toLowerCase();
      const rows = threads.filter(thread => {
        const province = state.masters.hospitals.find(h => h.id === thread.hospital_id)?.province || '';
        const searchable = [thread.subject, thread.created_by_name, thread.created_by_email, thread.hospital_name].join(' ').toLowerCase();
        return (!text || searchable.includes(text))
          && (!f.category || thread.category === f.category)
          && (!f.status || thread.status === f.status)
          && (!f.province || province === f.province);
      });
      $('#adminSupportCount').textContent = `หัวข้อ ${rows.length.toLocaleString('th-TH')} จาก ${threads.length.toLocaleString('th-TH')} เรื่อง`;
      $('#adminSupportResults').innerHTML = rows.length ? `<div class="support-thread-list">${rows.map(thread => `<button type="button" class="support-thread-row ${thread.status === 'waiting_admin' ? 'unread' : ''}" data-admin-support-thread="${thread.id}"><div><b>${U.esc(thread.subject)}</b><span>${U.esc(thread.created_by_name)} · ${U.esc(thread.hospital_name || '-')} · ${U.fmtDateTime(thread.last_message_at)}</span></div><div class="support-thread-meta"><span>${U.esc(SUPPORT_CATEGORY_LABEL[thread.category] || thread.category)}</span><span class="badge badge-${U.esc(thread.status)}">${U.esc(SUPPORT_STATUS_LABEL[thread.status] || thread.status)}</span></div></button>`).join('')}</div>` : emptyState('ไม่พบข้อความที่ตรงกับตัวกรอง','ลองล้างหรือลดเงื่อนไข');
      $$('[data-admin-support-thread]', $('#adminSupportResults')).forEach(button => button.addEventListener('click', () => openSupportThread(button.dataset.adminSupportThread, true, () => loadAdminTab('support'))));
    };
    bindAdminFilterControls('support', renderRows);
    renderRows();
  }

  async function adminUsers(host) {
    const { data, error } = await state.supabase.from('bent_profiles').select('*, hospital:bent_hospitals(id,name,province)').order('created_at', { ascending: false });
    if (error) throw error;
    const filters = adminFilterState('users');
    const row = p => `<tr><td><b>${U.esc(p.full_name || '-')}</b><br><small>${U.esc(p.email)}</small></td><td>${U.esc(p.hospital?.name || p.hospital_name_requested || '-')}<br><small>${U.esc(p.hospital?.province || '-')}</small></td><td><span class="badge badge-${p.status}">${U.esc(U.statusLabel[p.status])}</span></td><td>${p.role === 'system_admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน'}</td><td><button class="btn btn-soft" data-action="admin-edit-user" data-user="${p.id}">จัดการ</button></td></tr>`;
    const mobile = p => `<div class="mobile-data-card"><b>${U.esc(p.full_name || p.email)}</b><span>${U.esc(p.email)}</span><span>${U.esc(p.hospital?.name || p.hospital_name_requested || '-')} · ${U.esc(p.hospital?.province || '-')}</span><div class="inline-actions"><span class="badge badge-${p.status}">${U.esc(U.statusLabel[p.status])}</span><button class="btn btn-soft" data-action="admin-edit-user" data-user="${p.id}">จัดการ</button></div></div>`;
    host.innerHTML = `<div class="page-stack">
      ${adminFilterBar(`
        <label>ค้นหาผู้ใช้<input data-admin-filter="text" value="${U.esc(filters.text || '')}" placeholder="ชื่อ อีเมล โรงพยาบาล"></label>
        <label>จังหวัด<select data-admin-filter="province"><option value="">ทุกจังหวัด</option>${THAI_PROVINCES.map(p => `<option value="${U.esc(p)}">${U.esc(p)}</option>`).join('')}</select></label>
        <label>โรงพยาบาล<select data-admin-filter="hospital"><option value="">ทุกโรงพยาบาล</option>${state.masters.hospitals.map(h => `<option value="${h.id}">${U.esc(h.name)}</option>`).join('')}</select></label>
        <label>สถานะ<select data-admin-filter="status"><option value="">ทั้งหมด</option>${['pending','active','rejected','suspended','inactive'].map(x => `<option value="${x}">${U.esc(U.statusLabel[x])}</option>`).join('')}</select></label>
        <label>สิทธิ์<select data-admin-filter="role"><option value="">ทั้งหมด</option><option value="user">ผู้ใช้งาน</option><option value="system_admin">ผู้ดูแลระบบ</option></select></label>
      `)}
      <section class="panel"><div class="panel-header"><div><h2 id="adminUserCount">ผู้ใช้งาน</h2><p>จัดการข้อมูลบัญชี สถานะ และสิทธิ์ ส่วนการย้ายโรงพยาบาลให้ใช้แท็บคำขอย้าย รพ.</p></div></div><div class="panel-body" id="adminUserResults"></div></section>
    </div>`;
    host.dataset.users = JSON.stringify(data);
    const renderRows = () => {
      const f = adminFilterState('users');
      const text = String(f.text || '').trim().toLowerCase();
      const rows = data.filter(p => {
        const searchable = [p.full_name, p.email, p.hospital?.name, p.hospital_name_requested].join(' ').toLowerCase();
        return (!text || searchable.includes(text))
          && (!f.province || p.hospital?.province === f.province)
          && (!f.hospital || p.hospital_id === f.hospital)
          && (!f.status || p.status === f.status)
          && (!f.role || p.role === f.role);
      });
      $('#adminUserCount').textContent = `ผู้ใช้งาน ${rows.length.toLocaleString('th-TH')} จาก ${data.length.toLocaleString('th-TH')} บัญชี`;
      $('#adminUserResults').innerHTML = rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ผู้ใช้</th><th>โรงพยาบาล</th><th>สถานะ</th><th>สิทธิ์</th><th></th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div><div class="mobile-cards">${rows.map(mobile).join('')}</div>` : emptyState('ไม่พบผู้ใช้งานที่ตรงกับตัวกรอง','ลองล้างหรือลดเงื่อนไข');
    };
    bindAdminFilterControls('users', renderRows);
    renderRows();
  }
  function openAdminUser(user) {
    const currentHospital = state.masters.hospitals.find(h => h.id === user.hospital_id) || user.hospital || null;
    const currentProvince = currentHospital?.province || '';
    openModal('จัดการผู้ใช้งาน', user.email, `
      <form id="adminUserForm">
        <label>ชื่อ–นามสกุล<input id="adminUserName" value="${U.esc(user.full_name || '')}" maxlength="120"></label>
        <label>เบอร์โทร<input id="adminUserPhone" value="${U.esc(user.phone || '')}" maxlength="30"></label>
        <label>จังหวัดของโรงพยาบาล<select id="adminUserProvince">${provinceOptions(currentProvince)}</select></label>
        <label>โรงพยาบาล<select id="adminUserHospital"><option value="">ยังไม่กำหนด</option></select></label>
        <p class="field-help">เลือกจังหวัดก่อน ระบบจะแสดงเฉพาะโรงพยาบาลในจังหวัดนั้น เช่น “สมุทรปราการ”</p>
        <label>สถานะ<select id="adminUserStatus">${['pending','active','rejected','suspended','inactive'].map(x => `<option value="${x}" ${x === user.status ? 'selected' : ''}>${U.esc(U.statusLabel[x])}</option>`).join('')}</select></label>
        <label>สิทธิ์การใช้งาน<select id="adminUserRole"><option value="user" ${user.role === 'user' ? 'selected' : ''}>ผู้ใช้งาน</option><option value="system_admin" ${user.role === 'system_admin' ? 'selected' : ''}>ผู้ดูแลระบบ</option></select></label>
        <div class="notice warning"><b>ข้อควรระวัง</b><p>บัญชีที่เปิดใช้งานต้องกำหนดโรงพยาบาล หากเป็นการย้ายสถานที่ปฏิบัติงาน ให้ใช้แท็บ “คำขอย้าย รพ.” เพื่อให้มีการโทรตรวจสอบและ Audit Log ครบถ้วน การเปลี่ยนโรงพยาบาลตรงหน้านี้ควรใช้เฉพาะแก้ข้อมูลที่ผูกผิดเท่านั้น</p><p>หากบัญชีเคยสร้างประกาศหรือจัดการรูปแล้ว ระบบจะให้ปิดใช้งานแทนการลบ เพื่อรักษาประวัติการทำงาน</p></div>
        <div class="modal-actions"><button id="adminDeleteUserBtn" type="button" class="btn btn-danger" ${user.id === state.profile?.id ? 'disabled' : ''}>ลบบัญชี</button><button id="adminSendPasswordLinkBtn" type="button" class="btn btn-soft">ส่งลิงก์ตั้งรหัสผ่านใหม่</button><button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button><button id="adminSaveUserBtn" class="btn btn-primary" type="submit">บันทึก</button></div>
      </form>`);

    const renderHospitalOptions = () => {
      const province = $('#adminUserProvince').value;
      const rows = state.masters.hospitals.filter(h => !province || h.province === province).sort((a,b) => a.name.localeCompare(b.name,'th'));
      $('#adminUserHospital').innerHTML = `<option value="">ยังไม่กำหนด</option>${rows.map(h => `<option value="${h.id}" ${h.id === user.hospital_id ? 'selected' : ''}>${U.esc(h.name)}</option>`).join('')}`;
      if (!rows.some(h => h.id === $('#adminUserHospital').value) && user.hospital_id && currentHospital?.province === province) $('#adminUserHospital').value = user.hospital_id;
    };
    $('#adminUserProvince').addEventListener('change', () => {
      user.hospital_id = null;
      renderHospitalOptions();
    });
    renderHospitalOptions();

    $('#adminDeleteUserBtn').addEventListener('click', () => confirmDeleteUser(user));
    $('#adminSendPasswordLinkBtn').addEventListener('click', async () => {
      const btn = $('#adminSendPasswordLinkBtn');
      try {
        setButtonBusy(btn, true, 'กำลังส่ง...');
        const result = await I.call({ action: 'admin_send_password_link', access_token: state.session.access_token, user_id: user.id });
        toast('ออกลิงก์ใหม่แล้ว', result.email_sent ? 'ส่งอีเมลแล้ว และลิงก์เดิมถูกยกเลิก' : `ยังส่งอีเมลไม่สำเร็จ: ${U.friendlyError(result.email_error || 'ไม่ทราบสาเหตุ')}`, result.email_sent ? 'success' : 'error', 10000);
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
        if (user.id === state.profile?.id) {
          state.profile.hospital_id = hospital;
          state.profile.hospital = state.masters.hospitals.find(h => h.id === hospital) || null;
          state.hospital = state.profile.hospital;
          renderUserBlock();
        }
        closeModal(); toast('บันทึกผู้ใช้งานแล้ว', '', 'success'); await loadAdminTab('users');
      } catch (error) { toast('บันทึกไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
  }
  function confirmDeleteUser(user) {
    if (!user) return;
    if (user.id === state.profile?.id) {
      toast('ลบบัญชีนี้ไม่ได้', 'ไม่สามารถลบบัญชีที่กำลังเข้าสู่ระบบอยู่ได้', 'error');
      return;
    }
    openModal('ยืนยันการลบบัญชี', user.email, `
      <div class="notice danger"><b>ลบถาวรเฉพาะบัญชีที่ยังไม่มีประวัติการทำงาน</b><p>ระบบจะลบบัญชีเข้าสู่ระบบ โปรไฟล์ และคำขอเปิดบัญชีของ ${U.esc(user.full_name || user.email)} หากบัญชีเคยสร้างประกาศหรือจัดการรูป ระบบจะไม่ลบและจะแนะนำให้เปลี่ยนสถานะเป็น “ปิดใช้งาน” แทน</p></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button><button id="confirmDeleteUserBtn" type="button" class="btn btn-danger">ยืนยันลบบัญชี</button></div>`);
    $('#confirmDeleteUserBtn').addEventListener('click', async () => {
      const btn = $('#confirmDeleteUserBtn');
      try {
        setButtonBusy(btn, true, 'กำลังลบ...');
        await I.call({ action: 'admin_delete_user', access_token: state.session.access_token, user_id: user.id });
        closeModal();
        toast('ลบบัญชีแล้ว', `${user.email} ถูกนำออกจากระบบแล้ว`, 'success');
        await loadAdminTab('users');
      } catch (error) {
        toast('ลบบัญชีไม่สำเร็จ', U.friendlyError(error), 'error', 9000);
      } finally {
        setButtonBusy(btn, false);
      }
    });
  }

  async function adminHospitals(host) {
    const { data: activeProfiles, error } = await state.supabase.from('bent_profiles').select('hospital_id').eq('status', 'active').not('hospital_id', 'is', null);
    if (error) throw error;
    const activeCounts = (activeProfiles || []).reduce((map, profile) => {
      map[profile.hospital_id] = (map[profile.hospital_id] || 0) + 1;
      return map;
    }, {});
    const rows = state.masters.hospitals;
    const filters = adminFilterState('hospitals');
    host.innerHTML = `<div class="page-stack">
      <section class="panel"><div class="panel-header"><div><h2>เพิ่มโรงพยาบาล</h2><p>สถานะ Master ใช้กำหนดว่าจะให้เลือกตอนสมัครได้หรือไม่ ส่วน “มีผู้ใช้งาน Active” คือการใช้งานจริง</p></div></div><div class="panel-body"><form id="hospitalForm" class="master-row-form"><label>ชื่อโรงพยาบาล<input id="hospitalName" required maxlength="180"></label><label>จังหวัด<select id="hospitalProvince" required>${provinceOptions('')}</select></label><label>โทรศัพท์<input id="hospitalPhone" maxlength="30"></label><label>สถานะ Master<select id="hospitalActive"><option value="true">เปิดให้เลือกสมัคร</option><option value="false">ปิดไม่ให้เลือกสมัคร</option></select></label><button class="btn btn-primary" type="submit">เพิ่มโรงพยาบาล</button></form></div></section>
      ${adminFilterBar(`
        <label>ค้นหาโรงพยาบาล<input data-admin-filter="text" value="${U.esc(filters.text || '')}" placeholder="ชื่อหรือเบอร์โทร"></label>
        <label>จังหวัด<select data-admin-filter="province"><option value="">ทุกจังหวัด</option>${THAI_PROVINCES.map(p => `<option value="${U.esc(p)}">${U.esc(p)}</option>`).join('')}</select></label>
        <label>สถานะ Master<select data-admin-filter="master"><option value="">ทั้งหมด</option><option value="active">เปิดให้เลือกสมัคร</option><option value="inactive">ปิดไม่ให้เลือกสมัคร</option></select></label>
        <label>การใช้งานจริง<select data-admin-filter="staff"><option value="">ทั้งหมด</option><option value="active">มีผู้ใช้งาน Active</option><option value="none">ไม่มีผู้ใช้งาน Active</option></select></label>
      `, 'ค้นหาตามจังหวัด สถานะ Master หรือจำนวนผู้ใช้งาน Active')}
      <section class="panel"><div class="panel-header"><div><h2 id="adminHospitalCount">โรงพยาบาล</h2><p>“โรงพยาบาลที่เปิดใช้งานจริง” หมายถึงมีเจ้าหน้าที่สถานะ Active อย่างน้อย 1 บัญชี</p></div></div><div class="panel-body" id="adminHospitalResults"></div></section>
    </div>`;

    const renderRows = () => {
      const f = adminFilterState('hospitals');
      const text = String(f.text || '').trim().toLowerCase();
      const filtered = rows.filter(h => {
        const count = activeCounts[h.id] || 0;
        const searchable = [h.name, h.phone].join(' ').toLowerCase();
        return (!text || searchable.includes(text))
          && (!f.province || h.province === f.province)
          && (!f.master || (f.master === 'active' ? h.is_active : !h.is_active))
          && (!f.staff || (f.staff === 'active' ? count > 0 : count === 0));
      });
      $('#adminHospitalCount').textContent = `โรงพยาบาล ${filtered.length.toLocaleString('th-TH')} จาก ${rows.length.toLocaleString('th-TH')} แห่ง`;
      $('#adminHospitalResults').innerHTML = filtered.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>โรงพยาบาล</th><th>จังหวัด</th><th>โทรศัพท์</th><th>สถานะ Master</th><th>ผู้ใช้งาน Active</th><th></th></tr></thead><tbody>${filtered.map(h => `<tr><td>${U.esc(h.name)}</td><td>${U.esc(h.province || '-')}</td><td>${U.esc(h.phone || '-')}</td><td><span class="badge badge-${h.is_active ? 'active':'inactive'}">${h.is_active ? 'เปิดให้เลือกสมัคร':'ปิดไม่ให้เลือกสมัคร'}</span></td><td><span class="badge badge-${(activeCounts[h.id] || 0) > 0 ? 'active':'inactive'}">${(activeCounts[h.id] || 0).toLocaleString('th-TH')} บัญชี</span></td><td><button class="btn btn-soft" data-action="edit-hospital" data-id="${h.id}">แก้ไข</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('ไม่พบโรงพยาบาลที่ตรงกับตัวกรอง','ลองล้างหรือลดเงื่อนไข');
    };
    bindAdminFilterControls('hospitals', renderRows);
    renderRows();
    $('#hospitalForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = event.submitter;
      try {
        setButtonBusy(btn, true);
        const { error } = await state.supabase.from('bent_hospitals').insert({ name: $('#hospitalName').value.trim(), province: $('#hospitalProvince').value || null, phone: $('#hospitalPhone').value.trim() || null, is_active: $('#hospitalActive').value === 'true' });
        if (error) throw error;
        await loadMasters(); toast('เพิ่มโรงพยาบาลแล้ว', '', 'success'); await loadAdminTab('hospitals');
      } catch (error) { toast('เพิ่มไม่สำเร็จ', U.friendlyError(error), 'error'); }
      finally { setButtonBusy(btn, false); }
    });
  }
  function openHospitalEdit(hospital) {
    openModal('แก้ไขโรงพยาบาล', 'การปิดใช้งานจะไม่ลบข้อมูลประกาศเก่า', `<form id="editHospitalForm"><label>ชื่อ<input id="editHospitalName" value="${U.esc(hospital.name)}" required></label><label>จังหวัด<select id="editHospitalProvince" required>${provinceOptions(hospital.province || '')}</select></label><label>โทรศัพท์<input id="editHospitalPhone" value="${U.esc(hospital.phone || '')}"></label><label>สถานะ<select id="editHospitalActive"><option value="true" ${hospital.is_active ? 'selected':''}>ใช้งาน</option><option value="false" ${!hospital.is_active ? 'selected':''}>ปิดใช้งาน</option></select></label><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close-modal>ยกเลิก</button><button id="saveHospitalEdit" class="btn btn-primary">บันทึก</button></div></form>`);
    $('#editHospitalForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = $('#saveHospitalEdit');
      try {
        setButtonBusy(btn, true);
        const { error } = await state.supabase.from('bent_hospitals').update({ name: $('#editHospitalName').value.trim(), province: $('#editHospitalProvince').value || null, phone: $('#editHospitalPhone').value.trim() || null, is_active: $('#editHospitalActive').value === 'true' }).eq('id', hospital.id);
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
    const filters = adminFilterState(tab);
    host.innerHTML = `<div class="page-stack">
      <section class="panel"><div class="panel-header"><div><h2>เพิ่ม ${m.label}</h2><p>เพิ่มรายการใหม่โดยกำหนดรหัส ชื่อ และลำดับ</p></div></div><div class="panel-body"><form id="masterAddForm" class="master-row-form"><label>รหัสระบบ<input id="masterCode" required placeholder="${m.code}" maxlength="60"></label><label>ชื่อที่แสดง<input id="masterName" required maxlength="180"></label><label>ลำดับ<input id="masterOrder" type="number" min="0" value="100"></label>${tab === 'sources' ? '<label class="check-row"><input id="masterRequiresDetail" type="checkbox"><span>บังคับรายละเอียด</span></label>' : '<span></span>'}<button class="btn btn-primary" type="submit">เพิ่ม</button></form></div></section>
      ${adminFilterBar(`<label>ค้นหา<input data-admin-filter="text" value="${U.esc(filters.text || '')}" placeholder="รหัสหรือชื่อ"></label><label>สถานะ<select data-admin-filter="status"><option value="">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ปิดใช้งาน</option></select></label>`, `กรองรายการ ${m.label}`)}
      <section class="panel"><div class="panel-header"><div><h2 id="adminMasterCount">จัดการ ${m.label}</h2><p>ปิดใช้งานแทนการลบ เพื่อรักษาประวัติประกาศเดิม</p></div></div><div class="panel-body" id="adminMasterResults"></div></section>
    </div>`;
    const renderRows = () => {
      const f = adminFilterState(tab);
      const text = String(f.text || '').trim().toLowerCase();
      const rows = m.list.filter(x => {
        const searchable = [x.code, x.display_name].join(' ').toLowerCase();
        return (!text || searchable.includes(text)) && (!f.status || (f.status === 'active' ? x.is_active : !x.is_active));
      });
      $('#adminMasterCount').textContent = `${m.label} ${rows.length.toLocaleString('th-TH')} จาก ${m.list.length.toLocaleString('th-TH')} รายการ`;
      $('#adminMasterResults').innerHTML = rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>รหัสระบบ</th><th>ชื่อ</th><th>ลำดับ</th>${tab === 'sources' ? '<th>รายละเอียด</th>':''}<th>สถานะ</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td><code>${U.esc(x.code)}</code></td><td>${U.esc(x.display_name)}</td><td>${x.sort_order}</td>${tab === 'sources' ? `<td>${x.requires_detail ? 'บังคับ':'ไม่บังคับ'}</td>`:''}<td><span class="badge badge-${x.is_active ? 'active':'inactive'}">${x.is_active ? 'ใช้งาน':'ปิด'}</span></td><td><div class="inline-actions"><button class="btn btn-soft" data-action="edit-master" data-tab="${tab}" data-id="${x.id}">แก้ไข</button><button class="btn btn-ghost" data-action="toggle-master" data-tab="${tab}" data-id="${x.id}">${x.is_active ? 'ปิดใช้งาน':'เปิดใช้งาน'}</button></div></td></tr>`).join('')}</tbody></table></div>` : emptyState('ไม่พบรายการที่ตรงกับตัวกรอง','ลองล้างตัวกรอง');
    };
    bindAdminFilterControls(tab, renderRows);
    renderRows();
    $('#masterAddForm').addEventListener('submit', async event => {
      event.preventDefault(); const btn = event.submitter;
      try {
        setButtonBusy(btn, true);
        const payload = { code: $('#masterCode').value.trim(), display_name: $('#masterName').value.trim(), sort_order: Number($('#masterOrder').value || 100), is_active: true };
        if (tab === 'sources') payload.requires_detail = $('#masterRequiresDetail').checked;
        const { error } = await state.supabase.from(m.table).insert(payload); if (error) throw error;
        await loadMasters(); toast('เพิ่มข้อมูลแล้ว', '', 'success'); await loadAdminTab(tab);
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
    const filters = adminFilterState('stats');
    host.innerHTML = `<div class="page-stack">
      <form id="adminStatsFilterForm" class="admin-filter-panel"><div class="admin-filter-heading"><div><b>ตัวกรองช่วงวันที่</b><span>ใช้กับสถิติประกาศ ผลการประสานงาน และกราฟ ส่วนจำนวนผู้ใช้งาน Active เป็นสถานะปัจจุบัน</span></div><button type="button" class="btn btn-ghost" id="clearAdminStatsFilter">ล้างตัวกรอง</button></div><div class="admin-filter-grid"><label>ตั้งแต่วันที่<input id="statsDateFrom" type="date" value="${U.esc(filters.dateFrom || '')}"></label><label>ถึงวันที่<input id="statsDateTo" type="date" value="${U.esc(filters.dateTo || '')}"></label><button class="btn btn-primary" type="submit">แสดงสถิติ</button></div></form>
      <div id="adminStatsResults"><div class="loading-block"><div class="spinner"></div></div></div>
    </div>`;
    const loadStats = async () => {
      const result = $('#adminStatsResults');
      result.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';
      const f = adminFilterState('stats');
      const { data, error } = await state.supabase.rpc('bent_get_pilot_stats_filtered', { p_date_from: f.dateFrom || null, p_date_to: f.dateTo || null });
      if (error) throw error;
      const chart = (title, rows, labelKey) => {
        const list = rows || []; const max = Math.max(...list.map(x => x.total),1);
        return `<section class="panel"><div class="panel-header"><h2>${U.esc(title)}</h2></div><div class="panel-body chart-list">${list.map(x => `<div class="chart-row"><span>${U.esc(x[labelKey] || '-')}</span><div class="chart-bar"><span style="width:${Math.round(x.total/max*100)}%"></span></div><b>${x.total}</b></div>`).join('') || 'ยังไม่มีข้อมูล'}</div></section>`;
      };
      result.innerHTML = `<div class="page-stack"><section class="stat-grid">${statCard('โรงพยาบาลที่มีผู้ใช้งาน Active',data.hospitals_active,'แห่ง')}${statCard('ผู้ใช้งานที่เปิดใช้งาน',data.users_active,'บัญชี')}${statCard('ประกาศว่ามีเลือด',data.offers,'รายการ')}${statCard('ประกาศว่าต้องการเลือด',data.requests,'รายการ')}${statCard('ประสานงานสำเร็จ',data.success_items,'รายการ')}${statCard('Unit ที่สำเร็จ',data.coordinated_units,'Unit')}${statCard('หาได้ช่องทางอื่น',data.found_other_channel,'รายการ')}${statCard('เวลาเฉลี่ยจนปิด',data.average_close_hours,'ชั่วโมง')}${statCard('รายการหมดอายุ',data.expired_items,'รายการ')}${statCard('ประกาศมีรูป',data.with_images,'รายการ')}${statCard('รูปซ่อน/ลบ',data.images_hidden_or_deleted,'รายการ')}</section>${chart('ผลิตภัณฑ์ที่ถูกประกาศมากที่สุด',data.top_components,'display_name')}${chart('แอนติเจนผลลบที่ถูกประกาศมากที่สุด',data.top_antigens,'antigen')}${chart('แหล่งที่มาของผลิตภัณฑ์โลหิต',data.blood_sources,'display_name')}${chart('เหตุผลการปิดรายการ',data.closure_reasons,'closure_reason')}</div>`;
    };
    $('#adminStatsFilterForm').addEventListener('submit', async event => {
      event.preventDefault();
      filters.dateFrom = $('#statsDateFrom').value;
      filters.dateTo = $('#statsDateTo').value;
      try { await loadStats(); } catch (error) { $('#adminStatsResults').innerHTML = `<div class="notice danger"><b>โหลดสถิติไม่สำเร็จ</b><p>${U.esc(U.friendlyError(error))}</p></div>`; }
    });
    $('#clearAdminStatsFilter').addEventListener('click', async () => {
      filters.dateFrom = ''; filters.dateTo = '';
      $('#statsDateFrom').value = ''; $('#statsDateTo').value = '';
      try { await loadStats(); } catch (error) { toast('โหลดสถิติไม่สำเร็จ', U.friendlyError(error), 'error'); }
    });
    await loadStats();
  }
  async function adminImages(host) {
    const { data, error } = await state.supabase.from('bent_announcement_images').select('*, announcement:bent_announcements(id,status,hospital_id,hospital:bent_hospitals(name,province))').order('updated_at',{ascending:false});
    if (error) throw error;
    const filters = adminFilterState('images');
    const buttons = x => {
      if (x.image_status === 'active') return `<button class="btn btn-soft" data-action="admin-hide-image" data-image="${x.id}">ซ่อนรูป</button><button class="btn btn-danger" data-action="admin-delete-image" data-id="${x.announcement_id}">ลบรูป</button>`;
      if (x.image_status === 'hidden') return `<button class="btn btn-soft" data-action="admin-show-image" data-image="${x.id}" data-id="${x.announcement_id}">แสดงรูป</button><button class="btn btn-danger" data-action="admin-delete-image" data-id="${x.announcement_id}">ลบรูป</button>`;
      if (['pending_delete','delete_failed'].includes(x.image_status)) return `<button class="btn btn-primary" data-action="retry-image-delete" data-id="${x.announcement_id}">ลองลบอีกครั้ง</button>`;
      return '-';
    };
    host.dataset.images = JSON.stringify(data);
    host.innerHTML = `<div class="page-stack">
      ${adminFilterBar(`
        <label>ค้นหา<input data-admin-filter="text" value="${U.esc(filters.text || '')}" placeholder="ชื่อไฟล์หรือโรงพยาบาล"></label>
        <label>สถานะรูป<select data-admin-filter="imageStatus"><option value="">ทั้งหมด</option>${[...new Set(data.map(x => x.image_status))].map(x => `<option value="${U.esc(x)}">${U.esc(x)}</option>`).join('')}</select></label>
        <label>สถานะประกาศ<select data-admin-filter="announcementStatus"><option value="">ทั้งหมด</option>${['open','coordinating','closed','cancelled','expired'].map(x => `<option value="${x}">${U.esc(U.statusLabel[x])}</option>`).join('')}</select></label>
        <label>จังหวัด<select data-admin-filter="province"><option value="">ทุกจังหวัด</option>${THAI_PROVINCES.map(p => `<option value="${U.esc(p)}">${U.esc(p)}</option>`).join('')}</select></label>
      `)}
      <section class="panel"><div class="panel-header"><div><h2 id="adminImageCount">จัดการรูป</h2><p>ซ่อนรูปได้ทันที หรือลบไฟล์จาก Google Drive โดยระบบเก็บประวัติการเปลี่ยนแปลง</p></div></div><div class="panel-body" id="adminImageResults"></div></section>
    </div>`;
    const renderRows = () => {
      const f = adminFilterState('images');
      const text = String(f.text || '').trim().toLowerCase();
      const rows = data.filter(x => {
        const searchable = [x.image_file_name, x.announcement?.hospital?.name].join(' ').toLowerCase();
        return (!text || searchable.includes(text))
          && (!f.imageStatus || x.image_status === f.imageStatus)
          && (!f.announcementStatus || x.announcement?.status === f.announcementStatus)
          && (!f.province || x.announcement?.hospital?.province === f.province);
      });
      $('#adminImageCount').textContent = `จัดการรูป ${rows.length.toLocaleString('th-TH')} จาก ${data.length.toLocaleString('th-TH')} รายการ`;
      $('#adminImageResults').innerHTML = rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>ไฟล์</th><th>โรงพยาบาล</th><th>ประกาศ</th><th>สถานะรูป</th><th>ข้อผิดพลาด</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td>${U.esc(x.image_file_name)}</td><td>${U.esc(x.announcement?.hospital?.name || '-')}<br><small>${U.esc(x.announcement?.hospital?.province || '-')}</small></td><td>${U.esc(U.statusLabel[x.announcement?.status] || x.announcement?.status || '-')}</td><td>${U.esc(x.image_status)}</td><td>${U.esc(x.delete_error || '-')}</td><td><div class="inline-actions">${buttons(x)}</div></td></tr>`).join('')}</tbody></table></div>` : emptyState('ไม่พบรูปที่ตรงกับตัวกรอง','ลองล้างหรือลดเงื่อนไข');
    };
    bindAdminFilterControls('images', renderRows);
    renderRows();
  }
  async function adminAudit(host) {
    const { data, error } = await state.supabase.from('bent_audit_logs').select('*').order('performed_at',{ascending:false}).limit(500); if (error) throw error;
    const filters = adminFilterState('audit');
    const actions = [...new Set(data.map(x => x.action).filter(Boolean))].sort();
    const entities = [...new Set(data.map(x => x.entity_type).filter(Boolean))].sort();
    host.innerHTML = `<div class="page-stack">
      ${adminFilterBar(`
        <label>ค้นหา<input data-admin-filter="text" value="${U.esc(filters.text || '')}" placeholder="รายการ ผู้ดำเนินการ หรือรหัสข้อมูล"></label>
        <label>การทำรายการ<select data-admin-filter="action"><option value="">ทั้งหมด</option>${actions.map(x => `<option value="${U.esc(x)}">${U.esc(x)}</option>`).join('')}</select></label>
        <label>ประเภทข้อมูล<select data-admin-filter="entity"><option value="">ทั้งหมด</option>${entities.map(x => `<option value="${U.esc(x)}">${U.esc(x)}</option>`).join('')}</select></label>
        <label>ตั้งแต่วันที่<input type="date" data-admin-filter="dateFrom"></label>
        <label>ถึงวันที่<input type="date" data-admin-filter="dateTo"></label>
      `)}
      <section class="panel"><div class="panel-header"><div><h2 id="adminAuditCount">ประวัติการเปลี่ยนแปลงล่าสุด</h2><p>เก็บการเปลี่ยนแปลงสำคัญโดยไม่ตั้งใจเก็บข้อมูลผู้ป่วย</p></div></div><div class="panel-body" id="adminAuditResults"></div></section>
    </div>`;
    const renderRows = () => {
      const f = adminFilterState('audit');
      const text = String(f.text || '').trim().toLowerCase();
      const rows = data.filter(x => {
        const searchable = [x.action, x.entity_type, x.entity_id, x.performed_by, JSON.stringify(x.new_data || {})].join(' ').toLowerCase();
        const date = bangkokDateKey(x.performed_at);
        return (!text || searchable.includes(text))
          && (!f.action || x.action === f.action)
          && (!f.entity || x.entity_type === f.entity)
          && (!f.dateFrom || date >= f.dateFrom)
          && (!f.dateTo || date <= f.dateTo);
      });
      $('#adminAuditCount').textContent = `ประวัติ ${rows.length.toLocaleString('th-TH')} จาก ${data.length.toLocaleString('th-TH')} รายการล่าสุด`;
      $('#adminAuditResults').innerHTML = rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>วันเวลา</th><th>การทำรายการ</th><th>ข้อมูลที่เกี่ยวข้อง</th><th>ผู้ดำเนินการ</th><th>ข้อมูลใหม่</th></tr></thead><tbody>${rows.map(x => `<tr><td>${U.fmtDateTime(x.performed_at)}</td><td>${U.esc(x.action)}</td><td>${U.esc(x.entity_type)}<br><small>${U.esc(x.entity_id || '')}</small></td><td>${U.esc(x.performed_by || '-')}</td><td><div class="audit-json">${U.esc(JSON.stringify(x.new_data,null,2) || '-')}</div></td></tr>`).join('')}</tbody></table></div>` : emptyState('ไม่พบประวัติที่ตรงกับตัวกรอง','ลองล้างหรือลดเงื่อนไข');
    };
    bindAdminFilterControls('audit', renderRows);
    renderRows();
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
    $('#registerProvince').addEventListener('change', handleRegistrationProvinceChange);
    $('#registerHospitalSearch').addEventListener('input', () => {
      $('#registerHospitalId').value = '';
      $('#registerHospitalMode').value = '';
      $('#registerHospitalSelected').classList.add('hidden');
      $('#registerExistingHospitalPhone').classList.add('hidden');
      $('#registerNewHospitalFields').classList.add('hidden');
      renderRegistrationHospitalSuggestions();
    });
    $('#registerHospitalSearch').addEventListener('focus', renderRegistrationHospitalSuggestions);
    $('#registerHospitalSuggestions').addEventListener('click', event => {
      const button = event.target.closest('[data-register-hospital-id]');
      if (!button) return;
      selectRegistrationHospital(state.registrationHospitals.find(hospital => hospital.id === button.dataset.registerHospitalId));
    });
    $('#registerNewHospitalBtn').addEventListener('click', startNewHospitalRequest);
    $('#registerHospitalPhoneBtn').addEventListener('click', () => {
      $('#registerHospitalPhoneProposalLabel').classList.remove('hidden');
      $('#registerExistingHospitalPhoneProposed').focus();
    });
    $('#passwordSetupForm').addEventListener('submit', saveSetupPassword);
    $('#backToLoginBtn').addEventListener('click', returnToLogin);
    $('#forgotPasswordBtn').addEventListener('click', forgotPassword);
    $('#logoutBtn').addEventListener('click', logout);
    $('#pendingLogoutBtn').addEventListener('click', logout);
    $('#refreshProfileBtn').addEventListener('click', () => routeSession().catch(handleRouteSessionError));
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
      const { data, error } = await state.supabase.auth.signInWithPassword({ email: $('#loginEmail').value.trim(), password: $('#loginPassword').value });
      if (error) throw error;
      state.session = data?.session || null;
      await routeSession();
    } catch (error) {
      showScreen('auth');
      toast('เข้าสู่ระบบไม่สำเร็จ', U.friendlyError(error), 'error');
    } finally { setButtonBusy(btn, false); }
  }

  async function register(event) {
    event.preventDefault(); const btn = event.submitter;
    try {
      const province = $('#registerProvince').value;
      let mode = $('#registerHospitalMode').value;
      let hospitalId = $('#registerHospitalId').value;
      let hospitalName = '';
      let proposedHospitalPhone = '';

      if (!province) throw new Error('INVALID_PROVINCE');

      if (!mode) {
        const typed = $('#registerHospitalSearch').value.trim();
        const exact = registrationHospitalsForProvince().find(hospital => normalizeHospitalName(hospital.name) === normalizeHospitalName(typed));
        if (exact) {
          selectRegistrationHospital(exact);
          mode = 'existing';
          hospitalId = exact.id;
        } else {
          throw new Error('HOSPITAL_SELECTION_REQUIRED');
        }
      }

      if (mode === 'existing') {
        const selected = state.registrationHospitals.find(hospital => hospital.id === hospitalId && hospital.province === province);
        if (!selected) throw new Error('HOSPITAL_SELECTION_REQUIRED');
        hospitalName = selected.name;
        proposedHospitalPhone = $('#registerExistingHospitalPhoneProposed').value.trim();
      } else if (mode === 'new') {
        hospitalName = $('#registerNewHospitalName').value.trim();
        proposedHospitalPhone = $('#registerHospitalPhoneProposed').value.trim();
        if (hospitalName.length < 2) throw new Error('INVALID_HOSPITAL');
        if (proposedHospitalPhone.length < 3) throw new Error('HOSPITAL_PHONE_REQUIRED');
      } else {
        throw new Error('HOSPITAL_SELECTION_REQUIRED');
      }

      setButtonBusy(btn, true, 'กำลังส่งคำขอ...');
      await I.call({
        action: 'submit_account_request',
        full_name: $('#registerName').value.trim(),
        province,
        hospital_selection_mode: mode,
        requested_hospital_id: hospitalId || null,
        hospital_name: hospitalName,
        proposed_hospital_phone: proposedHospitalPhone || null,
        phone: $('#registerPhone').value.trim(),
        email: $('#registerEmail').value.trim(),
        position_title: $('#registerPosition').value.trim(),
        website: $('#registerWebsite').value
      });
      openModal('ส่งคำขอแล้ว', 'โรงพยาบาลใหม่ยังไม่ถูกเพิ่มจนกว่าผู้ดูแลจะอนุมัติ', `<ol><li>ผู้ดูแลระบบตรวจสอบข้อมูล จังหวัด และชื่อโรงพยาบาลซ้ำ</li><li>หากเป็นโรงพยาบาลใหม่ ผู้ดูแลจะเพิ่มโรงพยาบาลและสร้างบัญชีในขั้นตอนเดียว</li><li>ระบบส่งลิงก์ตั้งรหัสผ่านไปยังอีเมลที่ระบุ</li></ol><div class="notice warning"><b>ลิงก์ไม่มีการหมดอายุตามเวลา</b><p>ลิงก์ใช้ได้หนึ่งครั้ง และลิงก์เดิมจะถูกยกเลิกเมื่อมีการออกลิงก์ใหม่</p></div><div class="modal-actions"><button class="btn btn-primary" data-close-modal>รับทราบ</button></div>`);
      event.target.reset();
      initializeRegistrationForm();
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
    state.session = null; state.profile = null; state.hospital = null; state.announcements = []; state.filters = {}; state.searchPerformed = false; state.adminFilters = {}; state.currentView = 'dashboard'; showScreen('auth');
  }

  async function handleActionClick(event) {
    const viewBtn = event.target.closest('[data-view]');
    if (viewBtn && !viewBtn.closest('#mainNav')) { await navigate(viewBtn.dataset.view); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const id = event.target.closest('[data-id]')?.dataset.id;
    const item = id ? findAnnouncement(id) : null;
    if (action === 'reload-app') await enterApp();
    else if (action === 'clear-filters') { state.filters = {}; state.searchPerformed = false; renderBrowse(); }
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
      const requests = JSON.parse($('#adminContent').dataset.requests || '[]'); await openAccountRequest(requests.find(x => x.id === event.target.closest('[data-request]').dataset.request));
    }
    else if (action === 'admin-resend-request-link') {
      const requests = JSON.parse($('#adminContent').dataset.requests || '[]'); await resendRequestLink(requests.find(x => x.id === event.target.closest('[data-request]').dataset.request));
    }
    else if (action === 'admin-delete-request') {
      const requests = JSON.parse($('#adminContent').dataset.requests || '[]'); confirmDeleteAccountRequest(requests.find(x => x.id === event.target.closest('[data-request]').dataset.request));
    }
    else if (action === 'admin-edit-user') {
      const users = JSON.parse($('#adminContent').dataset.users || '[]'); openAdminUser(users.find(x => x.id === event.target.closest('[data-user]').dataset.user));
    }
    else if (action === 'admin-review-transfer') {
      const transfers = JSON.parse($('#adminContent').dataset.transfers || '[]'); openAdminHospitalTransfer(transfers.find(x => x.id === event.target.closest('[data-transfer]').dataset.transfer));
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
    else if (action === 'admin-delete-announcement' && item) confirmAdminDeleteAnnouncement(item);
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
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=1.6.0').catch(() => {}));
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
