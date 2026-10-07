(async function () {
  const client = window.schoolshieldSupabase, form = document.getElementById('setupForm');
  const waiting = document.getElementById('setupWaiting'), errorBox = document.getElementById('setupError');
  const fail = message => { waiting.hidden = true; errorBox.textContent = message; errorBox.style.display = 'block'; };
  try {
    if (!client) throw new Error('Account setup is unavailable. Contact your school administrator.');
    const session = await SchoolShieldInvitation.exchangeInvitation(client, location.href);
    history.replaceState({}, '', location.pathname);
    const { data: profile, error } = await client.from('profiles').select('display_name,phone,onboarding_completed_at,role,school_id').eq('id', session.user.id).single();
    if (error || !profile) throw new Error('Your approved school profile is unavailable. Contact your school administrator.');
    if (profile.onboarding_completed_at) throw new Error('This account has already completed setup. Sign in with your password.');
    document.getElementById('setupName').value = profile.display_name || '';
    document.getElementById('setupPhone').value = profile.phone || '';
    waiting.hidden = true; form.hidden = false;
  } catch (error) { form.hidden = true; fail(error.message); return; }
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    errorBox.style.display = 'none';
    try {
      const password = document.getElementById('setupPassword').value;
      if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
      if (password !== document.getElementById('setupConfirmPassword').value) throw new Error('The passwords do not match.');
      const phone = SchoolShieldInvitation.normalizePhone(document.getElementById('setupPhone').value);
      const { error: passwordError } = await client.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      const { error: profileError } = await client.rpc('complete_my_profile', { p_display_name: document.getElementById('setupName').value.trim(), p_phone: phone, p_address: document.getElementById('setupAddress').value.trim(), p_emergency_contact: document.getElementById('setupEmergency').value.trim() });
      if (profileError) throw profileError;
      await client.auth.signOut();
      sessionStorage.removeItem('schoolshieldSession'); sessionStorage.removeItem('schoolshieldRole');
      location.replace('login.html?setup=complete');
    } catch (error) { fail(error.message); button.disabled = false; }
  };
})();
