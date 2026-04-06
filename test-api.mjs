// 测试加密和 API 调用
import * as crypto from 'crypto';
import fetch from 'node-fetch';

// 龙猫 RSA 公钥
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDU/j+c5FdkEwhSIF9jmw+050iN
0/yfjhk/669RyFiG5wu0Adpk3NR2Ikbo2lA+rTBJBx1bpGVGCvMKKQ/pljNUSmJt
JaM5ieONFrZD6RhSUbjrNENH89Ks9GGWi+1dkOfdSHNujQilF5oLOIHez1HYmwml
ADA29Ux4yb8e4+PtLQIDAQAB
-----END PUBLIC KEY-----`;

function encryptRequestContent(data) {
  const reqStr = JSON.stringify(data);
  const buffer = Buffer.from(reqStr, 'utf8');
  const key = crypto.createPublicKey(PUBLIC_KEY);
  const modulusLength = (key).asymmetricKeyDetails?.modulusLength || 1024;
  const keyBytes = Math.ceil(modulusLength / 8);
  const maxChunkSize = Math.max(1, keyBytes - 11);
  const chunks = [];
  for (let offset = 0; offset < buffer.length; offset += maxChunkSize) {
    const chunk = buffer.slice(offset, offset + maxChunkSize);
    const encryptedChunk = crypto.publicEncrypt(
      { key, padding: crypto.constants.RSA_PKCS1_PADDING },
      chunk
    );
    chunks.push(encryptedChunk);
  }
  return Buffer.concat(chunks).toString('base64');
}

async function test() {
  const token = 'APPO0NT4XS7yCP1RBzLk0Ge0Ma388IwMptO2lxEyubZFgt7s6wng7suqSxerD/ePht2qDmkO9k29WfeQKQrrcQESwBkRStHFRte';
  const campusId = 'QJXQ';
  const schoolId = 'cqifs';
  const stuNumber = '202413006775';

  // 1. 测试 getRunBegin
  console.log('=== 测试 getRunBegin ===');
  const initReq = { campusId, schoolId, stuNumber, token };
  const initEncrypted = encryptRequestContent(initReq);
  console.log('加密后长度:', initEncrypted.length);

  try {
    const res1 = await fetch('https://app.xtotoro.com/app/sunrun/getRunBegin', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Host': 'app.xtotoro.com',
        'User-Agent': 'okhttp/4.9.0',
      },
      body: initEncrypted,
    });
    const text1 = await res1.text();
    console.log('getRunBegin 响应:', text1.substring(0, 500));
  } catch (e) {
    console.error('getRunBegin 错误:', e.message);
  }

  // 2. 测试 sunRunExercises
  console.log('\n=== 测试 sunRunExercises ===');
  const sunRunReq = {
    token,
    stuNumber,
    campusId,
    schoolId,
    routeId: '',
    taskId: '',
    version: '1.2.14',
    runType: '0',
    phoneInfo: '$CN11/iPhone15,4/17.4.1',
    km: '2.00',
    steps: '2600',
    avgSpeed: '3.50',
    usedTime: '00:34:20',
    startTime: '16:30:00',
    endTime: '17:04:20',
    evaluateDate: '2026-03-16 17:04:20',
    ifLocalSubmit: '1',
    LocalSubmitReason: '',
    customDate: '2026-03-16',
    customPeriod: 'PM',
    signQrcode: '',
    flag: '1',
    fitDegree: '1',
    warnFlag: '0',
    warnType: '',
    faceData: '',
    headImage: '',
    mac: 'aa:bb:cc:dd:ee:ff',
    pointList: '',
    sensorString: '',
    baseStation: '',
  };

  const sunRunEncrypted = encryptRequestContent(sunRunReq);
  console.log('加密后长度:', sunRunEncrypted.length);

  try {
    const res2 = await fetch('https://app.xtotoro.com/app/platform/recrecord/sunRunExercises', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Host': 'app.xtotoro.com',
        'User-Agent': 'okhttp/4.9.0',
      },
      body: sunRunEncrypted,
    });
    const text2 = await res2.text();
    console.log('sunRunExercises 响应:', text2.substring(0, 500));
  } catch (e) {
    console.error('sunRunExercises 错误:', e.message);
  }
}

test();
