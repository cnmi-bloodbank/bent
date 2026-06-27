/**
 * BENT Secure Gateway
 * Google Apps Script Web App
 *
 * Required Script Properties:
 * - BENT_SUPABASE_URL
 * - BENT_SUPABASE_PUBLISHABLE_KEY
 * - BENT_SUPABASE_SERVICE_ROLE_KEY
 * - BENT_DRIVE_FOLDER_ID
 * - BENT_APP_URL (GitHub Pages / custom-domain app URL)
 * - BENT_CHAT_SERVICE_ACCOUNT_JSON (JSON key ของ Service Account สำหรับ Google Chat App)
 * - BENT_GOOGLE_CHAT_SPACE_NAME (ระบบบันทึกให้อัตโนมัติเมื่อเพิ่ม Chat App เข้าห้อง)
 * - BENT_GOOGLE_CHAT_WEBHOOK_URL (ไม่บังคับ: ใช้เป็นการ์ดสำรองแบบกดอนุมัติไม่ได้)
 * - BENT_TEST_EMAIL (ไม่บังคับ: อีเมลสำหรับฟังก์ชันทดสอบการส่งเมล)
 *
 * This gateway handles private images, account requests, admin approval,
 * MailApp delivery, interactive Google Chat approval cards, and permanent-until-used password setup links.
 */

const BENT_MAX_IMAGE_BYTES = 1024 * 1024;
const BENT_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const BENT_THAI_PROVINCES = [
  'กรุงเทพมหานคร','สมุทรปราการ','นนทบุรี','ปทุมธานี','พระนครศรีอยุธยา','อ่างทอง','ลพบุรี','สิงห์บุรี','ชัยนาท','สระบุรี',
  'ชลบุรี','ระยอง','จันทบุรี','ตราด','ฉะเชิงเทรา','ปราจีนบุรี','นครนายก','สระแก้ว','นครราชสีมา','บุรีรัมย์','สุรินทร์',
  'ศรีสะเกษ','อุบลราชธานี','ยโสธร','ชัยภูมิ','อำนาจเจริญ','บึงกาฬ','หนองบัวลำภู','ขอนแก่น','อุดรธานี','เลย','หนองคาย',
  'มหาสารคาม','ร้อยเอ็ด','กาฬสินธุ์','สกลนคร','นครพนม','มุกดาหาร','เชียงใหม่','ลำพูน','ลำปาง','อุตรดิตถ์','แพร่','น่าน',
  'พะเยา','เชียงราย','แม่ฮ่องสอน','นครสวรรค์','อุทัยธานี','กำแพงเพชร','ตาก','สุโขทัย','พิษณุโลก','พิจิตร','เพชรบูรณ์',
  'ราชบุรี','กาญจนบุรี','สุพรรณบุรี','นครปฐม','สมุทรสาคร','สมุทรสงคราม','เพชรบุรี','ประจวบคีรีขันธ์','นครศรีธรรมราช',
  'กระบี่','พังงา','ภูเก็ต','สุราษฎร์ธานี','ระนอง','ชุมพร','สงขลา','สตูล','ตรัง','พัทลุง','ปัตตานี','ยะลา','นราธิวาส'
];

function doGet() {
  return bentJson_({ ok: true, service: 'BENT secure gateway', version: '1.5.1' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(payload.action || '').toLowerCase();

    if (action === 'upload') return bentJson_(bentUpload_(payload));
    if (action === 'read') return bentJson_(bentRead_(payload));
    if (action === 'delete') return bentJson_(bentDelete_(payload));
    if (action === 'get_registration_options') return bentJson_(bentGetRegistrationOptions_(payload));
    if (action === 'submit_account_request') return bentJson_(bentSubmitAccountRequest_(payload));
    if (action === 'approve_account_request') return bentJson_(bentApproveAccountRequest_(payload));
    if (action === 'reject_account_request') return bentJson_(bentRejectAccountRequest_(payload));
    if (action === 'admin_send_password_link') return bentJson_(bentAdminSendPasswordLink_(payload));
    if (action === 'admin_delete_user') return bentJson_(bentAdminDeleteUser_(payload));
    if (action === 'request_password_reset') return bentJson_(bentRequestPasswordReset_(payload));
    if (action === 'check_setup_token') return bentJson_(bentCheckSetupToken_(payload));
    if (action === 'set_password') return bentJson_(bentSetPassword_(payload));
    if (action === 'health') return bentJson_({ ok: true, service: 'BENT secure gateway', version: '1.5.1' });

    throw new Error('UNKNOWN_ACTION');
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return bentJson_({ ok: false, error: bentSafeError_(error) });
  }
}

function bentGetRegistrationOptions_(payload) {
  bentPublicRateLimit_('registration-options-global', 1200, 600);
  const province = bentProvince_(payload && payload.province);
  const hospitals = bentServiceRest_('GET', '/rest/v1/bent_hospitals', null, {
    province: `eq.${province}`,
    is_active: 'eq.true',
    select: 'id,name,province,phone,is_active',
    order: 'name.asc',
    limit: '1000'
  }) || [];
  return { ok: true, province: province, hospitals: hospitals };
}

function bentSubmitAccountRequest_(payload) {
  // Honeypot: bots often fill hidden fields. Return the same generic success response.
  if (String(payload.website || '').trim()) return { ok: true, accepted: true };

  const email = bentNormalizeEmail_(payload.email);
  const fullName = bentRequiredText_(payload.full_name, 2, 120, 'INVALID_FULL_NAME');
  const phone = bentRequiredText_(payload.phone, 3, 30, 'INVALID_PHONE');
  const province = bentProvince_(payload.province);
  const selectionMode = ['existing', 'new'].includes(String(payload.hospital_selection_mode || ''))
    ? String(payload.hospital_selection_mode)
    : (() => { throw new Error('HOSPITAL_SELECTION_REQUIRED'); })();
  const positionTitle = bentOptionalText_(payload.position_title, 160);
  const proposedHospitalPhone = bentOptionalText_(payload.proposed_hospital_phone, 30);

  let requestedHospitalId = null;
  let hospitalName = '';
  if (selectionMode === 'existing') {
    requestedHospitalId = bentUuid_(payload.requested_hospital_id, 'INVALID_HOSPITAL_ID');
    const hospitals = bentServiceRest_('GET', '/rest/v1/bent_hospitals', null, {
      id: `eq.${requestedHospitalId}`,
      province: `eq.${province}`,
      is_active: 'eq.true',
      select: 'id,name,province,phone,is_active',
      limit: '1'
    });
    if (!hospitals.length) throw new Error('HOSPITAL_NOT_ACTIVE');
    hospitalName = hospitals[0].name;
  } else {
    hospitalName = bentRequiredText_(payload.hospital_name, 2, 180, 'INVALID_HOSPITAL');
    if (!proposedHospitalPhone) throw new Error('HOSPITAL_PHONE_REQUIRED');
  }

  // Basic anti-spam controls for the public form. The database remains idempotent by email.
  bentPublicRateLimit_('account-global', 40, 600);
  bentPublicRateLimit_('account-' + bentCacheKey_(email), 3, 3600);

  // Do not reveal whether an account already exists.
  const profiles = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
    email: `eq.${email}`, select: 'id', limit: '1'
  });
  if (profiles.length) return { ok: true, accepted: true };

  const existing = bentServiceRest_('GET', '/rest/v1/bent_account_requests', null, {
    email: `eq.${email}`, select: '*', limit: '1'
  });
  const now = new Date().toISOString();
  const values = {
    email: email,
    full_name: fullName,
    phone: phone,
    hospital_name: hospitalName,
    province: province,
    hospital_selection_mode: selectionMode,
    requested_hospital_id: requestedHospitalId,
    proposed_hospital_phone: proposedHospitalPhone,
    approved_hospital_id: null,
    hospital_created_during_approval: false,
    position_title: positionTitle,
    status: 'pending',
    requested_at: now,
    reviewed_at: null,
    reviewed_by: null,
    admin_note: null,
    email_last_error: null
  };

  let requestKind = 'new';
  let requestId = null;
  if (existing.length) {
    // Pending/approved requests are idempotent. Rejected requests can be submitted again.
    if (existing[0].status === 'pending' || existing[0].status === 'approved') {
      return { ok: true, accepted: true };
    }
    requestKind = 'resubmitted';
    requestId = existing[0].id;
    bentServiceRest_('PATCH', '/rest/v1/bent_account_requests', values,
      { id: `eq.${requestId}` }, { Prefer: 'return=minimal' });
  } else {
    const created = bentServiceRest_('POST', '/rest/v1/bent_account_requests', values,
      null, { Prefer: 'return=representation' });
    requestId = created && created.length ? created[0].id : null;
  }
  if (!requestId) throw new Error('ACCOUNT_REQUEST_CREATE_FAILED');

  // การแจ้งเตือนล้มเหลวต้องไม่ทำให้คำขอสมัครหายหรือผู้สมัครต้องกดซ้ำ
  try {
    bentSendAccountRequestChat_(Object.assign({ id: requestId }, values), requestKind);
  } catch (chatError) {
    console.error('Google Chat notification failed: ' + bentSafeError_(chatError));
  }

  return { ok: true, accepted: true };
}

