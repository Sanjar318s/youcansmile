const { cors, redirect, baseUrl } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { upsertGoogleCustomer, createSession } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { ensureCustomerSchema } = require(require('path').resolve(process.cwd(), 'lib/db'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const code = req.query.code;
  if (!code) return redirect(res, '/account.html?err=google');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirect(res, '/account.html?err=google');
  const origin = baseUrl(req);
  const redirectUri = `${origin}/api/auth/google/callback`;
  try {
    await ensureCustomerSchema();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return redirect(res, '/account.html?err=google');
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    const user = await upsertGoogleCustomer({
      googleId: profile.id,
      email: profile.email,
      name: profile.name,
    });
    await createSession(res, { role: 'customer', customerId: user.id, ...user });
    return redirect(res, '/account.html');
  } catch (e) {
    console.error('google_oauth', e.message);
    return redirect(res, '/account.html?err=google');
  }
};
