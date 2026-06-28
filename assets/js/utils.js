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
    pending_verification: 'รอตรวจสอบโรงพยาบาลเดิมและโรงพยาบาลใหม่',
    approved: 'อนุมัติแล้ว',
    active: 'ใช้งาน',
    rejected: 'ไม่อนุมัติ',
    suspended: 'ระงับ',
    inactive: 'ปิดใช้งาน',
    confirmed_inactive: 'ตรวจสอบแล้วและปิดบัญชี',
    dismissed: 'ตรวจสอบแล้ว ไม่ดำเนินการ',
    waiting_admin: 'รอผู้ดูแลตอบ',
    waiting_user: 'รอผู้ใช้งานตอบ',
    resolved: 'ปิดเรื่องแล้ว',
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
      ['ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้'],
      ['MAIL_DAILY_QUOTA_EXCEEDED', 'โควตาส่งอีเมลวันนี้เต็มแล้ว กรุณาให้ผู้ดูแลส่งใหม่ภายหลัง'],
      ['PASSWORD_EMAIL_SQL_NOT_READY', 'ส่วนออกลิงก์ตั้งรหัสผ่านใน Supabase ยังไม่พร้อม ให้ Run ไฟล์ supabase/05_fix_password_email_and_user_delete.sql แล้วส่งลิงก์ใหม่'],
      ['gen_random_bytes', 'Supabase ยังเรียกส่วนสร้างลิงก์ไม่ได้ ให้ Run ไฟล์ supabase/05_fix_password_email_and_user_delete.sql'],
      ['digest(', 'Supabase ยังเรียกส่วนเข้ารหัสลิงก์ไม่ได้ ให้ Run ไฟล์ supabase/05_fix_password_email_and_user_delete.sql'],
      ['ACCOUNT_REQUEST_ALREADY_APPROVED', 'คำขอนี้อนุมัติแล้ว ให้ใช้ปุ่มส่งลิงก์ใหม่แทน'],
      ['EMAIL_ALREADY_HAS_ACCOUNT', 'อีเมลนี้มีบัญชีที่เปิดใช้งานอยู่แล้ว ให้ใช้เมนูผู้ใช้งานหรือส่งลิงก์ตั้งรหัสผ่านใหม่'],
      ['INVALID_PROVINCE', 'กรุณาเลือกจังหวัดจากรายการที่ระบบกำหนด'],
      ['HOSPITAL_SELECTION_REQUIRED', 'กรุณาเลือกโรงพยาบาลจากผลค้นหา หรือกด “ไม่พบโรงพยาบาลของฉัน” เพื่อเสนอชื่อใหม่'],
      ['HOSPITAL_PHONE_REQUIRED', 'กรุณากรอกเบอร์โทรหลักของโรงพยาบาลตามข้อมูลทางการ'],
      ['HOSPITAL_RESOLUTION_REQUIRED', 'กรุณาเลือกว่าจะใช้โรงพยาบาลที่มีอยู่ หรือยืนยันว่าเป็นโรงพยาบาลใหม่'],
      ['CONFIRM_NEW_HOSPITAL_REQUIRED', 'กรุณายืนยันว่าเป็นโรงพยาบาลใหม่ก่อนเพิ่มเข้า Master'],
      ['HOSPITAL_ALREADY_EXISTS_USE_EXISTING', 'พบโรงพยาบาลนี้อยู่ในระบบแล้ว กรุณาเลือก “ใช้โรงพยาบาลที่มีอยู่” เพื่อป้องกันข้อมูลซ้ำ'],
      ['HOSPITAL_EXISTS_INACTIVE', 'พบชื่อโรงพยาบาลนี้ในระบบแต่ถูกปิดใช้งาน กรุณาเปิดใช้งานจากเมนูโรงพยาบาลก่อน'],
      ['SIMILAR_HOSPITAL_FOUND', 'พบชื่อโรงพยาบาลใกล้เคียง กรุณาตรวจสอบและเลือกว่าจะใช้โรงพยาบาลเดิมหรือยืนยันว่าเป็นโรงพยาบาลใหม่'],
      ['HOSPITAL_CREATE_FAILED', 'เพิ่มโรงพยาบาลไม่สำเร็จ กรุณาตรวจสอบชื่อ จังหวัด และข้อมูลซ้ำ'],
      ['bent_hospitals_province_normalized_unique', 'พบโรงพยาบาลชื่อเดียวกันในจังหวัดนี้แล้ว กรุณาใช้ข้อมูลเดิมแทนการสร้างซ้ำ'],
      ['bent_provinces', 'ฐานข้อมูลจังหวัดและขั้นตอนสมัครรุ่นใหม่ยังไม่พร้อม ให้ Run ไฟล์ supabase/06_hospital_registration_workflow.sql ก่อน'],
      ['PASSWORD_UPDATE_FAILED_NEW_LINK_SENT', 'ตั้งรหัสผ่านไม่สำเร็จ ระบบส่งลิงก์ใหม่ให้ทางอีเมลแล้ว'],
      ['ACTIVE_APPROVED_USER_REQUIRED', 'บัญชีต้องได้รับอนุมัติและผูกกับโรงพยาบาลก่อน'],
      ['RATE_LIMITED', 'สร้างรายการถี่เกินไป กรุณาตรวจสอบว่าไม่ได้กดซ้ำ'],
      ['COMPONENT_NOT_ACTIVE', 'ผลิตภัณฑ์นี้ถูกปิดใช้งาน กรุณาเลือกใหม่'],
      ['INVALID_ANTIGEN', 'พบแอนติเจนที่ไม่พร้อมใช้งาน กรุณาเลือกใหม่'],
      ['SOURCE_DETAIL_REQUIRED', 'กรุณาระบุรายละเอียดแหล่งที่มา'],
      ['DATE_IN_PAST', 'วันที่ต้องไม่ย้อนหลัง กรุณาเลือกวันนี้หรือวันถัดไป'],
      ['CLOSURE_NOTE_REQUIRED', 'หากเลือกเหตุผล “อื่น ๆ” กรุณาระบุรายละเอียด'],
      ['LAST_ADMIN_CANNOT_BE_REMOVED', 'ไม่สามารถลบหรือถอนสิทธิ์ผู้ดูแลระบบคนสุดท้ายได้ กรุณาแต่งตั้งผู้ดูแลสำรองก่อน'],
      ['CANNOT_DELETE_OWN_ACCOUNT', 'ไม่สามารถลบบัญชีที่กำลังเข้าสู่ระบบอยู่ได้'],
      ['USER_HAS_ACTIVITY_DEACTIVATE_ONLY', 'บัญชีนี้มีประวัติประกาศหรือจัดการรูปแล้ว จึงลบถาวรไม่ได้ ให้เปลี่ยนสถานะเป็น “ปิดใช้งาน” แทน'],
      ['USER_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้งานนี้ อาจถูกลบไปแล้ว'],
      ['ACTIVE_USER_REQUIRED', 'บัญชีต้องอยู่สถานะใช้งานก่อนจึงจะทำรายการนี้ได้'],
      ['TRANSFER_REASON_REQUIRED', 'กรุณาระบุเหตุผลการย้ายโรงพยาบาลอย่างน้อย 2 ตัวอักษร'],
      ['TRANSFER_DATE_IN_PAST', 'วันที่คาดว่าจะเริ่มงานต้องเป็นวันนี้หรือวันถัดไป'],
      ['TRANSFER_SAME_HOSPITAL', 'โรงพยาบาลใหม่ต้องไม่ใช่โรงพยาบาลปัจจุบัน'],
      ['TRANSFER_REQUEST_ALREADY_PENDING', 'บัญชีนี้มีคำขอย้ายโรงพยาบาลที่กำลังรอตรวจสอบอยู่แล้ว'],
      ['TRANSFER_REQUEST_NOT_FOUND', 'ไม่พบคำขอย้ายโรงพยาบาลนี้ หรือสถานะถูกเปลี่ยนแล้ว'],
      ['TRANSFER_REQUEST_NOT_PENDING', 'คำขอนี้ไม่ได้อยู่ระหว่างรอตรวจสอบแล้ว'],
      ['OLD_HOSPITAL_VERIFICATION_REQUIRED', 'กรุณากรอกชื่อผู้ให้ข้อมูล วันที่โทร ผลการตรวจสอบ และยืนยันการตรวจสอบโรงพยาบาลเดิม'],
      ['NEW_HOSPITAL_VERIFICATION_REQUIRED', 'กรุณากรอกชื่อผู้ให้ข้อมูล วันที่โทร ผลการตรวจสอบ และยืนยันการตรวจสอบโรงพยาบาลใหม่'],
      ['OUTSTANDING_ITEMS_CHECK_REQUIRED', 'กรุณายืนยันว่าไม่มีรายการในระบบที่ยังต้องรับผิดชอบ'],
      ['TRANSFER_HAS_OPEN_ITEMS', 'ยังมีประกาศสถานะเปิดหรือกำลังประสานงานที่โรงพยาบาลเดิม ต้องปิดหรือส่งมอบรายการก่อน'],
      ['TRANSFER_SOURCE_HOSPITAL_CHANGED', 'โรงพยาบาลปัจจุบันของผู้ใช้เปลี่ยนจากตอนยื่นคำขอ กรุณาตรวจสอบและให้ยื่นคำขอใหม่'],
      ['TRANSFER_REJECTION_NOTE_REQUIRED', 'กรุณาระบุเหตุผลที่ไม่อนุมัติอย่างน้อย 3 ตัวอักษร'],
      ['bent_hospital_transfer_requests', 'Supabase ยังไม่มีระบบย้ายโรงพยาบาล ให้ Run ไฟล์ supabase/09_hospital_transfer_workflow.sql ก่อน'],
      ['bent_update_own_profile', 'Supabase ยังไม่มีระบบข้อมูลบัญชีรุ่น v1.5.0 ให้ Run ไฟล์ supabase/09_hospital_transfer_workflow.sql ก่อน'],
      ['bent_submit_hospital_transfer_request', 'Supabase ยังไม่มีฟังก์ชันส่งคำขอย้ายโรงพยาบาล ให้ Run ไฟล์ supabase/09_hospital_transfer_workflow.sql ก่อน'],
      ['bent_cancel_hospital_transfer_request', 'Supabase ยังไม่มีฟังก์ชันยกเลิกคำขอย้ายโรงพยาบาล ให้ Run ไฟล์ supabase/09_hospital_transfer_workflow.sql ก่อน'],
      ['bent_admin_update_hospital_transfer', 'Supabase ยังไม่มีฟังก์ชันตรวจคำขอย้ายโรงพยาบาล ให้ Run ไฟล์ supabase/09_hospital_transfer_workflow.sql ก่อน'],
      ['bent_admin_approve_hospital_transfer', 'Supabase ยังไม่มีฟังก์ชันอนุมัติการย้ายโรงพยาบาล ให้ Run ไฟล์ supabase/09_hospital_transfer_workflow.sql ก่อน'],
      ['bent_admin_reject_hospital_transfer', 'Supabase ยังไม่มีฟังก์ชันไม่อนุมัติการย้ายโรงพยาบาล ให้ Run ไฟล์ supabase/09_hospital_transfer_workflow.sql ก่อน'],
      ['MEMBER_REPORT_SELF_NOT_ALLOWED', 'ไม่สามารถแจ้งบัญชีของตนเองจากเมนูสมาชิกโรงพยาบาลได้'],
      ['MEMBER_REPORT_REASON_REQUIRED', 'กรุณาเลือกสาเหตุที่ต้องการแจ้ง'],
      ['MEMBER_REPORT_DETAIL_REQUIRED', 'กรุณาระบุรายละเอียดอย่างน้อย 3 ตัวอักษร'],
      ['MEMBER_REPORT_DATE_IN_FUTURE', 'วันที่ปฏิบัติงานวันสุดท้ายต้องไม่เป็นวันที่ในอนาคต'],
      ['MEMBER_NOT_ACTIVE', 'บัญชีนี้ไม่ได้อยู่สถานะใช้งานแล้ว กรุณารีเฟรชรายชื่อ'],
      ['MEMBER_NOT_SAME_HOSPITAL', 'บัญชีนี้ไม่ได้อยู่โรงพยาบาลเดียวกับผู้แจ้งแล้ว'],
      ['MEMBER_HOSPITAL_CHANGED', 'ผู้ใช้งานเปลี่ยนโรงพยาบาลจากตอนที่มีการแจ้ง กรุณาตรวจสอบใหม่'],
      ['MEMBER_REPORT_ALREADY_PENDING', 'มีคำแจ้งของบัญชีนี้ที่กำลังรอตรวจสอบอยู่แล้ว'],
      ['MEMBER_REPORT_NOT_FOUND', 'ไม่พบคำแจ้งนี้ หรือสถานะถูกเปลี่ยนแล้ว'],
      ['MEMBER_REPORT_NOT_PENDING', 'คำแจ้งนี้ไม่ได้อยู่ระหว่างรอตรวจสอบแล้ว'],
      ['MEMBER_REPORT_VERIFICATION_REQUIRED', 'กรุณายืนยันการโทรตรวจสอบ พร้อมกรอกชื่อผู้ให้ข้อมูล วันเวลา และผลการตรวจสอบ'],
      ['MEMBER_REPORT_OPEN_ITEMS_CHECK_REQUIRED', 'กรุณายืนยันว่าไม่มีประกาศค้างของบัญชีนี้'],
      ['MEMBER_REPORT_HAS_OPEN_ITEMS', 'บัญชีนี้ยังมีประกาศสถานะเปิดหรือกำลังประสานงาน ต้องจัดการรายการเหล่านั้นก่อนปิดบัญชี'],
      ['MEMBER_REPORT_DISMISS_NOTE_REQUIRED', 'กรุณาระบุเหตุผลที่ไม่ดำเนินการอย่างน้อย 3 ตัวอักษร'],
      ['SUPPORT_CATEGORY_REQUIRED', 'กรุณาเลือกประเภทข้อความ'],
      ['SUPPORT_SUBJECT_REQUIRED', 'กรุณาระบุหัวข้ออย่างน้อย 4 ตัวอักษร'],
      ['SUPPORT_MESSAGE_REQUIRED', 'กรุณาพิมพ์ข้อความอย่างน้อย 2 ตัวอักษร และไม่เกิน 2,000 ตัวอักษร'],
      ['SUPPORT_THREAD_NOT_FOUND', 'ไม่พบหัวข้อสนทนานี้ หรือบัญชีไม่มีสิทธิ์เปิดดู'],
      ['SUPPORT_STATUS_INVALID', 'สถานะหัวข้อสนทนาไม่ถูกต้อง'],
      ['bent_member_departure_reports', 'Supabase ยังไม่มีระบบแจ้งผู้พ้นสภาพ ให้ Run ไฟล์ supabase/10_member_departure_and_support.sql ก่อน'],
      ['bent_list_same_hospital_members', 'Supabase ยังไม่มีระบบสมาชิกโรงพยาบาล ให้ Run ไฟล์ supabase/10_member_departure_and_support.sql ก่อน'],
      ['bent_list_my_member_departure_reports', 'Supabase ยังไม่มีระบบประวัติคำแจ้งผู้พ้นสภาพ ให้ Run ไฟล์ supabase/10_member_departure_and_support.sql ก่อน'],
      ['bent_submit_member_departure_report', 'Supabase ยังไม่มีฟังก์ชันแจ้งผู้พ้นสภาพ ให้ Run ไฟล์ supabase/10_member_departure_and_support.sql ก่อน'],
      ['bent_support_threads', 'Supabase ยังไม่มีระบบติดต่อผู้ดูแล ให้ Run ไฟล์ supabase/10_member_departure_and_support.sql ก่อน'],
      ['bent_support_messages', 'Supabase ยังไม่มีตารางข้อความสนทนา ให้ Run ไฟล์ supabase/10_member_departure_and_support.sql ก่อน'],
      ['bent_create_support_thread', 'Supabase ยังไม่มีฟังก์ชันส่งข้อความถึงผู้ดูแล ให้ Run ไฟล์ supabase/10_member_departure_and_support.sql ก่อน'],
      ['NOT_ALLOWED', 'บัญชีนี้ไม่มีสิทธิ์ทำรายการดังกล่าว'],
      ['ANNOUNCEMENT_LOCKED', 'รายการนี้ปิดแล้ว จึงแก้ไขไม่ได้'],
      ['ANNOUNCEMENT_NOT_FOUND', 'ไม่พบประกาศนี้ อาจถูกลบหรือเปลี่ยนแปลงไปแล้ว'],
      ['INVALID_DATE_RANGE', 'ช่วงวันที่ไม่ถูกต้อง วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด'],
      ['bent_admin_delete_announcement', 'Supabase ยังไม่มีฟังก์ชันรุ่น v1.4.0 ให้ Run ไฟล์ supabase/08_admin_usability_and_delete_announcement.sql'],
      ['bent_get_pilot_stats_filtered', 'Supabase ยังไม่มีฟังก์ชันสถิติรุ่น v1.4.0 ให้ Run ไฟล์ supabase/08_admin_usability_and_delete_announcement.sql'],
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
