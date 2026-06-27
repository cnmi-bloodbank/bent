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
    approved: 'อนุมัติแล้ว',
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
      ['Password should be at least', 'รหัสผ่านสั้นเกินไป'],
      ['PASSWORD_TOO_SHORT', 'รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร'],
      ['PASSWORDS_NOT_MATCH', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'],
      ['SETUP_LINK_INVALID_OR_USED', 'ลิงก์นี้ถูกใช้แล้ว ถูกยกเลิก หรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่'],
      ['ACCOUNT_NOT_ACTIVE', 'บัญชีนี้ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ'],
      ['SYSTEM_ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้'],
      ['MAIL_DAILY_QUOTA_EXCEEDED', 'โควตาส่งอีเมลวันนี้เต็มแล้ว กรุณาให้ผู้ดูแลส่งใหม่ภายหลัง'],
      ['ACCOUNT_REQUEST_ALREADY_APPROVED', 'คำขอนี้อนุมัติแล้ว ให้ใช้ปุ่มส่งลิงก์ใหม่แทน'],
      ['EMAIL_ALREADY_HAS_ACCOUNT', 'อีเมลนี้มีบัญชีที่เปิดใช้งานอยู่แล้ว ให้ใช้เมนูผู้ใช้งานหรือส่งลิงก์ตั้งรหัสผ่านใหม่'],
      ['PASSWORD_UPDATE_FAILED_NEW_LINK_SENT', 'ตั้งรหัสผ่านไม่สำเร็จ ระบบส่งลิงก์ใหม่ให้ทางอีเมลแล้ว'],
      ['ACTIVE_APPROVED_USER_REQUIRED', 'บัญชีต้องได้รับอนุมัติและผูกกับโรงพยาบาลก่อน'],
      ['RATE_LIMITED', 'สร้างรายการถี่เกินไป กรุณาตรวจสอบว่าไม่ได้กดซ้ำ'],
      ['COMPONENT_NOT_ACTIVE', 'ผลิตภัณฑ์นี้ถูกปิดใช้งาน กรุณาเลือกใหม่'],
      ['INVALID_ANTIGEN', 'พบแอนติเจนที่ไม่พร้อมใช้งาน กรุณาเลือกใหม่'],
      ['SOURCE_DETAIL_REQUIRED', 'กรุณาระบุรายละเอียดแหล่งที่มา'],
      ['DATE_IN_PAST', 'วันที่ต้องไม่ย้อนหลัง กรุณาเลือกวันนี้หรือวันถัดไป'],
      ['CLOSURE_NOTE_REQUIRED', 'หากเลือกเหตุผล “อื่น ๆ” กรุณาระบุรายละเอียด'],
      ['LAST_ADMIN_CANNOT_BE_REMOVED', 'ไม่สามารถถอนสิทธิ์ผู้ดูแลระบบคนสุดท้ายได้ กรุณาแต่งตั้งผู้ดูแลสำรองก่อน'],
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
