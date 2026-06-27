# คู่มือติดตั้ง BENT MVP v1.3.1 แบบทีละขั้น

รุ่นนี้เปลี่ยนระบบสมาชิกเป็น:

```text
ส่งคำขอเปิดบัญชี
→ ระบบบันทึกคำขอและแจ้งผู้ดูแลใน Google Chat
→ ผู้ดูแลระบบตรวจสอบ
→ Apps Script สร้างบัญชี Supabase
→ Google Apps Script ส่งอีเมล
→ ผู้ใช้เปิดลิงก์ BENT และตั้งรหัสผ่านเอง
```

ลิงก์ตั้งรหัสผ่านของ BENT **ไม่มีการหมดอายุตามเวลา** ไม่มี `expires_at` และไม่ใช้ Supabase OTP/Magic Link แต่ลิงก์จะใช้ได้หนึ่งครั้ง และลิงก์เดิมจะถูกยกเลิกเมื่อออกลิงก์ใหม่หรือผู้ดูแลเพิกถอน

---

## 1. เลือกวิธีติดตั้ง

### กรณียังไม่เคยติดตั้ง BENT

ทำตามทุกหัวข้อตั้งแต่ข้อ 2 เป็นต้นไป และ Run SQL ตามลำดับที่ระบุในข้อ 3

### กรณีมี BENT รุ่นเดิมใช้งานอยู่แล้ว

ให้ทำตาม `UPGRADE_v1.3.1_TH.md` โดยสรุปคือ:

1. สำรองระบบและเก็บ `assets/js/config.js` เดิม
2. หากยังไม่เคยใช้ v1.3.0 ให้ Run `supabase/06_hospital_registration_workflow.sql` ก่อน จากนั้น Run `supabase/07_seed_thailand_hospitals.sql`
3. แทนที่ `apps-script/Code.gs` และ Deploy เป็น **New version**
4. อัปโหลดหน้าเว็บ v1.3.1 ทับไฟล์เดิม
5. ล้าง Cache/PWA และทดสอบขั้นตอนสมัครกับอนุมัติ

ไม่ต้อง Run `01`, `02`, `04` หรือ `05` ซ้ำ หากเคย Run สำเร็จแล้ว

---

## 2. สร้าง Supabase Project

1. เข้า Supabase Dashboard
2. กด **New project**
3. ตั้งชื่อ เช่น `bent-production`
4. ตั้ง Database Password ที่เดายาก
5. เลือก Region ที่เหมาะสม
6. รอจน Project พร้อม

ไปที่ **Project Settings → API** แล้วเก็บค่า:

- Project URL
- Publishable Key หรือ Anon Key
- Service Role Key

ข้อห้าม:

- Publishable/Anon Key ใส่ในหน้าเว็บได้
- Service Role Key ห้ามใส่ใน GitHub หรือ `assets/js/config.js`
- Service Role Key ให้เก็บใน Apps Script Properties เท่านั้น

---

## 3. Run SQL

### 3.1 สร้างฐานข้อมูลหลัก

เปิด Supabase → **SQL Editor → New query** แล้ว Run ตามลำดับ:

1. `supabase/01_schema_and_security.sql`
2. `supabase/02_bootstrap_first_admin.sql`
3. `supabase/04_account_onboarding_no_expiry.sql`
4. `supabase/05_fix_password_email_and_user_delete.sql`
5. `supabase/06_hospital_registration_workflow.sql`
6. `supabase/07_seed_thailand_hospitals.sql`
7. `supabase/03_health_check.sql`

ก่อน Run ไฟล์ `02_bootstrap_first_admin.sql` ต้องสร้างผู้ใช้ Admin คนแรกใน Supabase Authentication และแก้อีเมลใน SQL ให้ตรงตามคู่มือในไฟล์นั้น

### 3.2 สิ่งที่ไฟล์ 04, 06 และ 07 เพิ่ม

- ตาราง `bent_account_requests`
- ตาราง `bent_password_setup_tokens`
- สถานะคำขอ `pending / approved / rejected / cancelled`
- Token แบบสุ่ม 256-bit
- เก็บเฉพาะ SHA-256 hash ของ Token
- ไม่มีคอลัมน์วันหมดอายุ
- Function ตรวจ Token โดยไม่ตรวจเวลา
- Function ใช้ Token แบบ Atomic และใช้ซ้ำไม่ได้
- หน้า Admin อ่านคำขอได้ผ่าน RLS
- Master จังหวัดไทย 77 จังหวัด
- ข้อมูลโรงพยาบาลเดิม/โรงพยาบาลใหม่ที่ผู้สมัครเสนอ
- การ Normalize และ Unique Index ป้องกันชื่อโรงพยาบาลซ้ำในจังหวัดเดียวกัน
- Master โรงพยาบาลที่ยังใช้งาน 1,601 แห่ง ครบ 77 จังหวัด จากทะเบียน HCODE

