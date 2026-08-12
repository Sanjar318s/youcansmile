const { cors, redirect, baseUrl } = require('../lib/http');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return redirect(res, '/account.html?err=google');
  const origin = baseUrl(req);
  const redirectUri = `${origin}/api/auth/google/callback`;
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
    }).toString();
  return redirect(res, url);
};