function bentSendAccountRequestChat_(request, requestKind) {
  const interactive = bentChatInteractiveConfigured_();
  const message = bentBuildAccountRequestChatMessage_(request, requestKind, interactive);

  if (interactive) {
    bentChatCreateMessage_(message);
    return { mode: 'interactive_chat_app' };
  }

  // ระหว่างยังตั้งค่า Chat App ไม่ครบ ให้ส่งเป็นการ์ดผ่าน Incoming Webhook แทน
  // การ์ดสำรองเปิดหน้า BENT ได้ แต่กดอนุมัติจาก Chat โดยตรงไม่ได้
  const webhookUrl = bentOptionalProperty_('BENT_GOOGLE_CHAT_WEBHOOK_URL').trim();
  if (!/^https:\/\/chat\.googleapis\.com\/v1\/spaces\//i.test(webhookUrl)) {
    throw new Error('GOOGLE_CHAT_APP_NOT_CONFIGURED');
  }
  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: JSON.stringify(message),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`GOOGLE_CHAT_${code}: ${response.getContentText().slice(0, 300)}`);
  }
  return { mode: 'webhook_card_fallback' };
}

function bentBuildAccountRequestChatMessage_(request, requestKind, interactive) {
  const appUrl = bentProperty_('BENT_APP_URL').trim();
  const kindText = requestKind === 'resubmitted' ? 'ส่งคำขอเปิดบัญชีอีกครั้ง' : 'คำขอเปิดบัญชีใหม่';
  const requestedText = Utilities.formatDate(
    new Date(request.requested_at),
    Session.getScriptTimeZone() || 'Asia/Bangkok',
    'dd/MM/yyyy HH:mm'
  );

  let hospitals = [];
  let matchedId = '';
  if (interactive) {
    const filters = {
      is_active: 'eq.true',
      select: 'id,name,province,phone,is_active',
      order: 'name.asc',
      limit: '500'
    };
    if (request.province) filters.province = `eq.${request.province}`;
    hospitals = bentServiceRest_('GET', '/rest/v1/bent_hospitals', null, filters) || [];
    matchedId = request.requested_hospital_id || bentMatchHospitalId_(request.hospital_name, hospitals);
  }

  const matched = hospitals.find(function(hospital) { return hospital.id === matchedId; });
  const hospitalStatus = matched
    ? `มีในระบบ: ${matched.name}`
    : 'ยังไม่มีในระบบ หรือยังไม่พบชื่อที่ตรงกัน';

  const widgets = [
    { decoratedText: { topLabel: 'ชื่อ–นามสกุล', text: bentChatText_(request.full_name) } },
    { decoratedText: { topLabel: 'โรงพยาบาลที่ผู้สมัครแจ้ง', text: bentChatText_(request.hospital_name) } },
    { decoratedText: { topLabel: 'จังหวัด', text: bentChatText_(request.province) } },
    { decoratedText: { topLabel: 'สถานะโรงพยาบาล', text: hospitalStatus } },
    { decoratedText: { topLabel: 'เบอร์โทรติดต่อผู้สมัคร/หน่วยงาน', text: bentChatText_(request.phone) } },
    { decoratedText: { topLabel: 'เบอร์โทรโรงพยาบาลที่เสนอ', text: bentChatText_(request.proposed_hospital_phone) } },
    { decoratedText: { topLabel: 'อีเมล', text: bentChatText_(request.email) } }
  ];
  if (request.position_title) {
    widgets.push({ decoratedText: { topLabel: 'ตำแหน่ง / หน่วยงาน', text: bentChatText_(request.position_title) } });
  }
  widgets.push({ decoratedText: { topLabel: 'เวลาส่งคำขอ', text: requestedText } });
  widgets.push({ divider: {} });

  if (interactive && hospitals.length) {
    widgets.push({
      selectionInput: {
        name: 'hospital_id',
        label: matched ? 'ใช้โรงพยาบาลที่มีอยู่' : 'เลือกโรงพยาบาลเดิม หากพบว่าเป็นแห่งเดียวกัน',
        type: 'DROPDOWN',
        items: hospitals.map(function(hospital) {
          return {
            text: hospital.name,
            value: hospital.id,
            selected: hospital.id === matchedId
          };
        })
      }
    });
    widgets.push({
      textInput: {
        name: 'admin_note',
        label: 'หมายเหตุผู้ดูแล (ไม่บังคับ)',
        type: 'SINGLE_LINE'
      }
    });
    widgets.push({
      decoratedText: {
        topLabel: matched ? 'ดำเนินการจาก Chat ได้' : 'กรณีเป็นโรงพยาบาลใหม่',
        text: matched ? 'ผูกกับโรงพยาบาลเดิมและอนุมัติบัญชี' : 'ให้เปิดหน้า BENT เพื่อตรวจชื่อใกล้เคียงและเพิ่ม Master อย่างปลอดภัย',
        bottomLabel: 'การแต่งตั้งผู้ดูแลระบบให้ทำจากหน้า BENT เพื่อป้องกันการกดผิด'
      }
    });
    widgets.push({
      buttonList: {
        buttons: [
          {
            text: 'ใช้โรงพยาบาลที่เลือกและอนุมัติ',
            onClick: {
              action: {
                function: 'bentChatApproveAccount',
                parameters: [{ key: 'request_id', value: request.id }],
                requiredWidgets: ['hospital_id'],
                loadIndicator: 'SPINNER'
              }
            }
          },
          {
            text: matched ? 'เปิดหน้าจัดการ BENT' : 'เพิ่มโรงพยาบาลและอนุมัติใน BENT',
            onClick: { openLink: { url: appUrl } }
          }
        ]
      }
    });
  } else {
    widgets.push({
      decoratedText: {
        topLabel: interactive ? 'โรงพยาบาลใหม่' : 'สถานะการตั้งค่า Google Chat',
        text: interactive ? 'ยังไม่มีโรงพยาบาลในจังหวัดนี้ให้เลือกจากการ์ด' : 'ส่งเป็นการ์ดสำรอง',
        bottomLabel: interactive ? 'เปิด BENT เพื่อเพิ่มโรงพยาบาลและอนุมัติบัญชีในปุ่มเดียว' : 'ตั้งค่า Google Chat App ให้ครบ จึงจะกดอนุมัติจากการ์ดได้'
      }
    });
    widgets.push({
      buttonList: {
        buttons: [{
          text: interactive ? 'เพิ่มโรงพยาบาลและอนุมัติใน BENT' : 'เปิดหน้าจัดการ BENT',
          onClick: { openLink: { url: appUrl } }
        }]
      }
    });
  }

  return {
    fallbackText: `BENT: ${kindText} - ${request.full_name} - ${request.hospital_name}`,
    cardsV2: [{
      cardId: bentChatCardId_(request.id),
      card: {
        header: {
          title: '🩸 คำขอเปิดบัญชี BENT',
          subtitle: kindText,
          imageUrl: 'https://exchange.cnmiblood.com/assets/icons/icon-192.png',
          imageType: 'CIRCLE',
          imageAltText: 'BENT'
        },
        sections: [{
          header: 'รอตรวจสอบและอนุมัติ',
          widgets: widgets
        }]
      }
    }]
  };
}

function bentBuildAccountApprovedChatMessage_(request, result, admin) {
  const appUrl = bentProperty_('BENT_APP_URL').trim();
  const emailStatus = result.email_sent
    ? 'ส่งลิงก์ตั้งรหัสผ่านทางอีเมลแล้ว'
    : 'สร้างบัญชีแล้ว แต่ส่งอีเมลไม่สำเร็จ กรุณาเปิด BENT แล้วกดส่งลิงก์ใหม่';
  return {
    fallbackText: `BENT: อนุมัติบัญชี ${request.full_name} แล้ว`,
    actionResponse: { type: 'UPDATE_MESSAGE' },
    cardsV2: [{
      cardId: bentChatCardId_(request.id),
      card: {
        header: {
          title: '✅ อนุมัติบัญชีแล้ว',
          subtitle: request.full_name,
          imageUrl: 'https://exchange.cnmiblood.com/assets/icons/icon-192.png',
          imageType: 'CIRCLE',
          imageAltText: 'BENT'
        },
        sections: [{
          widgets: [
            { decoratedText: { topLabel: 'อีเมล', text: bentChatText_(request.email) } },
            { decoratedText: { topLabel: 'โรงพยาบาลในระบบ', text: bentChatText_(result.hospital_name) } },
            { decoratedText: { topLabel: 'ผลการส่งอีเมล', text: emailStatus } },
            { decoratedText: { topLabel: 'อนุมัติโดย', text: bentChatText_(admin.full_name || admin.email) } },
            { buttonList: { buttons: [{
              text: 'เปิด BENT',
              onClick: { openLink: { url: appUrl } }
            }] } }
          ]
        }]
      }
    }]
  };
}

