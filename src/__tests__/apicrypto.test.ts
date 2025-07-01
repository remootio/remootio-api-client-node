import {
  remootioApiConstructEncrypedFrame,
  remootioApiDecryptEncrypedFrame,
} from '../apicrypto';

const testApiSecretKey =
  'EFD0E4BF75D49BDD4F5CD5492D55C92FE96040E9CD74BED9F19ACA2658EA0FA9';
const testApiAuthKey =
  '7B456E7AE95E55F714E2270983C33360514DAD96C93AE1990AFE35FD5BF00A72';
const testApiSessionKey = 'yzEI7RWCjYDEwFrgc5YrmWo82kXEjFNStbtN+wFM2Qk=';

test('Encrypt returns undefined if no session key present', () => {
  const result = remootioApiConstructEncrypedFrame(
      JSON.stringify({
        action: {
          type: 'QUERY',
          id: 808411243,
        },
      }),
      testApiSecretKey,
      testApiAuthKey,
      undefined, // no session key
  );
  expect(result).toBeUndefined();
});

test('Apicrypto encryption test', () => {
  const result = remootioApiConstructEncrypedFrame(
      JSON.stringify({
        action: {
          type: 'QUERY',
          id: 808411243,
        },
      }),
      testApiSecretKey,
      testApiAuthKey,
      testApiSessionKey,
  );

  expect(result).not.toBeUndefined();

  expect(result?.type).toEqual('ENCRYPTED');
  expect(typeof result?.mac).toBe('string');
  expect(typeof result?.data.iv).toBe('string');
  expect(typeof result?.data.payload).toBe('string');
});

test('Apicrypto decryption test', () => {
  const result = remootioApiDecryptEncrypedFrame(
      {
        type: 'ENCRYPTED',
        data: {
          iv: 'S7Mt0PR3MCADhHOPqhJPLA==',
          payload:
          'pSw+jH9iR3/nOO2+78EpQct3w+vJGKku+8ynSaYra6WsU4dHQJfMg1KNJkooVb1/WYhT28NyGznEHEKt97SYTMG15KjWcQUuqRSlpGD3JzWi/5LG+JPvIg3ptivsFrRZR3wzHAtZI6CekFujm8dhjeK/o6w+daK4FdvVh78pVigX6tBuNHEjoRQfUL9TRS9W',
        },
        mac: 'cD4IpRARmeWoUjkL4Kh40uhOMbs7P9prP497qZUapwQ=',
      },
      testApiSecretKey,
      testApiAuthKey,
      testApiSessionKey,
  );

  expect(result).not.toBeUndefined();

  if (result != undefined) {
    expect('response' in result).toBe(true);

    if ('response' in result) {
      expect(result.response.type).toEqual('QUERY');
      expect(result.response.id).toEqual(808411244);
      expect(result.response.success).toEqual(true);
      expect(result.response.state).toEqual('no sensor');
      expect(result.response.t100ms).toEqual(8985);
      expect(result.response.relayTriggered).toEqual(false);
      expect(result.response.errorCode).toEqual('');
    }
  }
});