---

## 4. ปิดการสมัครตรงผ่าน Supabase

เนื่องจาก BENT ใช้ระบบ “ส่งคำขอแล้วให้ Admin สร้างบัญชี” จึงต้องปิด Public Signup เพื่อไม่ให้มีผู้เรียก Supabase `signUp()` ตรงจากภายนอก

ไปที่ Supabase:

```text
Authentication → General Configuration
```

ปิด:

```text
Allow new users to sign up
```

อย่าปิด Email/Password Sign-in เพราะผู้ใช้ยังต้องเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน

BENT v1.3.1 ไม่เรียก:

- `supabase.auth.signUp()`
- `supabase.auth.resetPasswordForEmail()`
- Supabase Magic Link
- Supabase Recovery OTP

จึงไม่ใช้โควตาส่งอีเมลของ Supabase ในขั้นตอนสมัครและลืมรหัสผ่าน

---

## 5. ติดตั้ง Google Apps Script

Apps Script รุ่นนี้ทำหน้าที่:

- รับคำขอเปิดบัญชี
- แจ้งผู้ดูแลใน Google Chat เมื่อมีคำขอใหม่
- ตรวจสิทธิ์ผู้ดูแลระบบ
- สร้างบัญชี Supabase ด้วย Service Role
- ยืนยันอีเมลในระบบโดยไม่ส่งอีเมล Supabase
- สร้างลิงก์ตั้งรหัสผ่านของ BENT
- ส่งอีเมลด้วย `MailApp`
- ตั้งรหัสผ่านผ่าน Supabase Admin API
- จัดการรูปใน Private Google Drive

### 5.1 สร้าง Project

1. เข้า Google Apps Script
2. กด **New project**
3. ตั้งชื่อ `BENT Secure Gateway`
4. เปิด `apps-script/Code.gs`
5. คัดลอกทั้งหมดไปวางทับ Code.gs
6. เปิดการแสดง Manifest
7. วางไฟล์ `apps-script/appsscript.json`
8. กด Save

### 5.2 ตั้ง Script Properties

ไปที่:

```text
Project Settings → Script properties
```

เพิ่มอย่างน้อย 7 ค่า:

| Property | ค่า |
|---|---|
| `BENT_SUPABASE_URL` | Project URL ของ Supabase |
| `BENT_SUPABASE_PUBLISHABLE_KEY` | Publishable Key หรือ Anon Key |
| `BENT_SUPABASE_SERVICE_ROLE_KEY` | Service Role Key |
| `BENT_DRIVE_FOLDER_ID` | ID โฟลเดอร์ Private Drive สำหรับรูป |
| `BENT_APP_URL` | URL หน้าเว็บ BENT ที่ผู้ใช้เปิดจริง |
| `BENT_GOOGLE_CHAT_WEBHOOK_URL` | Incoming webhook URL ของห้อง Google Chat สำหรับผู้ดูแล |
| `BENT_TEST_EMAIL` | อีเมลสำหรับ Run `testEmailDelivery` เพื่อตรวจระบบส่งเมล |

ตัวอย่าง `BENT_APP_URL`:

```text
https://exchange.cnmiblood.com/
```

ต้องเป็น URL หน้าแรกของแอปและขึ้นต้นด้วย `https://`

### 5.3 สร้าง Google Chat Incoming Webhook

ต้องทำผ่าน Google Chat บนเว็บ ไม่ใช่แอปมือถือ:

1. เปิดห้อง Google Chat ที่ต้องการรับแจ้งเตือน
2. กดลูกศรข้างชื่อห้อง
3. เลือก **Apps & integrations**
4. กด **Add webhooks**
5. ตั้งชื่อ เช่น `BENT Account Alert`
6. กด Save
7. กดเมนูเพิ่มเติมของ Webhook แล้วเลือก **Copy link**
8. นำลิงก์ไปใส่ใน Script Property `BENT_GOOGLE_CHAT_WEBHOOK_URL`

ข้อสำคัญ:

- ใช้ห้องที่มีเฉพาะผู้ดูแลที่เกี่ยวข้อง เพราะข้อความมีชื่อ โรงพยาบาล อีเมล และเบอร์โทรผู้สมัคร
- Webhook URL เป็นข้อมูลลับ ห้ามใส่ใน GitHub หรือส่งในกลุ่มสาธารณะ
- หากกด Add webhooks ไม่ได้ แปลว่าองค์กรอาจยังไม่อนุญาตให้ผู้ใช้เพิ่ม Incoming Webhook ต้องติดต่อผู้ดูแล Google Workspace
- การแจ้ง Google Chat ล้มเหลวจะไม่ทำให้คำขอสมัครหาย ผู้ดูแลยังตรวจคำขอได้จากหน้า “คำขอเปิดบัญชี”

### 5.4 ทดสอบ Configuration

1. เลือก Function `testConfiguration`
2. กด **Run**
3. อนุญาตสิทธิ์:
   - Google Drive
   - External Request
   - Send Email
4. เปิด Execution log
5. ต้องเห็น:
   - Supabase URL
   - ชื่อ Drive Folder
   - `serviceRoleConfigured: true`
   - `appUrl`
   - `interactiveChatConfigured: true` หรือ `webhookCardFallbackConfigured: true`
   - จำนวน `mailQuotaRemaining`
   - `provinceMasterCount: 77`
   - `provinceMasterReady: true`

จากนั้นทดสอบ Google Chat:

1. เลือก Function `testGoogleChatNotification`
2. กด **Run**
3. ตรวจว่าห้อง Google Chat ได้รับข้อความทดสอบจาก BENT

### 5.5 Deploy

1. กด **Deploy → New deployment**
2. Type = **Web app**
3. Description = `BENT Secure Gateway v1.5.0`
4. Execute as = **Me**
5. Who has access = **Anyone**
6. กด Deploy
7. คัดลอก URL ที่ลงท้าย `/exec`

เมื่อแก้ Code.gs ภายหลัง ต้อง:

```text
Deploy → Manage deployments → Edit → New version → Deploy
```

การกด Save อย่างเดียวไม่ทำให้ Web App ใช้โค้ดใหม่

## 6. ตั้งค่าหน้าเว็บ

เปิด:

```text
assets/js/config.js
```

ใส่ 3 ค่า:

```js
window.BENT_CONFIG = {
  SUPABASE_URL: 'https://PROJECT.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'PUBLISHABLE_OR_ANON_KEY',
  APPS_SCRIPT_WEB_APP_URL: 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec',
  APP_NAME: 'Blood Exchange Network Thailand',
  APP_SHORT_NAME: 'BENT'
};
```

ตรวจว่าไม่มี Service Role Key ในไฟล์นี้

---

## 7. อัปขึ้น GitHub Pages

1. เปิด Repository เดิมหรือสร้าง Repository ใหม่
2. อัปทุกไฟล์ในโฟลเดอร์ BENT ขึ้นที่ Root ของ Repository
3. ไฟล์ `index.html` ต้องอยู่ระดับบนสุด
4. ไปที่ **Settings → Pages**
5. เลือก Branch ที่ใช้งาน
6. รอ GitHub Pages Deploy สำเร็จ
7. เปิด URL จริงของแอป
8. นำ URL เดียวกันไปใส่ใน Script Property `BENT_APP_URL`

หากเปลี่ยน Custom Domain หรือ Path ของ Repository ต้องแก้ `BENT_APP_URL` และ Deploy Apps Script เวอร์ชันใหม่

---

## 8. ทดสอบระบบสมาชิก

### ทดสอบที่ 1: ส่งคำขอ

1. เปิดหน้า BENT แบบยังไม่ Login
2. เลือก **สมัครใช้งาน**
3. กรอกข้อมูล
4. กด **ส่งคำขอเปิดบัญชี**
5. ตรวจใน Supabase Table Editor:

```text
bent_account_requests
```

ต้องพบสถานะ `pending`

ตรวจเพิ่มว่า:

- ห้อง Google Chat ของผู้ดูแลได้รับแจ้งเตือนคำขอใหม่
- ข้อความมีชื่อ โรงพยาบาล อีเมล และเวลาส่งคำขอ

ในขั้นนี้ต้องยังไม่มี Auth User ใหม่

### ทดสอบที่ 2: Admin อนุมัติ

1. เข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ
2. ไป **จัดการระบบ → คำขอเปิดบัญชี**
3. กด **ตรวจสอบ**
4. เลือกโรงพยาบาล
5. กด **อนุมัติและส่งลิงก์**
6. ตรวจว่า:
   - Supabase Authentication มี User ใหม่
   - `bent_profiles.status = active`
   - `must_change_password = true`
   - คำขอเป็น `approved`
   - ผู้ใช้ได้รับอีเมลจาก Apps Script