/** Google Chat interaction: เพิ่มแอปเข้าห้องแล้วบันทึกห้องนี้เป็นห้องแจ้งเตือน */
function onAddToSpace(event) {
  try {
    const admin = bentRequireChatSystemAdmin_(event);
    const spaceName = String(event && event.space && event.space.name || '').trim();
    if (!/^spaces\/[A-Za-z0-9_-]+$/.test(spaceName)) throw new Error('INVALID_CHAT_SPACE');
    PropertiesService.getScriptProperties().setProperty('BENT_GOOGLE_CHAT_SPACE_NAME', spaceName);
    return {
      cardsV2: [{
        cardId: 'bent-chat-ready',
        card: {
          header: { title: '✅ เชื่อม BENT กับ Google Chat แล้ว', subtitle: 'ห้องนี้จะได้รับการ์ดคำขอเปิดบัญชี' },
          sections: [{ widgets: [
            { decoratedText: { topLabel: 'ตั้งค่าโดย', text: bentChatText_(admin.full_name || admin.email) } },
            { textParagraph: { text: 'เมื่อมีผู้สมัครใหม่ ระบบจะแสดงข้อมูลเป็นการ์ด และผู้ดูแลระบบสามารถเลือกโรงพยาบาลแล้วกดอนุมัติได้จากการ์ดโดยตรง' } }
          ] }]
        }
      }]
    };
  } catch (error) {
    return bentChatPrivateMessage_(event, 'เพิ่ม BENT เข้าห้องไม่สำเร็จ: ' + bentChatFriendlyError_(error));
  }
}

function onRemoveFromSpace(event) {
  const current = bentOptionalProperty_('BENT_GOOGLE_CHAT_SPACE_NAME');
  const removed = String(event && event.space && event.space.name || '');
  if (current && current === removed) {
    PropertiesService.getScriptProperties().deleteProperty('BENT_GOOGLE_CHAT_SPACE_NAME');
  }
}

function onMessage(event) {
  return bentChatPrivateMessage_(event, 'BENT ใช้ห้องนี้สำหรับแจ้งคำขอเปิดบัญชี กรุณาดำเนินการจากปุ่มบนการ์ดแจ้งเตือน');
}

function onCardClick(event) {
  try {
    const invoked = String(
      event && event.common && event.common.invokedFunction ||
      event && event.action && event.action.actionMethodName || ''
    );
    if (invoked === 'bentChatApproveAccount') return bentChatApproveAccount_(event);
    return bentChatPrivateMessage_(event, 'ไม่พบคำสั่งที่ต้องการ กรุณาเปิด BENT เพื่อตรวจสอบรายการ');
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return bentChatPrivateMessage_(event, 'ดำเนินการไม่สำเร็จ: ' + bentChatFriendlyError_(error));
  }
}

function bentChatApproveAccount_(event) {
  const admin = bentRequireChatSystemAdmin_(event);
  const requestId = bentUuid_(bentChatParameter_(event, 'request_id'), 'INVALID_REQUEST_ID');
  const hospitalId = bentUuid_(bentChatFormValue_(event, 'hospital_id'), 'INVALID_HOSPITAL_ID');
  const adminNote = bentOptionalText_(bentChatFormValue_(event, 'admin_note'), 500);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('SYSTEM_BUSY_TRY_AGAIN');
  try {
    const requests = bentServiceRest_('GET', '/rest/v1/bent_account_requests', null, {
      id: `eq.${requestId}`, select: '*', limit: '1'
    });
    if (!requests.length) throw new Error('ACCOUNT_REQUEST_NOT_FOUND');
    const request = requests[0];
    if (request.status === 'approved') {
      let hospitalName = request.hospital_name;
      if (request.auth_user_id) {
        const profiles = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
          id: `eq.${request.auth_user_id}`, select: 'hospital_id', limit: '1'
        }) || [];
        if (profiles.length && profiles[0].hospital_id) {
          const hospitals = bentServiceRest_('GET', '/rest/v1/bent_hospitals', null, {
            id: `eq.${profiles[0].hospital_id}`, select: 'name', limit: '1'
          }) || [];
          if (hospitals.length) hospitalName = hospitals[0].name;
        }
      }
      return bentBuildAccountApprovedChatMessage_(request, {
        email_sent: Boolean(request.email_sent_at) && !request.email_last_error,
        hospital_name: hospitalName
      }, admin);
    }
    if (request.status !== 'pending') throw new Error('ACCOUNT_REQUEST_NOT_READY');

    const result = bentApproveAccountRequestCore_({
      request_id: requestId,
      resolution: 'existing',
      hospital_id: hospitalId,
      province: request.province,
      role: 'user',
      full_name: request.full_name,
      phone: request.phone,
      admin_note: adminNote
    }, admin.id);
    return bentBuildAccountApprovedChatMessage_(request, result, admin);
  } finally {
    lock.releaseLock();
  }
}

function bentRequireChatSystemAdmin_(event) {
  const email = bentNormalizeEmail_(event && event.user && event.user.email);
  const profiles = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
    email: `eq.${email}`,
    status: 'eq.active',
    role: 'eq.system_admin',
    select: 'id,email,full_name,status,role',
    limit: '1'
  });
  if (!profiles.length) throw new Error('SYSTEM_ADMIN_REQUIRED');
  return profiles[0];
}

function bentChatInteractiveConfigured_() {
  const spaceName = bentOptionalProperty_('BENT_GOOGLE_CHAT_SPACE_NAME').trim();
  const credentials = bentOptionalProperty_('BENT_CHAT_SERVICE_ACCOUNT_JSON').trim();
  return /^spaces\/[A-Za-z0-9_-]+$/.test(spaceName) && Boolean(credentials);
}

