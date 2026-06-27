# BENT Secure Gateway v1.5.0

Google Apps Script ตัวนี้ทำหน้าที่เป็นฝั่ง Server ของ BENT สำหรับ:

- รูปภาพ Private Google Drive
- รับคำขอเปิดบัญชี
- ส่งการ์ดแจ้งเตือนคำขอใหม่ไป Google Chat
- รับการกดอนุมัติจากการ์ด Google Chat
- สร้าง Supabase Auth User และ Profile
- ส่งอีเมลตั้งรหัสผ่านผ่าน `MailApp`
- จัดการลิงก์ตั้งรหัสผ่านแบบไม่มีวันหมดอายุตามเวลาและใช้ได้ครั้งเดียว

## Script Properties

| Property | การใช้งาน |
|---|---|
| `BENT_SUPABASE_URL` | Project URL ของ Supabase |
| `BENT_SUPABASE_PUBLISHABLE_KEY` | Publishable/Anon key |
| `BENT_SUPABASE_SERVICE_ROLE_KEY` | Service Role key เก็บเฉพาะ Apps Script |
| `BENT_DRIVE_FOLDER_ID` | โฟลเดอร์รูป Private Drive |
| `BENT_APP_URL` | URL หน้า BENT จริง |
| `BENT_CHAT_SERVICE_ACCOUNT_JSON` | เนื้อหา JSON key ของ Service Account สำหรับ Chat App |
| `BENT_GOOGLE_CHAT_SPACE_NAME` | ระบบสร้างให้อัตโนมัติเมื่อเพิ่ม Chat App เข้าห้อง |
| `BENT_GOOGLE_CHAT_WEBHOOK_URL` | ไม่บังคับ ใช้เป็นการ์ดสำรองแบบกดอนุมัติไม่ได้ |
| `BENT_TEST_EMAIL` | ไม่บังคับ อีเมลสำหรับ Run `testEmailDelivery` |

ห้ามนำ Service Role key, Service Account JSON หรือ Webhook URL ขึ้น GitHub

## เหตุผลที่ต้องใช้ Google Chat App

Incoming Webhook ส่งการ์ดได้ แต่รับเหตุการณ์จากการกดปุ่มไม่ได้ การอนุมัติจาก Chat จึงต้องตั้งค่าเป็น Google Chat App แบบ Interactive และเชื่อมกับ Apps Script

## ลำดับติดตั้งแบบย่อ

1. วาง `Code.gs` และ `appsscript.json` ใน Apps Script เดิม
2. Deploy Web App เป็น New version เพื่อให้หน้า BENT ใช้โค้ดใหม่
3. เชื่อม Apps Script กับ Standard Google Cloud project
4. เปิด Google Chat API
5. สร้าง Service Account และ JSON key
6. ใส่ JSON ทั้งก้อนใน `BENT_CHAT_SERVICE_ACCOUNT_JSON`
7. คัดลอก **Head deployment ID** จาก `Deploy → Test deployments`
8. ตั้งค่า Google Chat API ให้ Connection = Apps Script และวาง Head deployment ID
9. เพิ่ม BENT Chat App เข้าห้องผู้ดูแล ระบบจะบันทึก `BENT_GOOGLE_CHAT_SPACE_NAME` ให้อัตโนมัติ
10. Run `testConfiguration`, `testEmailDelivery` และ `testGoogleChatNotification`

รายละเอียดการตั้งค่าอยู่ในหัวข้อ Google Chat ของ `../docs/INSTALLATION_TH.md`

## ผลที่ต้องเห็นจาก testConfiguration

```text
interactiveChatConfigured: true
chatServiceAccountConfigured: true
googleChatSpaceName: spaces/...
provinceMasterCount: 77
provinceMasterReady: true
```

ถ้ายังเป็น `interactiveChatConfigured: false` ให้ตรวจ Service Account JSON และตรวจว่าเพิ่ม Chat App เข้าห้องแล้ว

## ทดสอบการส่งอีเมล

1. เพิ่ม Script Property `BENT_TEST_EMAIL`
2. เลือกฟังก์ชัน `testEmailDelivery`
3. กด Run และอนุญาตสิทธิ์ส่งอีเมล
4. ตรวจ Inbox, Spam และระบบกักกันอีเมลขององค์กร
5. Deploy Web App เป็น New version หลังแก้ `Code.gs`
