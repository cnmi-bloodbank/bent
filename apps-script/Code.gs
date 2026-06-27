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
 *
 * This gateway handles private images, account requests, admin approval,
 * MailApp delivery, and permanent-until-used password setup links.
 */

const BENT_MAX_IMAGE_BYTES = 1024 * 1024;
const BENT_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

function doGet() {
  return bentJson_({ ok: true, service: 'BENT secure gateway', version: '1.1.0' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(payload.action || '').toLowerCase();

    if (action === 'upload') return bentJson_(bentUpload_(payload));
    if (action === 'read') return bentJson_(bentRead_(payload));
    if (action === 'delete') return bentJson_(bentDelete_(payload));
    if (action === 'submit_account_request') return bentJson_(bentSubmitAccountRequest_(payload));
    if (action === 'approve_account_request') return bentJson_(bentApproveAccountRequest_(payload));
    if (action === 'reject_account_request') return bentJson_(bentRejectAccountRequest_(payload));
    if (action === 'admin_send_password_link') return bentJson_(bentAdminSendPasswordLink_(payload));
    if (action === 'request_password_reset') return bentJson_(bentRequestPasswordReset_(payload));
    if (action === 'check_setup_token') return bentJson_(bentCheckSetupToken_(payload));
    if (action === 'set_password') return bentJson_(bentSetPassword_(payload));
    if (action === 'health') return bentJson_({ ok: true, service: 'BENT secure gateway', version: '1.1.0' });

    throw new Error('UNKNOWN_ACTION');
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return bentJson_({ ok: false, error: bentSafeError_(error) });
  }
}

function bentSubmitAccountRequest_(payload) {
  // Honeypot: bots often fill hidden fields. Return the same generic success response.
  if (String(payload.website || '').trim()) return { ok: true, accepted: true };

  const email = bentNormalizeEmail_(payload.email);
  const fullName = bentRequiredText_(payload.full_name, 2, 120, 'INVALID_FULL_NAME');
  const phone = bentRequiredText_(payload.phone, 3, 30, 'INVALID_PHONE');
  const hospitalName = bentRequiredText_(payload.hospital_name, 2, 180, 'INVALID_HOSPITAL');
  const positionTitle = bentOptionalText_(payload.position_title, 160);

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
    position_title: positionTitle,
    status: 'pending',
    requested_at: now,
    reviewed_at: null,
    reviewed_by: null,
    admin_note: null,
    email_last_error: null
  };

  if (existing.length) {
    // Pending/approved requests are idempotent. Rejected requests can be submitted again.
    if (existing[0].status === 'pending' || existing[0].status === 'approved') {
      return { ok: true, accepted: true };
    }
    bentServiceRest_('PATCH', '/rest/v1/bent_account_requests', values,
      { id: `eq.${existing[0].id}` }, { Prefer: 'return=minimal' });
  } else {
    bentServiceRest_('POST', '/rest/v1/bent_account_requests', values,
      null, { Prefer: 'return=minimal' });
  }

  return { ok: true, accepted: true };
}

function bentApproveAccountRequest_(payload) {
  const admin = bentRequireSystemAdmin_(payload.access_token);
  const requestId = bentUuid_(payload.request_id, 'INVALID_REQUEST_ID');
  const hospitalId = bentUuid_(payload.hospital_id, 'INVALID_HOSPITAL_ID');
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

  const existingProfiles = bentServiceRest_('GET', '/rest/v1/bent_profiles', null, {
    email: `eq.${bentNormalizeEmail_(request.email)}`, select: 'id,status', limit: '1'
  });
  if (existingProfiles.length && existingProfiles[0].status === 'active') throw new Error('EMAIL_ALREADY_HAS_ACCOUNT');

  const hospitals = bentServiceRest_('GET', '/rest/v1/bent_hospitals', null, {
    id: `eq.${hospitalId}`, is_active: 'eq.true', select: 'id,name', limit: '1'
  });
  if (!hospitals.length) throw new Error('HOSPITAL_NOT_ACTIVE');

  const email = bentNormalizeEmail_(request.email);
  const existingUsers = bentServiceRpc_('bent_find_auth_user_by_email', { p_email: email });
  let userId;
  if (existingUsers.length) {
    userId = existingUsers[0].user_id;
  } else {
    const created = bentAuthAdminRequest_('POST', '/auth/v1/admin/users', {
      email: email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: phone,
        hospital_name: request.hospital_name,
        position_title: request.position_title || null
      }
    });
    const user = created.user || created;
    userId = user.id;
  }
  if (!userId) throw new Error('AUTH_USER_CREATE_FAILED');

  bentServiceRest_('POST', '/rest/v1/bent_profiles', {
    id: userId,
    email: email,
    full_name: fullName,
    phone: phone,
    hospital_id: hospitalId,
    hospital_name_requested: request.hospital_name,
    status: 'active',
    role: role,
    approved_by: admin.user.id,
    approved_at: new Date().toISOString(),
    must_change_password: true,
    password_set_at: null
  }, { on_conflict: 'id' }, { Prefer: 'resolution=merge-duplicates,return=minimal' });

  bentServiceRest_('PATCH', '/rest/v1/bent_account_requests', {
    status: 'approved',
    auth_user_id: userId,
    reviewed_at: new Date().toISOString(),
    reviewed_by: admin.user.id,
    admin_note: adminNote,
    email_last_error: null
  }, { id: `eq.${requestId}` }, { Prefer: 'return=minimal' });

  const delivery = bentIssueAndSendPasswordLink_({
    userId: userId,
    requestId: requestId,
    email: email,
    fullName: fullName,
    purpose: 'initial_password',
    createdBy: admin.user.id
  });
  return { ok: true, user_id: userId, email_sent: delivery.emailSent, email_error: delivery.emailError || null };
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
    emailError = bentSafeError_(error);
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
  const htmlBody = `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#17324d;max-width:620px;margin:auto"><h2 style="color:#0b6aa8">Blood Exchange Network Thailand (BENT)</h2><p>เรียน ${safeName}</p><p>${actionText}</p><p style="margin:28px 0"><a href="${safeLink}" style="background:#0b6aa8;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold">${actionText}</a></p><div style="background:#fff2cf;padding:14px;border-radius:10px"><b>ลิงก์นี้ไม่มีการหมดอายุตามเวลา</b><br>ลิงก์ใช้ได้หนึ่งครั้ง และลิงก์เดิมจะถูกยกเลิกเมื่อมีการออกลิงก์ใหม่หรือผู้ดูแลเพิกถอน</div><p style="font-size:12px;color:#63788c;margin-top:24px">หากไม่ได้ขอเปิดบัญชีหรือรีเซ็ตรหัสผ่าน กรุณาติดต่อ System Admin ของ BENT</p></div>`;
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
  const response = UrlFetchApp.fetch(base + path, {
    method: method.toLowerCase(),
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    payload: JSON.stringify(body || {}),
    muteHttpExceptions: true
  });
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
  const checks = {
    supabaseUrl: bentProperty_('BENT_SUPABASE_URL'),
    publishableKeyPresent: Boolean(bentProperty_('BENT_SUPABASE_PUBLISHABLE_KEY')),
    driveFolderName: DriveApp.getFolderById(bentProperty_('BENT_DRIVE_FOLDER_ID')).getName(),
    serviceRoleConfigured: Boolean(bentProperty_('BENT_SUPABASE_SERVICE_ROLE_KEY')),
    appUrl: bentProperty_('BENT_APP_URL'),
    mailQuotaRemaining: MailApp.getRemainingDailyQuota()
  };
  console.log(JSON.stringify(checks, null, 2));
  return checks;
}
