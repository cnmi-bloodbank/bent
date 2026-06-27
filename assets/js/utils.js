(function () {
  'use strict';

  const esc = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const fmtDate = (value) => {
    if (!value) return '-';
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return esc(value);
    return new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  };

  const fmtDateTime = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return esc(value);
    return new Intl.DateTimeFormat('th-TH', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(d);
  };

  const statusLabel = {
    open: 'เปิดรับการติดต่อ',
    coordinating: 'กำลังประสานงาน',
    closed: 'ปิดรายการแล้ว',
    cancelled: 'ยกเลิกรายการ',
    expired: 'หมดอายุ',
    pending: 'รออนุมัติ',
    active: 'ใช้งาน',
    rejected: 'ไม่อนุมัติ',
    suspended: 'ระงับ',
    inactive: 'ปิดใช้งาน',
    success: 'สำเร็จ',
    unsuccessful: 'ไม่สำเร็จ',
    not_actioned: 'ไม่ได้ดำเนินการ',
    unknown: 'ไม่ทราบผล'
  };

  const typeLabel = { offer: 'มีเลือดพร้อมให้ติดต่อ', request: 'ต้องการเลือด' };
  const rhLabel = { positive: 'Positive', negative: 'Negative', not_specified: 'ไม่ระบุ' };
  const urgencyLabel = { routine: 'ทั่วไป', urgent: 'เร่งด่วน', immediate: 'ด่วนมาก' };

  function friendlyError(error) {
    const raw = String(error?.message || error || 'เกิดข้อผิดพลาด');
    const map = [
      ['Invalid login credentials', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'],
      ['Email not confirmed', 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ'],
      ['User already registered', 'อีเมลนี้สมัครไว้แล้ว กรุณาเข้าสู่ระบบหรือรีเซ็ตรหัสผ่าน'],
      ['Password should be at least', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'],
      ['ACTIVE_APPROVED_USER_REQUIRED', 'บัญชีต้องได้รับอนุมัติและผูกกับโรงพยาบาลก่อน'],
      ['RATE_LIMITED', 'สร้างรายการถี่เกินไป กรุณาตรวจสอบว่าไม่ได้กดซ้ำ'],
      ['COMPONENT_NOT_ACTIVE', 'ผลิตภัณฑ์นี้ถูกปิดใช้งาน กรุณาเลือกใหม่'],
      ['INVALID_ANTIGEN', 'พบ Antigen ที่ไม่พร้อมใช้งาน กรุณาเลือกใหม่'],
      ['SOURCE_DETAIL_REQUIRED', 'กรุณาระบุรายละเอียดแหล่งที่มา'],
      ['DATE_IN_PAST', 'วันที่ต้องไม่ย้อนหลัง กรุณาเลือกวันนี้หรือวันถัดไป'],
      ['CLOSURE_NOTE_REQUIRED', 'หากเลือกเหตุผล “อื่น ๆ” กรุณาระบุรายละเอียด'],
      ['LAST_ADMIN_CANNOT_BE_REMOVED', 'ไม่สามารถถอนสิทธิ์ System Admin คนสุดท้ายได้ กรุณาแต่งตั้ง Admin สำรองก่อน'],
      ['NOT_ALLOWED', 'บัญชีนี้ไม่มีสิทธิ์ทำรายการดังกล่าว'],
      ['ANNOUNCEMENT_LOCKED', 'รายการนี้ปิดแล้ว จึงแก้ไขไม่ได้'],
      ['Failed to fetch', 'เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่']
    ];
    const hit = map.find(([key]) => raw.includes(key));
    return hit ? hit[1] : raw;
  }

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function telHref(phone) {
    return `tel:${String(phone || '').replace(/[^0-9+]/g, '')}`;
  }

  function debounce(fn, wait = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  window.BENT_UTIL = {
    esc, fmtDate, fmtDateTime, statusLabel, typeLabel, rhLabel, urgencyLabel,
    friendlyError, uuid, telHref, debounce
  };
})();
