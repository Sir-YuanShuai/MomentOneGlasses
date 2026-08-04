#!/usr/bin/env node
/**
 * binding-flow 手动测试脚本
 *
 * 用法：
 *   node scripts/test-binding-flow.mjs <binding_code>
 *   node scripts/test-binding-flow.mjs                # 自动从 Server 申请一个 binding_code
 *
 * 这个脚本会：
 *   1. （可选）向 Server POST /v1/device/bindings 申请 binding_code
 *   2. 模拟眼镜端 requestBinding：POST /oauth/token 用 binding_code 换 token
 *   3. 模拟眼镜端 getValidAccessToken：检查 token 是否有效
 *   4. （可选）模拟 refresh：POST /oauth/token 用 refresh_token 换新 token
 *
 * 需要 Server 在本地运行（默认 http://127.0.0.1:8000）。
 * 需要 Casdoor 用户 access_token（通过环境变量 USER_ACCESS_TOKEN 传入）。
 */

const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://127.0.0.1:8000';
const USER_ACCESS_TOKEN = process.env.USER_ACCESS_TOKEN || '';
const DEVICE_ID = process.env.DEVICE_ID || 'test-device-' + Math.random().toString(36).slice(2, 10);

async function main() {
  const argCode = process.argv[2];
  let bindingCode = argCode;

  // Step 1: 如果没传 binding_code，向 Server 申请一个
  if (!bindingCode) {
    if (!USER_ACCESS_TOKEN) {
      console.error('✗ 请传 binding_code 参数，或设置 USER_ACCESS_TOKEN 环境变量让脚本自动申请');
      console.error('  用法: node scripts/test-binding-flow.mjs <binding_code>');
      console.error('  或:   USER_ACCESS_TOKEN=xxx node scripts/test-binding-flow.mjs');
      process.exit(1);
    }
    console.log('① 向 Server 申请 binding_code…');
    const res = await fetch(`${SERVER_BASE_URL}/v1/device/bindings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${USER_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ device_name: 'test-glasses', scope: ['moment:read', 'moment:write'] }),
    });
    if (!res.ok) {
      console.error(`✗ 申请失败: HTTP ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const data = await res.json();
    bindingCode = data.binding_code;
    console.log(`✓ binding_code = ${bindingCode}`);
    console.log(`  qr_payload   = ${data.qr_payload}`);
    console.log(`  expires_at   = ${data.expires_at}`);
  } else {
    console.log(`① 使用传入的 binding_code = ${bindingCode}`);
  }

  // Step 2: 模拟眼镜端 requestBinding
  console.log('\n② 模拟眼镜端 requestBinding: POST /oauth/token');
  const tokenRes = await fetch(`${SERVER_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:momentone:oauth:grant-type:device-binding',
      binding_code: bindingCode,
      device_id: DEVICE_ID,
      device_name: 'Rokid Glasses (test)',
      device_type: 'rokid-glasses',
    }),
  });
  const tokenData = await tokenRes.json();
  if (tokenRes.status !== 200 || !tokenData.access_token) {
    console.error(`✗ 绑定失败: HTTP ${tokenRes.status}`);
    console.error('  响应:', JSON.stringify(tokenData, null, 2));
    process.exit(1);
  }
  console.log(`✓ 绑定成功！`);
  console.log(`  binding_id    = ${tokenData.binding_id}`);
  console.log(`  access_token  = ${tokenData.access_token.slice(0, 20)}…`);
  console.log(`  refresh_token = ${tokenData.refresh_token?.slice(0, 20) || '(无)'}…`);
  console.log(`  expires_in    = ${tokenData.expires_in}s`);

  // Step 3: 用 access_token 调一个需要鉴权的接口验证
  console.log('\n③ 用 access_token 调 /v1/device/bindings 验证');
  const verifyRes = await fetch(`${SERVER_BASE_URL}/v1/device/bindings`, {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
  });
  console.log(`  HTTP ${verifyRes.status}`);
  if (verifyRes.ok) {
    const list = await verifyRes.json();
    console.log(`✓ 鉴权通过，当前用户有 ${list.length} 个绑定`);
    console.log('  绑定列表:', list.map(b => ({ id: b.id, device_id: b.device_id, status: b.status })));
  } else {
    console.error(`✗ 鉴权失败: ${await verifyRes.text()}`);
  }

  // Step 4: 测试 refresh_token
  if (tokenData.refresh_token) {
    console.log('\n④ 测试 refresh_token: POST /oauth/token');
    const refreshRes = await fetch(`${SERVER_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenData.refresh_token,
      }),
    });
    const refreshData = await refreshRes.json();
    if (refreshRes.status === 200 && refreshData.access_token) {
      console.log(`✓ 刷新成功，新 access_token = ${refreshData.access_token.slice(0, 20)}…`);
    } else {
      console.error(`✗ 刷新失败: HTTP ${refreshRes.status}`);
      console.error('  响应:', JSON.stringify(refreshData, null, 2));
    }
  }

  console.log('\n✅ 全流程测试完成');
}

main().catch((err) => {
  console.error('✗ 异常:', err);
  process.exit(1);
});
