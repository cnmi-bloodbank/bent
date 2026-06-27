# BENT Secure Gateway v1.1.0

`Code.gs` เป็น Server-side Gateway สำหรับ:

- รับคำขอเปิดบัญชี
- ให้ System Admin อนุมัติและสร้าง Supabase Auth User
- ส่งอีเมลตั้งรหัสผ่านด้วย Google `MailApp`
- ใช้ลิงก์ BENT แบบไม่มีการหมดอายุตามเวลา
- รีเซ็ตรหัสผ่านโดยไม่ใช้ Supabase Email/OTP
- อัปโหลด อ่าน และลบรูปใน Private Google Drive

## Script Properties ที่ต้องมี

| Property | ค่า |
|---|---|
| `BENT_SUPABASE_URL` | Supabase Project URL |
| `BENT_SUPABASE_PUBLISHABLE_KEY` | Publishable/Anon Key |
| `BENT_SUPABASE_SERVICE_ROLE_KEY` | Service Role Key |
| `BENT_DRIVE_FOLDER_ID` | Private Drive Folder ID |
| `BENT_APP_URL` | URL หน้าแรกของ BENT เช่น `https://example.github.io/bent/` |

ห้ามใส่ Service Role Key ใน GitHub หรือไฟล์หน้าเว็บ

## หลังแก้ Code.gs

ต้อง Deploy เป็น New version ทุกครั้ง:

```text
Deploy → Manage deployments → Edit → New version → Deploy
```

## ตรวจ Configuration

Run Function:

```text
testConfiguration
```

ต้องเห็น `serviceRoleConfigured: true`, `appUrl` และ `mailQuotaRemaining`
