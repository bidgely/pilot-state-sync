import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTokenRequest, mintToken, readAccessTokenFromPayload } from './mint-token.js';

describe('buildTokenRequest', () => {
  it('builds a client_credentials request with Basic auth and scope', () => {
    const request = buildTokenRequest({
      BIDGELY_TOKEN_MODE: 'client_credentials',
      BIDGELY_TOKEN_URL: 'https://nonprodqaapi-external.bidgely.com/oauth/token',
      BIDGELY_BASIC_AUTH: 'abc123base64',
      BIDGELY_TOKEN_SCOPE: 'all',
    });

    assert.equal(request.url, 'https://nonprodqaapi-external.bidgely.com/oauth/token');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, 'Basic abc123base64');
    assert.equal(request.headers.Accept, 'application/json');
    assert.equal(request.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(request.body.get('grant_type'), 'client_credentials');
    assert.equal(request.body.get('scope'), 'all');
  });

  it('builds a refresh_token request for future mixed-mode support', () => {
    const request = buildTokenRequest({
      BIDGELY_TOKEN_MODE: 'refresh_token',
      BIDGELY_TOKEN_URL: 'https://example.com/oauth/token',
      BIDGELY_REFRESH_TOKEN: 'refresh-123',
      BIDGELY_CLIENT_ID: 'client-1',
      BIDGELY_CLIENT_SECRET: 'secret-1',
      BIDGELY_TOKEN_SCOPE: 'openid profile',
      BIDGELY_TOKEN_AUDIENCE: 'bidgely-api',
    });

    assert.equal(request.method, 'POST');
    assert.equal(request.body.get('grant_type'), 'refresh_token');
    assert.equal(request.body.get('refresh_token'), 'refresh-123');
    assert.equal(request.body.get('client_id'), 'client-1');
    assert.equal(request.body.get('client_secret'), 'secret-1');
    assert.equal(request.body.get('scope'), 'openid profile');
    assert.equal(request.body.get('audience'), 'bidgely-api');
  });

  it('allows extra request params in client_credentials mode', () => {
    const request = buildTokenRequest({
      BIDGELY_TOKEN_MODE: 'client_credentials',
      BIDGELY_TOKEN_URL: 'https://example.com/oauth/token',
      BIDGELY_BASIC_AUTH: 'basic-secret',
      BIDGELY_TOKEN_SCOPE: 'all',
      BIDGELY_TOKEN_EXTRA_BODY: JSON.stringify({ tenant: 'nonprodqa', includeJwt: true }),
    });

    assert.equal(request.body.get('tenant'), 'nonprodqa');
    assert.equal(request.body.get('includeJwt'), 'true');
  });
});

describe('readAccessTokenFromPayload', () => {
  it('reads access_token by default', () => {
    const token = readAccessTokenFromPayload({ access_token: 'abc123' }, {});
    assert.equal(token, 'abc123');
  });

  it('reads a nested token field when configured', () => {
    const token = readAccessTokenFromPayload(
      { data: { token: 'nested-xyz' } },
      { BIDGELY_ACCESS_TOKEN_FIELD: 'data.token' }
    );
    assert.equal(token, 'nested-xyz');
  });
});

describe('mintToken', () => {
  it('extracts access_token from a successful response', async () => {
    const token = await mintToken(
      {
        BIDGELY_TOKEN_MODE: 'client_credentials',
        BIDGELY_TOKEN_URL: 'https://example.com/oauth/token',
        BIDGELY_BASIC_AUTH: 'basic-secret',
        BIDGELY_TOKEN_SCOPE: 'all',
      },
      async (url, options) => {
        assert.equal(url, 'https://example.com/oauth/token');
        assert.equal(options.headers.Authorization, 'Basic basic-secret');
        assert.equal(options.body.get('grant_type'), 'client_credentials');
        assert.equal(options.body.get('scope'), 'all');
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => JSON.stringify({
            access_token: 'd5e6ecd5-e16d-45c6-9b73-95ca0ff58407',
            token_type: 'bearer',
            expires_in: 43199,
            scope: 'all',
          }),
        };
      }
    );

    assert.equal(token, 'd5e6ecd5-e16d-45c6-9b73-95ca0ff58407');
  });

  it('throws on non-json responses', async () => {
    await assert.rejects(
      mintToken(
        {
          BIDGELY_TOKEN_MODE: 'client_credentials',
          BIDGELY_TOKEN_URL: 'https://example.com/oauth/token',
          BIDGELY_BASIC_AUTH: 'basic-secret',
        },
        async () => ({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          text: async () => '<html>oops</html>',
        })
      ),
      /non-JSON response/
    );
  });

  it('throws on non-200 responses', async () => {
    await assert.rejects(
      mintToken(
        {
          BIDGELY_TOKEN_MODE: 'client_credentials',
          BIDGELY_TOKEN_URL: 'https://example.com/oauth/token',
          BIDGELY_BASIC_AUTH: 'basic-secret',
        },
        async () => ({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: async () => JSON.stringify({ message: 'Bad credentials' }),
        })
      ),
      /Token mint failed: Bad credentials/
    );
  });

  it('throws when access_token is missing', async () => {
    await assert.rejects(
      mintToken(
        {
          BIDGELY_TOKEN_MODE: 'client_credentials',
          BIDGELY_TOKEN_URL: 'https://example.com/oauth/token',
          BIDGELY_BASIC_AUTH: 'basic-secret',
        },
        async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => JSON.stringify({ token_type: 'bearer' }),
        })
      ),
      /Token response missing string field "access_token"/
    );
  });
});