### ทดสอบที่ 3: ตั้งรหัสผ่าน

1. เปิดลิงก์จากอีเมล
2. หน้าจอต้องแสดงอีเมลแบบปิดบางส่วน
3. ตั้งรหัสผ่านอย่างน้อย 10 ตัวอักษร
4. กดบันทึก
5. Login ด้วยอีเมลและรหัสผ่านใหม่
6. ตรวจว่า:
   - `must_change_password = false`
   - `password_set_at` มีวันที่

### ทดสอบที่ 4: ใช้ลิงก์ซ้ำ

1. เปิดลิงก์เดิมอีกครั้ง
2. ระบบต้องแจ้งว่าลิงก์ถูกใช้แล้ว/ถูกยกเลิก/ไม่ถูกต้อง

### ทดสอบที่ 5: ไม่มีหมดอายุตามเวลา

ตรวจ Table:

```text
bent_password_setup_tokens
```

ต้องไม่มี `expires_at`

ตรวจ SQL Function:

```text
bent_check_password_setup_token
```

ต้องไม่มีการเปรียบเทียบ `now()` กับวันหมดอายุ

สามารถเก็บลิงก์ที่ยังไม่ใช้ไว้ทดสอบภายหลังได้ ลิงก์จะยังใช้ได้ตราบใดที่ยังไม่ถูกใช้ ไม่ถูกเพิกถอน และยังไม่มีการออกลิงก์ใหม่

### ทดสอบที่ 6: ออกลิงก์ใหม่

1. Admin กด **ส่งลิงก์ใหม่**
2. อีเมลใหม่ต้องได้รับลิงก์ใหม่
3. ลิงก์เก่าต้องใช้ไม่ได้
4. ลิงก์ใหม่ต้องใช้ได้

### ทดสอบที่ 7: ลืมรหัสผ่าน

1. หน้า Login กรอกอีเมล
2. กด **ลืมรหัสผ่าน**
3. ระบบตอบแบบกลาง ๆ โดยไม่เปิดเผยว่ามีบัญชีหรือไม่
4. บัญชีที่เปิดใช้งานต้องได้รับอีเมลลิงก์ใหม่
5. ลิงก์เดิมของบัญชีนั้นต้องถูกยกเลิก

---

## 9. ความหมายของ “ลิงก์ไม่หมดอายุ”

ลิงก์นี้ไม่มี Time-based Expiration กล่าวคือ:

- ไม่หมดอายุใน 1 ชั่วโมง
- ไม่หมดอายุใน 24 ชั่วโมง
- ไม่หมดอายุเมื่อผ่านหลายวัน
- ไม่มีการตั้งวันหมดอายุในฐานข้อมูล

ลิงก์หยุดใช้ได้เฉพาะกรณี:

1. ผู้ใช้ตั้งรหัสผ่านสำเร็จแล้ว
2. Admin หรือระบบออกลิงก์ใหม่ ซึ่งเพิกถอนลิงก์เดิม
3. Token ถูกเพิกถอน
4. บัญชีไม่ได้อยู่ในสถานะเปิดใช้งาน
5. URL เว็บไซต์ BENT ถูกเปลี่ยนหรือระบบถูกย้ายโดยไม่อัปเดต `BENT_APP_URL`

นี่เป็นการป้องกันไม่ให้ลิงก์ที่เคยใช้หรือเคยรั่วกลับมาเปลี่ยนรหัสผ่านซ้ำได้

---

## 10. Security Checklist ก่อนเปิดใช้จริง

- ปิด `Allow new users to sign up` ใน Supabase
- Service Role Key อยู่เฉพาะ Apps Script Properties
- Repository ไม่มี Service Role Key
- Apps Script Deploy เป็น Execute as Me
- Apps Script ใช้ Deployment เวอร์ชันล่าสุด
- `BENT_APP_URL` เป็น HTTPS และตรงกับ URL ใช้งานจริง
- อีเมลเจ้าของ Apps Script เป็นบัญชีองค์กร/บัญชีโครงการ
- มีผู้ดูแลระบบสำรองอย่างน้อย 2 คน
- ทดสอบลิงก์ใช้ซ้ำไม่ได้
- ทดสอบออกลิงก์ใหม่แล้วลิงก์เก่าถูกยกเลิก
- ตรวจ Mail quota ก่อน Pilot
- ห้ามส่งข้อมูลผู้ป่วย ผู้บริจาค เลขถุงเลือด Barcode หรือ QR Code ผ่านแบบสมัครหรืออีเมล