function bentChatCreateMessage_(message) {
  const spaceName = bentOptionalProperty_('BENT_GOOGLE_CHAT_SPACE_NAME').trim();
  if (!/^spaces\/[A-Za-z0-9_-]+$/.test(spaceName)) throw new Error('INVALID_CHAT_SPACE');
  const token = bentChatAccessToken_();
  const response = UrlFetchApp.fetch(`https://chat.googleapis.com/v1/${spaceName}/messages`, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify(message),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error(`GOOGLE_CHAT_APP_${code}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

function bentChatAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('bent-chat-app-access-token');
  if (cached) return cached;

  let credentials;
  try {
    credentials = JSON.parse(bentProperty_('BENT_CHAT_SERVICE_ACCOUNT_JSON'));
  } catch (_) {
    throw new Error('INVALID_BENT_CHAT_SERVICE_ACCOUNT_JSON');
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('INVALID_BENT_CHAT_SERVICE_ACCOUNT_JSON');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = bentBase64UrlText_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = bentBase64UrlText_(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/chat.bot',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const privateKey = String(credentials.private_key).replace(/\\n/g, '\n');
  const signature = Utilities.computeRsaSha256Signature(unsigned, privateKey);
  const assertion = `${unsigned}.${Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '')}`;

  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion
    },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error(`GOOGLE_CHAT_TOKEN_${code}: ${text.slice(0, 500)}`);
  const tokenData = JSON.parse(text);
  if (!tokenData.access_token) throw new Error('GOOGLE_CHAT_TOKEN_MISSING');
  cache.put('bent-chat-app-access-token', tokenData.access_token, Math.max(60, Number(tokenData.expires_in || 3600) - 120));
  return tokenData.access_token;
}

function bentBase64UrlText_(text) {
  return Utilities.base64EncodeWebSafe(String(text), Utilities.Charset.UTF_8).replace(/=+$/, '');
}

function bentChatParameter_(event, key) {
  if (event && event.common && event.common.parameters && event.common.parameters[key] !== undefined) {
    return String(event.common.parameters[key]);
  }
  const params = event && event.action && event.action.parameters || [];
  const found = params.find(function(item) { return item.key === key; });
  return found ? String(found.value || '') : '';
}

function bentChatFormValue_(event, name) {
  const inputs = event && event.common && event.common.formInputs || {};
  const field = inputs[name];
  if (!field) return '';
  const actual = field[''] || field;
  if (actual.stringInputs && actual.stringInputs.value && actual.stringInputs.value.length) {
    return String(actual.stringInputs.value[0]);
  }
  return '';
}

function bentMatchHospitalId_(requestedName, hospitals) {
  const target = bentNormalizeHospitalName_(requestedName);
  if (!target) return '';
  const exact = hospitals.filter(function(hospital) {
    return bentNormalizeHospitalName_(hospital.name) === target;
  });
  return exact.length === 1 ? exact[0].id : '';
}

function bentNormalizeHospitalName_(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/^(โรงพยาบาล|ร\.?\s*พ\.?)\s*/i, '')
    .replace(/[\s\u00a0().,\-_/\\]+/g, '');
}

function bentLevenshteinDistance_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = [];
  for (let index = 0; index <= b.length; index += 1) row[index] = index;
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = saved;
    }
  }
  return row[b.length];
}

function bentHospitalSimilarity_(left, right) {
  const a = bentNormalizeHospitalName_(left);
  const b = bentNormalizeHospitalName_(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  const editScore = longest ? 1 - (bentLevenshteinDistance_(a, b) / longest) : 0;
  const containsScore = Math.min(a.length, b.length) >= 6 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)
    ? Math.min(a.length, b.length) / longest
    : 0;
  return Math.max(editScore, containsScore);
}

function bentFindSimilarHospitals_(requestedName, hospitals, threshold) {
  return (hospitals || [])
    .map(function(hospital) {
      return { hospital: hospital, score: bentHospitalSimilarity_(requestedName, hospital.name) };
    })
    .filter(function(item) { return item.score >= Number(threshold || 0.68); })
    .sort(function(left, right) { return right.score - left.score; });
}

function bentChatCardId_(requestId) {
  return 'bent-account-' + String(requestId || 'request').replace(/[^A-Za-z0-9_-]/g, '');
}

function bentChatText_(value) {
  const text = String(value === null || value === undefined ? '-' : value).trim();
  return text || '-';
}

function bentChatPrivateMessage_(event, text) {
  const response = { text: text };
  if (event && event.user) response.privateMessageViewer = event.user;
  const eventType = String(event && event.type || '');
  const invokedFunction = String(event && event.common && event.common.invokedFunction || '');
  if (eventType === 'CARD_CLICKED' || invokedFunction) {
    response.actionResponse = { type: 'NEW_MESSAGE' };
  }
  return response;
}

function bentChatFriendlyError_(error) {
  const code = String(error && error.message ? error.message : error || 'UNKNOWN_ERROR');
  const map = {
    SYSTEM_ADMIN_REQUIRED: 'บัญชี Google Chat นี้ไม่ได้เป็นผู้ดูแลระบบ BENT',
    ACCOUNT_REQUEST_NOT_FOUND: 'ไม่พบคำขอเปิดบัญชีนี้',
    ACCOUNT_REQUEST_ALREADY_APPROVED: 'คำขอนี้ได้รับอนุมัติแล้ว',
    ACCOUNT_REQUEST_CANCELLED: 'คำขอนี้ถูกยกเลิกแล้ว',
    ACCOUNT_REQUEST_NOT_READY: 'คำขอนี้ยังไม่พร้อมให้อนุมัติ',
    EMAIL_ALREADY_HAS_ACCOUNT: 'อีเมลนี้มีบัญชีที่เปิดใช้งานแล้ว',
    HOSPITAL_NOT_ACTIVE: 'โรงพยาบาลที่เลือกยังไม่เปิดใช้งานหรือไม่ได้อยู่ในจังหวัดที่ผู้สมัครเลือก',
    HOSPITAL_ALREADY_EXISTS_USE_EXISTING: 'พบโรงพยาบาลนี้อยู่แล้ว กรุณาเลือกโรงพยาบาลที่มีอยู่',
    HOSPITAL_EXISTS_INACTIVE: 'พบชื่อโรงพยาบาลนี้แต่ถูกปิดใช้งาน กรุณาเปิดใช้งานจากหน้า BENT ก่อน',
    INVALID_PROVINCE: 'จังหวัดในคำขอไม่ถูกต้อง กรุณาเปิดหน้า BENT เพื่อตรวจสอบ',
    INVALID_HOSPITAL_ID: 'กรุณาเลือกโรงพยาบาลจากรายการบนการ์ด',
    SYSTEM_BUSY_TRY_AGAIN: 'ระบบกำลังประมวลผล กรุณาลองอีกครั้ง'
  };
  return map[code] || code.replace(/^[A-Z0-9_]+:\s*/, '').slice(0, 220);
}

function bentApproveAccountRequest_(payload) {
  const admin = bentRequireSystemAdmin_(payload.access_token);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('SYSTEM_BUSY_TRY_AGAIN');
  try {
    return bentApproveAccountRequestCore_(payload, admin.user.id);
  } finally {
    lock.releaseLock();
  }
}

function bentApproveAccountRequestCore_(payload, adminUserId) {
  const requestId = bentUuid_(payload.request_id, 'INVALID_REQUEST_ID');
  const role = ['user', 'system_admin'].includes(String(payload.role || 'user')) ? String(payload.role || 'user') : 'user';
  const fullName = bentRequiredText_(payload.full_name, 2, 120, 'INVALID_FULL_NAME');
  const phone = bentRequiredText_(payload.phone, 3, 30, 'INVALID_PHONE');
  const adminNote = bentOptionalText_(payload.admin_note, 500);

  const requests = bentServiceRest_('GET', '/rest/v1/bent_account_requests', null, {
    id: `eq.${requestId}`, select: '*', limit: '1'
  });
  if (!requests.length) throw new Error('ACCOUNT_REQUEST_NOT_FOUND');
  const request = requests[0];
  if (request.status === 'approved') throw new Error('ACCOUNT_REQUEST_ALREADY_APPROVED');
  if (request.status === 'cancelled') throw new Error('ACCOUNT_REQUEST_CANCELLED');
  if (!['pending', 'rejected'].includes(request.status)) throw new Error('ACCOUNT_REQUEST_NOT_READY');

  const province = bentProvince_(payload.province || request.province);
  const resolution = String(payload.resolution || (payload.hospital_id ? 'existing' : '')).toLowerCase();
  if (!['existing', 'new'].includes(resolution)) throw new Error('HOSPITAL_RESOLUTION_REQUIRED');

  let hospital = null;
  let hospitalCreated = false;
  let hospitalPhoneUpdated = false;

  if (resolution === 'existing') {
    const hospitalId = bentUuid_(payload.hospital_id, 'INVALID_HOSPITAL_ID');
    const hospitals = bentServiceRest_('GET', '/rest/v1/bent_hospitals', null, {
      id: `eq.${hospitalId}`,
      province: `eq.${province}`,
      is_active: 'eq.true',
      select: 'id,name,province,phone,is_active',
      limit: '1'
    });
    if (!hospitals.length) throw new Error('HOSPITAL_NOT_ACTIVE');
    hospital = hospitals[0];

    const proposedPhone = bentOptionalText_(request.proposed_hospital_phone, 30);
    if (!hospital.phone && proposedPhone) {
      const updated = bentServiceRest_('PATCH', '/rest/v1/bent_hospitals', {
        phone: proposedPhone
      }, { id: `eq.${hospital.id}`, phone: 'is.null' }, { Prefer: 'return=representation' }) || [];
      if (updated.length) {
        hospital = updated[0];
        hospitalPhoneUpdated = true;
      }
    }
  } else {
    if (payload.confirm_new_hospital !== true) throw new Error('CONFIRM_NEW_HOSPITAL_REQUIRED');
    const newHospitalName = bentRequiredText_(payload.new_hospital_name || request.hospital_name, 2, 180, 'INVALID_HOSPITAL');
    const newHospitalPhone = bentOptionalText_(payload.new_hospital_phone || request.proposed_hospital_phone, 30);
    const existingHospitals = bentServiceRest_('GET', '/rest/v1/bent_hospitals', null, {
      province: `eq.${province}`,
      select: 'id,name,province,phone,is_active',
      order: 'name.asc',
      limit: '1000'
    }) || [];

    const exact = existingHospitals.find(function(item) {
      return bentNormalizeHospitalName_(item.name) === bentNormalizeHospitalName_(newHospitalName);
    });
    if (exact) {
      if (exact.is_active) throw new Error(`HOSPITAL_ALREADY_EXISTS_USE_EXISTING:${exact.id}`);
      throw new Error(`HOSPITAL_EXISTS_INACTIVE:${exact.id}`);
    }

    const similar = bentFindSimilarHospitals_(newHospitalName, existingHospitals, 0.68);
    if (similar.length && payload.confirm_new_hospital !== true) {
      throw new Error('SIMILAR_HOSPITAL_FOUND');
    }

    try {
      const createdHospitals = bentServiceRest_('POST', '/rest/v1/bent_hospitals', {
        name: newHospitalName,
        province: province,
        phone: newHospitalPhone,
        is_active: true
      }, null, { Prefer: 'return=representation' }) || [];
      if (!createdHospitals.length) throw new Error('HOSPITAL_CREATE_FAILED');
      hospital = createdHospitals[0];
      hospitalCreated = true;
    } catch (error) {
      const text = String(error && error.message || error);
      if (text.includes('23505') || text.includes('bent_hospitals_province_normalized_unique')) {
        throw new Error('HOSPITAL_ALREADY_EXISTS_USE_EXISTING');
      }
      throw error;
    }
  }

  if (!hospital || !hospital.id) throw new Error('HOSPITAL_RESOLUTION_FAILED');

  const email = bentNormalizeEmail_(request.email);
  const existingProfiles = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
    email: `eq.${email}`, select: 'id,status,hospital_id', limit: '1'
  });

  let userId;
  if (existingProfiles.length) {
    if (existingProfiles[0].status === 'active' && request.auth_user_id && request.auth_user_id !== existingProfiles[0].id) {
      throw new Error('EMAIL_ALREADY_HAS_ACCOUNT');
    }
    userId = existingProfiles[0].id;
  } else {
    const existingUsers = bentServiceRpc_('bent_find_auth_user_by_email', { p_email: email });
    if (existingUsers.length) {
      userId = existingUsers[0].user_id;
    } else {
      const created = bentAuthAdminRequest_('POST', '/auth/v1/admin/users', {
        email: email,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone: phone,
          hospital_name: hospital.name,
          position_title: request.position_title || null
        }
      });
      const user = created.user || created;
      userId = user.id;
    }
  }
  if (!userId) throw new Error('AUTH_USER_CREATE_FAILED');

  bentServiceRest_('POST', '/rest/v1/bent_profiles', {
    id: userId,
    email: email,
    full_name: fullName,
    phone: phone,
    hospital_id: hospital.id,
    hospital_name_requested: request.hospital_name,
    status: 'active',
    role: role,
    approved_by: adminUserId,
    approved_at: new Date().toISOString(),
    must_change_password: true,
    password_set_at: null
  }, { on_conflict: 'id' }, { Prefer: 'resolution=merge-duplicates,return=minimal' });

  bentServiceRest_('PATCH', '/rest/v1/bent_account_requests', {
    status: 'approved',
    auth_user_id: userId,
    approved_hospital_id: hospital.id,
    hospital_created_during_approval: hospitalCreated,
    province: province,
    reviewed_at: new Date().toISOString(),
    reviewed_by: adminUserId,
    admin_note: adminNote,
    email_last_error: null
  }, { id: `eq.${requestId}` }, { Prefer: 'return=minimal' });

  let delivery = { emailSent: false, emailError: null };
  try {
    delivery = bentIssueAndSendPasswordLink_({
      userId: userId,
      requestId: requestId,
      email: email,
      fullName: fullName,
      purpose: 'initial_password',
      createdBy: adminUserId
    });
  } catch (deliveryError) {
    // The account is already created and approved. Do not tell the admin that approval failed.
    // Store the delivery error and let the admin use “ส่งลิงก์ใหม่” after fixing the mail/SQL setup.
    delivery.emailError = bentNormalizeMailError_(deliveryError);
    try {
      bentServiceRest_('PATCH', '/rest/v1/bent_account_requests', {
        email_sent_at: null,
        email_last_error: delivery.emailError
      }, { id: `eq.${requestId}` }, { Prefer: 'return=minimal' });
    } catch (logError) {
      console.error('Could not save email delivery error: ' + bentSafeError_(logError));
    }
  }
  return {
    ok: true,
    user_id: userId,
    email_sent: delivery.emailSent,
    email_error: delivery.emailError || null,
    mail_quota_remaining: MailApp.getRemainingDailyQuota(),
    hospital_id: hospital.id,
    hospital_name: hospital.name,
    hospital_created: hospitalCreated,
    hospital_phone_updated: hospitalPhoneUpdated,
    full_name: fullName,
    email: email
  };
}

function bentRejectAccountRequest_(payload) {
  const admin = bentRequireSystemAdmin_(payload.access_token);
  const requestId = bentUuid_(payload.request_id, 'INVALID_REQUEST_ID');
  const adminNote = bentOptionalText_(payload.admin_note, 500);
  const updated = bentServiceRest_('PATCH', '/rest/v1/bent_account_requests', {
    status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: admin.user.id, admin_note: adminNote
  }, { id: `eq.${requestId}`, status: 'eq.pending' }, { Prefer: 'return=representation' });
  if (!updated.length) throw new Error('ACCOUNT_REQUEST_NOT_FOUND');
  return { ok: true };
}

function bentAdminSendPasswordLink_(payload) {
  const admin = bentRequireSystemAdmin_(payload.access_token);
  let userId = String(payload.user_id || '').trim();
  let requestId = String(payload.request_id || '').trim() || null;
  let request = null;

  if (requestId) {
    requestId = bentUuid_(requestId, 'INVALID_REQUEST_ID');
    const rows = bentServiceRest_('GET', '/rest/v1/bent_account_requests', null, {
      id: `eq.${requestId}`, select: '*', limit: '1'
    });
    if (!rows.length || !rows[0].auth_user_id) throw new Error('APPROVED_ACCOUNT_REQUIRED');
    request = rows[0];
    userId = request.auth_user_id;
  }
  userId = bentUuid_(userId, 'INVALID_USER_ID');

  const profiles = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
    id: `eq.${userId}`, select: 'id,email,full_name,status,password_set_at', limit: '1'
  });
  if (!profiles.length || profiles[0].status !== 'active') throw new Error('ACTIVE_USER_REQUIRED');
  const profile = profiles[0];

  const delivery = bentIssueAndSendPasswordLink_({
    userId: userId,
    requestId: requestId,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    purpose: profile.password_set_at ? 'password_reset' : 'initial_password',
    createdBy: admin.user.id
  });
  return { ok: true, email_sent: delivery.emailSent, email_error: delivery.emailError || null };
}

function bentAdminDeleteUser_(payload) {
  const admin = bentRequireSystemAdmin_(payload.access_token);
  const userId = bentUuid_(payload.user_id, 'INVALID_USER_ID');
  if (userId === admin.user.id) throw new Error('CANNOT_DELETE_OWN_ACCOUNT');

  const profiles = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
    id: `eq.${userId}`, select: 'id,email,full_name,status,role', limit: '1'
  });
  if (!profiles.length) throw new Error('USER_NOT_FOUND');
  const profile = profiles[0];

  if (profile.status === 'active' && profile.role === 'system_admin') {
    const activeAdmins = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
      status: 'eq.active', role: 'eq.system_admin', select: 'id', limit: '2'
    });
    if (activeAdmins.length <= 1) throw new Error('LAST_ADMIN_CANNOT_BE_REMOVED');
  }

  // Auth users referenced by operational history must be retained for auditability.
  const created = bentServiceRest_('GET', '/rest/v1/bent_announcements', null, {
    created_by: `eq.${userId}`, select: 'id', limit: '1'
  });
  const closed = bentServiceRest_('GET', '/rest/v1/bent_announcements', null, {
    closed_by: `eq.${userId}`, select: 'id', limit: '1'
  });
  const uploaded = bentServiceRest_('GET', '/rest/v1/bent_announcement_images', null, {
    uploaded_by: `eq.${userId}`, select: 'id', limit: '1'
  });
  if (created.length || closed.length || uploaded.length) {
    throw new Error('USER_HAS_ACTIVITY_DEACTIVATE_ONLY');
  }

  bentAuthAdminRequest_('DELETE', `/auth/v1/admin/users/${encodeURIComponent(userId)}`, null);

  // Remove the old request so the same email can submit a fresh request later.
  try {
    bentServiceRest_('DELETE', '/rest/v1/bent_account_requests', null,
      { email: `eq.${bentNormalizeEmail_(profile.email)}` }, { Prefer: 'return=minimal' });
  } catch (requestDeleteError) {
    console.error('Auth user deleted but account request cleanup failed: ' + bentSafeError_(requestDeleteError));
    // Fallback: mark the request cancelled so the same email can submit a new request later.
    try {
      bentServiceRest_('PATCH', '/rest/v1/bent_account_requests', {
        status: 'cancelled',
        auth_user_id: null,
        email_sent_at: null,
        email_last_error: null,
        admin_note: 'บัญชีถูกลบโดยผู้ดูแลระบบ'
      }, { email: `eq.${bentNormalizeEmail_(profile.email)}` }, { Prefer: 'return=minimal' });
    } catch (requestFallbackError) {
      console.error('Account request fallback cleanup failed: ' + bentSafeError_(requestFallbackError));
    }
  }

  return { ok: true, deleted: true, email: profile.email };
}

function bentRequestPasswordReset_(payload) {
  const email = bentNormalizeEmail_(payload.email);
  const generic = { ok: true, accepted: true };
  const profiles = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
    email: `eq.${email}`, status: 'eq.active', select: 'id,email,full_name,status,password_set_at', limit: '1'
  });
  if (!profiles.length) return generic;
  const profile = profiles[0];

  // Anti-spam: at most one email per 10 minutes and five per rolling 24 hours per user.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = bentServiceRest_('GET', '/rest/v1/bent_password_setup_tokens', null, {
    user_id: `eq.${profile.id}`, created_at: `gte.${since24h}`, select: 'created_at', order: 'created_at.desc', limit: '5'
  });
  if (recent.length >= 5) return generic;
  if (recent.length && Date.now() - new Date(recent[0].created_at).getTime() < 10 * 60 * 1000) return generic;

  try {
    bentIssueAndSendPasswordLink_({
      userId: profile.id,
      requestId: null,
      email: profile.email,
      fullName: profile.full_name || profile.email,
      purpose: 'password_reset',
      createdBy: null
    });
  } catch (error) {
    console.error('Password reset delivery failed: ' + bentSafeError_(error));
  }
  return generic;
}

function bentCheckSetupToken_(payload) {
  const token = bentSetupToken_(payload.setup_token);
  const checked = bentServiceRpc_('bent_check_password_setup_token', { p_setup_token: token });
  if (!checked.length) throw new Error('SETUP_LINK_INVALID_OR_USED');
  const profiles = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
    id: `eq.${checked[0].user_id}`, status: 'eq.active', select: 'id,status', limit: '1'
  });
  if (!profiles.length) throw new Error('ACCOUNT_NOT_ACTIVE');
  return { ok: true, masked_email: bentMaskEmail_(checked[0].email), purpose: checked[0].purpose };
}

function bentSetPassword_(payload) {
  const token = bentSetupToken_(payload.setup_token);
  const password = String(payload.new_password || '');
  if (password.length < 10 || password.length > 128) throw new Error('PASSWORD_TOO_SHORT');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('SYSTEM_BUSY_TRY_AGAIN');
  try {
    const checked = bentServiceRpc_('bent_check_password_setup_token', { p_setup_token: token });
    if (!checked.length) throw new Error('SETUP_LINK_INVALID_OR_USED');
    const row = checked[0];
    const profiles = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
      id: `eq.${row.user_id}`, status: 'eq.active', select: 'id,status', limit: '1'
    });
    if (!profiles.length) throw new Error('ACCOUNT_NOT_ACTIVE');

    // Consume first so a network retry can never reuse the same permanent link.
    const consumed = bentServiceRpc_('bent_consume_password_setup_token', { p_setup_token: token });
    if (!consumed.length) throw new Error('SETUP_LINK_INVALID_OR_USED');

    try {
      bentAuthAdminRequest_('PUT', `/auth/v1/admin/users/${encodeURIComponent(row.user_id)}`, { password: password });
      bentServiceRest_('PATCH', '/rest/v1/bent_profiles', {
        must_change_password: false,
        password_set_at: new Date().toISOString()
      }, { id: `eq.${row.user_id}` }, { Prefer: 'return=minimal' });
      return { ok: true };
    } catch (updateError) {
      // The original token was consumed for safety. Send a fresh one automatically when possible.
      const replacement = bentIssueAndSendPasswordLink_({
        userId: row.user_id,
        requestId: null,
        email: row.email,
        fullName: row.email,
        purpose: row.purpose || 'password_reset',
        createdBy: null
      });
      if (replacement.emailSent) throw new Error('PASSWORD_UPDATE_FAILED_NEW_LINK_SENT');
      throw updateError;
    }
  } finally {
    lock.releaseLock();
  }
}

function bentNormalizeMailError_(error) {
  const raw = bentSafeError_(error);
  if (raw.indexOf('gen_random_bytes') >= 0 || raw.indexOf('digest(') >= 0 || raw.indexOf('bent_issue_password_setup_token') >= 0) {
    return 'PASSWORD_EMAIL_SQL_NOT_READY';
  }
  return raw;
}

function bentIssueAndSendPasswordLink_(args) {
  if (MailApp.getRemainingDailyQuota() < 1) {
    const quotaError = 'MAIL_DAILY_QUOTA_EXCEEDED';
    if (args.requestId) {
      bentServiceRest_('PATCH', '/rest/v1/bent_account_requests', {
        email_last_error: quotaError
      }, { id: `eq.${args.requestId}` }, { Prefer: 'return=minimal' });
    }
    return { emailSent: false, emailError: quotaError };
  }

  const issued = bentServiceRpc_('bent_issue_password_setup_token', {
    p_user_id: args.userId,
    p_request_id: args.requestId || null,
    p_email: bentNormalizeEmail_(args.email),
    p_purpose: args.purpose,
    p_created_by: args.createdBy || null
  });
  if (!issued.length || !issued[0].setup_token) throw new Error('SETUP_TOKEN_CREATE_FAILED');

  const link = bentBuildSetupLink_(issued[0].setup_token);
  let emailSent = false;
  let emailError = null;
  try {
    bentSendPasswordEmail_(args.email, args.fullName, link, args.purpose);
    emailSent = true;
  } catch (error) {
    emailError = bentNormalizeMailError_(error);
    // Do not keep an active link that the user never received. This also allows an immediate retry.
    try {
      bentServiceRest_('DELETE', '/rest/v1/bent_password_setup_tokens', null, {
        user_id: `eq.${args.userId}`,
        used_at: 'is.null',
        revoked_at: 'is.null'
      }, { Prefer: 'return=minimal' });
    } catch (cleanupError) {
      console.error('Could not remove undelivered password token: ' + bentSafeError_(cleanupError));
    }
  }

  if (args.requestId) {
    bentServiceRest_('PATCH', '/rest/v1/bent_account_requests', {
      email_sent_at: emailSent ? new Date().toISOString() : null,
      email_last_error: emailError,
      resend_count: bentIncrementRequestResend_(args.requestId)
    }, { id: `eq.${args.requestId}` }, { Prefer: 'return=minimal' });
  }
  return { emailSent: emailSent, emailError: emailError };
}

function bentIncrementRequestResend_(requestId) {
  const rows = bentServiceRest_('GET', '/rest/v1/bent_account_requests', null, {
    id: `eq.${requestId}`, select: 'resend_count', limit: '1'
  });
  return (rows.length ? Number(rows[0].resend_count || 0) : 0) + 1;
}

function bentSendPasswordEmail_(email, fullName, link, purpose) {
  const initial = purpose === 'initial_password';
  const subject = initial ? 'BENT: ตั้งรหัสผ่านเพื่อเริ่มใช้งาน' : 'BENT: ตั้งรหัสผ่านใหม่';
  const actionText = initial ? 'ตั้งรหัสผ่านและเปิดใช้งานบัญชี' : 'ตั้งรหัสผ่านใหม่';
  const safeName = bentHtml_(fullName || email);
  const safeLink = bentHtml_(link);
  const body = `เรียน ${fullName || email}\n\n${actionText}:\n${link}\n\nลิงก์นี้ไม่มีการหมดอายุตามเวลา ใช้ได้หนึ่งครั้ง และลิงก์เดิมจะถูกยกเลิกเมื่อมีการออกลิงก์ใหม่\n\nBlood Exchange Network Thailand (BENT)`;
  const htmlBody = `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#17324d;max-width:620px;margin:auto"><h2 style="color:#0b6aa8">Blood Exchange Network Thailand (BENT)</h2><p>เรียน ${safeName}</p><p>${actionText}</p><p style="margin:28px 0"><a href="${safeLink}" style="background:#0b6aa8;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold">${actionText}</a></p><div style="background:#fff2cf;padding:14px;border-radius:10px"><b>ลิงก์นี้ไม่มีการหมดอายุตามเวลา</b><br>ลิงก์ใช้ได้หนึ่งครั้ง และลิงก์เดิมจะถูกยกเลิกเมื่อมีการออกลิงก์ใหม่หรือผู้ดูแลเพิกถอน</div><p style="font-size:12px;color:#63788c;margin-top:24px">หากไม่ได้ขอเปิดบัญชีหรือรีเซ็ตรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบ BENT</p></div>`;
  MailApp.sendEmail({ to: email, subject: subject, body: body, htmlBody: htmlBody, name: 'BENT' });
}

function bentBuildSetupLink_(token) {
  const appUrl = bentProperty_('BENT_APP_URL').trim();
  if (!/^https:\/\//i.test(appUrl)) throw new Error('INVALID_BENT_APP_URL');
  const separator = appUrl.includes('?') ? '&' : '?';
  return appUrl + separator + 'setup=' + encodeURIComponent(token);
}

function bentRequireSystemAdmin_(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) throw new Error('ACCESS_TOKEN_REQUIRED');
  const user = bentAuthUser_(token);
  const profiles = bentRest_('GET', '/rest/v1/bent_profiles', token, null, {
    id: `eq.${user.id}`, select: 'id,status,role,hospital_id', limit: '1'
  });
  if (!profiles.length || profiles[0].status !== 'active' || profiles[0].role !== 'system_admin') {
    throw new Error('SYSTEM_ADMIN_REQUIRED');
  }
  return { token: token, user: user, profile: profiles[0] };
}

function bentServiceRpc_(name, body) {
  return bentServiceRest_('POST', '/rest/v1/rpc/' + name, body || {}, null, { Prefer: 'return=representation' }) || [];
}

function bentServiceRest_(method, path, body, query, extraHeaders) {
  const serviceKey = bentProperty_('BENT_SUPABASE_SERVICE_ROLE_KEY');
  const base = bentProperty_('BENT_SUPABASE_URL').replace(/\/$/, '');
  const qs = query ? '?' + Object.keys(query).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`).join('&') : '';
  const headers = Object.assign({
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  }, extraHeaders || {});
  const options = { method: method.toLowerCase(), headers: headers, muteHttpExceptions: true };
  if (body !== null && body !== undefined) options.payload = JSON.stringify(body);
  const response = UrlFetchApp.fetch(base + path + qs, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error(`SUPABASE_SERVICE_${code}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function bentAuthAdminRequest_(method, path, body) {
  const serviceKey = bentProperty_('BENT_SUPABASE_SERVICE_ROLE_KEY');
  const base = bentProperty_('BENT_SUPABASE_URL').replace(/\/$/, '');
  const options = {
    method: method.toLowerCase(),
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    muteHttpExceptions: true
  };
  if (body !== null && body !== undefined) options.payload = JSON.stringify(body);
  const response = UrlFetchApp.fetch(base + path, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error(`SUPABASE_AUTH_ADMIN_${code}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

function bentPublicRateLimit_(key, maxAttempts, ttlSeconds) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('SYSTEM_BUSY_TRY_AGAIN');
  try {
    const cache = CacheService.getScriptCache();
    const current = Number(cache.get(key) || 0);
    if (current >= maxAttempts) throw new Error('RATE_LIMITED');
    cache.put(key, String(current + 1), ttlSeconds);
  } finally {
    lock.releaseLock();
  }
}

function bentCacheKey_(value) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '').slice(0, 48);
}

function bentNormalizeEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INVALID_EMAIL');
  return email;
}

function bentProvince_(value) {
  const province = String(value || '').trim();
  if (BENT_THAI_PROVINCES.indexOf(province) < 0) throw new Error('INVALID_PROVINCE');
  return province;
}

function bentRequiredText_(value, min, max, code) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) throw new Error(code);
  return text;
}

function bentOptionalText_(value, max) {
  const text = String(value || '').trim();
  if (text.length > max) throw new Error('TEXT_TOO_LONG');
  return text || null;
}

function bentUuid_(value, code) {
  const id = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error(code);
  return id;
}

function bentSetupToken_(value) {
  const token = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw new Error('SETUP_LINK_INVALID_OR_USED');
  return token;
}

function bentMaskEmail_(email) {
  const parts = String(email || '').split('@');
  if (parts.length !== 2) return 'อีเมลที่ลงทะเบียน';
  const local = parts[0];
  const visible = local.slice(0, Math.min(2, local.length));
  return visible + '***@' + parts[1];
}

function bentHtml_(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function bentUpload_(payload) {
  const context = bentAuthorize_(payload.access_token, payload.announcement_id, true);
  if (!['open', 'coordinating'].includes(context.announcement.status)) {
    throw new Error('ANNOUNCEMENT_LOCKED');
  }

  const mimeType = String(payload.mime_type || '');
  if (!BENT_ALLOWED_MIME.includes(mimeType)) throw new Error('INVALID_IMAGE_TYPE');

  const bytes = Utilities.base64Decode(String(payload.base64_data || ''));
  if (!bytes.length || bytes.length > BENT_MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');

  const existing = bentRest_('GET', '/rest/v1/bent_announcement_images', context.token, null, {
    announcement_id: `eq.${context.announcement.id}`,
    select: 'id,image_status,drive_file_id'
  });
  if (existing.length && existing[0].image_status !== 'deleted') throw new Error('IMAGE_ALREADY_EXISTS');

  const folder = DriveApp.getFolderById(bentProperty_('BENT_DRIVE_FOLDER_ID'));
  const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
  const safeName = `bent-${context.announcement.id}-${Date.now()}.${ext}`;
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const file = folder.createFile(blob);
  file.setDescription(`BENT announcement ${context.announcement.id}; uploaded ${new Date().toISOString()}`);

  try {
    const metadata = {
      announcement_id: context.announcement.id,
      drive_file_id: file.getId(),
      image_file_name: safeName,
      image_size: bytes.length,
      image_mime_type: mimeType,
      image_status: 'active',
      uploaded_by: context.user.id,
      uploaded_at: new Date().toISOString(),
      deleted_at: null,
      delete_error: null
    };
    let saved;
    if (existing.length && existing[0].image_status === 'deleted') {
      saved = bentRest_('PATCH', '/rest/v1/bent_announcement_images', context.token, metadata,
        { id: `eq.${existing[0].id}` }, { Prefer: 'return=representation' });
    } else {
      saved = bentRest_('POST', '/rest/v1/bent_announcement_images', context.token, metadata,
        null, { Prefer: 'return=representation' });
    }

    return { ok: true, image: saved[0] || null };
  } catch (error) {
    try { file.setTrashed(true); } catch (_) {}
    throw error;
  }
}

function bentRead_(payload) {
  const context = bentAuthorize_(payload.access_token, payload.announcement_id, false);
  const sameHospital = context.profile.hospital_id === context.announcement.hospital_id;
  const admin = context.profile.role === 'system_admin';
  const publicWithinApp = ['open', 'coordinating'].includes(context.announcement.status);
  if (!publicWithinApp && !sameHospital && !admin) throw new Error('NOT_ALLOWED');

  const images = bentRest_('GET', '/rest/v1/bent_announcement_images', context.token, null, {
    announcement_id: `eq.${context.announcement.id}`,
    image_status: 'eq.active',
    select: 'drive_file_id,image_file_name,image_mime_type,image_size'
  });
  if (!images.length) throw new Error('IMAGE_NOT_AVAILABLE');

  const image = images[0];
  const file = DriveApp.getFileById(image.drive_file_id);
  bentAssertFileInFolder_(file);
  const blob = file.getBlob();
  if (blob.getBytes().length > BENT_MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');

  return {
    ok: true,
    file_name: image.image_file_name,
    mime_type: image.image_mime_type,
    data_url: `data:${image.image_mime_type};base64,${Utilities.base64Encode(blob.getBytes())}`
  };
}

function bentDelete_(payload) {
  const context = bentAuthorize_(payload.access_token, payload.announcement_id, true);
  const images = bentRest_('GET', '/rest/v1/bent_announcement_images', context.token, null, {
    announcement_id: `eq.${context.announcement.id}`,
    select: 'id,drive_file_id,image_status'
  });
  if (!images.length) return { ok: true, deleted: false, reason: 'NO_IMAGE' };

  const image = images[0];
  try {
    const file = DriveApp.getFileById(image.drive_file_id);
    bentAssertFileInFolder_(file);
    file.setTrashed(true);
    bentRest_('PATCH', '/rest/v1/bent_announcement_images', context.token, {
      image_status: 'deleted',
      deleted_at: new Date().toISOString(),
      delete_error: null
    }, { id: `eq.${image.id}` }, { Prefer: 'return=minimal' });
    return { ok: true, deleted: true };
  } catch (error) {
    try {
      bentRest_('PATCH', '/rest/v1/bent_announcement_images', context.token, {
        image_status: 'delete_failed',
        delete_error: String(error.message || error).slice(0, 500)
      }, { id: `eq.${image.id}` }, { Prefer: 'return=minimal' });
    } catch (_) {}
    throw error;
  }
}

function bentAuthorize_(accessToken, announcementId, requireManage) {
  const token = String(accessToken || '').trim();
  const id = String(announcementId || '').trim();
  if (!token) throw new Error('ACCESS_TOKEN_REQUIRED');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('INVALID_ANNOUNCEMENT_ID');

  const user = bentAuthUser_(token);
  const profiles = bentRest_('GET', '/rest/v1/bent_profiles', token, null, {
    id: `eq.${user.id}`,
    select: 'id,status,role,hospital_id'
  });
  if (!profiles.length || profiles[0].status !== 'active') throw new Error('ACTIVE_USER_REQUIRED');

  const announcements = bentRest_('GET', '/rest/v1/bent_announcements', token, null, {
    id: `eq.${id}`,
    select: 'id,status,hospital_id,created_by'
  });
  if (!announcements.length) throw new Error('ANNOUNCEMENT_NOT_FOUND_OR_NOT_ALLOWED');

  const profile = profiles[0];
  const announcement = announcements[0];
  if (requireManage && profile.role !== 'system_admin' && profile.hospital_id !== announcement.hospital_id) {
    throw new Error('NOT_ALLOWED');
  }

  return { token, user, profile, announcement };
}

function bentAuthUser_(token) {
  const url = bentProperty_('BENT_SUPABASE_URL').replace(/\/$/, '') + '/auth/v1/user';
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      apikey: bentProperty_('BENT_SUPABASE_PUBLISHABLE_KEY'),
      Authorization: `Bearer ${token}`
    },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('INVALID_OR_EXPIRED_SESSION');
  return JSON.parse(response.getContentText());
}

function bentRest_(method, path, token, body, query, extraHeaders) {
  const base = bentProperty_('BENT_SUPABASE_URL').replace(/\/$/, '');
  const qs = query ? '?' + Object.keys(query).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`).join('&') : '';
  const headers = Object.assign({
    apikey: bentProperty_('BENT_SUPABASE_PUBLISHABLE_KEY'),
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }, extraHeaders || {});

  const options = { method: method.toLowerCase(), headers, muteHttpExceptions: true };
  if (body !== null && body !== undefined) options.payload = JSON.stringify(body);

  const response = UrlFetchApp.fetch(base + path + qs, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error(`SUPABASE_${code}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function bentJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function bentProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`MISSING_SCRIPT_PROPERTY_${name}`);
  return value;
}

function bentOptionalProperty_(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || '';
}

function bentSafeFileName_(name) {
  const cleaned = String(name).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 120);
  return cleaned || `bent-image-${Date.now()}.jpg`;
}

function bentAssertFileInFolder_(file) {
  const expectedId = bentProperty_('BENT_DRIVE_FOLDER_ID');
  const parents = file.getParents();
  let allowed = false;
  while (parents.hasNext()) {
    if (parents.next().getId() === expectedId) { allowed = true; break; }
  }
  if (!allowed) throw new Error('FILE_OUTSIDE_BENT_FOLDER');
}

function bentSafeError_(error) {
  const message = String(error && error.message ? error.message : error || 'UNKNOWN_ERROR');
  // Avoid returning tokens, keys, or full upstream payloads to the browser.
  return message.replace(/eyJ[a-zA-Z0-9._-]+/g, '[TOKEN]').slice(0, 600);
}

/**
 * Optional scheduled maintenance.
 * Set BENT_SUPABASE_SERVICE_ROLE_KEY in Script Properties before using.
 * Then create an hourly trigger for hourlyMaintenance.
 */
function hourlyMaintenance() {
  const serviceKey = bentProperty_('BENT_SUPABASE_SERVICE_ROLE_KEY');
  const base = bentProperty_('BENT_SUPABASE_URL').replace(/\/$/, '');
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  UrlFetchApp.fetch(base + '/rest/v1/rpc/bent_expire_due_announcements', {
    method: 'post', headers, payload: '{}', muteHttpExceptions: true
  });

  const response = UrlFetchApp.fetch(base + '/rest/v1/bent_announcement_images?image_status=in.(pending_delete,delete_failed)&select=id,drive_file_id', {
    method: 'get', headers, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error(response.getContentText());

  const images = JSON.parse(response.getContentText());
  images.forEach(image => {
    try {
      const file = DriveApp.getFileById(image.drive_file_id);
      bentAssertFileInFolder_(file);
      file.setTrashed(true);
      UrlFetchApp.fetch(base + `/rest/v1/bent_announcement_images?id=eq.${encodeURIComponent(image.id)}`, {
        method: 'patch', headers: Object.assign({}, headers, { Prefer: 'return=minimal' }),
        payload: JSON.stringify({ image_status: 'deleted', deleted_at: new Date().toISOString(), delete_error: null }),
        muteHttpExceptions: true
      });
    } catch (error) {
      UrlFetchApp.fetch(base + `/rest/v1/bent_announcement_images?id=eq.${encodeURIComponent(image.id)}`, {
        method: 'patch', headers: Object.assign({}, headers, { Prefer: 'return=minimal' }),
        payload: JSON.stringify({ image_status: 'delete_failed', delete_error: String(error.message || error).slice(0, 500) }),
        muteHttpExceptions: true
      });
    }
  });
}

/** Run once from the Apps Script editor to confirm all required properties and folder access. */
function testConfiguration() {
  const spaceName = bentOptionalProperty_('BENT_GOOGLE_CHAT_SPACE_NAME');
  const serviceAccountJson = bentOptionalProperty_('BENT_CHAT_SERVICE_ACCOUNT_JSON');
  const chatWebhook = bentOptionalProperty_('BENT_GOOGLE_CHAT_WEBHOOK_URL');
  const provinceRows = bentServiceRest_('GET', '/rest/v1/bent_provinces', null, {
    is_active: 'eq.true', select: 'code', limit: '100'
  }) || [];
  const checks = {
    supabaseUrl: bentProperty_('BENT_SUPABASE_URL'),
    publishableKeyPresent: Boolean(bentProperty_('BENT_SUPABASE_PUBLISHABLE_KEY')),
    driveFolderName: DriveApp.getFolderById(bentProperty_('BENT_DRIVE_FOLDER_ID')).getName(),
    serviceRoleConfigured: Boolean(bentProperty_('BENT_SUPABASE_SERVICE_ROLE_KEY')),
    appUrl: bentProperty_('BENT_APP_URL'),
    interactiveChatConfigured: bentChatInteractiveConfigured_(),
    googleChatSpaceName: spaceName || 'ยังไม่ได้เพิ่ม Chat App เข้าห้อง',
    chatServiceAccountConfigured: Boolean(serviceAccountJson),
    webhookCardFallbackConfigured: /^https:\/\/chat\.googleapis\.com\/v1\/spaces\//i.test(chatWebhook),
    mailQuotaRemaining: MailApp.getRemainingDailyQuota(),
    testEmailConfigured: Boolean(bentOptionalProperty_('BENT_TEST_EMAIL')),
    provinceMasterCount: provinceRows.length,
    provinceMasterReady: provinceRows.length === 77
  };
  console.log(JSON.stringify(checks, null, 2));
  return checks;
}

/** ส่งการ์ดทดสอบ หากมีคำขอ pending จะใช้คำขอจริงเพื่อให้ทดสอบปุ่มอนุมัติได้ */
function testGoogleChatNotification() {
  const pending = bentServiceRest_('GET', '/rest/v1/bent_account_requests', null, {
    status: 'eq.pending', select: '*', order: 'requested_at.desc', limit: '1'
  }) || [];
  if (pending.length) {
    bentSendAccountRequestChat_(pending[0], 'new');
    console.log('ส่งการ์ดของคำขอ pending ล่าสุดไป Google Chat แล้ว');
    return { ok: true, interactive_test: true, request_id: pending[0].id };
  }

  const demo = {
    id: '00000000-0000-4000-8000-000000000000',
    full_name: 'ทดสอบระบบ BENT',
    hospital_name: 'โรงพยาบาลตัวอย่าง',
    province: 'กรุงเทพมหานคร',
    hospital_selection_mode: 'new',
    requested_hospital_id: null,
    proposed_hospital_phone: '02-111-1111',
    phone: '02-000-0000',
    email: 'test@example.com',
    position_title: 'การ์ดทดสอบ ไม่ใช่คำขอจริง',
    requested_at: new Date().toISOString()
  };
  const message = bentBuildAccountRequestChatMessage_(demo, 'new', false);
  if (bentChatInteractiveConfigured_()) bentChatCreateMessage_(message);
  else {
    const webhookUrl = bentOptionalProperty_('BENT_GOOGLE_CHAT_WEBHOOK_URL');
    if (!webhookUrl) throw new Error('GOOGLE_CHAT_APP_NOT_CONFIGURED');
    UrlFetchApp.fetch(webhookUrl, {
      method: 'post', contentType: 'application/json; charset=utf-8',
      payload: JSON.stringify(message), muteHttpExceptions: true
    });
  }
  console.log('ส่งการ์ดทดสอบไป Google Chat แล้ว แต่ไม่มีคำขอ pending จึงไม่มีปุ่มอนุมัติ');
  return { ok: true, interactive_test: false };
}


/** Run manually after setting BENT_TEST_EMAIL to confirm that Apps Script can send mail. */
function testEmailDelivery() {
  const email = bentNormalizeEmail_(bentProperty_('BENT_TEST_EMAIL'));
  const quotaBefore = MailApp.getRemainingDailyQuota();
  if (quotaBefore < 1) throw new Error('MAIL_DAILY_QUOTA_EXCEEDED');
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
  MailApp.sendEmail({
    to: email,
    subject: 'BENT: ทดสอบการส่งอีเมล',
    body: `อีเมลทดสอบจาก BENT ส่งเมื่อ ${now}

หากได้รับฉบับนี้ แสดงว่า Apps Script มีสิทธิ์ส่งอีเมลและ Deployment ทำงานภายใต้บัญชีผู้เป็นเจ้าของสคริปต์แล้ว`,
    htmlBody: `<div style="font-family:Arial,sans-serif;line-height:1.65"><h2>BENT: ทดสอบการส่งอีเมล</h2><p>ส่งเมื่อ ${bentHtml_(now)}</p><p>หากได้รับฉบับนี้ แสดงว่า Apps Script มีสิทธิ์ส่งอีเมลและ Deployment ทำงานภายใต้บัญชีผู้เป็นเจ้าของสคริปต์แล้ว</p></div>`,
    name: 'BENT'
  });
  const result = { ok: true, sent_to: email, quota_before: quotaBefore, quota_after: MailApp.getRemainingDailyQuota() };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
