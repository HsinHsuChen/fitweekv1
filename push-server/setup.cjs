'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),webpush=require('web-push');
const target=path.join(__dirname,'.env');
if(fs.existsSync(target)){console.error('.env 已存在；為避免通知金鑰失效，不會覆寫。');process.exitCode=1}else{
 const keys=webpush.generateVAPIDKeys();
 const text=['PORT=3000','SITE_URL=https://YOUR-NAME.github.io/YOUR-REPOSITORY/','PAIRING_CODE='+crypto.randomBytes(24).toString('base64url'),'VAPID_SUBJECT=mailto:YOUR_EMAIL@example.com','VAPID_PUBLIC_KEY='+keys.publicKey,'VAPID_PRIVATE_KEY='+keys.privateKey,'DATA_DIR=./data',''].join('\n');
 fs.writeFileSync(target,text,{mode:0o600,flag:'wx'});console.log('已建立 .env，請在主機上填寫 SITE_URL 與 VAPID_SUBJECT；其餘金鑰已自動產生。');
}
