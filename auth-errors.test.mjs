import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { signupFailure } from './auth.mjs';

test('寄信拒絕、限流與停用註冊有具體提示，不回傳原始敏感錯誤',()=>{
  assert.match(signupFailure({code:'email_address_not_authorized'}).message,/SMTP/);
  assert.match(signupFailure({code:'over_email_send_rate_limit'}).message,/未能寄出/);
  assert.match(signupFailure({code:'signup_disabled'}).message,/尚未開放/);
  const result=signupFailure({code:'unknown_failure',message:'secret credential and private email'});
  assert.equal(result.code,'unknown_failure');assert.ok(!result.message.includes('secret'));
  assert.equal(signupFailure({code:'user@example.com'}).code,'unknown');
});
