import { describe, expect, it } from 'vitest';
import {
  checkPasswordStrength,
  createAuthRecord,
  hashPassword,
  verifyPassword,
} from '../auth';

describe('パスワードのハッシュ化', () => {
  it('同じ入力なら同じハッシュになる（決定的）', async () => {
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const a = await hashPassword('hunter2', salt, 1000);
    const b = await hashPassword('hunter2', salt, 1000);
    expect(a).toBe(b);
  });

  it('パスワードが違えばハッシュも変わる', async () => {
    const salt = new Uint8Array(16).fill(7);
    const a = await hashPassword('password-a', salt, 1000);
    const b = await hashPassword('password-b', salt, 1000);
    expect(a).not.toBe(b);
  });

  it('salt が違えば同じパスワードでもハッシュは変わる', async () => {
    const a = await hashPassword('same', new Uint8Array(16).fill(1), 1000);
    const b = await hashPassword('same', new Uint8Array(16).fill(2), 1000);
    expect(a).not.toBe(b);
  });

  it('base64 で 256bit = 44文字（padding込み）になる', async () => {
    const hash = await hashPassword('x', new Uint8Array(16), 1000);
    expect(hash).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
});

describe('アカウント作成と照合', () => {
  it('作成したパスワードで verify が通る', async () => {
    const rec = await createAuthRecord('ぼく', 'my-secret-123');
    expect(await verifyPassword('my-secret-123', rec)).toBe(true);
  });

  it('違うパスワードでは verify が通らない', async () => {
    const rec = await createAuthRecord('ぼく', 'correct-horse');
    expect(await verifyPassword('battery-staple', rec)).toBe(false);
    expect(await verifyPassword('correct-horse ', rec)).toBe(false); // 末尾スペース
    expect(await verifyPassword('', rec)).toBe(false);
  });

  it('毎回ランダムな salt が使われる（同じパスワードでもレコードが異なる）', async () => {
    const a = await createAuthRecord('u', 'same-password');
    const b = await createAuthRecord('u', 'same-password');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    // どちらも同じパスワードで開ける
    expect(await verifyPassword('same-password', a)).toBe(true);
    expect(await verifyPassword('same-password', b)).toBe(true);
  });

  it('ユーザー名の前後の空白は落とす', async () => {
    const rec = await createAuthRecord('  なまえ  ', 'pw1234');
    expect(rec.username).toBe('なまえ');
  });

  it('レコードは v:1 / iterations を持つ', async () => {
    const rec = await createAuthRecord('u', 'pw1234');
    expect(rec.v).toBe(1);
    expect(rec.iterations).toBeGreaterThan(0);
    expect(typeof rec.createdAt).toBe('string');
  });

  it('日本語や絵文字を含むパスワードも扱える', async () => {
    const rec = await createAuthRecord('u', 'パス🔑ワード');
    expect(await verifyPassword('パス🔑ワード', rec)).toBe(true);
    expect(await verifyPassword('パスワード', rec)).toBe(false);
  });
});

describe('パスワードの強さチェック', () => {
  it('4文字未満はエラー', () => {
    expect(checkPasswordStrength('abc')).toBeTruthy();
    expect(checkPasswordStrength('')).toBeTruthy();
  });

  it('4文字以上は OK', () => {
    expect(checkPasswordStrength('abcd')).toBeNull();
    expect(checkPasswordStrength('a longer passphrase')).toBeNull();
  });

  it('極端に長いものはエラー', () => {
    expect(checkPasswordStrength('x'.repeat(201))).toBeTruthy();
  });
});
